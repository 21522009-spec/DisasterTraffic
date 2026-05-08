"""
Trích xuất địa điểm tiếng Việt từ title/description (rule-based).

Pattern hỗ trợ theo thứ tự ưu tiên (cụ thể -> tổng quát):
  "Cầu X" / "Ngã 4 X" / "Đường X" / "Phường X" / "Chợ X" /
  "Quận N" / "Huyện X" -> sau đó append city context (TP.HCM / Hà Nội /
  tỉnh khác).

VD: extract_location("Cháy lớn ở Đường Nguyễn Hữu Cảnh, Bình Thạnh")
    -> "Đường Nguyễn Hữu Cảnh, Bình Thạnh, TP.HCM"
"""
import re
from typing import List, Optional


# Danh sách quận/huyện TP.HCM (thường gặp trong tin tức)
HCM_DISTRICTS = [
    # Quận
    "Quận 1", "Quận 2", "Quận 3", "Quận 4", "Quận 5", "Quận 6",
    "Quận 7", "Quận 8", "Quận 9", "Quận 10", "Quận 11", "Quận 12",
    "Quận Bình Tân", "Quận Bình Thạnh", "Quận Gò Vấp", "Quận Phú Nhuận",
    "Quận Tân Bình", "Quận Tân Phú",
    # TP/Huyện
    "Thành phố Thủ Đức", "Thủ Đức",
    "Huyện Bình Chánh", "Huyện Cần Giờ", "Huyện Củ Chi",
    "Huyện Hóc Môn", "Huyện Nhà Bè",
    # Viết tắt thường thấy (không có prefix "Quận"/"Huyện")
    "Bình Thạnh", "Gò Vấp", "Phú Nhuận", "Tân Bình", "Tân Phú", "Bình Tân",
    "Bình Chánh", "Hóc Môn", "Nhà Bè", "Củ Chi", "Cần Giờ",
]

# Tỉnh/thành Việt Nam (đầy đủ — xuất hiện trong tin báo VN cả nước)
# Order theo độ dài giảm dần được handle trong code (longest match wins).
NEARBY_CITIES = [
    # Tỉnh/thành miền Nam & lân cận TP.HCM
    "Đồng Nai", "Bình Dương", "Long An", "Bà Rịa - Vũng Tàu", "Vũng Tàu",
    "Tây Ninh", "Tiền Giang", "Bến Tre", "Đồng Tháp", "Vĩnh Long",
    "Cần Thơ", "An Giang", "Kiên Giang", "Hậu Giang", "Sóc Trăng",
    "Bạc Liêu", "Cà Mau", "Trà Vinh", "Lâm Đồng", "Bình Phước",
    "Bình Thuận", "Ninh Thuận", "Khánh Hòa", "Phú Yên",
    # TP lớn miền Trung
    "Đà Nẵng", "Quảng Nam", "Quảng Ngãi", "Bình Định", "Quảng Bình",
    "Quảng Trị", "Thừa Thiên Huế", "Huế", "Nghệ An", "Hà Tĩnh",
    "Thanh Hóa", "Kon Tum", "Gia Lai", "Đắk Lắk", "Đắk Nông",
    # TP lớn miền Bắc
    "Hà Nội", "Hải Phòng", "Quảng Ninh", "Hạ Long", "Bắc Ninh",
    "Hải Dương", "Hưng Yên", "Hà Nam", "Nam Định", "Thái Bình",
    "Ninh Bình", "Vĩnh Phúc", "Phú Thọ", "Bắc Giang", "Lạng Sơn",
    "Cao Bằng", "Bắc Kạn", "Thái Nguyên", "Tuyên Quang", "Hà Giang",
    "Yên Bái", "Lào Cai", "Lai Châu", "Điện Biên", "Sơn La", "Hòa Bình",
    # Các TP/TX trực thuộc tỉnh hay xuất hiện trong tin
    "Nha Trang", "Phan Thiết", "Phan Rang", "Đà Lạt", "Buôn Ma Thuột",
    "Pleiku", "Quy Nhơn", "Tuy Hòa", "Hội An", "Tam Kỳ", "Vinh",
    "Móng Cái", "Cẩm Phả", "Sa Pa", "Phú Quốc", "Côn Đảo",
]

