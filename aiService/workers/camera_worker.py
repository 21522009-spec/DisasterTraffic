"""
1 camera = 1 worker chạy song song.

Mỗi worker:
  - Mở video stream/file qua FrameReader
  - Mỗi DETECT_INTERVAL_SECONDS giây:
      * Đọc 1 frame
      * Chạy detector (mock/yolo)
      * Nếu có sự kiện và đã qua cooldown → POST alert + heartbeat
  - Khi camera bị remove/paused, supervisor set stop_event → worker thoát
"""
import asyncio
import time
from datetime import datetime, timezone
from typing import Optional

from loguru import logger

from config import DETECT_INTERVAL_SECONDS, DETECTOR
from backend_client import post_alert, heartbeat
from video_reader import FrameReader, resolve_source

# Chọn detector theo config
if DETECTOR == "yolo":
    from detectors.yolo import detect as run_detect
else:
    # Mock detector không cần frame, vẫn chấp nhận tham số 2 cho cùng signature
    from detectors.mock import detect as _mock_detect

    def run_detect(camera, frame):
        return _mock_detect(camera)


def _now_ts() -> float:
    return time.time()


def _last_alert_ts(camera: dict) -> float:
    iso = camera.get("lastAlertAt")
    if not iso:
        return 0
    try:
        if isinstance(iso, str):
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        else:
            dt = iso
        return dt.replace(tzinfo=timezone.utc).timestamp()
    except Exception:
        return 0


async def _read_frame_safe(reader: FrameReader):
    """cv2.VideoCapture.read() là blocking — chạy trong executor."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, reader.read)


async def _detect_safe(camera: dict, frame):
    """YOLO predict cũng blocking + tốn CPU — chạy trong executor."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, run_detect, camera, frame)


async def run_worker(camera: dict, stop_event: asyncio.Event) -> None:
    name = camera.get("name", str(camera.get("_id", "?")))
    cooldown_ms = int(camera.get("cooldownMs", 60_000))
    cooldown_s = cooldown_ms / 1000.0
    stream_url = camera.get("streamUrl", "")

    # ===== Mở video source =====
    source = resolve_source(stream_url)
    reader: Optional[FrameReader] = None

    if DETECTOR != "mock":
        if source is None:
            logger.warning(
                f"[worker:{name}] streamUrl không hợp lệ hoặc không tìm thấy file ({stream_url}). "
                f"Worker sẽ idle. Đặt video vào thư mục videos/ và đặt tên đúng, "
                f"hoặc set DETECTOR=mock trong .env."
            )
        else:
            reader = FrameReader(source)
            if not reader.open():
                logger.error(f"[worker:{name}] không mở được source: {source}")
                reader = None
            else:
                logger.info(f"[worker:{name}] đã mở source: {source}")

    logger.info(
        f"[worker:{name}] started (interval={DETECT_INTERVAL_SECONDS}s, cooldown={cooldown_s}s, detector={DETECTOR})"
    )

    last_local = _last_alert_ts(camera)
    consecutive_read_fails = 0
    MAX_CONSECUTIVE_FAILS = 5     # số lần fail liên tiếp trước khi thử reconnect
    RECONNECT_WAIT = 30           # giây chờ trước khi reconnect

    try:
        while not stop_event.is_set():
            # Tick
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=DETECT_INTERVAL_SECONDS)
                break
            except asyncio.TimeoutError:
                pass

            # Đọc frame (chỉ với detector thật)
            frame = None
            if reader is not None:
                frame = await _read_frame_safe(reader)
                if frame is None:
                    consecutive_read_fails += 1
                    logger.debug(f"[worker:{name}] read frame fail ({consecutive_read_fails}/{MAX_CONSECUTIVE_FAILS})")

                    if consecutive_read_fails >= MAX_CONSECUTIVE_FAILS and source is not None:
                        logger.warning(f"[worker:{name}] stream mất ổn định, thử reconnect sau {RECONNECT_WAIT}s...")
                        reader.release()
                        reader = None
                        await asyncio.sleep(RECONNECT_WAIT)
                        reader = FrameReader(source)
                        if reader.open():
                            logger.info(f"[worker:{name}] reconnect thành công")
                        else:
                            logger.error(f"[worker:{name}] reconnect thất bại")
                            reader = None
                        consecutive_read_fails = 0
                    continue
                else:
                    consecutive_read_fails = 0

            # Detect
            try:
                detection = await _detect_safe(camera, frame)
            except Exception as e:
                logger.error(f"[worker:{name}] detect error: {e}")
                continue

            if not detection:
                logger.debug(f"[worker:{name}] tick — no event")
                continue

            if _now_ts() - last_local < cooldown_s:
                logger.debug(
                    f"[worker:{name}] DETECTED {detection['type']} "
                    f"nhưng đang cooldown ({cooldown_s - (_now_ts() - last_local):.1f}s còn lại)"
                )
                continue

            logger.info(
                f"[worker:{name}] DETECTED {detection['type']} "
                f"(conf={detection.get('confidence')}, sev={detection.get('severity')}) - {detection.get('description')}"
            )

            result = await post_alert(camera, detection)
            if result:
                logger.success(f"[worker:{name}] alert posted (id={result.get('_id')})")
                last_local = _now_ts()
                await heartbeat(str(camera["_id"]))
            else:
                logger.warning(f"[worker:{name}] alert post failed — sẽ thử lại tick sau")

    finally:
        if reader is not None:
            reader.release()
        logger.info(f"[worker:{name}] stopped")
