"""
Verify disaster type từ 1 frame ảnh dùng Google Gemini.

So với YOLO fire-only, Gemini phân loại được 6 type: fire / flood /
landslide / storm / earthquake / traffic, trả 'none' nếu ảnh không phải disaster.

Cần GOOGLE_API_KEY (lấy free tại https://aistudio.google.com/app/apikey)
và pip install google-generativeai. Nếu chưa có thì các function trả
None và caller tự fallback YOLO.

Tự thử lần lượt nhiều tên model để chống deprecate (Google đổi naming
khá thường xuyên). Override bằng env GEMINI_MODEL nếu cần.
"""
import os
from typing import Optional, Tuple

from loguru import logger


# Thử lần lượt — dùng model đầu tiên khả dụng. Override bằng GEMINI_MODEL.
_DEFAULT_MODEL_CANDIDATES = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash-latest",
]

# Lazy-init state
_model = None
_disabled = False


# Tiếng Việt + English mix để Gemini parse tốt
_PROMPT = """You are a disaster classifier. Look at this image and decide which category fits BEST:

- "fire": visible flames, thick smoke, or burning structures
- "flood": water clearly covering streets, fields, or buildings
- "landslide": collapsed earth/mud/rocks, road blocked by slide
- "storm": heavy storm damage (fallen trees, debris, wind)
- "earthquake": collapsed buildings, cracked roads/walls, rubble from quake
- "traffic": serious traffic accident or major road jam
- "none": normal scene, TV studio, graphic, indoor, no disaster visible

Reply with EXACTLY ONE word (lowercase): fire, flood, landslide, storm, earthquake, traffic, or none.
Do NOT explain. Do NOT add punctuation."""


def _get_model():
    """
    Lazy init Gemini model. Returns None nếu disable.
    Thử lần lượt các model trong _DEFAULT_MODEL_CANDIDATES, dùng model
    nào configure thành công (validate sẽ xảy ra ở lần generate_content đầu).
    """
    global _model, _disabled
    if _disabled:
        return None
    if _model is not None:
        return _model

    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.debug("[vision] GOOGLE_API_KEY chưa set — Vision LLM tắt.")
        _disabled = True
        return None

    try:
        import google.generativeai as genai

        genai.configure(api_key=api_key)

        # Override bằng env var nếu user muốn ép cụ thể model
        env_override = os.getenv("GEMINI_MODEL", "").strip()
        candidates = [env_override] if env_override else list(_DEFAULT_MODEL_CANDIDATES)

        # Dùng model đầu tiên — không validate ở init, validate ở lần call đầu.
        _model = genai.GenerativeModel(candidates[0])
        logger.info(f"[vision] Gemini ready (model={candidates[0]})")
        # Lưu danh sách fallback để verify_disaster có thể auto-switch khi 404
        _model._candidate_models = candidates  # type: ignore[attr-defined]
        return _model
    except ImportError:
        logger.warning(
            "[vision] google-generativeai chưa cài. Chạy: "
            "pip install google-generativeai"
        )
        _disabled = True
        return None
    except Exception as e:
        logger.warning(f"[vision] init error: {e}")
        _disabled = True
        return None


def _try_next_model() -> bool:
    """
    Khi gặp 404 model not found, thử model kế tiếp trong candidate list.
    Returns True nếu đã switch thành công, False nếu hết candidate.
    """
    global _model
    if _model is None:
        return False
    candidates = getattr(_model, "_candidate_models", None)
    if not candidates or len(candidates) < 2:
        return False
    try:
        import google.generativeai as genai

        # Bỏ candidate hiện tại, lấy cái tiếp theo
        candidates = candidates[1:]
        new_name = candidates[0]
        _model = genai.GenerativeModel(new_name)
        _model._candidate_models = candidates  # type: ignore[attr-defined]
        logger.info(f"[vision] Switched model → {new_name}")
        return True
    except Exception as e:
        logger.warning(f"[vision] fallback model init error: {e}")
        return False


def is_enabled() -> bool:
    """Check Vision LLM có sẵn sàng dùng không (không trigger init nặng)."""
    if _disabled:
        return False
    if _model is not None:
        return True
    return bool(os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))


def verify_disaster(
    frame_jpeg: bytes, hint: Optional[str] = None
) -> Optional[Tuple[str, float]]:
    """
    Verify disaster type từ frame JPEG bytes.

    Args:
        frame_jpeg: ảnh đã encode JPEG (vd qua cv2.imencode('.jpg', frame)).
        hint:       optional, gợi ý type từ keyword search (vd 'fire' nếu
                    YouTube search keyword là "cháy"). Vision LLM tự xác nhận
                    hoặc bác bỏ.

    Returns:
        (disaster_type, confidence) — type ∈ {fire,flood,landslide,storm,earthquake,traffic}.
        None nếu LLM trả 'none' / disable / lỗi.
    """
    model = _get_model()
    if model is None or not frame_jpeg:
        return None

    prompt = _PROMPT
    if hint and hint not in ("none", None):
        prompt += f"\n\nHint: source caption suggests this might be '{hint}'. Confirm or reject."

    def _call(m) -> Optional[str]:
        try:
            response = m.generate_content(
                [
                    prompt,
                    {"mime_type": "image/jpeg", "data": frame_jpeg},
                ],
                generation_config={
                    "max_output_tokens": 16,
                    "temperature": 0.1,
                },
            )
            # Đọc response.text qua quick accessor có thể raise nếu finish_reason
            # là SAFETY/RECITATION/MAX_TOKENS — try parts trực tiếp.
            try:
                return (response.text or "").strip().lower()
            except Exception:
                # Inspect candidates để biết finish_reason → log nhẹ và return None
                try:
                    cand = response.candidates[0] if response.candidates else None
                    fr = getattr(cand, "finish_reason", None)
                    fr_name = getattr(fr, "name", str(fr))
                    logger.debug(
                        f"[vision] no text in response (finish_reason={fr_name}) — bỏ qua"
                    )
                except Exception:
                    logger.debug("[vision] no text in response — bỏ qua")
                return None
        except Exception as exc:
            err_msg = str(exc)
            # Model không tồn tại → switch fallback
            if "404" in err_msg or "not found" in err_msg.lower():
                if _try_next_model():
                    new_m = _get_model()
                    if new_m is not None:
                        return _call(new_m)  # retry 1 lần với model mới
                logger.warning(
                    f"[vision] model không khả dụng và hết fallback: {err_msg}"
                )
                return None
            logger.warning(f"[vision] verify error: {err_msg}")
            return None

    text = _call(model)
    if text is None:
        return None

    valid = ("fire", "flood", "landslide", "storm", "earthquake", "traffic")
    for t in valid:
        if t in text:
            # Confidence cao hơn nếu LLM khớp với hint
            conf = 0.92 if hint == t else 0.85
            logger.info(f"[vision] detected '{t}' (hint={hint}, conf={conf})")
            return (t, conf)

    if "none" in text:
        logger.debug("[vision] no disaster detected")
        return None

    logger.warning(f"[vision] unexpected response: {text!r}")
    return None
