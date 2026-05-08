"""
Worker quét RSS các báo VN tìm tin về thiên tai/tai nạn, phân loại theo
keyword, extract địa điểm và POST alert lên backend.

So với youtube_hunter, RSS không cần verify bằng AI vision vì đã là tin
biên tập, độ tin cậy cao hơn. Cover được hầu hết disaster type và miễn
phí (không có quota như YouTube API).

Mặc định 3 báo lớn: VnExpress, Tuổi Trẻ, Thanh Niên. Có thể đổi qua biến
RSS_FEEDS trong .env.
"""
import asyncio
import re
import time
from typing import List, Optional, Tuple
from urllib.parse import urlparse

import httpx
from loguru import logger

from config import (
    RSS_FEEDS,
    RSS_POLL_INTERVAL_SECONDS,
    RSS_USER_AGENT,
    DEFAULT_LAT,
    DEFAULT_LNG,
)
from backend_client import post_alert_payload
from services.location_extractor import extract_location
from services.geocoder import geocode


# Cache đã xử lý — tránh tạo alert trùng cho cùng 1 entry RSS
_processed_guids: dict = {}   # {guid: timestamp}
_PROCESSED_TTL = 7 * 24 * 3600


def _prune_cache() -> None:
    cutoff = time.time() - _PROCESSED_TTL
    stale = [g for g, ts in _processed_guids.items() if ts < cutoff]
    for g in stale:
        del _processed_guids[g]


# Phân loại disaster — thứ tự = ưu tiên check (severity cao / hiếm hơn trước)
DISASTER_KEYWORDS: List[Tuple[str, List[str]]] = [
    ("earthquake", ["động đất", "rung chấn"]),
    ("landslide", ["sạt lở", "lở đất", "sạt đất", "lở núi"]),
    ("fire", ["cháy lớn", "hỏa hoạn", "cháy nhà", "cháy chợ", "cháy chung cư",
              "cháy xưởng", "cháy rừng", "phát hỏa", "hỏa thiêu"]),
    ("storm", ["bão số", "siêu bão", "áp thấp nhiệt đới", "lốc xoáy", "gió lốc",
               "bão đổ bộ"]),
    ("flood", ["ngập sâu", "ngập nặng", "ngập lụt", "lũ quét", "lũ lớn",
               "lụt", "triều cường", "ngập úng"]),
    ("traffic", ["tai nạn giao thông nghiêm trọng", "tai nạn liên hoàn",
                 "lật xe", "xe container", "tai nạn chết người"]),
]

# Severity theo type
SEVERITY_MAP = {
    "earthquake": 5,
    "landslide": 4,
    "fire": 4,
    "storm": 3,
    "flood": 3,
    "traffic": 2,
    "other": 2,
}

# Tên hiển thị cho từng nguồn (lookup theo domain)
SOURCE_NAMES = {
    "vnexpress.net": "VnExpress",
    "tuoitre.vn": "Tuổi Trẻ",
    "thanhnien.vn": "Thanh Niên",
    "baotintuc.vn": "Báo Tin Tức",
    "tienphong.vn": "Tiền Phong",
    "nld.com.vn": "Người Lao Động",
    "dantri.com.vn": "Dân Trí",
    "laodong.vn": "Lao Động",
    "vietnamnet.vn": "VietNamNet",
}


def _classify_disaster(text: str) -> Optional[str]:
    """Trả disaster type khớp đầu tiên trong DISASTER_KEYWORDS, hoặc None."""
    if not text:
        return None
    lower = text.lower()
    for dtype, keywords in DISASTER_KEYWORDS:
        for kw in keywords:
            if kw in lower:
                return dtype
    return None


def _domain_of(url: str) -> str:
    try:
        netloc = urlparse(url).netloc.lower()
        return netloc[4:] if netloc.startswith("www.") else netloc
    except Exception:
        return ""


def _source_label(url: str) -> str:
    dom = _domain_of(url)
    return SOURCE_NAMES.get(dom, dom or "RSS")


_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(s: str) -> str:
    if not s:
        return ""
    return re.sub(r"\s+", " ", _HTML_TAG_RE.sub("", s)).strip()


