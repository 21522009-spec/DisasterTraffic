from __future__ import annotations

import asyncio
import re
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2
from loguru import logger

from backend_client import (
    claim_next_scan_job,
    create_scan_job_event,
    update_scan_job_progress,
)
from config import (
    DETECTOR,
    ENABLE_VOD_SCAN_WORKER,
    MEDIA_OUTPUT_DIR,
    MEDIA_PUBLIC_BASE_URL,
    VOD_OUTPUT_CODEC,
    VOD_PROGRESS_PUSH_SECONDS,
    VOD_SCAN_POLL_SECONDS,
)
from detectors import vision_llm
from source_adapters import build_source_adapter

if DETECTOR == "yolo":
    from detectors.yolo import detect as run_detect
else:
    from detectors.mock import detect as _mock_detect

    def run_detect(camera, frame):
        return _mock_detect(camera)


@dataclass
class BufferedFrame:
    timestamp_sec: float
    frame: any


@dataclass
class ActiveEvent:
    sequence: int
    event_type: str
    severity: int
    description: str
    start_sec: float
    last_detect_sec: float
    best_confidence: float
    best_frame: any
    best_frame_sec: float
    raw_detections: int
    frames: list[BufferedFrame]


async def _run_blocking(func, *args):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, func, *args)


async def _read_packet(adapter):
    return await _run_blocking(adapter.read)


async def _detect_safe(camera: dict, frame):
    return await _run_blocking(run_detect, camera, frame)


def _frame_to_jpeg(frame, quality: int = 85) -> Optional[bytes]:
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    return buf.tobytes() if ok else None


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:40] or "event"


def _ensure_output_dir(job_id: str) -> Path:
    path = MEDIA_OUTPUT_DIR / "scan-jobs" / job_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def _public_url(path: Path) -> str:
    rel = path.relative_to(MEDIA_OUTPUT_DIR).as_posix()
    return f"{MEDIA_PUBLIC_BASE_URL}/{rel}"


def _write_snapshot(frame, target: Path) -> str:
    target.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(target), frame):
        raise RuntimeError(f"Không ghi được snapshot: {target}")
    return _public_url(target)


def _write_clip(samples: list[BufferedFrame], fps: float, target: Path) -> str:
    if not samples:
        return ""

    target.parent.mkdir(parents=True, exist_ok=True)
    first = samples[0].frame
    height, width = first.shape[:2]
    fourcc = cv2.VideoWriter_fourcc(*VOD_OUTPUT_CODEC[:4])
    writer = cv2.VideoWriter(str(target), fourcc, max(float(fps), 1.0), (width, height))
    if not writer.isOpened():
        raise RuntimeError(f"Không mở được VideoWriter cho {target}")

    try:
        for sample in samples:
            frame = sample.frame
            if frame is None:
                continue
            if frame.shape[:2] != (height, width):
                frame = cv2.resize(frame, (width, height))
            writer.write(frame)
    finally:
        writer.release()

    return _public_url(target)


def _persist_artifacts(
    job_id: str,
    event: ActiveEvent,
    final_type: str,
    clip_before_sec: float,
    clip_after_sec: float,
    artifact_fps: float,
):
    base_dir = _ensure_output_dir(job_id)
    slug = _slugify(final_type)
    stem = f"event-{event.sequence:03d}-{slug}"

    window_start = max(0.0, event.start_sec - clip_before_sec)
    window_end = event.last_detect_sec + clip_after_sec
    frames = [
        sample
        for sample in event.frames
        if sample.timestamp_sec >= window_start and sample.timestamp_sec <= window_end
    ]
    before_frames = [sample for sample in frames if sample.timestamp_sec < event.start_sec]
    during_frames = [
        sample
        for sample in frames
        if event.start_sec <= sample.timestamp_sec <= event.last_detect_sec
    ]
    after_frames = [sample for sample in frames if sample.timestamp_sec > event.last_detect_sec]

    snapshot_path = base_dir / f"{stem}-snapshot.jpg"
    before_path = base_dir / f"{stem}-before.mp4"
    during_path = base_dir / f"{stem}-during.mp4"
    after_path = base_dir / f"{stem}-after.mp4"

    snapshot_url = _write_snapshot(event.best_frame, snapshot_path)
    before_url = _write_clip(before_frames, artifact_fps, before_path)
    during_url = _write_clip(during_frames or frames, artifact_fps, during_path)
    after_url = _write_clip(after_frames, artifact_fps, after_path)
    return snapshot_url, before_url, during_url, after_url


