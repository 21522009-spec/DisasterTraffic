"""
YOLOv8 detector — dùng pre-trained COCO model để nhận diện kẹt xe.
Optionally: dùng thêm model fine-tune để detect fire/smoke.

Logic:
  - Đếm số xe (car/truck/bus/motorcycle) trong frame.
  - Nếu >= TRAFFIC_VEHICLE_THRESHOLD → return event 'traffic'.
  - Nếu FIRE_MODEL_PATH có set → chạy thêm fire model, return 'fire' nếu detect.

Nếu camera.allowedEventTypes có giới hạn (vd chỉ ['flood']) → bỏ qua các check
không nằm trong allowed.
"""
from typing import Optional

from loguru import logger

from config import (
    YOLO_MODEL,
    YOLO_CONF,
    TRAFFIC_VEHICLE_THRESHOLD,
    FIRE_MODEL_PATH,
)


# COCO class names mà ta coi là "phương tiện giao thông"
TRAFFIC_CLASSES = {"car", "truck", "bus", "motorcycle", "bicycle"}

# Lazy load để khỏi import ultralytics khi DETECTOR=mock
_general_model = None
_fire_model = None
_fire_load_attempted = False


def _load_general():
    global _general_model
    if _general_model is None:
        from ultralytics import YOLO

        logger.info(f"Đang load YOLO general model: {YOLO_MODEL} (lần đầu sẽ download ~6MB)...")
        _general_model = YOLO(YOLO_MODEL)
        logger.success("YOLO general model đã sẵn sàng.")
    return _general_model


def _load_fire():
    global _fire_model, _fire_load_attempted
    if _fire_load_attempted:
        return _fire_model
    _fire_load_attempted = True

    if not FIRE_MODEL_PATH:
        return None

    try:
        from ultralytics import YOLO

        logger.info(f"Đang load fire model: {FIRE_MODEL_PATH}")
        m = YOLO(FIRE_MODEL_PATH)
        # Verify model có class 'fire' không — nếu không, đây không phải fire detector,
        # bỏ qua để tránh tạo alert giả (vd: model car detector sẽ trigger fire alert
        # cho mọi xe trong frame).
        names = getattr(m, "names", {}) or {}
        has_fire_class = any(str(v).lower() == "fire" for v in names.values())
        if not has_fire_class:
            logger.warning(
                f"Model {FIRE_MODEL_PATH} không có class 'fire' "
                f"(classes: {list(names.values())}). Bỏ qua fire detection."
            )
            _fire_model = None
        else:
            _fire_model = m
            logger.success("Fire model đã sẵn sàng.")
    except Exception as e:
        logger.error(f"Không load được fire model ({FIRE_MODEL_PATH}): {e}")
        _fire_model = None

    return _fire_model


def _count_vehicles(model, frame) -> int:
    """Đếm số phương tiện trong 1 frame."""
    results = model.predict(frame, verbose=False, conf=YOLO_CONF)
    if not results:
        return 0

    names = model.names
    count = 0
    for r in results:
        if r.boxes is None or r.boxes.cls is None:
            continue
        for cls_id in r.boxes.cls.cpu().numpy().astype(int):
            if names.get(int(cls_id), "") in TRAFFIC_CLASSES:
                count += 1
    return count


def _has_fire(model, frame) -> bool:
    """True nếu detect được box thuộc class 'fire'. Bỏ qua các class khác."""
    results = model.predict(frame, verbose=False, conf=YOLO_CONF)
    if not results:
        return False
    names = getattr(model, "names", {}) or {}
    fire_ids = {k for k, v in names.items() if str(v).lower() == "fire"}
    if not fire_ids:
        return False
    for r in results:
        if r.boxes is None or r.boxes.cls is None:
            continue
        for cls_id in r.boxes.cls.cpu().numpy().astype(int):
            if int(cls_id) in fire_ids:
                return True
    return False


def detect(camera: dict, frame) -> Optional[dict]:
    """
    Args:
        camera: dict camera từ Mongo (cần 'allowedEventTypes')
        frame:  numpy ndarray (BGR) từ cv2 — hoặc None
    Returns:
        None nếu không detect, hoặc dict {type, severity, description, confidence}.
    """
    if frame is None:
        return None

    allowed = set(camera.get("allowedEventTypes") or [])
    # Nếu camera không giới hạn → cho phép cả traffic + fire
    if not allowed:
        allowed = {"traffic", "fire"}

    # ===== 1. Traffic (vehicle counting) =====
    if "traffic" in allowed:
        try:
            general = _load_general()
            count = _count_vehicles(general, frame)
            logger.debug(f"YOLO vehicle count: {count}")
            if count >= TRAFFIC_VEHICLE_THRESHOLD:
                # Severity scale theo số xe: 8→2, 12→3, 16→4, 20+→5
                sev = min(5, max(2, 1 + count // 4))
                return {
                    "type": "traffic",
                    "severity": sev,
                    "description": f"YOLO phát hiện {count} phương tiện trong frame",
                    "confidence": min(0.95, 0.6 + count * 0.02),
                }
        except Exception as e:
            logger.error(f"YOLO traffic detection error: {e}")

    # ===== 2. Fire =====
    if "fire" in allowed:
        fire_model = _load_fire()
        if fire_model is not None:
            try:
                if _has_fire(fire_model, frame):
                    return {
                        "type": "fire",
                        "severity": 4,
                        "description": "Phát hiện cháy/khói (YOLO fire model)",
                        "confidence": 0.85,
                    }
            except Exception as e:
                logger.error(f"YOLO fire detection error: {e}")

    return None
