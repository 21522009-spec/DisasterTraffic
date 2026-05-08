"""
Mock detector — random sinh sự kiện để test pipeline khi chưa có model thật.

Mỗi tick:
  - Với xác suất MOCK_DETECTION_PROBABILITY → return 1 sự kiện random từ
    `allowed_event_types` của camera.
  - Còn lại → return None (không có sự kiện).

Khi thay bằng model thật, giữ nguyên signature `detect(camera) -> Optional[dict]`
là đủ — main.py không cần sửa.
"""
import random
from typing import Optional

from config import MOCK_DETECTION_PROBABILITY


SEVERITY_BY_TYPE = {
    "fire": 4,
    "flood": 3,
    "traffic": 2,
    "landslide": 4,
    "storm": 4,
    "earthquake": 5,
    "other": 2,
}

DESCRIPTIONS = {
    "fire": "Phát hiện khói/lửa trong khung hình (mock).",
    "flood": "Mực nước cao bất thường trên mặt đường (mock).",
    "traffic": "Mật độ phương tiện cao, chuyển động chậm (mock).",
    "landslide": "Phát hiện vật cản lớn trên đường (mock).",
    "storm": "Gió mạnh + cây ngã (mock).",
    "earthquake": "Rung lắc khung hình bất thường (mock).",
    "other": "Sự kiện chưa phân loại (mock).",
}


def detect(camera: dict) -> Optional[dict]:
    """
    Args:
        camera: dict từ Mongo có keys name, lat, lng, allowedEventTypes...
    Returns:
        None nếu không detect, hoặc dict {type, severity, description, confidence}
    """
    if random.random() > MOCK_DETECTION_PROBABILITY:
        return None

    allowed = camera.get("allowedEventTypes") or []
    if not allowed:
        # Nếu không giới hạn → chọn random toàn bộ
        allowed = ["fire", "flood", "traffic"]

    event_type = random.choice(allowed)
    return {
        "type": event_type,
        "severity": SEVERITY_BY_TYPE.get(event_type, 3),
        "description": DESCRIPTIONS.get(event_type, ""),
        "confidence": round(random.uniform(0.6, 0.95), 2),
    }
