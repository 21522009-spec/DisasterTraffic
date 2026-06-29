from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
from loguru import logger

from config import VOD_DEFAULT_FPS
from video_reader import resolve_source


@dataclass
class FramePacket:
    frame: any
    frame_index: int
    timestamp_sec: float


class BaseSourceAdapter:
    def __init__(self, source_type: str, source_url: str):
        self.source_type = source_type
        self.source_url = source_url
        self.frame_index = 0
        self.fps = VOD_DEFAULT_FPS
        self.duration_sec: Optional[float] = None
        self.resolved_source: Optional[str] = None

    def open(self) -> bool:
        raise NotImplementedError

    def read(self) -> Optional[FramePacket]:
        raise NotImplementedError

    def close(self) -> None:
        raise NotImplementedError

    def metadata(self) -> dict:
        return {
            "sourceType": self.source_type,
            "sourceUrl": self.source_url,
            "resolvedSource": self.resolved_source or self.source_url,
            "fps": round(float(self.fps or VOD_DEFAULT_FPS), 3),
            "durationSec": round(self.duration_sec, 3) if self.duration_sec is not None else None,
        }


class OpenCVSourceAdapter(BaseSourceAdapter):
    def __init__(self, source_type: str, source_url: str):
        super().__init__(source_type, source_url)
        self.cap = None

    def open(self) -> bool:
        source = resolve_source(self.source_url)
        if source is None:
            logger.error(f"[source] Không resolve được nguồn: {self.source_url}")
            return False

        self.resolved_source = str(source)
        self.cap = cv2.VideoCapture(source)
        if self.cap is None or not self.cap.isOpened():
            logger.error(f"[source] Không mở được nguồn OpenCV: {self.resolved_source}")
            self.cap = None
            return False

        fps = float(self.cap.get(cv2.CAP_PROP_FPS) or 0)
        self.fps = fps if fps > 0.1 else VOD_DEFAULT_FPS

        frame_count = float(self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if frame_count > 0 and self.fps > 0:
            self.duration_sec = frame_count / self.fps
        return True

    def read(self) -> Optional[FramePacket]:
        if self.cap is None:
            return None

        ok, frame = self.cap.read()
        if not ok or frame is None:
            return None

        packet = FramePacket(
            frame=frame,
            frame_index=self.frame_index,
            timestamp_sec=self.frame_index / max(self.fps, 0.1),
        )
        self.frame_index += 1
        return packet

    def close(self) -> None:
        if self.cap is not None:
            self.cap.release()
            self.cap = None


class YouTubeStreamAdapter(BaseSourceAdapter):
    def __init__(self, source_type: str, source_url: str):
        super().__init__(source_type, source_url)
        self.stream = None

    def open(self) -> bool:
        try:
            from vidgear.gears import CamGear

            self.resolved_source = self.source_url
            self.stream = CamGear(
                source=self.source_url,
                stream_mode=True,
                logging=False,
                STREAM_RESOLUTION="480p",
                STREAM_PARAMS={
                    "quiet": True,
                    "no_warnings": True,
                    "nocheckcertificate": True,
                },
            ).start()
            self.fps = VOD_DEFAULT_FPS
            return self.stream is not None
        except Exception as error:
            logger.error(f"[source] Không mở được YouTube stream {self.source_url}: {error}")
            self.stream = None
            return False

    def read(self) -> Optional[FramePacket]:
        if self.stream is None:
            return None

        frame = self.stream.read()
        if frame is None:
            return None

        packet = FramePacket(
            frame=frame,
            frame_index=self.frame_index,
            timestamp_sec=self.frame_index / max(self.fps, 0.1),
        )
        self.frame_index += 1
        return packet

    def close(self) -> None:
        if self.stream is not None:
            try:
                self.stream.stop()
            except Exception:
                pass
            self.stream = None


def build_source_adapter(source_type: str, source_url: str) -> BaseSourceAdapter:
    if source_type in ("youtube-vod", "youtube-live"):
        return YouTubeStreamAdapter(source_type, source_url)

    if source_type in ("file", "direct-url", "rtsp-live", "hls-live"):
        return OpenCVSourceAdapter(source_type, source_url)

    raise ValueError(f"Unsupported source type: {source_type}")
