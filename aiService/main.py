"""
Entry point của AI Service.
Chạy: python main.py

Quản lý 3 nhóm worker chạy song song:
  - Camera workers: 1 worker mỗi camera đã đăng ký trong DB
  - VOD queue worker: poll ScanJob queue để quét video full timeline
  - YouTube hunter: quét YouTube tìm video thiên tai
  - RSS hunter:     quét RSS báo VN tìm tin thiên tai

Bật/tắt từng nhóm qua .env (DETECTOR, ENABLE_VOD_SCAN_WORKER, ENABLE_YOUTUBE_HUNTER, ENABLE_RSS_HUNTER).
"""
import asyncio
import signal
import sys
from typing import Dict

from loguru import logger

from config import (
    BACKEND_URL,
    AI_WEBHOOK_SECRET,
    CAMERA_REFRESH_SECONDS,
    LOG_LEVEL,
    ENABLE_VOD_SCAN_WORKER,
    ENABLE_YOUTUBE_HUNTER,
    ENABLE_RSS_HUNTER,
)
from backend_client import fetch_active_cameras, close_client
from workers.camera_worker import run_worker
from workers.vod_scan_worker import run_vod_scan_queue
from workers.youtube_hunter import run_youtube_hunter
from workers.rss_hunter import run_rss_hunter


# ===== Logging setup =====
logger.remove()
logger.add(
    sys.stderr,
    level=LOG_LEVEL,
    format="<green>{time:HH:mm:ss}</green> | <level>{level:<8}</level> | {message}",
)


class WorkerSupervisor:
    """Quản lý các worker (camera + YouTube hunter + RSS hunter)."""

    def __init__(self) -> None:
        self.camera_tasks: Dict[str, asyncio.Task] = {}
        self.camera_stops: Dict[str, asyncio.Event] = {}

        self.vod_task: asyncio.Task | None = None
        self.vod_stop = asyncio.Event()

        self.hunter_task: asyncio.Task | None = None
        self.hunter_stop = asyncio.Event()

        self.rss_task: asyncio.Task | None = None
        self.rss_stop = asyncio.Event()

        self.shutting_down = False

    async def reconcile_cameras(self) -> None:
        cameras = await fetch_active_cameras()
        active_ids = {str(c["_id"]) for c in cameras if "_id" in c}

        # Spawn workers cho camera mới
        for cam in cameras:
            cid = str(cam.get("_id", ""))
            if not cid:
                continue
            if cid not in self.camera_tasks:
                stop = asyncio.Event()
                self.camera_stops[cid] = stop
                self.camera_tasks[cid] = asyncio.create_task(run_worker(cam, stop))

        # Cancel workers của camera đã bị remove/paused
        for cid in list(self.camera_tasks.keys()):
            if cid not in active_ids:
                logger.info(f"Camera {cid} không còn active, dừng worker.")
                self.camera_stops[cid].set()
                self.camera_tasks.pop(cid, None)
                self.camera_stops.pop(cid, None)

        logger.info(
            f"[supervisor] camera workers: {len(self.camera_tasks)} | "
            f"vod: {'on' if self.vod_task and not self.vod_task.done() else 'off'} | "
            f"hunter: {'on' if self.hunter_task and not self.hunter_task.done() else 'off'}"
        )

    async def start_vod(self) -> None:
        if not ENABLE_VOD_SCAN_WORKER:
            logger.info("[supervisor] VOD queue worker tắt (ENABLE_VOD_SCAN_WORKER=false).")
            return
        if self.vod_task and not self.vod_task.done():
            return
        self.vod_task = asyncio.create_task(run_vod_scan_queue(self.vod_stop))

    async def start_hunter(self) -> None:
        if not ENABLE_YOUTUBE_HUNTER:
            logger.info("[supervisor] YouTube hunter tắt (ENABLE_YOUTUBE_HUNTER=false).")
            return
        if self.hunter_task and not self.hunter_task.done():
            return
        self.hunter_task = asyncio.create_task(run_youtube_hunter(self.hunter_stop))

    async def start_rss(self) -> None:
        if not ENABLE_RSS_HUNTER:
            logger.info("[supervisor] RSS hunter tắt (ENABLE_RSS_HUNTER=false).")
            return
        if self.rss_task and not self.rss_task.done():
            return
        self.rss_task = asyncio.create_task(run_rss_hunter(self.rss_stop))

    async def run(self) -> None:
        # Spawn camera workers theo danh sách camera active trong DB
        await self.reconcile_cameras()
        if not self.camera_tasks:
            logger.warning(
                "Không có camera active nào trong DB. "
                "Chạy: cd ../DisasterTrafficWeb && npm run seed:cameras"
            )

        # Spawn VOD queue worker, YouTube hunter và RSS hunter (nếu được bật trong .env)
        await self.start_vod()
        await self.start_hunter()
        await self.start_rss()

        # Loop refresh camera list
        while not self.shutting_down:
            try:
                await asyncio.sleep(CAMERA_REFRESH_SECONDS)
                if self.shutting_down:
                    break
                await self.reconcile_cameras()
            except asyncio.CancelledError:
                break

    async def shutdown(self) -> None:
        self.shutting_down = True
        logger.info("[supervisor] Shutting down...")

        # Camera workers
        for stop in self.camera_stops.values():
            stop.set()
        # VOD queue worker
        self.vod_stop.set()
        # YouTube hunter
        self.hunter_stop.set()
        # RSS hunter
        self.rss_stop.set()

        all_tasks = list(self.camera_tasks.values())
        if self.vod_task:
            all_tasks.append(self.vod_task)
        if self.hunter_task:
            all_tasks.append(self.hunter_task)
        if self.rss_task:
            all_tasks.append(self.rss_task)
        if all_tasks:
            await asyncio.gather(*all_tasks, return_exceptions=True)

        await close_client()
        logger.info("[supervisor] Bye.")


async def main_async() -> None:
    if not AI_WEBHOOK_SECRET or AI_WEBHOOK_SECRET == "replace_me":
        logger.error("AI_WEBHOOK_SECRET chưa được cấu hình trong .env.")
        return

    logger.info(f"Backend: {BACKEND_URL}")
    logger.info(f"VOD Queue:      {'ON' if ENABLE_VOD_SCAN_WORKER else 'off'}")
    logger.info(f"YouTube Hunter: {'ON' if ENABLE_YOUTUBE_HUNTER else 'off'}")
    logger.info(f"RSS Hunter:     {'ON' if ENABLE_RSS_HUNTER else 'off'}")

    sup = WorkerSupervisor()

    loop = asyncio.get_running_loop()

    def _handle_signal():
        logger.info("Nhận SIGINT — chuẩn bị thoát.")
        sup.shutting_down = True
        for stop in sup.camera_stops.values():
            stop.set()
        sup.vod_stop.set()
        sup.hunter_stop.set()
        sup.rss_stop.set()

    if sys.platform != "win32":
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, _handle_signal)
            except NotImplementedError:
                pass

    try:
        await sup.run()
    except KeyboardInterrupt:
        pass
    finally:
        await sup.shutdown()


if __name__ == "__main__":
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        pass
