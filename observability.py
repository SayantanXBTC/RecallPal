"""
Observability wiring: Sentry, structlog JSON logging, Prometheus metrics.

Everything here is opt-in. Missing SENTRY_DSN, missing packages, or
disabled ENABLE_METRICS all degrade to a no-op — the app still boots.

Public surface:
- init_observability(app): call once from app.py after Flask() is built.
- log:                    module-level structlog logger (safe to import).
- metrics_middleware:     records request latency + count into Prometheus.
- record_recognize(...):  domain-specific counters for face pipeline.
"""

from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Any

# ---------------------------------------------------------------------------
# structlog — JSON logs with request/user context
# ---------------------------------------------------------------------------

try:
    import structlog
    _STRUCTLOG_OK = True
except ImportError:
    structlog = None                                          # type: ignore
    _STRUCTLOG_OK = False


def _configure_structlog() -> None:
    if not _STRUCTLOG_OK:
        return
    logging.basicConfig(
        format = "%(message)s",
        level  = os.environ.get("LOG_LEVEL", "INFO").upper(),
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class      = structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory     = structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use = True,
    )


class _StdlibShim:
    """Fallback used only when structlog is absent. Accepts kwargs and
    formats them into the message so call sites stay identical."""
    def __init__(self, name: str) -> None:
        self._logger = logging.getLogger(name)
    def _emit(self, level: int, event: str, **kw: Any) -> None:
        if kw:
            extras = " ".join(f"{k}={v}" for k, v in kw.items())
            self._logger.log(level, "%s %s", event, extras)
        else:
            self._logger.log(level, "%s", event)
    def debug(self, event: str, **kw: Any) -> None:   self._emit(logging.DEBUG, event, **kw)
    def info(self,  event: str, **kw: Any) -> None:   self._emit(logging.INFO,  event, **kw)
    def warning(self, event: str, **kw: Any) -> None: self._emit(logging.WARNING, event, **kw)
    def error(self, event: str, **kw: Any) -> None:   self._emit(logging.ERROR, event, **kw)


log: Any
if _STRUCTLOG_OK:
    _configure_structlog()
    log = structlog.get_logger("recallpal")
else:
    log = _StdlibShim("recallpal")


def bind_request_context(request_id: str, user_id: str | None) -> None:
    """Bind per-request fields so every log line carries them."""
    if not _STRUCTLOG_OK:
        return
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id, user_id=user_id)


# ---------------------------------------------------------------------------
# Sentry
# ---------------------------------------------------------------------------

def _init_sentry() -> bool:
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.flask import FlaskIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
    except ImportError:
        return False
    sentry_sdk.init(
        dsn                  = dsn,
        integrations         = [
            FlaskIntegration(),
            LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
        ],
        traces_sample_rate   = float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
        profiles_sample_rate = float(os.environ.get("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
        environment          = os.environ.get("SENTRY_ENV", os.environ.get("FLASK_ENV", "production")),
        release              = os.environ.get("SENTRY_RELEASE") or os.environ.get("GIT_SHA"),
        send_default_pii     = False,
    )
    return True


# ---------------------------------------------------------------------------
# Prometheus metrics
# ---------------------------------------------------------------------------

try:
    from prometheus_client import (
        CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest,
    )
    _PROM_OK = True
except ImportError:
    _PROM_OK = False


if _PROM_OK:
    HTTP_REQUESTS = Counter(
        "recallpal_http_requests_total",
        "HTTP requests by endpoint + status.",
        ["endpoint", "method", "status"],
    )
    HTTP_LATENCY = Histogram(
        "recallpal_http_request_seconds",
        "HTTP request latency in seconds.",
        ["endpoint", "method"],
        buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10),
    )
    RECOGNIZE_FACES = Histogram(
        "recallpal_recognize_faces_count",
        "Number of faces returned per /api/recognize call.",
        buckets=(0, 1, 2, 3, 5, 10),
    )
    RECOGNIZE_OUTCOMES = Counter(
        "recallpal_recognize_outcomes_total",
        "Per-face recognition outcomes.",
        ["outcome"],   # recognized | unknown
    )


def record_recognize(n_faces: int, n_recognized: int) -> None:
    if not _PROM_OK:
        return
    RECOGNIZE_FACES.observe(n_faces)
    RECOGNIZE_OUTCOMES.labels(outcome="recognized").inc(n_recognized)
    RECOGNIZE_OUTCOMES.labels(outcome="unknown").inc(max(0, n_faces - n_recognized))


# ---------------------------------------------------------------------------
# Flask wiring
# ---------------------------------------------------------------------------

def init_observability(app) -> dict[str, Any]:
    """Attach Sentry + logging context + metrics middleware to *app*.

    Idempotent. Returns a status dict useful for /api/health.
    """
    sentry_on = _init_sentry()

    @app.before_request
    def _before():
        from flask import g, request
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
        g.request_id  = request_id
        g._start_time = time.perf_counter()
        # user_id is bound later by @require_auth; bind whatever we know now.
        bind_request_context(request_id=request_id, user_id=getattr(g, "user_id", None))

    @app.after_request
    def _after(resp):
        from flask import g, request
        # Re-bind so the log line carries the authenticated user (set by
        # require_auth after _before ran).
        bind_request_context(
            request_id = getattr(g, "request_id", "-"),
            user_id    = getattr(g, "user_id",    None),
        )
        endpoint = request.endpoint or "unknown"
        latency  = time.perf_counter() - getattr(g, "_start_time", time.perf_counter())
        if _PROM_OK and endpoint != "metrics":
            HTTP_LATENCY.labels(endpoint=endpoint, method=request.method).observe(latency)
            HTTP_REQUESTS.labels(endpoint=endpoint, method=request.method, status=resp.status_code).inc()
        try:
            log.info(
                "http_request",
                endpoint    = endpoint,
                method      = request.method,
                status      = resp.status_code,
                latency_ms  = round(latency * 1000, 2),
                path        = request.path,
            )
        except Exception:
            pass
        resp.headers["X-Request-ID"] = getattr(g, "request_id", "-")
        return resp

    if _PROM_OK and os.environ.get("ENABLE_METRICS", "true").lower() != "false":
        @app.route("/metrics", methods=["GET"])
        def metrics():
            from flask import Response
            return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)

    return {
        "sentry":    sentry_on,
        "structlog": _STRUCTLOG_OK,
        "metrics":   _PROM_OK,
    }
