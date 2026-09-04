"""
Standalone insightface inference microservice.

Runs on the GPU pod. Exposes a single POST /analyze endpoint that takes a
base64 JPEG frame and returns detected bounding boxes + L2-normalised
ArcFace embeddings. No Supabase, no auth logic, no business rules.

The main Flask app calls this over the internal network via
inference_client.RemoteInferenceClient when INFERENCE_URL is set.
Otherwise the main app runs insightface in-process (unchanged behaviour).

Environment
-----------
INFERENCE_PORT          Port to listen on. Default 8001.
INFERENCE_SHARED_TOKEN  Required. Rejects requests without matching
                        X-Inference-Token header. Not user-facing.
"""

from __future__ import annotations

import base64
import logging
import os
from typing import Any

import cv2
import numpy as np
from flask import Flask, jsonify, request

from face_engine import _analyze_frame, _get_face_app

logger = logging.getLogger("inference_service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = Flask(__name__)

_SHARED_TOKEN = os.environ.get("INFERENCE_SHARED_TOKEN", "").strip()
if not _SHARED_TOKEN:
    logger.warning("INFERENCE_SHARED_TOKEN not set — service will refuse all requests.")


def _reject_if_untrusted() -> tuple[Any, int] | None:
    if not _SHARED_TOKEN:
        return jsonify({"error": "service not configured"}), 503
    supplied = request.headers.get("X-Inference-Token", "").strip()
    if supplied != _SHARED_TOKEN:
        return jsonify({"error": "unauthorized"}), 401
    return None


def _decode_b64_frame(b64: str) -> np.ndarray:
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    raw = base64.b64decode(b64)
    frame = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("could not decode image bytes")
    h, w = frame.shape[:2]
    if max(h, w) > 640:
        scale = 640 / max(h, w)
        frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    return frame


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":            "ok",
        "insightface_ready": _get_face_app() is not None,
    })


@app.route("/analyze", methods=["POST"])
def analyze():
    err = _reject_if_untrusted()
    if err is not None:
        return err

    payload = request.get_json(silent=True) or {}
    image = payload.get("image")
    if not isinstance(image, str) or not image:
        return jsonify({"error": "missing 'image' (base64 JPEG)"}), 400

    try:
        frame = _decode_b64_frame(image)
    except Exception as exc:
        return jsonify({"error": f"decode failed: {exc}"}), 400

    faces = _analyze_frame(frame)
    out = [
        {
            "bbox":      list(f["bbox"]),
            "embedding": f["embedding"].tolist(),
        }
        for f in faces
    ]
    return jsonify({
        "faces":        out,
        "frame_width":  int(frame.shape[1]),
        "frame_height": int(frame.shape[0]),
    })


if __name__ == "__main__":
    # Warm the model on boot so first real request is fast.
    _get_face_app()
    port = int(os.environ.get("INFERENCE_PORT", "8001"))
    app.run(host="0.0.0.0", port=port)
