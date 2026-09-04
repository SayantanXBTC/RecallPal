"""
Lightweight anti-spoof + enrolment quality guards.

Full-strength liveness (MiniFASNet / depth check / colour rPPG) is a
future step — this module implements the cheap heuristics that catch
the most common attacks and low-quality enrolments without needing a
second neural network:

- Blur:     Laplacian variance below threshold ⇒ reject (motion / OOF).
- Pose:     Std-dev of yaw across enrolment frames below threshold ⇒
            reject (single static photo re-shown).
- Similarity: Cosine sim > 0.995 across all pairs ⇒ reject (identical
            duplicate frames — likely a still image / video loop).
"""

from __future__ import annotations

import logging
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Tunable thresholds — pulled from env so ops can adjust without deploy.
import os
_MIN_LAPLACIAN_VAR    = float(os.environ.get("LIVENESS_MIN_BLUR_VAR",   "45.0"))
_MIN_YAW_STD_DEG      = float(os.environ.get("LIVENESS_MIN_YAW_STD",     "5.0"))
_MAX_PAIR_COSINE_SIM  = float(os.environ.get("LIVENESS_MAX_PAIR_SIM",   "0.995"))
_MIN_FRAMES_FOR_POSE  = int  (os.environ.get("LIVENESS_MIN_FRAMES",         "3"))


def blur_score(frame_bgr: np.ndarray) -> float:
    """Higher = sharper. Uses variance of Laplacian on the greyscale frame."""
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def is_sharp(frame_bgr: np.ndarray) -> bool:
    return blur_score(frame_bgr) >= _MIN_LAPLACIAN_VAR


def enrol_quality_check(
    frames:     list[np.ndarray],
    embeddings: list[np.ndarray],
    poses:      list[tuple[float, float, float]] | None = None,
) -> dict[str, Any]:
    """Run all cheap liveness / quality checks on an enrolment batch.

    Parameters
    ----------
    frames      Decoded BGR frames the client uploaded.
    embeddings  L2-normalised ArcFace embeddings extracted from those frames.
    poses       Optional list of (yaw, pitch, roll) degrees per frame. When
                None, the pose check is skipped (accepting the batch on
                pose grounds alone — sharpness + similarity still run).

    Returns
    -------
    dict with keys:
        passed:  bool
        reasons: list[str]  (only populated when passed is False)
        stats:   dict with the numeric measurements
    """
    reasons: list[str] = []
    stats:   dict[str, Any] = {}

    # ---- Sharpness --------------------------------------------------------
    if frames:
        blur_scores = [blur_score(f) for f in frames]
        stats["blur_min"] = round(min(blur_scores), 2)
        stats["blur_avg"] = round(sum(blur_scores) / len(blur_scores), 2)
        n_sharp = sum(1 for b in blur_scores if b >= _MIN_LAPLACIAN_VAR)
        stats["blur_sharp_frames"] = n_sharp
        if n_sharp < max(2, len(frames) // 2):
            reasons.append(
                f"Fewer than half the frames are sharp (min variance {stats['blur_min']} "
                f"< {_MIN_LAPLACIAN_VAR}). Retake in better lighting, holding the camera still."
            )

    # ---- Pose variance (liveness heuristic) -------------------------------
    if poses and len(poses) >= _MIN_FRAMES_FOR_POSE:
        yaws     = np.array([p[0] for p in poses], dtype=np.float64)
        yaw_std  = float(np.std(yaws))
        stats["yaw_std_deg"] = round(yaw_std, 2)
        if yaw_std < _MIN_YAW_STD_DEG:
            reasons.append(
                f"Head pose too uniform (yaw std {yaw_std:.1f}° < {_MIN_YAW_STD_DEG}°). "
                "Turn head slightly left/right during enrolment so the system knows "
                "you're a live person, not a static photo."
            )

    # ---- Pairwise embedding similarity (duplicate detection) --------------
    if len(embeddings) >= 2:
        mat  = np.vstack([e.reshape(-1) for e in embeddings]).astype(np.float32)
        # Assume already L2 normalised (insightface normed_embedding).
        sims = mat @ mat.T
        np.fill_diagonal(sims, 0.0)
        max_sim = float(sims.max())
        stats["max_pair_cosine_sim"] = round(max_sim, 4)
        if max_sim > _MAX_PAIR_COSINE_SIM:
            reasons.append(
                f"Frames are near-identical (max pair similarity {max_sim:.4f} > "
                f"{_MAX_PAIR_COSINE_SIM}). Capture from different angles / moments."
            )

    return {
        "passed":  len(reasons) == 0,
        "reasons": reasons,
        "stats":   stats,
    }
