"""
NER wrapper dùng underthesea, optional. Khi cài thì hỗ trợ thêm cho rule-based
location_extractor để bắt các địa danh hiếm gặp mà regex bỏ sót.

Cài: pip install underthesea  (lần đầu sẽ tải model ~500MB).
Nếu không cài, các function trả [] và code chính vẫn chạy bình thường.
"""
from typing import List

from loguru import logger


# Lazy-init state
_ner_fn = None
_load_attempted = False


def _try_load():
    """Try to import underthesea.ner. Trả về callable hoặc None."""
    global _ner_fn, _load_attempted
    if _load_attempted:
        return _ner_fn
    _load_attempted = True

    try:
        from underthesea import ner as _ner  # noqa: WPS433

        _ner_fn = _ner
        logger.info("[ner] underthesea loaded — NER hybrid mode ON")
    except ImportError:
        logger.debug(
            "[ner] underthesea chưa cài — chạy regex-only. "
            "Để bật NER: pip install underthesea"
        )
        _ner_fn = None
    except Exception as e:
        logger.warning(f"[ner] underthesea load error: {e}")
        _ner_fn = None
    return _ner_fn


def is_enabled() -> bool:
    """True nếu NER hybrid đã sẵn sàng dùng."""
    return _try_load() is not None


def extract_locations(text: str) -> List[str]:
    """
    Extract LOC entities từ text bằng underthesea.

    Returns:
        List các chuỗi địa danh đã merge B-LOC + I-LOC, dedup, preserve order.
        [] nếu NER disable hoặc không có entity.
    """
    if not text or not text.strip():
        return []
    fn = _try_load()
    if fn is None:
        return []

    try:
        tags = fn(text.strip())
    except Exception as e:
        logger.warning(f"[ner] extract error: {e}")
        return []

    locations: List[str] = []
    current: List[str] = []

    for token_info in tags or []:
        # underthesea.ner trả [token, pos_tag, chunk_tag, ner_tag]
        if not isinstance(token_info, (list, tuple)) or len(token_info) < 4:
            continue
        token = token_info[0]
        ner_tag = token_info[3] or ""

        if ner_tag == "B-LOC":
            if current:
                locations.append(" ".join(current).replace("_", " "))
                current = []
            current.append(token)
        elif ner_tag == "I-LOC" and current:
            current.append(token)
        else:
            if current:
                locations.append(" ".join(current).replace("_", " "))
                current = []

    if current:
        locations.append(" ".join(current).replace("_", " "))

    # Dedup case-insensitive, preserve order
    seen = set()
    out: List[str] = []
    for loc in locations:
        loc_clean = loc.strip()
        key = loc_clean.lower()
        if loc_clean and key not in seen:
            seen.add(key)
            out.append(loc_clean)
    return out
