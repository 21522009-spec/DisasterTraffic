"""
Worker quét YouTube tìm video thiên tai, verify bằng Vision LLM (Gemini)
hoặc YOLO fire model nếu Vision không có, sau đó extract địa điểm và
POST alert lên backend.

Search nhiều keyword riêng (vì YouTube q= không hỗ trợ regex |).
Cover cả livestream và video upload mới (publishedAfter).
Frame sampling thưa khi verify để khỏi tốn quota.

Worker không khởi động nếu chưa có YOUTUBE_API_KEY, hoặc nếu cả Gemini
lẫn YOLO fire model đều chưa có.
"""
import asyncio
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Tuple

from loguru import logger

from config import (
    YOUTUBE_API_KEY,
    YOUTUBE_SEARCH_KEYWORDS,
    YOUTUBE_POLL_INTERVAL_SECONDS,
    YOUTUBE_MAX_RESULTS,
    YOUTUBE_INCLUDE_VOD,
    YOUTUBE_VOD_HOURS,
    YOLO_VERIFY_MAX_SAMPLES,
    YOLO_VERIFY_FRAME_SKIP,
    FIRE_MODEL_PATH,
    DEFAULT_LAT,
    DEFAULT_LNG,
    YOLO_CONF,
)
from backend_client import post_alert_payload
from services.location_extractor import extract_location
from services.geocoder import geocode
from detectors import vision_llm


# Lazy-loaded — chỉ khởi tạo khi worker chạy
_youtube_client = None
_yolo_model = None
_processed_video_ids: dict = {}   # {video_id: timestamp} — tự prune sau 7 ngày
_PROCESSED_TTL = 7 * 24 * 3600   # 7 ngày tính bằng giây

# Severity gợi ý theo type
_SEVERITY = {
    "fire": 4,
    "flood": 3,
    "landslide": 4,
    "storm": 3,
    "traffic": 2,
}


def _prune_video_cache() -> None:
    cutoff = time.time() - _PROCESSED_TTL
    stale = [vid for vid, ts in _processed_video_ids.items() if ts < cutoff]
    for vid in stale:
        del _processed_video_ids[vid]
    if stale:
        logger.debug(f"[hunter] pruned {len(stale)} video IDs cũ khỏi cache")


def _get_youtube_client():
    """Build YouTube Data API v3 client. None nếu chưa có API key."""
    global _youtube_client
    if _youtube_client is None and YOUTUBE_API_KEY:
        from googleapiclient.discovery import build  # noqa: WPS433

        _youtube_client = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)
    return _youtube_client


def _get_yolo():
    """Lazy-load YOLO fire model. None nếu chưa có FIRE_MODEL_PATH."""
    global _yolo_model
    if _yolo_model is None and FIRE_MODEL_PATH:
        from ultralytics import YOLO  # noqa: WPS433

        logger.info(f"[hunter] Loading fire model: {FIRE_MODEL_PATH}")
        _yolo_model = YOLO(FIRE_MODEL_PATH)
        logger.success("[hunter] Fire model ready.")
    return _yolo_model


# YouTube search
async def _search_one(
    keyword: str,
    max_results: int,
    *,
    event_type: Optional[str] = None,
    published_after: Optional[str] = None,
) -> List[dict]:
    """1 lần search YouTube cho 1 keyword. Returns list items từ snippet."""
    client = _get_youtube_client()
    if not client:
        return []

    def _sync_call():
        try:
            params = {
                "part": "snippet",
                "q": keyword,
                "type": "video",
                "maxResults": max_results,
                "regionCode": "VN",
                "relevanceLanguage": "vi",
                "order": "date",
            }
            if event_type:
                params["eventType"] = event_type
            if published_after:
                params["publishedAfter"] = published_after
            req = client.search().list(**params)
            return req.execute().get("items", [])
        except Exception as e:
            logger.error(f"[hunter] YouTube search '{keyword}' error: {e}")
            return []

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _sync_call)


async def _gather_candidates() -> List[dict]:
    """
    Gom video candidate từ tất cả keywords + cả 2 mode (live + VOD).
    Dedupe theo videoId trong batch hiện tại.
    """
    keywords = YOUTUBE_SEARCH_KEYWORDS or []
    if not keywords:
        return []

    vod_after: Optional[str] = None
    if YOUTUBE_INCLUDE_VOD and YOUTUBE_VOD_HOURS > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=YOUTUBE_VOD_HOURS)
        vod_after = cutoff.strftime("%Y-%m-%dT%H:%M:%SZ")

    tasks = []
    for kw in keywords:
        # Livestream đang phát
        tasks.append(_search_one(kw, YOUTUBE_MAX_RESULTS, event_type="live"))
        # Video mới upload trong N giờ
        if vod_after:
            tasks.append(_search_one(kw, YOUTUBE_MAX_RESULTS, published_after=vod_after))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    seen = set()
    merged: List[dict] = []
    for batch in results:
        if isinstance(batch, Exception):
            logger.warning(f"[hunter] một search batch lỗi: {batch}")
            continue
        for v in batch:
            vid_id = v.get("id", {}).get("videoId")
            if not vid_id or vid_id in seen:
                continue
            seen.add(vid_id)
            merged.append(v)
    return merged