# Fetch và parse feed
async def _fetch_feed_entries(url: str) -> List[dict]:
    """
    Fetch RSS feed bằng httpx async, parse bằng feedparser (sync, run trong executor).
    Trả list dict { 'title', 'summary', 'link', 'guid' }.
    """
    try:
        async with httpx.AsyncClient(
            timeout=20.0,
            headers={"User-Agent": RSS_USER_AGENT},
            follow_redirects=True,
        ) as client:
            r = await client.get(url)
        if r.status_code != 200:
            logger.warning(f"[rss] HTTP {r.status_code} from {url}")
            return []
        content = r.content
    except Exception as e:
        logger.error(f"[rss] fetch error {url}: {e}")
        return []

    def _parse() -> List[dict]:
        try:
            import feedparser  # noqa: WPS433

            feed = feedparser.parse(content)
            out: List[dict] = []
            for e in getattr(feed, "entries", []) or []:
                out.append(
                    {
                        "title": (e.get("title") or "").strip(),
                        "summary": _strip_html(
                            e.get("summary") or e.get("description") or ""
                        ),
                        "link": e.get("link") or "",
                        "guid": e.get("id") or e.get("guid") or e.get("link") or "",
                    }
                )
            return out
        except Exception as ex:
            logger.error(f"[rss] feedparser error {url}: {ex}")
            return []

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _parse)


# Resolve location bằng NER + geocoding
async def _resolve_location(
    title: str, summary: str
) -> Tuple[float, float, str, float]:
    """
    Returns (lat, lng, address, confidence).

    Confidence cao hơn YouTube vì RSS thường có địa chỉ tường minh:
      0.80 — extract + geocode OK
      0.55 — extract OK, geocode fail
      0.30 — không extract được
    """
    text = f"{title}. {summary}".strip()
    extracted = extract_location(text)
    if extracted:
        coords = await geocode(extracted)
        if coords:
            return (coords[0], coords[1], extracted, 0.80)
        return (DEFAULT_LAT, DEFAULT_LNG, f"{extracted} (chưa định vị chính xác)", 0.55)
    return (
        DEFAULT_LAT,
        DEFAULT_LNG,
        "Vị trí không xác định",
        0.30,
    )


# Xử lý từng entry và post alert
async def _process_entry(entry: dict, feed_url: str) -> Optional[dict]:
    """
    Trả về payload alert đã post thành công, hoặc None nếu skip.
    """
    title = entry["title"]
    summary = entry["summary"]
    link = entry["link"]
    guid = entry["guid"]
    if not guid:
        return None
    if guid in _processed_guids:
        return None

    _processed_guids[guid] = time.time()

    full_text = f"{title}. {summary}"
    dtype = _classify_disaster(full_text)
    if not dtype:
        return None  # bài thường — bỏ qua

    source_label = _source_label(feed_url or link)
    logger.info(f"[rss] match {dtype} ({source_label}): {title}")

    lat, lng, address, conf = await _resolve_location(title, summary)

    desc = f"[{source_label}] {title}"
    if summary:
        desc += f" — {summary[:200]}"
    desc = desc[:1000]

    payload = {
        "type": dtype,
        "address": address[:500],
        "lat": lat,
        "lng": lng,
        "source": "crawler",
        "severity": SEVERITY_MAP.get(dtype, 3),
        "confidence": conf,
        "description": desc,
    }
    if link:
        payload["sourceUrl"] = link[:1000]

    result = await post_alert_payload(payload)
    if result:
        logger.success(
            f"[rss] alert posted ({dtype}) @ {address} (id={result.get('_id')})"
        )
    return result


# Main loop
async def run_rss_hunter(stop_event: asyncio.Event) -> None:
    if not RSS_FEEDS:
        logger.warning("[rss] RSS_FEEDS rỗng — không khởi động.")
        return

    logger.info(
        f"[rss] started — {len(RSS_FEEDS)} feeds, poll {RSS_POLL_INTERVAL_SECONDS}s"
    )
    for f in RSS_FEEDS:
        logger.info(f"[rss]   - {_source_label(f)}: {f}")

    while not stop_event.is_set():
        try:
            _prune_cache()

            # Fetch song song cho tất cả feed
            results = await asyncio.gather(
                *(_fetch_feed_entries(url) for url in RSS_FEEDS),
                return_exceptions=True,
            )

            total_new = 0
            for url, entries in zip(RSS_FEEDS, results):
                if isinstance(entries, Exception):
                    logger.warning(f"[rss] {url} batch error: {entries}")
                    continue
                logger.debug(f"[rss] {_source_label(url)}: {len(entries)} entries")
                for entry in entries:
                    posted = await _process_entry(entry, url)
                    if posted:
                        total_new += 1

            if total_new:
                logger.info(f"[rss] tick xong — {total_new} alert mới posted")
            else:
                logger.debug("[rss] tick xong — không có tin disaster mới")

            try:
                await asyncio.wait_for(
                    stop_event.wait(), timeout=RSS_POLL_INTERVAL_SECONDS
                )
                break
            except asyncio.TimeoutError:
                pass

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"[rss] iteration error: {e}")
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=60)
                break
            except asyncio.TimeoutError:
                pass

    logger.info("[rss] stopped")
