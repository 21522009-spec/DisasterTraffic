"""HTTP client để gọi backend DisasterTrafficWeb."""
import asyncio
from typing import List, Optional

import httpx
from loguru import logger

from config import BACKEND_URL, AI_WEBHOOK_SECRET

_client: Optional[httpx.AsyncClient] = None

# Delays (giây) cho mỗi lần retry: 2s, 4s, 8s
_RETRY_DELAYS = [2.0, 4.0, 8.0]


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=BACKEND_URL,
            timeout=15.0,
            headers={"User-Agent": "DisasterTraffic-AIService/0.1"},
        )
    return _client


async def close_client() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


async def _post_with_retry(url: str, payload: dict, headers: dict) -> Optional[httpx.Response]:
    """POST với exponential backoff retry. Chỉ retry khi lỗi mạng hoặc 5xx."""
    client = _get_client()
    last_exc = None

    for attempt, delay in enumerate([0.0] + _RETRY_DELAYS):
        if delay > 0:
            logger.warning(f"[backend] Retry lần {attempt}/{len(_RETRY_DELAYS)} sau {delay}s...")
            await asyncio.sleep(delay)
        try:
            r = await client.post(url, json=payload, headers=headers)
            if r.status_code < 500:
                return r
            # 5xx — server tạm lỗi, retry
            logger.warning(f"[backend] Server trả {r.status_code}, sẽ retry...")
        except Exception as e:
            last_exc = e
            logger.warning(f"[backend] Request lỗi: {e}")

    if last_exc:
        raise last_exc
    return None


async def fetch_active_cameras() -> List[dict]:
    """GET /api/cameras?status=active"""
    client = _get_client()
    try:
        r = await client.get("/api/cameras", params={"status": "active", "limit": 1000})
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.error(f"fetch_active_cameras error: {e}")
        return []


async def claim_next_scan_job(worker_id: str) -> Optional[dict]:
    """POST /api/scan-jobs/claim — claim job queued sớm nhất cho worker."""
    try:
        r = await _post_with_retry(
            "/api/scan-jobs/claim",
            {"workerId": worker_id},
            {"x-api-key": AI_WEBHOOK_SECRET},
        )
        if r is None or r.status_code >= 400:
            logger.error(f"claim_next_scan_job failed: HTTP {r.status_code if r else 'no response'}")
            return None
        data = r.json().get("data")
        return data if isinstance(data, dict) else None
    except Exception as e:
        logger.error(f"claim_next_scan_job error: {e}")
        return None


async def update_scan_job_progress(scan_job_id: str, payload: dict) -> bool:
    """POST /api/scan-jobs/:id/progress — update status/progress/timeline."""
    try:
        r = await _post_with_retry(
            f"/api/scan-jobs/{scan_job_id}/progress",
            payload,
            {"x-api-key": AI_WEBHOOK_SECRET},
        )
        return bool(r is not None and r.status_code < 400)
    except Exception as e:
        logger.error(f"update_scan_job_progress error: {e}")
        return False


async def create_scan_job_event(scan_job_id: str, payload: dict) -> Optional[dict]:
    """POST /api/scan-jobs/:id/events — persist event and optionally alert."""
    try:
        r = await _post_with_retry(
            f"/api/scan-jobs/{scan_job_id}/events",
            payload,
            {"x-api-key": AI_WEBHOOK_SECRET},
        )
        if r is None or r.status_code >= 400:
            logger.error(f"create_scan_job_event failed: HTTP {r.status_code if r else 'no response'}")
            return None
        return r.json().get("data")
    except Exception as e:
        logger.error(f"create_scan_job_event error: {e}")
        return None


async def post_alert(camera: dict, detection: dict) -> Optional[dict]:
    """
    POST /api/alerts với header x-api-key.
    Toạ độ alert = toạ độ camera. Tự retry khi backend tạm lỗi.
    """
    payload = {
        "type": detection["type"],
        "address": camera.get("address") or camera.get("name") or "Unknown",
        "lng": camera["lng"],
        "lat": camera["lat"],
        "source": "ai",
        "severity": detection.get("severity", 3),
        "description": detection.get("description", ""),
        "confidence": detection.get("confidence", 0.7),
    }
    if camera.get("streamUrl"):
        payload["sourceUrl"] = camera["streamUrl"]

    try:
        r = await _post_with_retry(
            "/api/alerts",
            payload,
            {"x-api-key": AI_WEBHOOK_SECRET},
        )
        if r is None or r.status_code >= 400:
            logger.error(f"post_alert failed: HTTP {r.status_code if r else 'no response'}")
            return None
        return r.json().get("data")
    except Exception as e:
        logger.error(f"post_alert error: {e}")
        return None


async def post_alert_payload(payload: dict) -> Optional[dict]:
    """
    POST /api/alerts với raw payload (dùng cho YouTube/RSS hunter).
    Tự retry khi backend tạm lỗi.
    """
    try:
        r = await _post_with_retry(
            "/api/alerts",
            payload,
            {"x-api-key": AI_WEBHOOK_SECRET},
        )
        if r is None or r.status_code >= 400:
            logger.error(f"post_alert_payload failed: HTTP {r.status_code if r else 'no response'}")
            return None
        return r.json().get("data")
    except Exception as e:
        logger.error(f"post_alert_payload error: {e}")
        return None


async def heartbeat(camera_id: str) -> bool:
    """POST /api/cameras/:id/heartbeat — cập nhật lastAlertAt cho cooldown."""
    client = _get_client()
    try:
        r = await client.post(
            f"/api/cameras/{camera_id}/heartbeat",
            headers={"x-api-key": AI_WEBHOOK_SECRET},
        )
        return r.status_code < 400
    except Exception as e:
        logger.warning(f"heartbeat error: {e}")
        return False