# Verify: Vision LLM trước, YOLO fallback
def _open_stream(video_id: str):
    """Mở stream qua vidgear/yt-dlp. Trả stream object hoặc None."""
    for attempt in range(2):
        try:
            from vidgear.gears import CamGear  # noqa: WPS433

            url = f"https://www.youtube.com/watch?v={video_id}"
            options = {
                "STREAM_RESOLUTION": "480p",
                "STREAM_PARAMS": {
                    "quiet": True,
                    "no_warnings": True,
                    "nocheckcertificate": True,
                },
            }
            return CamGear(
                source=url, stream_mode=True, logging=False, **options
            ).start()
        except Exception as e:
            msg = str(e).lower()
            if "not available" in msg or "private" in msg or "removed" in msg:
                logger.debug(f"[hunter] {video_id} không stream được — bỏ qua")
                return None
            logger.warning(
                f"[hunter] open stream {video_id} attempt {attempt + 1} failed: {e}"
            )
    return None


def _frame_to_jpeg(frame, quality: int = 80) -> Optional[bytes]:
    """Encode 1 frame BGR → JPEG bytes. None nếu thất bại."""
    try:
        import cv2  # noqa: WPS433

        ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
        return buf.tobytes() if ok else None
    except Exception as e:
        logger.warning(f"[hunter] cv2 encode error: {e}")
        return None


async def _verify_disaster_in_stream(
    video_id: str, hint: Optional[str] = None
) -> Optional[Tuple[str, float]]:
    """
    Mở stream, sample frames, verify bằng Vision LLM (primary) hoặc YOLO (fallback).

    Args:
        video_id: YouTube video ID.
        hint:     Loại disaster gợi ý từ keyword search (vd 'fire' cho keyword "cháy").

    Returns:
        (disaster_type, confidence) — type ∈ {fire,flood,landslide,storm,traffic}.
        None nếu không có disaster / lỗi / cả 2 verifier đều disable.
    """
    yolo = _get_yolo()
    use_vision = vision_llm.is_enabled()

    if not yolo and not use_vision:
        logger.debug("[hunter] Cả Vision LLM lẫn YOLO đều disable — skip verify")
        return None

    def _sync_verify() -> Optional[Tuple[str, float]]:
        stream = _open_stream(video_id)
        if stream is None:
            return None

        try:
            # Skip ~125 frame đầu (≈5s) để tránh intro / khoảng trống
            for _ in range(125):
                f = stream.read()
                if f is None:
                    break

            # ===== Vision LLM verify (1 frame, đa class) =====
            if use_vision:
                frame = stream.read()
                if frame is not None:
                    jpeg = _frame_to_jpeg(frame)
                    if jpeg:
                        result = vision_llm.verify_disaster(jpeg, hint=hint)
                        if result:
                            return result
                        # Vision LLM trả None (none / error) → thử YOLO fallback nếu có

            # ===== YOLO fallback (fire-only, sample nhiều frame) =====
            if yolo:
                fire_class_id = next(
                    (k for k, v in yolo.names.items() if v == "fire"), None
                )
                if fire_class_id is None:
                    logger.warning(
                        "[hunter] YOLO model không có class 'fire' — bỏ qua fallback."
                    )
                    return None

                samples_done = 0
                frame_idx = 0
                max_total = YOLO_VERIFY_MAX_SAMPLES * (YOLO_VERIFY_FRAME_SKIP + 1)

                while samples_done < YOLO_VERIFY_MAX_SAMPLES and frame_idx < max_total:
                    frame = stream.read()
                    if frame is None:
                        break
                    if frame_idx % (YOLO_VERIFY_FRAME_SKIP + 1) != 0:
                        frame_idx += 1
                        continue
                    samples_done += 1
                    frame_idx += 1

                    results = yolo(frame, conf=YOLO_CONF, verbose=False)
                    for r in results:
                        if r.boxes is None:
                            continue
                        for box in r.boxes:
                            if int(box.cls[0]) == fire_class_id:
                                logger.debug(
                                    f"[hunter] YOLO fire confirmed @ sample {samples_done}"
                                )
                                return ("fire", 0.85)

            return None
        finally:
            try:
                stream.stop()
            except Exception:
                pass

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _sync_verify)