# Khối ký tự bắt đầu một "tên riêng" tiếng Việt (chữ hoa có dấu)
_UPPER_VI = r"A-ZÀ-ỸĐ"
_LOWER_VI = r"a-zà-ỹđ"
# Một "từ" trong tên riêng: bắt đầu bằng chữ hoa, có thể kèm chữ thường, hoặc là số (D2, Số 5)
_NAME_WORD = rf"(?:[{_UPPER_VI}][{_UPPER_VI}{_LOWER_VI}]*|[A-Z]?\d+)"
# 1 đến 5 từ liên tiếp ngăn bằng space
_NAME_PHRASE = rf"{_NAME_WORD}(?:\s+{_NAME_WORD}){{0,4}}"

# ===== Patterns (Title-case loose, cho phép cả số) =====
DUONG_RE = re.compile(rf"\b(đường\s+(?:Số\s+)?{_NAME_PHRASE})\b", re.IGNORECASE)
CAU_RE = re.compile(rf"\b(cầu\s+{_NAME_PHRASE})\b", re.IGNORECASE)
# Ngã 3, Ngã 4, Ngã ba, Ngã tư, Ngã năm, Vòng xoay
NGA_RE = re.compile(
    rf"\b((?:ngã\s+(?:\d+|[a-zà-ỹ]+)|vòng\s+xoay)\s+{_NAME_PHRASE})\b",
    re.IGNORECASE,
)
PHUONG_RE = re.compile(rf"\b(phường\s+(?:{_NAME_WORD}|\d+)(?:\s+{_NAME_WORD}){{0,3}})\b", re.IGNORECASE)
CHO_RE = re.compile(rf"\b(chợ\s+{_NAME_PHRASE})\b", re.IGNORECASE)
DISTRICT_RE = re.compile(rf"\b(quận\s+(?:\d+|{_NAME_PHRASE}))\b", re.IGNORECASE)
HUYEN_RE = re.compile(rf"\b(huyện\s+{_NAME_PHRASE})\b", re.IGNORECASE)

# Patterns lookup theo thứ tự ưu tiên (specific → general)
_LANDMARK_PATTERNS = [
    ("đường", DUONG_RE),
    ("cầu", CAU_RE),
    ("ngã", NGA_RE),
    ("chợ", CHO_RE),
    ("phường", PHUONG_RE),
]

# Các viết tắt nên giữ in HOA hoặc giữ nguyên khi normalize
_PRESERVE_TOKENS = {
    "TP", "TP.", "TPHCM", "TP.HCM", "HCM",
    "TT", "TT.", "KCN", "KCX", "ĐH",
    "Q", "Q.", "P", "P.", "H", "H.",
}


def _normalize_match(s: str) -> str:
    """
    Title-case có ngữ cảnh:
      "đường nguyễn HỮU cảnh" → "Đường Nguyễn Hữu Cảnh"
      "tp.hcm" → "TP.HCM"
      "phường bến nghé" → "Phường Bến Nghé"
    Giữ nguyên các viết tắt phổ biến (TP, KCN, Q.…) và token toàn chữ số.
    """
    out = []
    for raw in s.split():
        upper = raw.upper()
        if upper in _PRESERVE_TOKENS or upper.replace(".", "") in _PRESERVE_TOKENS:
            out.append(upper)
            continue
        if raw.isdigit() or re.fullmatch(r"[A-Z]\d+", upper):
            out.append(upper)
            continue
        out.append(raw[:1].upper() + raw[1:].lower())
    return " ".join(out)


def _find_first(text: str) -> List[str]:
    """Áp dụng các pattern landmark theo thứ tự ưu tiên, trả về list các phần tìm được (có thể nhiều cái khác nhóm)."""
    found = []
    seen_groups = set()
    for label, pat in _LANDMARK_PATTERNS:
        m = pat.search(text)
        if m and label not in seen_groups:
            normalized = _normalize_match(m.group(1))
            found.append(normalized)
            seen_groups.add(label)
    return found


