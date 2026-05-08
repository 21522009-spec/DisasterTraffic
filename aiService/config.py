"""Đọc cấu hình từ .env."""
import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv

load_dotenv()


def _f(key: str, default: float) -> float:
    try:
        return float(os.getenv(key, default))
    except (TypeError, ValueError):
        return default


def _i(key: str, default: int) -> int:
    try:
        return int(os.getenv(key, default))
    except (TypeError, ValueError):
        return default


def _b(key: str, default: bool) -> bool:
    v = os.getenv(key)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def _list(key: str, default: List[str], sep: str = "|") -> List[str]:
    """Parse list từ env, chấp nhận `|` hoặc `,`. Trim trắng và bỏ rỗng."""
    raw = os.getenv(key)
    if raw is None:
        return list(default)
    if "|" in raw:
        items = raw.split("|")
    else:
        items = raw.split(sep) if sep != "|" else raw.split(",")
    return [s.strip() for s in items if s.strip()]


# ===== Backend =====
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:3000").rstrip("/")
AI_WEBHOOK_SECRET: str = os.getenv("AI_WEBHOOK_SECRET", "")

# ===== Scheduling (camera workers) =====
DETECT_INTERVAL_SECONDS: int = _i("DETECT_INTERVAL_SECONDS", 20)
CAMERA_REFRESH_SECONDS: int = _i("CAMERA_REFRESH_SECONDS", 60)

# ===== Detector (camera workers) =====
DETECTOR: str = os.getenv("DETECTOR", "yolo").lower()
YOLO_MODEL: str = os.getenv("YOLO_MODEL", "yolov8n.pt")
YOLO_CONF: float = _f("YOLO_CONF", 0.4)
TRAFFIC_VEHICLE_THRESHOLD: int = _i("TRAFFIC_VEHICLE_THRESHOLD", 8)
FIRE_MODEL_PATH: str = os.getenv("FIRE_MODEL_PATH", "")

# ===== Video sources =====
VIDEOS_DIR: Path = Path(os.getenv("VIDEOS_DIR", str(Path(__file__).parent / "videos")))
DEFAULT_VIDEO: str = os.getenv("DEFAULT_VIDEO", "default.mp4")
MOCK_DETECTION_PROBABILITY: float = _f("MOCK_DETECTION_PROBABILITY", 0.3)

# ===== YouTube Hunter =====
ENABLE_YOUTUBE_HUNTER: bool = _b("ENABLE_YOUTUBE_HUNTER", False)
YOUTUBE_API_KEY: str = os.getenv("YOUTUBE_API_KEY", "")
# Multi-keyword: list, mỗi keyword search riêng. `|` hoặc `,` ngăn cách.
YOUTUBE_SEARCH_KEYWORDS: List[str] = _list(
    "YOUTUBE_SEARCH_KEYWORDS",
    ["cháy lớn", "hỏa hoạn", "cháy nhà"],
)
YOUTUBE_POLL_INTERVAL_SECONDS: int = _i("YOUTUBE_POLL_INTERVAL_SECONDS", 180)
YOUTUBE_MAX_RESULTS: int = _i("YOUTUBE_MAX_RESULTS", 5)
# Bao gồm video upload (VOD) trong N giờ gần nhất, ngoài livestream.
YOUTUBE_INCLUDE_VOD: bool = _b("YOUTUBE_INCLUDE_VOD", True)
YOUTUBE_VOD_HOURS: int = _i("YOUTUBE_VOD_HOURS", 6)

# Số lượng frame sample để verify fire (lấy thưa, không liên tiếp).
YOLO_VERIFY_MAX_SAMPLES: int = _i("YOLO_VERIFY_MAX_SAMPLES", 30)
# Mỗi N frame thì sample 1 lần. Vd YOLO_VERIFY_FRAME_SKIP=12 ở 25 fps → ~0.5s/sample.
YOLO_VERIFY_FRAME_SKIP: int = _i("YOLO_VERIFY_FRAME_SKIP", 12)

# ===== RSS Hunter =====
ENABLE_RSS_HUNTER: bool = _b("ENABLE_RSS_HUNTER", False)
# Danh sách RSS feed URL, ngăn cách bằng `,` hoặc `|` (KHÔNG nên có | trong URL).
# Default: 3 báo lớn VN có RSS ổn định.
RSS_FEEDS: List[str] = _list(
    "RSS_FEEDS",
    [
        "https://vnexpress.net/rss/thoi-su.rss",
        "https://tuoitre.vn/rss/tin-moi-nhat.rss",
        "https://thanhnien.vn/rss/home.rss",
    ],
)
# Tần suất poll RSS (giây). 600 = 10 phút. Báo VN cập nhật ~10-30 phút/lần.
RSS_POLL_INTERVAL_SECONDS: int = _i("RSS_POLL_INTERVAL_SECONDS", 600)
RSS_USER_AGENT: str = os.getenv(
    "RSS_USER_AGENT", "DisasterTraffic-AIService/0.1 RSS reader"
)

# Toạ độ fallback khi NER + geocoding cùng fail. Mặc định: trung tâm Q.1 TP.HCM.
DEFAULT_LAT: float = _f("DEFAULT_LAT", 10.776889)
DEFAULT_LNG: float = _f("DEFAULT_LNG", 106.700806)

# Nominatim user-agent (yêu cầu của Nominatim ToS)
NOMINATIM_USER_AGENT: str = os.getenv(
    "NOMINATIM_USER_AGENT", "DisasterTraffic-AIService/0.1"
)

# ===== Logging =====
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()
