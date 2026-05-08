"""
Geocoding qua Nominatim (OpenStreetMap, miễn phí). Throttle 1 req/s
theo ToS, set User-Agent đàng hoàng.

Có 3 lớp tăng accuracy:
  - Validate kết quả nằm trong VN bbox (reject query ambiguous trả điểm ngoài VN).
  - Cascading: query full fail thì cắt từ đầu thử lại đến khi còn city level.
  - LRU cache 1000 entry, kèm negative cache để khỏi gọi lại query đã fail.
"""
import asyncio
import time
from collections import OrderedDict
from typing import Optional, Tuple

import httpx
from loguru import logger

from config import NOMINATIM_USER_AGENT


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

# VN bounding box (xấp xỉ): [minLng, minLat, maxLng, maxLat]
VN_BBOX = (102.0, 8.0, 110.0, 23.5)

# Throttle 1 req/s theo Nominatim ToS — toàn bộ service share lock này.
_lock = asyncio.Lock()
_last_request_ts = 0.0

# LRU cache: query → (lat, lng) hoặc None (negative cache để khỏi gọi lại query đã fail).
_CACHE_MAX = 1000
_cache: "OrderedDict[str, Optional[Tuple[float, float]]]" = OrderedDict()
# TTL negative cache (giây) — cho phép retry sau 1 giờ khi query fail
_NEG_TTL = 3600
_neg_ts: dict = {}


def _in_vn_bbox(lat: float, lng: float) -> bool:
    min_lng, min_lat, max_lng, max_lat = VN_BBOX
    return min_lat <= lat <= max_lat and min_lng <= lng <= max_lng


def _cache_get(key: str) -> Tuple[bool, Optional[Tuple[float, float]]]:
    """Returns (hit, value). value=None nghĩa là negative cache (đã thử fail)."""
    if key in _cache:
        val = _cache[key]
        # Negative cache có TTL
        if val is None:
            if time.time() - _neg_ts.get(key, 0) > _NEG_TTL:
                _cache.pop(key, None)
                _neg_ts.pop(key, None)
                return (False, None)
        # Move to end (LRU)
        _cache.move_to_end(key)
        return (True, val)
    return (False, None)


def _cache_set(key: str, value: Optional[Tuple[float, float]]) -> None:
    if key in _cache:
        _cache.move_to_end(key)
    _cache[key] = value
    if value is None:
        _neg_ts[key] = time.time()
    if len(_cache) > _CACHE_MAX:
        evicted, _ = _cache.popitem(last=False)
        _neg_ts.pop(evicted, None)


async def _nominatim_lookup(query: str) -> Optional[Tuple[float, float]]:
    """1 request thật tới Nominatim, throttled 1.1s."""
    global _last_request_ts
    async with _lock:
        loop = asyncio.get_running_loop()
        now = loop.time()
        wait = 1.1 - (now - _last_request_ts)
        if wait > 0:
            await asyncio.sleep(wait)

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    NOMINATIM_URL,
                    params={
                        "q": query,
                        "format": "json",
                        "limit": 1,
                        "countrycodes": "vn",
                        "accept-language": "vi",
                        "addressdetails": 0,
                    },
                    headers={"User-Agent": NOMINATIM_USER_AGENT},
                )
                _last_request_ts = loop.time()

                if r.status_code != 200:
                    logger.warning(f"Nominatim HTTP {r.status_code} for '{query}'")
                    return None

                data = r.json()
                if not data:
                    logger.debug(f"Nominatim no result for '{query}'")
                    return None

                lat = float(data[0]["lat"])
                lng = float(data[0]["lon"])

                if not _in_vn_bbox(lat, lng):
                    logger.warning(
                        f"Nominatim trả ngoài VN ({lat:.4f}, {lng:.4f}) cho '{query}' — reject"
                    )
                    return None

                importance = float(data[0].get("importance", 0.0) or 0.0)
                if importance < 0.2:
                    logger.debug(
                        f"Nominatim low-importance ({importance:.2f}) for '{query}', vẫn dùng"
                    )

                logger.info(f"Geocoded '{query}' → ({lat:.5f}, {lng:.5f}) imp={importance:.2f}")
                return (lat, lng)
        except Exception as e:
            logger.warning(f"Nominatim error for '{query}': {e}")
            return None


def _split_progressively(query: str) -> list:
    """
    "Đường Lê Lợi, Quận 1, TP.HCM" →
        ["Đường Lê Lợi, Quận 1, TP.HCM", "Quận 1, TP.HCM", "TP.HCM"]
    Cắt từ đầu (specific) bỏ dần.
    """
    parts = [p.strip() for p in query.split(",") if p.strip()]
    if not parts:
        return [query.strip()] if query.strip() else []
    return [", ".join(parts[i:]) for i in range(len(parts))]


async def geocode(query: str) -> Optional[Tuple[float, float]]:
    """
    Geocode query string → (lat, lng) hoặc None.

    Chiến lược:
      1. Check cache (positive + negative).
      2. Thử query đầy đủ trên Nominatim.
      3. Nếu fail, cắt bớt phần đầu (rough → less rough), thử lại.
      4. Trả kết quả đầu tiên thành công, hoặc None nếu cạn.
      5. Lưu cache cho query gốc.
    """
    if not query or not query.strip():
        return None

    norm = query.strip()
    hit, val = _cache_get(norm)
    if hit:
        return val

    for variant in _split_progressively(norm):
        # Check cache cho variant trung gian luôn
        v_hit, v_val = _cache_get(variant)
        if v_hit:
            if v_val is not None:
                _cache_set(norm, v_val)
                return v_val
            continue  # variant đã fail, qua variant tiếp theo

        result = await _nominatim_lookup(variant)
        _cache_set(variant, result)
        if result is not None:
            _cache_set(norm, result)
            return result

    _cache_set(norm, None)
    return None
