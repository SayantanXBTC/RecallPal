"""
Client for the insightface inference microservice.

Two call sites:
- analyze_frame(frame)       — used by recognize_multi()
- analyze_b64(b64_image)     — direct pass-through when caller already
                               has a base64-encoded JPEG (skips redundant
                               decode+encode round-trip).

Falls back to in-process ``face_engine._analyze_frame`` when
``INFERENCE_URL`` is not configured.  This keeps single-node deploys
working with zero configuration.
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Optional

import cv2
import numpy as np
import requests

logger = logging.getLogger(__name__)

_INFERENCE_URL     = os.environ.get("INFERENCE_URL", "").strip().rstrip("/")
_INFERENCE_TOKEN   = os.environ.get("INFERENCE_SHARED_TOKEN", "").strip()
_INFERENCE_TIMEOUT = float(os.environ.get("INFERENCE_TIMEOUT_S", "2.0"))


def is_remote_enabled() -> bool:
    return bool(_INFERENCE_URL and _INFERENCE_TOKEN)


def _post(image_b64: str) -> Optional[dict]:
    try:
        resp = requests.post(
            f"{_INFERENCE_URL}/analyze",
            json    = {"image": image_b64},
            headers = {"X-Inference-Token": _INFERENCE_TOKEN},
            timeout = _INFERENCE_TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.warning("inference_client: POST /analyze failed: %s", exc)
        return None
    if resp.status_code != 200:
        logger.warning("inference_client: /analyze returned %d: %s", resp.status_code, resp.text[:200])
        return None
    try:
        return resp.json()
    except ValueError:
        return None


def _remote_to_local(payload: dict) -> list[dict]:
    out: list[dict] = []
    for f in payload.get("faces", []) or []:
        bbox = tuple(int(x) for x in f.get("bbox", []))
        emb  = np.asarray(f.get("embedding", []), dtype=np.float32)
        if len(bbox) != 4 or emb.size != 512:
            continue
        out.append({"bbox": bbox, "embedding": emb})
    return out


def _encode_frame_to_b64(frame: np.ndarray) -> Optional[str]:
    ok, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not ok:
        return None
    return base64.b64encode(buf.tobytes()).decode("ascii")


def analyze_frame(frame: np.ndarray) -> list[dict]:
    """Detect + embed all faces in *frame*. Remote when enabled, else local."""
    if is_remote_enabled():
        b64 = _encode_frame_to_b64(frame)
        if b64 is not None:
            payload = _post(b64)
            if payload is not None:
                return _remote_to_local(payload)
        logger.warning("inference_client: remote unavailable — falling back to in-process.")
    from face_engine import _analyze_frame
    return _analyze_frame(frame)


def analyze_b64(image_b64: str) -> list[dict]:
    """Prefer this when the caller already holds the base64 JPEG."""
    if is_remote_enabled():
        payload = _post(image_b64)
        if payload is not None:
            return _remote_to_local(payload)
        logger.warning("inference_client: remote unavailable — falling back to in-process.")
    from face_engine import _analyze_frame
    raw = base64.b64decode(image_b64.split(",", 1)[-1])
    frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        return []
    return _analyze_frame(frame)