# Resolve location từ title/description
async def _resolve_location(
    title: str, description: str = ""
) -> Tuple[float, float, str, float]:
    """
    Returns (lat, lng, address, location_confidence).
      0.85 — extract + geocode thành công
      0.55 — extract được nhưng geocode fail
      0.30 — không extract được gì
    """
    text = f"{title} {description}".strip()
    extracted = extract_location(text)

    if extracted:
        coords = await geocode(extracted)
        if coords:
            return (coords[0], coords[1], extracted, 0.85)
        return (DEFAULT_LAT, DEFAULT_LNG, f"{extracted} (chưa định vị chính xác)", 0.55)

    return (
        DEFAULT_LAT,
        DEFAULT_LNG,
        "Vị trí không xác định",
        0.30,
    )


# Post alert lên backend
async def _post_alert(
    title: str,
    video_id: str,
    dtype: str,
    lat: float,
    lng: float,
    address: str,
    confidence: float,
) -> Optional[dict]:
    payload = {
        "type": dtype,
        "address": address[:500],
        "lat": lat,
        "lng": lng,
        "source": "ai",
        "severity": _SEVERITY.get(dtype, 3),
        "description": f"Phát hiện qua YouTube ({dtype}): {title[:200]}",
        "confidence": round(confidence, 2),
        "sourceUrl": f"https://www.youtube.com/watch?v={video_id}",
    }
    return await post_alert_payload(payload)


# Main loop
async def run_youtube_hunter(stop_event: asyncio.Event) -> None:
    if not YOUTUBE_API_KEY:
        logger.warning("[hunter] YOUTUBE_API_KEY chưa set — không khởi động.")
        return

    has_vision = vision_llm.is_enabled()
    has_yolo = bool(FIRE_MODEL_PATH)

    if not has_vision and not has_yolo:
        logger.warning(
            "[hunter] Chưa có verifier nào — set GOOGLE_API_KEY (Vision LLM) "
            "HOẶC FIRE_MODEL_PATH (YOLO). Worker sẽ không khởi động."
        )
        return

    # Pre-load YOLO nếu có (fail sớm nếu config sai)
    if has_yolo:
        try:
            _get_yolo()
        except Exception as e:
            logger.error(f"[hunter] Không load được fire model: {e}")
            if not has_vision:
                return

    verifier_label = []
    if has_vision:
        verifier_label.append("Gemini Vision")
    if has_yolo:
        verifier_label.append("YOLO fire")

    logger.info(
        f"[hunter] started — {len(YOUTUBE_SEARCH_KEYWORDS)} keywords, "
        f"poll {YOUTUBE_POLL_INTERVAL_SECONDS}s, "
        f"VOD={YOUTUBE_INCLUDE_VOD} ({YOUTUBE_VOD_HOURS}h), "
        f"verify=[{' + '.join(verifier_label)}]"
    )

    while not stop_event.is_set():
        try:
            _prune_video_cache()
            videos = await _gather_candidates()
            new_videos = [
                v for v in videos
                if v.get("id", {}).get("videoId") not in _processed_video_ids
            ]

            if not new_videos:
                logger.debug("[hunter] không có video mới")
            else:
                logger.info(f"[hunter] tìm thấy {len(new_videos)} video mới — đang verify...")
                for v in new_videos:
                    vid_id = v["id"]["videoId"]
                    title = v["snippet"]["title"]
                    description = v["snippet"].get("description", "")
                    _processed_video_ids[vid_id] = time.time()

                    logger.info(f"[hunter] checking: {title}")

                    # Hint = 'fire' vì keyword hunter hiện tại tập trung vào cháy.
                    # Vision LLM có thể override nếu nhìn ra disaster type khác.
                    detection = await _verify_disaster_in_stream(vid_id, hint="fire")
                    if not detection:
                        logger.info(f"[hunter] {vid_id} — không thấy disaster, bỏ qua")
                        continue

                    dtype, dconf = detection
                    lat, lng, addr, loc_conf = await _resolve_location(title, description)
                    final_conf = dconf * loc_conf

                    logger.info(
                        f"[hunter] 🚨 {dtype.upper()} @ {addr} "
                        f"({lat:.4f}, {lng:.4f}) detect={dconf:.2f} loc={loc_conf:.2f} → {final_conf:.2f}"
                    )

                    result = await _post_alert(
                        title, vid_id, dtype, lat, lng, addr, final_conf
                    )
                    if result:
                        is_dup = isinstance(result, dict) and result.get("_id")
                        logger.success(
                            f"[hunter] alert posted ({dtype}, id={result.get('_id')})"
                        )

            # Sleep, có thể bị ngắt bởi stop_event
            try:
                await asyncio.wait_for(
                    stop_event.wait(), timeout=YOUTUBE_POLL_INTERVAL_SECONDS
                )
                break
            except asyncio.TimeoutError:
                pass

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"[hunter] iteration error: {e}")
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=60)
                break
            except asyncio.TimeoutError:
                pass

    logger.info("[hunter] stopped")
