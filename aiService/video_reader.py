"""
Frame reader thống nhất cho 4 loại nguồn:
  - Local MP4 file (loop khi đến cuối)
  - RTSP stream
  - HTTP/HTTPS stream
  - Webcam index (số nguyên 0/1/...)

Cách phân biệt qua `streamUrl` của camera:
  - "mock://name.mp4"        → tìm trong VIDEOS_DIR/name.mp4 (loop)
  - "/path/to/file.mp4"      → mở file (loop khi đến cuối)
  - "rtsp://..." / "http..."  → mở stream
  - "webcam:0"               → cv2.VideoCapture(0)
"""
from pathlib import Path
from typing import Optional, Union

import cv2
from loguru import logger

from config import VIDEOS_DIR, DEFAULT_VIDEO


def resolve_source(stream_url: str) -> Optional[Union[str, int]]:
    """Convert camera.streamUrl thành tham số cho cv2.VideoCapture(...)."""
    if not stream_url:
        return None

    s = stream_url.strip()

    # Webcam: "webcam:0"
    if s.startswith("webcam:"):
        try:
            return int(s.split(":", 1)[1])
        except ValueError:
            return 0

    # HTTP/HTTPS/RTSP/RTMP — cv2 đọc trực tiếp
    if s.startswith(("http://", "https://", "rtsp://", "rtmp://")):
        return s

    # mock://filename.mp4 — tìm trong VIDEOS_DIR
    if s.startswith("mock://"):
        filename = s[len("mock://"):]
        path = VIDEOS_DIR / filename
        if path.exists():
            return str(path)
        # Fallback: dùng default video
        default_path = VIDEOS_DIR / DEFAULT_VIDEO
        if default_path.exists():
            logger.warning(
                f"Không tìm thấy {path}, dùng fallback {default_path}"
            )
            return str(default_path)
        return None

    # Path thường (absolute hoặc relative) — kiểm tra tồn tại
    p = Path(s)
    if p.exists():
        return str(p)

    return None


class FrameReader:
    """Wrap cv2.VideoCapture với loop cho file."""

    def __init__(self, source: Union[str, int]):
        self.source = source
        self.cap: Optional[cv2.VideoCapture] = None
        self.is_file = isinstance(source, str) and not source.startswith(
            ("rtsp://", "rtmp://", "http://", "https://")
        )

    def open(self) -> bool:
        self.cap = cv2.VideoCapture(self.source)
        return self.cap is not None and self.cap.isOpened()

    def read(self):
        """Đọc 1 frame. Trả None nếu fail/hết stream."""
        if not self.cap:
            return None
        ok, frame = self.cap.read()
        if not ok and self.is_file:
            # Loop về đầu file
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ok, frame = self.cap.read()
        return frame if ok else None

    def release(self) -> None:
        if self.cap:
            self.cap.release()
            self.cap = None