def _verify_event(event: ActiveEvent, verify_with_llm: bool) -> tuple[str, bool, str, float, str]:
    base_type = event.event_type
    base_conf = float(event.best_confidence or 0.6)

    if verify_with_llm and vision_llm.is_enabled() and event.best_frame is not None:
        jpeg = _frame_to_jpeg(event.best_frame)
        if jpeg:
            result = vision_llm.verify_disaster(jpeg, hint=base_type)
            if result:
                verified_type, verified_conf = result
                return (
                    verified_type,
                    True,
                    "gemini",
                    max(base_conf, float(verified_conf)),
                    "verified",
                )
            return (base_type, False, "gemini", base_conf, "rejected")

    verifier = DETECTOR if DETECTOR != "mock" else "mock"
    return (base_type, True, verifier, base_conf, "verified")


async def _flush_event(
    job: dict,
    camera: dict,
    event: ActiveEvent,
    config: dict,
) -> tuple[int, int]:
    clip_before_sec = float(config.get("clipBeforeSec", 12) or 12)
    clip_after_sec = float(config.get("clipAfterSec", 12) or 12)
    artifact_fps = float(config.get("artifactFps", 6) or 6)
    verify_with_llm = bool(config.get("verifyWithLlm", True))

    final_type, verified, verified_by, confidence, event_status = await _run_blocking(
        _verify_event,
        event,
        verify_with_llm,
    )

    try:
        snapshot_url, before_url, during_url, after_url = await _run_blocking(
            _persist_artifacts,
            str(job["_id"]),
            event,
            final_type,
            clip_before_sec,
            clip_after_sec,
            artifact_fps,
        )
    except Exception as error:
        logger.warning(f"[vod] artifact persist failed for job {job['_id']}: {error}")
        snapshot_url, before_url, during_url, after_url = ("", "", "", "")

    create_alert = bool(job.get("publishAlerts", True) and verified)
    title = f"{camera.get('name', 'Camera')} {final_type} @ {event.start_sec:.1f}s"

    payload = {
        "type": final_type,
        "status": event_status,
        "title": title,
        "description": event.description,
        "severity": event.severity,
        "confidence": round(float(confidence), 3),
        "verified": verified,
        "verifiedBy": verified_by,
        "sourceType": job.get("sourceType"),
        "sourceUrl": job.get("sourceUrl", ""),
        "snapshotUrl": snapshot_url,
        "clipBeforeUrl": before_url,
        "clipDuringUrl": during_url,
        "clipAfterUrl": after_url,
        "eventStartSec": round(float(event.start_sec), 3),
        "eventEndSec": round(float(event.last_detect_sec), 3),
        "snapshotSec": round(float(event.best_frame_sec), 3),
        "metadata": {
            "detector": DETECTOR,
            "verifier": verified_by,
            "framesSampled": event.raw_detections,
            "rawConfidence": round(float(event.best_confidence), 3),
            "durationSec": round(float(max(0.0, event.last_detect_sec - event.start_sec)), 3),
            "labels": [event.event_type, final_type],
        },
        "createAlert": create_alert,
    }

    saved = await create_scan_job_event(str(job["_id"]), payload)
    if not saved:
        return (0, 0)
    return (1, 1 if saved.get("alert") else 0)


