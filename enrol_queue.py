"""
Redis-backed enrolment queue.

Enrolment is a heavy operation — decoding N photos, running insightface on
each, quality-filtering, and persisting embeddings — that blocks the web
worker for 3-10 seconds. When ``REDIS_URL`` is set, it is dispatched to an
RQ worker running on the GPU pod; the web request returns immediately with
a ``job_id`` the frontend can poll.

When ``REDIS_URL`` is not set, ``enqueue_enrol`` runs the job inline and
returns a synthetic ``done`` job record so the client contract is stable.
"""

from __future__ import annotations

import logging
import os
import uuid
from typing import Any, Optional

logger = logging.getLogger(__name__)

_REDIS_URL       = os.environ.get("REDIS_URL", "").strip()
_QUEUE_NAME      = os.environ.get("ENROL_QUEUE_NAME", "enrol")
_JOB_TIMEOUT_S   = int(os.environ.get("ENROL_JOB_TIMEOUT_S", "300"))
_JOB_RESULT_TTL  = int(os.environ.get("ENROL_JOB_RESULT_TTL_S", "3600"))

_redis      = None                   # type: ignore[var-annotated]
_queue      = None                   # type: ignore[var-annotated]


def is_async_enabled() -> bool:
    return bool(_REDIS_URL)


def _get_queue():
    global _redis, _queue
    if _queue is not None:
        return _queue
    if not _REDIS_URL:
        return None
    try:
        import redis
        from rq import Queue
    except ImportError as exc:
        logger.warning("enrol_queue: redis/rq not installed (%s) — running inline.", exc)
        return None
    _redis = redis.Redis.from_url(_REDIS_URL)
    _queue = Queue(_QUEUE_NAME, connection=_redis, default_timeout=_JOB_TIMEOUT_S)
    return _queue


def run_enrol_job(
    user_id: str,
    name:    str,
    relation: str,
    notes:    str,
    age:      Optional[int],
    likes:    list[str],
    images:   list[str],
) -> dict[str, Any]:
    """Executed in-process by the web worker or on the GPU worker via RQ."""
    from face_engine import FaceEngine

    engine = FaceEngine(user_id=user_id)
    engine._store._get_or_create_person_id(user_id, name)
    result = engine.add_person(name=name, images=images)

    try:
        from supabase_memory import get_memory_manager
        get_memory_manager(user_id).upsert_person(
            name=name, relation=relation, notes=notes, age=age, likes=likes,
        )
    except Exception as exc:
        logger.warning("enrol_queue: metadata upsert failed for '%s': %s", name, exc)

    return {
        "user_id":          user_id,
        "name":             name,
        "embeddings_count": result.get("embeddings_count", 0),
        "success":          result.get("success", False),
        "skipped":          result.get("skipped", 0),
        "error":            result.get("error"),
    }


def enqueue_enrol(
    user_id: str,
    name:    str,
    relation: str,
    notes:    str,
    age:      Optional[int],
    likes:    list[str],
    images:   list[str],
) -> dict[str, Any]:
    """Return {job_id, status, result?}. Inline execution when Redis absent."""
    q = _get_queue()
    if q is None:
        job_id = f"inline-{uuid.uuid4().hex[:12]}"
        result = run_enrol_job(user_id, name, relation, notes, age, likes, images)
        return {"job_id": job_id, "status": "finished", "result": result}

    job = q.enqueue(
        "enrol_queue.run_enrol_job",
        user_id, name, relation, notes, age, likes, images,
        result_ttl = _JOB_RESULT_TTL,
    )
    return {"job_id": job.id, "status": "queued", "result": None}


def get_job_status(job_id: str) -> dict[str, Any]:
    q = _get_queue()
    if q is None or not job_id or job_id.startswith("inline-"):
        return {"job_id": job_id, "status": "unknown", "result": None}
    try:
        from rq.job import Job
        job = Job.fetch(job_id, connection=_redis)
    except Exception as exc:
        logger.warning("enrol_queue: job fetch failed for %s: %s", job_id, exc)
        return {"job_id": job_id, "status": "unknown", "result": None}
    status = job.get_status(refresh=True)
    return {
        "job_id": job_id,
        "status": status,
        "result": job.result if status == "finished" else None,
        "error":  str(job.exc_info) if status == "failed" else None,
    }