def _find_district(text: str) -> Optional[str]:
    """Tìm "Quận N" / "Quận X" trong text, fallback bằng tên quận quen thuộc."""
    m = DISTRICT_RE.search(text)
    if m:
        return _normalize_match(m.group(1))
    # Lookup table — match theo độ dài giảm dần để "Bình Thạnh" ăn trước "Bình"
    lower = text.lower()
    for d in sorted(HCM_DISTRICTS, key=len, reverse=True):
        if d.lower() in lower:
            return d
    return None


def _find_huyen(text: str) -> Optional[str]:
    m = HUYEN_RE.search(text)
    return _normalize_match(m.group(1)) if m else None


def _detect_city_suffix(text: str) -> Optional[str]:
    """
    Phát hiện TP/tỉnh được nhắc trong text. Thứ tự ưu tiên:
      1. Marker TP.HCM (TP.HCM, Sài Gòn, Hồ Chí Minh) → "TP.HCM"
      2. Tên quận/huyện HCM trực tiếp (Bình Thạnh, Q.1...) → "TP.HCM"
      3. "Hà Nội" → "Hà Nội"
      4. Tỉnh/TP khác trong NEARBY_CITIES → "<tên>, Việt Nam"
      5. Bổ sung từ NER (underthesea, optional) — bắt các địa danh không có
         trong NEARBY_CITIES (vd: tên xã/huyện hiếm gặp).
      6. Không có marker nào → None
    """
    lower = text.lower()

    if re.search(
        r"\b(tp\.?\s*hcm|tp\.?\s*hồ\s*chí\s*minh|sài\s*gòn|hồ\s*chí\s*minh)\b",
        lower,
    ):
        return "TP.HCM"

    # Tên quận HCM literal — nếu có Bình Thạnh / Q.1 trong text → context HCM
    for d in sorted(HCM_DISTRICTS, key=len, reverse=True):
        if d.lower() in lower:
            return "TP.HCM"

    if re.search(r"\bhà\s*nội\b", lower):
        return "Hà Nội"

    for city in sorted(NEARBY_CITIES, key=len, reverse=True):
        if city.lower() in lower:
            return f"{city}, Việt Nam"

    # Fallback: NER (underthesea) bắt được địa danh không có trong list
    try:
        from services.location_ner import extract_locations as _ner_locs
        locs = _ner_locs(text)
        # Lấy entity dài nhất (thường là province/city level)
        if locs:
            best = max(locs, key=len)
            return f"{best}, Việt Nam"
    except Exception:
        pass

    return None


def extract_location(text: str) -> Optional[str]:
    """
    Trích xuất 1 chuỗi địa điểm rough từ text.

    Args:
        text: title/description video, hoặc bất kỳ text nào.
    Returns:
        Chuỗi đã chuẩn hoá:
          - "Đường X, Quận Y, TP.HCM" (HCM context)
          - "Phường X, Nha Trang, Việt Nam" (province khác)
          - "Đường X" (có landmark nhưng không phát hiện được city — để geocoder tự xử)
          - None nếu không tìm được gì
    """
    if not text:
        return None

    text_clean = re.sub(r"\s+", " ", text).strip()
    parts: List[str] = []

    # 1. Landmark cụ thể (đường / cầu / ngã / chợ / phường)
    parts.extend(_find_first(text_clean))

    # 2. Quận
    district = _find_district(text_clean)
    if district:
        parts.append(district)

    # 3. Huyện (chỉ thêm nếu chưa có quận/Thủ Đức)
    if not any(("Huyện" in p) or ("Quận" in p) or ("Thủ Đức" in p) for p in parts):
        huyen = _find_huyen(text_clean)
        if huyen:
            parts.append(huyen)

    # 4. Phát hiện city/province context (TP.HCM, Hà Nội, Nha Trang, ...)
    city_suffix = _detect_city_suffix(text_clean)

    # 5. Build kết quả
    if not parts and not city_suffix:
        return None
    if not parts:
        return city_suffix

    parts_str = ", ".join(parts)
    if not city_suffix:
        # Có landmark nhưng không biết city — trả về parts, để geocoder cascading xử lý
        return parts_str

    return f"{parts_str}, {city_suffix}"