async def _process_scan_job(job: dict, stop_event: asyncio.Event) -> None:
    job_id = str(job["_id"])
    camera = job.get("camera") or job.get("cameraId")
    if not isinstance(camera, dict):
        await update_scan_job_progress(
            job_id,
            {
                "status": "failed",
                "error": {
                    "message": "Camera context missing",
                    "details": "Claimed scan job does not include camera payload.",
                },
            },
        )
        return

    config = job.get("config") or {}
    scan_every_sec = max(float(config.get("scanEverySec", 2) or 2), 0.1)
    merge_gap_sec = max(float(config.get("mergeGapSec", 8) or 8), 0.0)
    clip_before_sec = max(float(config.get("clipBeforeSec", 12) or 12), 0.0)
    clip_after_sec = max(float(config.get("clipAfterSec", 12) or 12), 0.0)
    artifact_fps = max(float(config.get("artifactFps", 6) or 6), 1.0)
    finalize_gap_sec = max(merge_gap_sec, clip_after_sec)

    scan_camera = dict(camera)
    if job.get("allowedEventTypes"):
        scan_camera["allowedEventTypes"] = job["allowedEventTypes"]

    adapter = None
    frames_read = 0
    frames_sampled = 0
    candidates_detected = 0
    events_created = 0
    alerts_created = 0
    next_detection_ts = 0.0
    next_artifact_ts = 0.0
    active_event: Optional[ActiveEvent] = None
    event_seq = 0
    pre_buffer: deque[BufferedFrame] = deque()
    duration_sec = None
    last_progress_push = time.monotonic()
    last_frame_sec = 0.0

    try:
        adapter = build_source_adapter(job.get("sourceType", "file"), job.get("sourceUrl", ""))
        opened = await _run_blocking(adapter.open)
        if not opened:
            raise RuntimeError(f"Không mở được source {job.get('sourceUrl')}")

        duration_sec = adapter.duration_sec
        logger.info(
            f"[vod] job={job_id} camera={camera.get('name')} source={job.get('sourceType')} "
            f"fps={adapter.fps:.2f} duration={duration_sec or 'unknown'}"
        )

        await update_scan_job_progress(
            job_id,
            {
                "status": "running",
                "timeline": {"durationSec": duration_sec, "processedSec": 0, "lastFrameSec": 0},
                "result": {"summary": f"Scanning {job.get('sourceType')} source..."},
            },
        )

        while not stop_event.is_set():
            packet = await _read_packet(adapter)
            if packet is None:
                break

            frames_read += 1
            last_frame_sec = float(packet.timestamp_sec)

            if packet.timestamp_sec + 1e-6 >= next_artifact_ts:
                buffered = BufferedFrame(timestamp_sec=packet.timestamp_sec, frame=packet.frame.copy())
                pre_buffer.append(buffered)
                next_artifact_ts = packet.timestamp_sec + (1.0 / artifact_fps)
                keep_since = packet.timestamp_sec - clip_before_sec - merge_gap_sec - 1.0
                while pre_buffer and pre_buffer[0].timestamp_sec < keep_since:
                    pre_buffer.popleft()
                if active_event is not None:
                    active_event.frames.append(buffered)

            if packet.timestamp_sec + 1e-6 >= next_detection_ts:
                frames_sampled += 1
                next_detection_ts = packet.timestamp_sec + scan_every_sec
                detection = await _detect_safe(scan_camera, packet.frame)

                if detection:
                    dtype = str(detection.get("type") or "other")
                    candidates_detected += 1

                    if active_event is not None:
                        same_cluster = (
                            dtype == active_event.event_type
                            and (packet.timestamp_sec - active_event.last_detect_sec) <= merge_gap_sec
                        )
                        if not same_cluster:
                            new_events, new_alerts = await _flush_event(job, camera, active_event, config)
                            events_created += new_events
                            alerts_created += new_alerts
                            active_event = None

                    if active_event is None:
                        event_seq += 1
                        start_window = max(0.0, packet.timestamp_sec - clip_before_sec)
                        initial_frames = [
                            sample
                            for sample in list(pre_buffer)
                            if sample.timestamp_sec >= start_window
                        ]
                        active_event = ActiveEvent(
                            sequence=event_seq,
                            event_type=dtype,
                            severity=int(detection.get("severity", 3) or 3),
                            description=str(detection.get("description") or ""),
                            start_sec=float(packet.timestamp_sec),
                            last_detect_sec=float(packet.timestamp_sec),
                            best_confidence=float(detection.get("confidence", 0.6) or 0.6),
                            best_frame=packet.frame.copy(),
                            best_frame_sec=float(packet.timestamp_sec),
                            raw_detections=1,
                            frames=initial_frames,
                        )
                    else:
                        active_event.last_detect_sec = float(packet.timestamp_sec)
                        active_event.severity = max(
                            active_event.severity,
                            int(detection.get("severity", active_event.severity) or active_event.severity),
                        )
                        if detection.get("description"):
                            active_event.description = str(detection["description"])
                        active_event.raw_detections += 1

                    confidence = float(detection.get("confidence", 0.6) or 0.6)
                    if confidence >= active_event.best_confidence:
                        active_event.best_confidence = confidence
                        active_event.best_frame = packet.frame.copy()
                        active_event.best_frame_sec = float(packet.timestamp_sec)

            if active_event is not None and (packet.timestamp_sec - active_event.last_detect_sec) >= finalize_gap_sec:
                new_events, new_alerts = await _flush_event(job, camera, active_event, config)
                events_created += new_events
                alerts_created += new_alerts
                active_event = None

            if time.monotonic() - last_progress_push >= VOD_PROGRESS_PUSH_SECONDS:
                pct = 0
                if duration_sec and duration_sec > 0:
                    pct = min(99, int((last_frame_sec / duration_sec) * 100))
                await update_scan_job_progress(
                    job_id,
                    {
                        "status": "running",
                        "progress": {
                            "pct": pct,
                            "framesRead": frames_read,
                            "framesSampled": frames_sampled,
                            "candidatesDetected": candidates_detected,
                            "eventsCreated": events_created,
                        },
                        "timeline": {
                            "durationSec": duration_sec,
                            "processedSec": last_frame_sec,
                            "lastFrameSec": last_frame_sec,
                        },
                        "result": {
                            "eventsCount": events_created,
                            "alertsCount": alerts_created,
                        },
                    },
                )
                last_progress_push = time.monotonic()

        if stop_event.is_set():
            await update_scan_job_progress(
                job_id,
                {
                    "status": "cancelled",
                    "progress": {
                        "pct": 0,
                        "framesRead": frames_read,
                        "framesSampled": frames_sampled,
                        "candidatesDetected": candidates_detected,
                        "eventsCreated": events_created,
                    },
                    "result": {
                        "summary": "Worker stopped before scan completed.",
                        "eventsCount": events_created,
                        "alertsCount": alerts_created,
                    },
                },
            )
            return

        if active_event is not None:
            new_events, new_alerts = await _flush_event(job, camera, active_event, config)
            events_created += new_events
            alerts_created += new_alerts

        summary = (
            f"Timeline scan completed. frames={frames_read}, sampled={frames_sampled}, "
            f"candidates={candidates_detected}, events={events_created}, alerts={alerts_created}"
        )
        await update_scan_job_progress(
            job_id,
            {
                "status": "succeeded",
                "progress": {
                    "pct": 100,
                    "framesRead": frames_read,
                    "framesSampled": frames_sampled,
                    "candidatesDetected": candidates_detected,
                    "eventsCreated": events_created,
                },
                "timeline": {
                    "durationSec": duration_sec,
                    "processedSec": last_frame_sec,
                    "lastFrameSec": last_frame_sec,
                },
                "result": {
                    "summary": summary,
                    "eventsCount": events_created,
                    "alertsCount": alerts_created,
                },
            },
        )
        logger.success(f"[vod] job={job_id} done: {summary}")
    except Exception as error:
        logger.error(f"[vod] job={job_id} failed: {error}")
        await update_scan_job_progress(
            job_id,
            {
                "status": "failed",
                "progress": {
                    "framesRead": frames_read,
                    "framesSampled": frames_sampled,
                    "candidatesDetected": candidates_detected,
                    "eventsCreated": events_created,
                },
                "timeline": {
                    "durationSec": duration_sec,
                    "processedSec": last_frame_sec,
                    "lastFrameSec": last_frame_sec,
                },
                "result": {
                    "eventsCount": events_created,
                    "alertsCount": alerts_created,
                },
                "error": {
                    "message": str(error),
                    "details": repr(error),
                },
            },
        )
    finally:
        if adapter is not None:
            try:
                await _run_blocking(adapter.close)
            except Exception:
                pass


async def run_vod_scan_queue(stop_event: asyncio.Event) -> None:
    if not ENABLE_VOD_SCAN_WORKER:
        logger.info("[vod] Queue worker tắt (ENABLE_VOD_SCAN_WORKER=false).")
        return

    logger.info(
        f"[vod] queue worker started (poll={VOD_SCAN_POLL_SECONDS}s, media={MEDIA_OUTPUT_DIR})"
    )

    while not stop_event.is_set():
        try:
            job = await claim_next_scan_job("ai-vod-worker")
            if job:
                await _process_scan_job(job, stop_event)
                continue

            try:
                await asyncio.wait_for(stop_event.wait(), timeout=VOD_SCAN_POLL_SECONDS)
                break
            except asyncio.TimeoutError:
                pass
        except asyncio.CancelledError:
            break
        except Exception as error:
            logger.error(f"[vod] loop error: {error}")
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=VOD_SCAN_POLL_SECONDS)
                break
            except asyncio.TimeoutError:
                pass

    logger.info("[vod] queue worker stopped")
