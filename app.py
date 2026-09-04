"""
app.py — Flask backend for dementia-assist.

Connects FaceEngine (face recognition) with MemoryManager (Supabase)
and exposes a REST API consumed by the frontend.

Environment variables (can be set via a .env file)
---------------------------------------------------
SUPABASE_URL          Supabase project URL  (https://xxxx.supabase.co)
SUPABASE_SERVICE_KEY  Service-role secret key — used by FaceEngine and
                      MemoryManager for all DB operations.  Never expose
                      this to the browser.
SUPABASE_JWT_SECRET   HS256 signing secret for verifying user JWTs.
                      Found in: Supabase Dashboard → Settings → API →
                      JWT Settings → JWT Secret.
SUPABASE_ANON_KEY     Public anon key — used by the auth endpoints
                      (/api/auth/login, /api/auth/signup) so email-
                      confirmation flows behave like the frontend client.
                      Falls back to SUPABASE_SERVICE_KEY when not set.
DEFAULT_USER_ID       Fallback user UUID when SUPABASE_JWT_SECRET is
                      absent — useful for local dev without a live
                      Supabase project.
FLASK_DEBUG           Enable Flask debug mode (default: True).
"""

import logging
import os

# Prevent OpenMP silent crashes on Windows/macOS when using DeepFace/OpenCV in threads
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

import random
import traceback
from collections import defaultdict
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request
from flask_cors import CORS
from jose import JWTError
from jose import jwt as jose_jwt

from face_engine import FaceEngine
from supabase_memory import get_memory_manager

# ---------------------------------------------------------------------------
# Authentication helpers
# ---------------------------------------------------------------------------

def _is_dev_mode() -> bool:
    """Dev fallback only active when FLASK_ENV=development."""
    return os.environ.get("FLASK_ENV", "").strip().lower() == "development"


def _get_user_id() -> str:
    """
    Return the authenticated user's UUID for the current request.

    When ``@require_auth`` has run, ``flask.g.user_id`` is set. For unprotected
    routes, falls back to ``DEFAULT_USER_ID`` **only in development mode**.

    Raises ValueError if no identity is available.
    """
    uid = getattr(g, "user_id", None)
    if uid:
        return uid
    if _is_dev_mode():
        uid = os.environ.get("DEFAULT_USER_ID", "").strip()
        if uid:
            return uid
    raise ValueError("No authenticated user — provide a valid Bearer token.")


# Users whose default people have been seeded in this process lifetime.
# The seed itself is idempotent, so restarting the process is always safe.
_seeded_users: set[str] = set()


def _maybe_seed(user_id: str) -> None:
    """
    Seed the four default people for a new user on their first authenticated
    request.  Uses a module-level set so the seed call fires at most once
    per process per user.
    """
    if user_id in _seeded_users:
        return
    _seeded_users.add(user_id)
    try:
        get_memory_manager(user_id).seed_initial_data()
        logger.info("Auto-seeded default people for user %s.", user_id)
    except Exception:
        logger.warning(
            "Auto-seed failed for user %s:\n%s", user_id, traceback.format_exc()
        )


# Lazy singleton Supabase client used only by the auth endpoints.
# Uses SUPABASE_ANON_KEY when present (correct for sign-in/sign-up flows),
# falls back to SUPABASE_SERVICE_KEY so a second env var is not required.
_auth_client = None


def _get_auth_client():
    """Return a lazy-initialised Supabase client for auth operations."""
    global _auth_client
    if _auth_client is not None:
        return _auth_client
    try:
        from supabase import create_client
    except ImportError as exc:
        raise ImportError(
            "supabase-py is not installed.  Run: pip install supabase"
        ) from exc
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = (
        os.environ.get("SUPABASE_ANON_KEY", "").strip()
        or os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    )
    if not url or not key:
        raise ValueError(
            "SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_KEY) must be set."
        )
    _auth_client = create_client(url, key)
    return _auth_client


_JWKS_CACHE: dict[str, tuple[float, list[dict]]] = {}
_JWKS_TTL_S = 600.0


import re
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def _is_valid_email(email: str) -> bool:
    """Lightweight RFC-5322-ish check. Supabase itself performs a second
    validation (rejects at signup if the domain has no MX record), so this is
    mostly a fast client-side guard against typos before we call the API."""
    if not email or len(email) > 254:
        return False
    return bool(_EMAIL_RE.match(email.strip()))


def _fetch_supabase_jwks() -> list[dict]:
    """Fetch and cache Supabase JWKS for asymmetric JWT verification.

    Supabase projects that migrated to signing keys expose the public JWKS
    at {SUPABASE_URL}/auth/v1/.well-known/jwks.json. Cached in-process for
    _JWKS_TTL_S seconds to avoid a network round-trip per request.
    """
    import time as _time
    import requests as _requests
    base = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    if not base:
        return []
    now = _time.time()
    cached = _JWKS_CACHE.get(base)
    if cached and (now - cached[0]) < _JWKS_TTL_S:
        return cached[1]
    try:
        r = _requests.get(f"{base}/auth/v1/.well-known/jwks.json", timeout=3.0)
        r.raise_for_status()
        keys = (r.json() or {}).get("keys") or []
        _JWKS_CACHE[base] = (now, keys)
        return keys
    except Exception as exc:
        logger.warning("JWKS fetch failed for %s: %s", base, exc)
        return cached[1] if cached else []


def _verify_supabase_jwt(token: str, hs256_secret: str) -> dict:
    """Verify a Supabase JWT.

    Supports two signing modes transparently:
      - Legacy HS256 with the project's JWT secret.
      - Asymmetric ES256 / RS256 with rotating keys published via JWKS.

    Chooses the code path from the token's own alg header, then verifies
    against the appropriate key material.
    """
    header = jose_jwt.get_unverified_header(token)
    alg    = (header.get("alg") or "").strip()
    kid    = (header.get("kid") or "").strip()
    common_opts = {
        "verify_signature": True,
        "verify_aud":       True,
        "verify_exp":       True,
        "verify_iat":       True,
        "require":          ["exp", "sub", "aud"],
    }
    if alg == "HS256":
        return jose_jwt.decode(
            token, hs256_secret,
            algorithms=["HS256"], audience="authenticated", options=common_opts,
        )
    if alg in ("ES256", "RS256"):
        keys = _fetch_supabase_jwks()
        matches = [k for k in keys if (k.get("kid") == kid)] if kid else keys
        if not matches:
            raise JWTError(f"no JWKS key matched kid={kid!r}")
        last_exc: Exception | None = None
        for jwk in matches:
            try:
                return jose_jwt.decode(
                    token, jwk,
                    algorithms=[alg], audience="authenticated", options=common_opts,
                )
            except JWTError as exc:
                last_exc = exc
        raise JWTError(str(last_exc) if last_exc else "asymmetric verification failed")
    raise JWTError(f"unsupported alg: {alg!r}")


def require_auth(f):
    """
    Route decorator that enforces Bearer JWT authentication.

    Reads the ``Authorization: Bearer <token>`` header, verifies the
    signature against ``SUPABASE_JWT_SECRET`` using HS256 (python-jose),
    and stores the verified user UUID in ``flask.g.user_id``.

    After successful verification it calls ``_maybe_seed()`` so new users
    automatically get their default enrolled people on their first request.

    Dev-mode fallback
    -----------------
    When ``SUPABASE_JWT_SECRET`` is not set, the decorator accepts any
    request and uses ``DEFAULT_USER_ID`` as the user identity.  This
    allows local development without a live Supabase project.

    Errors
    ------
    401  Token missing, malformed, or expired.
    500  Server not configured (no JWT secret and no DEFAULT_USER_ID).
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        jwt_secret = os.environ.get("SUPABASE_JWT_SECRET", "").strip()

        if not jwt_secret:
            if _is_dev_mode():
                fallback = os.environ.get("DEFAULT_USER_ID", "").strip()
                if fallback:
                    g.user_id = fallback
                    return f(*args, **kwargs)
            logger.error("SUPABASE_JWT_SECRET not configured in production.")
            return jsonify({
                "status":  "error",
                "message": "Server authentication is not configured.",
            }), 500

        auth_header = request.headers.get("Authorization", "").strip()
        if not auth_header.startswith("Bearer "):
            return jsonify({
                "status":  "error",
                "message": "Authorization header missing or not a Bearer token.",
            }), 401

        token = auth_header[7:].strip()
        if not token:
            return jsonify({"status": "error", "message": "Empty bearer token."}), 401

        try:
            payload = _verify_supabase_jwt(token, jwt_secret)
        except JWTError as exc:
            logger.warning("JWT verification failed: %s", exc)
            return jsonify({
                "status":  "error",
                "message": "Invalid or expired token.",
            }), 401

        user_id = (payload.get("sub") or "").strip()
        if not user_id:
            return jsonify({
                "status":  "error",
                "message": "Token is missing the subject (sub) claim.",
            }), 401

        if (payload.get("role") or "").strip() == "service_role":
            logger.warning("Rejected service_role token used as user auth.")
            return jsonify({
                "status":  "error",
                "message": "Service role tokens are not permitted here.",
            }), 401

        g.user_id = user_id
        return f(*args, **kwargs)

    return decorated

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Observability (Sentry + structlog + metrics). init_observability() is
# called below after the Flask app is constructed. Importing here so
# Sentry can catch exceptions thrown during .env parsing / Supabase init.
from observability import init_observability, record_recognize, log as struct_log

# ---------------------------------------------------------------------------
# Load .env file if present (simple parser — no extra dependencies)
# ---------------------------------------------------------------------------

_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    with open(_env_path, encoding="utf-8") as _fh:
        for _line in _fh:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _key, _, _val = _line.partition("=")
                os.environ.setdefault(_key.strip(), _val.strip())
    logger.info("Loaded environment variables from .env")

# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

app = Flask(__name__)

# CORS — explicit origin allowlist. Comma-separated in ALLOWED_ORIGINS env var.
# Falls back to localhost dev origins only. Never use "*" with credentials.
_default_dev_origins = "http://localhost:3000,http://127.0.0.1:3000"
_allowed_origins = [
    o.strip()
    for o in os.environ.get("ALLOWED_ORIGINS", _default_dev_origins).split(",")
    if o.strip()
]
CORS(
    app,
    resources={r"/api/*": {"origins": _allowed_origins}},
    supports_credentials=True,
    max_age=600,
)
logger.info("CORS allowed origins: %s", _allowed_origins)

# Trust the reverse-proxy so request.is_secure / remote_addr reflect the
# original client rather than the load balancer's private hop.
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# Force HTTPS + HSTS only when explicitly opted in. Defaults to off so local
# dev (python app.py, docker-compose) never hits redirect / 400 loops. Set
# FLASK_ENV=production or FORCE_HTTPS=true on the deploy target.
_IS_PROD = (
    os.environ.get("FLASK_ENV", "").strip().lower() == "production"
    or os.environ.get("FORCE_HTTPS", "").strip().lower() in {"1", "true", "yes"}
)

@app.before_request
def _force_https_in_prod():
    """Redirect HTTP → HTTPS in production. Terminated at the LB, but if any
    request slips through with X-Forwarded-Proto=http we bounce it."""
    if not _IS_PROD:
        return None
    if request.is_secure:
        return None
    # Health checks from internal probes are allowed on HTTP.
    if request.path in ("/api/health", "/api/ready"):
        return None
    if request.method != "GET":
        return jsonify({"status": "error", "message": "HTTPS required."}), 400
    from flask import redirect
    return redirect(request.url.replace("http://", "https://", 1), code=301)


@app.after_request
def _security_headers(resp):
    """OWASP-recommended headers. Set on every response — cheap belt-and-braces
    even though most are also configurable at the CDN / reverse-proxy layer."""
    # Prevent MIME sniffing
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    # Deny framing (clickjacking)
    resp.headers.setdefault("X-Frame-Options", "DENY")
    # Referrer discipline — don't leak paths to third parties
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # Restrict powerful browser features to what we actually need
    resp.headers.setdefault(
        "Permissions-Policy",
        "camera=(self), microphone=(), geolocation=(), payment=()",
    )
    # HSTS only in prod (browsers cache this — never send in dev over localhost)
    if _IS_PROD:
        resp.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains; preload",
        )
    return resp

# Rate limiting — protects expensive endpoints (recognize, add-person) from abuse.
# Uses in-memory storage by default; set RATELIMIT_STORAGE_URI=redis://... in prod
# for multi-instance deployments.
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

def _rate_limit_key() -> str:
    """Rate limit per authenticated user when possible, else per IP."""
    uid = getattr(g, "user_id", None)
    return uid if uid else get_remote_address()

limiter = Limiter(
    app=app,
    key_func=_rate_limit_key,
    storage_uri=os.environ.get("RATELIMIT_STORAGE_URI", "memory://"),
    default_limits=["1000 per hour"],
    headers_enabled=True,
)

# Sentry + structlog + Prometheus. Attaches before/after handlers that
# bind request_id and emit http_request logs + metrics.
_OBSERVABILITY = init_observability(app)
struct_log.info("boot", **_OBSERVABILITY)

# ---------------------------------------------------------------------------
# Initialise subsystems
# ---------------------------------------------------------------------------

logger.info("Memory backend: Supabase (supabase_memory.py)")
# Both FaceEngine and MemoryManager are instantiated per-user on first request.
# Startup seed is deferred to the frontend — see /api/seed.

# ---------------------------------------------------------------------------
# Per-user FaceEngine cache
# ---------------------------------------------------------------------------

_engine_cache: dict[str, FaceEngine] = {}


def _get_face_engine(user_id: str) -> FaceEngine:
    """
    Return a cached FaceEngine for the given user.

    On first call for a given user_id the engine fetches all of that
    user's face embeddings from Supabase and builds the in-memory
    average-embedding cache.  Subsequent calls within the same process
    return the already-loaded instance without a DB round-trip.
    """
    if user_id not in _engine_cache:
        logger.info("Creating FaceEngine for user %s…", user_id)
        _engine_cache[user_id] = FaceEngine(user_id=user_id)
    return _engine_cache[user_id]

# ---------------------------------------------------------------------------
# Suggestion generator
# ---------------------------------------------------------------------------

# Keyword → suggestion template.  {name} is substituted at runtime.
_KEYWORD_SUGGESTIONS: list[tuple[str, str]] = [
    ("car",      "Ask {name} about their car"),
    ("school",   "Ask {name} how school is going"),
    ("cooking",  "Ask {name} what they've been cooking lately"),
    ("work",     "Ask {name} how work has been"),
    ("travel",   "Ask {name} about their recent travels"),
    ("garden",   "Ask {name} how the garden is coming along"),
    ("sport",    "Ask {name} how their team is doing"),
    ("football", "Ask {name} how their team is doing"),
    ("music",    "Ask {name} what music they've been listening to"),
    ("dog",      "Ask {name} how their dog is doing"),
    ("cat",      "Ask {name} how their cat is doing"),
    ("baby",     "Ask {name} about the baby"),
    ("wedding",  "Ask {name} how the wedding plans are going"),
    ("birthday", "Ask {name} about their birthday"),
    ("holiday",  "Ask {name} about their holiday"),
]


def _parse_last_seen(last_seen_str: str) -> datetime | None:
    """
    Parse an ISO-8601 timestamp string into a timezone-aware datetime.

    Returns ``None`` when the string is empty, missing, or unparseable.
    """
    if not last_seen_str:
        return None
    try:
        dt = datetime.fromisoformat(last_seen_str)
        # Make timezone-aware if naive (assume UTC)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def generate_suggestion(name: str, memory: dict | None) -> str:
    """
    Produce a context-sensitive conversation starter for the caregiver.

    Decision logic (in priority order):
    1. Last-seen recency (month → week → today).
    2. Random pick from the likes list.
    3. Keyword scan of the notes field.
    4. Generic fallback.

    Parameters
    ----------
    name : str
        Matched person's display name.
    memory : dict or None
        Recalled memory dict (keys: ``relation``, ``notes``, ``last_seen``,
        ``age``, ``likes``).  May be ``None`` if no memory record exists yet.

    Returns
    -------
    str
        A short, human-friendly suggestion string.
    """
    if not memory:
        return f"Ask {name} about their day"

    notes: str = (memory.get("notes") or "").lower()
    last_seen_str: str = memory.get("last_seen") or ""
    likes: list = memory.get("likes") or []

    # --- Recency-based suggestions ---
    last_seen_dt = _parse_last_seen(last_seen_str)
    if last_seen_dt:
        now = datetime.now(timezone.utc)
        delta_days = (now - last_seen_dt).days

        if delta_days >= 30:
            return f"You haven't seen {name} in over a month. They might have news to share!"
        if delta_days >= 7:
            return f"It's been a while since you saw {name}. Ask how they've been!"
        if delta_days == 0:
            return f"You saw {name} earlier today."

    # --- Likes-based suggestion (random pick) ---
    if likes:
        chosen = random.choice(likes)
        return f"Ask {name} about {chosen}"

    # --- Notes keyword scan ---
    for keyword, template in _KEYWORD_SUGGESTIONS:
        if keyword in notes:
            return template.format(name=name)

    # --- Generic fallback ---
    return f"Ask {name} about their day"


# ---------------------------------------------------------------------------
# Recognition event logging
# ---------------------------------------------------------------------------

# Throttle: log at most one event per person per 60 seconds per user.
_event_log_cache: dict[str, float] = {}


def _log_recognition_event(user_id: str, person_name: str, confidence: float) -> None:
    """
    Insert a recognition_events row for the given person.

    Throttled to one DB write per (user_id, person_name) per 60 s so the
    700 ms recognition loop doesn't flood the table.
    """
    cache_key = f"{user_id}:{person_name}"
    now_ts = __import__("time").time()
    if now_ts - _event_log_cache.get(cache_key, 0) < 60:
        return
    _event_log_cache[cache_key] = now_ts

    try:
        from supabase import create_client
        url = os.environ.get("SUPABASE_URL", "").strip()
        key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
        client = create_client(url, key)
        client.table("recognition_events").insert({
            "user_id":     user_id,
            "person_name": person_name,
            "confidence":  round(float(confidence), 4),
        }).execute()
        logger.info("Logged recognition event: user=%s person=%s conf=%.4f", user_id, person_name, confidence)
    except Exception:
        logger.warning("Failed to log recognition event:\n%s", traceback.format_exc())


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/api/health", methods=["GET"])
def health():
    """
    Return a brief system status report.

    Response keys
    -------------
    status          "ok"
    face_db_loaded  bool — whether face embeddings are loaded from Supabase
    people_count    int  — number of people in the face database
    memory_backend  "supabase"
    """
    try:
        try:
            user_id = _get_user_id()
            engine = _get_face_engine(user_id)
            people_count  = len(engine.database)
            face_db_loaded = bool(engine.database)
        except ValueError:
            people_count  = 0
            face_db_loaded = False
        from inference_client import is_remote_enabled as _inf_remote
        from enrol_queue import is_async_enabled as _enrol_async
        return jsonify(
            {
                "status": "ok",
                "face_db_loaded": face_db_loaded,
                "people_count": people_count,
                "memory_backend": "supabase",
                "inference":      "remote" if _inf_remote() else "in-process",
                "enrol_queue":    "redis"  if _enrol_async() else "inline",
                "assistant":      "claude" if os.environ.get("ANTHROPIC_API_KEY") else "off",
                "observability":  _OBSERVABILITY,
            }
        )
    except Exception:
        logger.error("Error in /api/health:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Health check failed"}), 500


@app.route("/api/recognize", methods=["POST"])
@require_auth
@limiter.limit("30 per minute")
def recognize():
    """
    Identify all faces in a single webcam frame.

    Request body (JSON)
    -------------------
    image : str
        Base64-encoded image string (raw or data-URI).

    Response body (JSON)
    --------------------
    faces : list of face objects, each with:
        status       "recognized" | "unknown"
        name         str | null
        confidence   float (0.0–1.0) | 0.0
        memory       dict | null
        suggestion   str | null
        bbox         {x, y, w, h} in frame pixel coords
        frame_width  int
        frame_height int
    """
    try:
        payload = request.get_json(silent=True) or {}
        image: str = payload.get("image", "").strip()

        if not image:
            return jsonify({"faces": [], "status": "error", "message": "No image provided"}), 400

        try:
            user_id = _get_user_id()
        except ValueError as exc:
            return jsonify({"faces": [], "status": "error", "message": str(exc)}), 401

        engine = _get_face_engine(user_id)
        multi = engine.recognize_multi(image)
        faces_raw: list[dict] = multi.get("faces", [])

        if not faces_raw:
            return jsonify({"faces": []})

        mm = get_memory_manager(user_id)
        faces_out = []

        for face in faces_raw:
            matched_name: str | None = face.get("name")
            confidence: float = face.get("confidence") or 0.0
            bbox = face.get("bbox")
            frame_width = face.get("frame_width")
            frame_height = face.get("frame_height")

            if not matched_name or matched_name == "Unknown":
                faces_out.append({
                    "status":       "unknown",
                    "name":         None,
                    "confidence":   0.0,
                    "memory":       None,
                    "suggestion":   None,
                    "bbox":         bbox,
                    "frame_width":  frame_width,
                    "frame_height": frame_height,
                })
                continue

            name_key = matched_name.lower()
            recalled = mm.recall_person(name_key)
            mm.update_last_seen(name_key)

            memory_payload: dict | None = None
            if recalled:
                memory_payload = {
                    "relation":  recalled.get("relation", ""),
                    "notes":     recalled.get("notes", ""),
                    "last_seen": recalled.get("last_seen", ""),
                    "age":       recalled.get("age"),
                    "likes":     recalled.get("likes") or [],
                }

            display_name = recalled.get("name", matched_name) if recalled else matched_name.title()
            suggestion = generate_suggestion(display_name, recalled)
            _log_recognition_event(user_id, name_key, confidence)

            faces_out.append({
                "status":       "recognized",
                "name":         display_name,
                "confidence":   round(confidence, 4),
                "memory":       memory_payload,
                "suggestion":   suggestion,
                "bbox":         bbox,
                "frame_width":  frame_width,
                "frame_height": frame_height,
            })

        n_recognized = sum(1 for f in faces_out if f.get("status") == "recognized")
        record_recognize(n_faces=len(faces_out), n_recognized=n_recognized)
        struct_log.info(
            "recognize",
            n_faces=len(faces_out), n_recognized=n_recognized,
        )
        return jsonify({"faces": faces_out})

    except Exception:
        logger.error("Error in POST /api/recognize:\n%s", traceback.format_exc())
        return jsonify({"faces": [], "status": "error", "message": "Recognition failed unexpectedly"}), 500


@app.route("/api/ready", methods=["GET"])
def ready():
    """Readiness probe: distinct from /health (which only proves the
    process responds). /ready verifies external dependencies:
      - Supabase reachable
      - Inference microservice reachable (when remote mode is on)
    Returns 503 when any dependency is degraded.
    """
    checks: dict[str, bool] = {}
    try:
        from supabase_memory import get_memory_manager
        get_memory_manager("00000000-0000-0000-0000-000000000000")._client.table("people").select("id").limit(1).execute()
        checks["supabase"] = True
    except Exception:
        checks["supabase"] = False

    try:
        from inference_client import is_remote_enabled, _INFERENCE_URL, _INFERENCE_TOKEN
        if is_remote_enabled():
            import requests as _r
            r = _r.get(f"{_INFERENCE_URL}/health", timeout=1.5)
            checks["inference"] = (r.status_code == 200)
        else:
            checks["inference"] = True
    except Exception:
        checks["inference"] = False

    healthy = all(checks.values())
    return jsonify({"status": "ok" if healthy else "degraded", "checks": checks}), (200 if healthy else 503)


@app.route("/api/add-person", methods=["POST"])
@require_auth
@limiter.limit("10 per hour")
def add_person():
    """
    Enrol a new person in both the face database and the memory store.

    Request body (JSON)
    -------------------
    name     : str   — display name entered by the user
    relation : str   — relationship to the patient
    notes    : str   — free-form notes
    images   : list  — list of base64-encoded image strings (5–10 recommended)

    Response body (JSON)
    --------------------
    status           "success" | "error"
    name             str (on success)
    embeddings_count int (on success)
    message          str
    """
    try:
        payload = request.get_json(silent=True) or {}

        name: str     = (payload.get("name") or "").strip()
        relation: str = (payload.get("relation") or "").strip()
        notes: str    = (payload.get("notes") or "").strip()
        images: list  = payload.get("images") or []
        age_raw       = payload.get("age")
        age: int | None = int(age_raw) if isinstance(age_raw, (int, float)) and age_raw > 0 else None
        likes: list[str] = [str(l).strip() for l in (payload.get("likes") or []) if str(l).strip()]

        # Input validation
        if not name:
            return jsonify({"status": "error", "message": "Name is required"}), 400
        if len(name) < 2:
            return jsonify({"status": "error", "message": "Name must be at least 2 characters"}), 400
        if not relation:
            return jsonify({"status": "error", "message": "Relationship is required"}), 400
        if len(images) < 5:
            return (
                jsonify({
                    "status": "error",
                    "message": f"Please provide at least 5 photos ({len(images)} received).",
                }),
                400,
            )

        try:
            user_id = _get_user_id()
        except ValueError as exc:
            return jsonify({"status": "error", "message": str(exc)}), 401
        engine = _get_face_engine(user_id)

        # Duplicate name guard — query DB (engine.database is lazy-loaded).
        existing_names_lower = {n.lower() for n in engine.list_people()}
        if name.lower() in existing_names_lower:
            return (
                jsonify({
                    "status": "error",
                    "message": f'"{name}" already exists in the database. Please use a different name.',
                }),
                409,
            )

        logger.info(
            "Adding person '%s' (%s) with %d image(s).", name, relation, len(images)
        )

        # Consent gate (GDPR Art. 9). Enrolling biometric data without an
        # active opt-in is a compliance breach. Two paths:
        #   1. Consent already granted via POST /api/consent — proceed.
        #   2. Client sends { consent: { accepted, granter_name, granter_relation } }
        #      in this request — grant it inline, then proceed.
        from consent import has_active_consent, grant_consent, audit as _audit
        if not has_active_consent(user_id, name):
            inline = payload.get("consent") or {}
            if isinstance(inline, dict) and inline.get("accepted"):
                grant_consent(
                    user_id,
                    subject_name     = name,
                    granter_name     = (inline.get("granter_name")     or relation or name).strip(),
                    granter_relation = (inline.get("granter_relation") or relation).strip(),
                )
            else:
                return jsonify({
                    "status":  "error",
                    "code":    "consent_required",
                    "message": (
                        f"Biometric consent required for '{name}'. Include "
                        "consent: {{accepted:true, granter_name, granter_relation}} "
                        "in the request body or call POST /api/consent first."
                    ),
                }), 403

        # Optional async path: when the caller sets ?async=true or the
        # X-Async: 1 header AND Redis is configured, dispatch to the RQ
        # worker on the GPU pod and return 202 with a job_id.
        want_async = (
            request.args.get("async", "").lower() in {"1", "true", "yes"}
            or request.headers.get("X-Async", "").strip() in {"1", "true"}
        )
        from enrol_queue import enqueue_enrol, is_async_enabled as _enrol_async_on
        if want_async and _enrol_async_on():
            job = enqueue_enrol(user_id, name, relation, notes, age, likes, images)
            return jsonify({
                "status": "queued",
                "name":   name,
                "job_id": job["job_id"],
                "message": f"Enrolment for {name} accepted. Poll /api/enrol-status/{job['job_id']}.",
            }), 202

        # Liveness / quality gate — blur + duplicate frame detection before
        # burning GPU on embedding extraction. Pose variance check runs later
        # against insightface pose estimates if we have them.
        try:
            from liveness import enrol_quality_check, is_sharp
            decoded_frames = []
            for img_b64 in images:
                try:
                    decoded_frames.append(engine._decode_frame(img_b64))
                except Exception:
                    continue
            # Cheap pre-check: reject if no frame is sharp at all.
            if decoded_frames and not any(is_sharp(f) for f in decoded_frames):
                return jsonify({
                    "status":  "error",
                    "code":    "liveness_failed",
                    "message": "All frames are blurred. Hold the camera steady with good lighting and retake.",
                }), 400
        except Exception as _exc:
            logger.warning("Pre-enrol liveness check skipped: %s", _exc)

        # Generate embeddings and save to Supabase
        engine_result = engine.add_person(name, images)

        if not engine_result["success"]:
            return (
                jsonify({
                    "status": "error",
                    "message": engine_result.get("error") or (
                        "Could not detect enough faces in the provided photos. "
                        "Please retake photos facing the camera directly, with good lighting."
                    ),
                    "embeddings_count": engine_result.get("embeddings_count", 0),
                    "skipped": engine_result.get("skipped", 0),
                }),
                400,
            )

        # Only persist memory after face enrolment confirms success
        name_key = name.lower()
        mem_payload = {
            "relation": relation,
            "notes": notes,
            "age": age,
            "likes": likes,
        }
        get_memory_manager(user_id).store_person(name_key, mem_payload)

        _audit(user_id, "enrol_person",
               target_type="person", target_id=name_key,
               metadata={"embeddings_count": engine_result["embeddings_count"]})

        return jsonify(
            {
                "status": "success",
                "name": name,
                "embeddings_count": engine_result["embeddings_count"],
                "skipped": engine_result["skipped"],
                "message": (
                    f"{name} has been added successfully. "
                    "The system will now recognize them."
                ),
            }
        )

    except Exception as e:
        err = traceback.format_exc()
        logger.error("Error in POST /api/add-person:\n%s", err)
        return (
            jsonify({"status": "error", "message": "Could not save person. Please try again."}),
            500,
        )


@app.route("/api/enrol-status/<job_id>", methods=["GET"])
@require_auth
def enrol_status(job_id: str):
    """Poll status of an async enrolment job dispatched via ?async=true."""
    from enrol_queue import get_job_status
    return jsonify(get_job_status(job_id))


@app.route("/api/people", methods=["GET"])
@require_auth
def list_people():
    """
    Return all people currently enrolled in the face database.

    Each entry is enriched with relationship/notes data from the memory
    store where available.

    Response body (JSON)
    --------------------
    people : list of dicts
        name             str
        relation         str (from Supabase memory store)
        notes            str
        embeddings_count int
    """
    try:
        try:
            user_id = _get_user_id()
        except ValueError as exc:
            return jsonify({"status": "error", "message": str(exc)}), 401
        mm = get_memory_manager(user_id)
        engine = _get_face_engine(user_id)

        # Use people table as source of truth — includes people with 0 embeddings.
        # engine.database only has people with face vectors; people table has all enrolled.
        all_people_rows = mm.get_all_people()
        # Build a set of names with embeddings for the count
        people_list = []
        for row in all_people_rows:
            name = row.get("name", "")
            if not name:
                continue
            embeddings_count = len(engine.database.get(name, []))
            people_list.append(
                {
                    "name":             name,
                    "relation":         row.get("relation") or "",
                    "notes":            row.get("notes")    or "",
                    "age":              row.get("age"),
                    "likes":            row.get("likes")    or [],
                    "embeddings_count": embeddings_count,
                }
            )

        return jsonify({"people": people_list})

    except Exception:
        logger.error("Error in GET /api/people:\n%s", traceback.format_exc())
        return (
            jsonify({"status": "error", "message": "Failed to retrieve people list"}),
            500,
        )


@app.route("/api/update-person", methods=["POST"])
@require_auth
def update_person():
    """
    Update a person's memory details (relation, notes, age, likes).
    Does NOT modify face embeddings.

    Request body (JSON)
    -------------------
    name     : str
    relation : str
    notes    : str
    age      : int | null
    likes    : list[str]

    Response body (JSON)
    --------------------
    status   "success" | "error"
    message  str
    """
    try:
        payload = request.get_json(silent=True) or {}
        name: str = (payload.get("name") or "").strip()
        if not name:
            return jsonify({"status": "error", "message": "Name is required"}), 400

        name_key = name.lower()

        try:
            user_id = _get_user_id()
        except ValueError as exc:
            return jsonify({"status": "error", "message": str(exc)}), 401

        if name_key not in _get_face_engine(user_id).database:
            return (
                jsonify({"status": "error", "message": f"'{name}' not found in face database"}),
                404,
            )

        relation: str = payload.get("relation") or ""
        notes:    str = payload.get("notes") or ""
        age_raw        = payload.get("age")
        likes: list    = payload.get("likes") or []

        try:
            age = int(age_raw) if age_raw not in (None, "", "null") else None
        except (ValueError, TypeError):
            age = None

        get_memory_manager(user_id).update_person(name_key, relation, notes, age=age, likes=likes)
        logger.info("Updated memory for '%s'", name_key)

        return jsonify({"status": "success", "message": f"{name.title()} updated successfully."})

    except Exception:
        logger.error("Error in POST /api/update-person:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Update failed"}), 500


@app.route("/api/add-photos", methods=["POST"])
@require_auth
@limiter.limit("20 per hour")
def add_photos():
    """
    Append new face embeddings to an already-enrolled person.
    Does NOT modify their memory metadata (relation, notes, etc.).

    Request body (JSON)
    -------------------
    name   : str          — must match an existing person (case-insensitive)
    images : list[str]    — base64-encoded photos (at least 3)

    Response body (JSON)
    --------------------
    status           "success" | "error"
    embeddings_added int
    total_embeddings int
    message          str
    """
    try:
        payload = request.get_json(silent=True) or {}
        name: str    = (payload.get("name") or "").strip()
        images: list = payload.get("images") or []

        if not name:
            return jsonify({"status": "error", "message": "Name is required"}), 400
        if len(images) < 3:
            return jsonify({
                "status":  "error",
                "message": f"Please provide at least 3 photos ({len(images)} received).",
            }), 400

        try:
            user_id = _get_user_id()
        except ValueError as exc:
            return jsonify({"status": "error", "message": str(exc)}), 401

        engine = _get_face_engine(user_id)
        name_key = name.lower()

        # engine.database is lazily populated — don't trust it as the
        # authoritative "does this person exist?" check. Query the people
        # table directly (RLS-scoped to this user).
        if name_key not in set(engine.list_people()):
            return jsonify({
                "status":  "error",
                "message": f"'{name}' is not enrolled. Use Add Person to enroll them first.",
            }), 404

        # Consent gate for appending new biometric data.
        from consent import has_active_consent
        if not has_active_consent(user_id, name_key):
            return jsonify({
                "status":  "error",
                "code":    "consent_required",
                "message": f"No active biometric consent for '{name}'. "
                           "Refresh consent via POST /api/consent first.",
            }), 403

        from face_engine import _augment_frame

        raw_embeddings = []
        skipped = 0

        for idx, img_b64 in enumerate(images):
            try:
                frame = engine._decode_frame(img_b64)
            except Exception as exc:
                skipped += 1
                logger.warning("add-photos: skipping image %d (%s)", idx, exc)
                continue
            base_emb = engine._get_embedding_from_frame(frame)
            if base_emb is None:
                skipped += 1
                continue
            raw_embeddings.append(base_emb)
            for aug_frame in _augment_frame(frame):
                aug_emb = engine._get_embedding_from_frame(aug_frame)
                if aug_emb is not None:
                    raw_embeddings.append(aug_emb)

        if not raw_embeddings:
            return jsonify({
                "status":  "error",
                "message": "No faces detected in the provided photos. Use better lighting.",
            }), 400

        kept_embeddings, _ = engine._filter_by_quality(raw_embeddings)

        save_failures = 0
        for emb in kept_embeddings:
            if not engine._store.save_embedding(user_id, name_key, emb):
                save_failures += 1

        added = len(kept_embeddings) - save_failures
        # Only mutate the legacy in-RAM cache if it has been populated; the
        # HNSW k-NN path reads the DB directly on every recognize tick.
        if added > 0 and engine._db_loaded:
            engine.database.setdefault(name_key, []).extend(kept_embeddings[:added])
            engine._rebuild_emb_cache()

        total = len(engine.database.get(name_key, [])) + (added if not engine._db_loaded else 0)
        logger.info("add-photos: added %d embeddings for '%s'.", added, name_key)

        return jsonify({
            "status":           "success",
            "embeddings_added": added,
            "total_embeddings": total,
            "message":          f"Added {added} new photo(s) for {name.title()}. Total: {total} samples.",
        })

    except Exception:
        logger.error("Error in POST /api/add-photos:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Add photos failed unexpectedly"}), 500


@app.route("/api/delete-person", methods=["POST"])
@require_auth
def delete_person():
    """
    Delete a person from the face database and memory store.

    Request body (JSON)
    -------------------
    name : str

    Response body (JSON)
    --------------------
    status   "success" | "error"
    message  str
    """
    try:
        payload  = request.get_json(silent=True) or {}
        name: str = (payload.get("name") or "").strip()
        if not name:
            return jsonify({"status": "error", "message": "Name is required"}), 400

        try:
            user_id = _get_user_id()
        except ValueError as exc:
            return jsonify({"status": "error", "message": str(exc)}), 401

        name_key = name.lower()

        # Remove from in-memory engine (database dict + emb_cache)
        _get_face_engine(user_id).delete_person(name_key)

        # Delete from Supabase — people row cascades to face_embeddings
        get_memory_manager(user_id).delete_person(name_key)

        from consent import audit as _audit
        _audit(user_id, "delete_person", target_type="person", target_id=name_key)

        logger.info("Deleted person '%s' for user %s.", name_key, user_id)
        return jsonify({"status": "success", "message": f"{name} deleted successfully."})

    except Exception:
        tb = traceback.format_exc()
        logger.error("Error in POST /api/delete-person:\n%s", tb)
        return jsonify({"status": "error", "message": "Delete failed"}), 500


# ---------------------------------------------------------------------------
# Consent + audit + right-to-erasure
# ---------------------------------------------------------------------------

@app.route("/api/consent", methods=["GET", "POST"])
@require_auth
def consent_endpoint():
    """List (GET) or grant (POST) biometric consent for a subject.

    POST body: { subject_name, granter_name, granter_relation? }.
    Returns { consent_id } on success. Frontend should call this
    before /api/add-person for the same subject.
    """
    from consent import list_consents, grant_consent, CURRENT_CONSENT_VERSION
    try:
        user_id = _get_user_id()
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 401

    if request.method == "GET":
        return jsonify({
            "consent_text_version": CURRENT_CONSENT_VERSION,
            "consents":             list_consents(user_id),
        })

    payload = request.get_json(silent=True) or {}
    subject  = (payload.get("subject_name")     or "").strip()
    granter  = (payload.get("granter_name")     or "").strip()
    relation = (payload.get("granter_relation") or "").strip()
    if not subject or not granter:
        return jsonify({
            "status":  "error",
            "message": "subject_name and granter_name are required.",
        }), 400
    cid = grant_consent(user_id, subject_name=subject,
                        granter_name=granter, granter_relation=relation)
    if not cid:
        return jsonify({"status": "error", "message": "Failed to record consent."}), 500
    return jsonify({
        "status":     "success",
        "consent_id": cid,
        "version":    CURRENT_CONSENT_VERSION,
    })


@app.route("/api/consent/<consent_id>", methods=["DELETE"])
@require_auth
def consent_revoke(consent_id: str):
    from consent import revoke_consent
    try:
        user_id = _get_user_id()
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 401
    ok = revoke_consent(user_id, consent_id)
    if not ok:
        return jsonify({"status": "error", "message": "Revoke failed."}), 400
    return jsonify({"status": "success"})


@app.route("/api/audit", methods=["GET"])
@require_auth
def audit_log_endpoint():
    from consent import list_audit
    try:
        user_id = _get_user_id()
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 401
    limit = int(request.args.get("limit", "200"))
    return jsonify({"events": list_audit(user_id, limit=limit)})


@app.route("/api/me", methods=["DELETE"])
@require_auth
def erase_me():
    """GDPR right-to-erasure. Wipes all user rows via SECURITY DEFINER RPC
    and revokes JWT session on next request (cascades profile → people →
    embeddings → events → consents)."""
    from consent import erase_user, audit as _audit
    try:
        user_id = _get_user_id()
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 401
    _audit(user_id, "erase_user_requested", target_type="user", target_id=user_id)
    if not erase_user(user_id):
        return jsonify({"status": "error", "message": "Erasure failed."}), 500
    return jsonify({"status": "success", "message": "Account and all associated biometric data deleted."})


@app.route("/api/seed", methods=["POST"])
@require_auth
def seed():
    """
    Seed the default four people for the authenticated user if they have
    none yet.  Call once after first login from the frontend.

    Response body (JSON)
    --------------------
    status          "success"
    seeded          list of names that were inserted
    already_existed list of names that were already present
    """
    try:
        try:
            user_id = _get_user_id()
        except ValueError as exc:
            return jsonify({"status": "error", "message": str(exc)}), 401
        result = get_memory_manager(user_id).seed_initial_data()
        return jsonify({"status": "success", **result})
    except Exception:
        logger.error("Error in POST /api/seed:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Seed failed"}), 500


@app.route("/api/events", methods=["GET"])
@require_auth
def get_events():
    """
    Return the 50 most recent recognition events for the authenticated user.

    Query params
    ------------
    limit : int   (default 50, max 100)
    person : str  (optional) filter by person_name

    Response body (JSON)
    --------------------
    events : list of dicts
        id            str
        person_name   str
        confidence    float
        recognized_at str (ISO-8601)
    """
    try:
        try:
            user_id = _get_user_id()
        except ValueError as exc:
            return jsonify({"status": "error", "message": str(exc)}), 401

        limit = min(int(request.args.get("limit", 50)), 100)
        person_filter = (request.args.get("person") or "").strip().lower()

        from supabase import create_client
        url = os.environ.get("SUPABASE_URL", "").strip()
        key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
        client = create_client(url, key)

        query = (
            client.table("recognition_events")
            .select("id, person_name, confidence, recognized_at")
            .eq("user_id", user_id)
            .order("recognized_at", desc=True)
            .limit(limit)
        )
        if person_filter:
            query = query.eq("person_name", person_filter)

        result = query.execute()
        return jsonify({"events": result.data or []})

    except Exception:
        logger.error("Error in GET /api/events:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Failed to retrieve events"}), 500


@app.route("/api/events", methods=["DELETE"])
@require_auth
def clear_events():
    """Delete all recognition events for the authenticated user."""
    try:
        try:
            user_id = _get_user_id()
        except ValueError as exc:
            return jsonify({"status": "error", "message": str(exc)}), 401

        from supabase import create_client
        url = os.environ.get("SUPABASE_URL", "").strip()
        key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
        client = create_client(url, key)

        client.table("recognition_events").delete().eq("user_id", user_id).execute()
        return jsonify({"status": "success"})

    except Exception:
        logger.error("Error in DELETE /api/events:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Failed to clear events"}), 500


@app.route("/api/summary/daily", methods=["GET"])
@require_auth
def daily_summary():
    """
    Return aggregated face-recognition events for a single calendar day.

    Query params
    ------------
    date : str  YYYY-MM-DD  (default: today UTC)

    Response body (JSON)
    --------------------
    date            str
    total_visitors  int
    visitors        list of dicts
        person_name    str
        relation       str    (empty string when person not in DB)
        notes          str    (empty string when not set)
        likes          list   (empty list when not set)
        visit_count    int
        first_seen     str | null  (ISO-8601)
        last_seen      str | null  (ISO-8601)
    """
    try:
        try:
            user_id = _get_user_id()
        except ValueError as exc:
            return jsonify({"status": "error", "message": str(exc)}), 401

        date_str = (request.args.get("date") or "").strip()
        if date_str:
            try:
                target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                return jsonify({"status": "error", "message": "Invalid date — use YYYY-MM-DD"}), 400
        else:
            target_date = datetime.now(timezone.utc).date()

        day_start = datetime(target_date.year, target_date.month, target_date.day,
                             0, 0, 0, tzinfo=timezone.utc)
        day_end   = datetime(target_date.year, target_date.month, target_date.day,
                             23, 59, 59, 999999, tzinfo=timezone.utc)

        from supabase import create_client
        url    = os.environ.get("SUPABASE_URL", "").strip()
        key    = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
        client = create_client(url, key)

        events_result = (
            client.table("recognition_events")
            .select("person_name, confidence, recognized_at")
            .eq("user_id", user_id)
            .gte("recognized_at", day_start.isoformat())
            .lte("recognized_at", day_end.isoformat())
            .order("recognized_at", desc=False)
            .execute()
        )
        events = events_result.data or []

        people_result = (
            client.table("people")
            .select("name, relation, notes, likes")
            .eq("user_id", user_id)
            .execute()
        )
        people_map: dict[str, dict] = {
            p["name"]: p for p in (people_result.data or [])
        }

        aggregated: dict[str, dict] = defaultdict(lambda: {
            "visit_count": 0,
            "first_seen":  None,
            "last_seen":   None,
        })
        for ev in events:
            pname = ev["person_name"]
            agg   = aggregated[pname]
            agg["visit_count"] += 1
            ts_dt = datetime.fromisoformat(ev["recognized_at"].replace("Z", "+00:00"))
            if agg["first_seen"] is None or ts_dt < agg["first_seen"]:
                agg["first_seen"] = ts_dt
            if agg["last_seen"] is None or ts_dt > agg["last_seen"]:
                agg["last_seen"] = ts_dt

        visitors = []
        for pname, agg in sorted(aggregated.items(),
                                  key=lambda x: x[1]["visit_count"], reverse=True):
            person = people_map.get(pname, {})
            visitors.append({
                "person_name": pname,
                "relation":    person.get("relation", ""),
                "notes":       person.get("notes", ""),
                "likes":       person.get("likes") or [],
                "visit_count": agg["visit_count"],
                "first_seen":  agg["first_seen"].isoformat() if agg["first_seen"] else None,
                "last_seen":   agg["last_seen"].isoformat() if agg["last_seen"] else None,
            })

        return jsonify({
            "date":           target_date.isoformat(),
            "total_visitors": len(visitors),
            "visitors":       visitors,
        })

    except Exception:
        logger.error("Error in GET /api/summary/daily:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Failed to retrieve daily summary"}), 500


@app.route("/api/alerts/settings", methods=["GET", "POST"])
@require_auth
def alert_settings():
    """
    GET  — return current alert_days setting for the user.
    POST — update alert_days.

    POST body (JSON)
    ----------------
    alert_days : int  (1–90)

    Response (both)
    ---------------
    status     "success" | "error"
    alert_days int
    """
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    client = create_client(url, key)

    try:
        user_id = _get_user_id()
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 401

    if request.method == "GET":
        try:
            result = (
                client.table("profiles")
                .select("alert_days")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
            days = result.data[0]["alert_days"] if result.data else 3
            return jsonify({"status": "success", "alert_days": days})
        except Exception:
            logger.error("Error in GET /api/alerts/settings:\n%s", traceback.format_exc())
            return jsonify({"status": "error", "message": "Failed to fetch settings"}), 500

    # POST
    try:
        payload    = request.get_json(silent=True) or {}
        alert_days = payload.get("alert_days")
        try:
            alert_days = int(alert_days)
        except (TypeError, ValueError):
            return jsonify({"status": "error", "message": "alert_days must be an integer"}), 400
        if not (1 <= alert_days <= 90):
            return jsonify({"status": "error", "message": "alert_days must be between 1 and 90"}), 400

        client.table("profiles").update({"alert_days": alert_days}).eq("id", user_id).execute()
        return jsonify({"status": "success", "alert_days": alert_days})
    except Exception:
        logger.error("Error in POST /api/alerts/settings:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Failed to save settings"}), 500


@app.route("/api/alerts/check", methods=["GET"])
@require_auth
def alert_check():
    """
    Return a list of people who haven't been seen for >= alert_days days.

    Response (JSON)
    ---------------
    overdue : list of dicts
        name       str
        relation   str
        days_since int   — days since last_seen (None → never seen)
    alert_days int
    """
    from supabase import create_client
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    client = create_client(url, key)

    try:
        user_id = _get_user_id()
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 401

    try:
        prof = client.table("profiles").select("alert_days").eq("id", user_id).limit(1).execute()
        alert_days = prof.data[0]["alert_days"] if prof.data else 3

        people_result = (
            client.table("people")
            .select("name, relation, last_seen")
            .eq("user_id", user_id)
            .execute()
        )

        now = datetime.now(timezone.utc)
        overdue = []
        for row in (people_result.data or []):
            last_seen_str = row.get("last_seen") or ""
            if last_seen_str:
                try:
                    last_seen_dt = datetime.fromisoformat(last_seen_str)
                    if last_seen_dt.tzinfo is None:
                        last_seen_dt = last_seen_dt.replace(tzinfo=timezone.utc)
                    days_since = (now - last_seen_dt).days
                except (ValueError, TypeError):
                    days_since = None
            else:
                days_since = None  # never seen

            if days_since is None or days_since >= alert_days:
                overdue.append({
                    "name":       row.get("name", ""),
                    "relation":   row.get("relation", ""),
                    "days_since": days_since,
                })

        return jsonify({"overdue": overdue, "alert_days": alert_days})

    except Exception:
        logger.error("Error in GET /api/alerts/check:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Failed to check alerts"}), 500


# ---------------------------------------------------------------------------
# Debug endpoint (TEMPORARY — remove before production)
# ---------------------------------------------------------------------------


@app.route("/api/debug-face", methods=["POST"])
def debug_face():
    """
    Diagnostic endpoint: run every stage of the face detection pipeline
    on a single base64 image and report where it succeeds or fails.

    Request body (JSON)
    -------------------
    image : str  — base64 image (raw or data-URI)
    """
    import base64 as _b64
    import numpy as _np
    import cv2 as _cv2
    from face_engine import _FACE_CASCADE, _crop_largest_face, _analyze_frame, _get_face_app
    from inference_client import is_remote_enabled as _inf_remote, analyze_frame as _inf_analyze

    results: dict = {}
    try:
        payload   = request.get_json(silent=True) or {}
        image_b64 = (payload.get("image") or "").strip()
        if not image_b64:
            return jsonify({"error": "No image provided"}), 400

        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]

        # Step 1 — decode
        try:
            raw   = _b64.b64decode(image_b64)
            arr   = _np.frombuffer(raw, dtype=_np.uint8)
            frame = _cv2.imdecode(arr, _cv2.IMREAD_COLOR)
            results["step1_decode"] = "FAIL: imdecode returned None" if frame is None else f"OK shape={frame.shape}"
        except Exception as exc:
            results["step1_decode"] = f"FAIL: {exc}"
            return jsonify({"status": "ok", "results": results})

        if frame is None:
            return jsonify({"status": "ok", "results": results})

        # Step 2 — grayscale (legacy Haar sanity check)
        try:
            gray = _cv2.cvtColor(frame, _cv2.COLOR_BGR2GRAY)
            results["step2_grayscale"] = f"OK shape={gray.shape}"
        except Exception as exc:
            results["step2_grayscale"] = f"FAIL: {exc}"
            return jsonify({"status": "ok", "results": results})

        # Step 3 — legacy Haar detection (fallback path)
        try:
            faces = _FACE_CASCADE.detectMultiScale(
                _cv2.equalizeHist(gray), scaleFactor=1.05, minNeighbors=3, minSize=(40, 40),
            )
            results["step3_haar_fallback"] = f"faces={len(faces)}"
        except Exception as exc:
            results["step3_haar_fallback"] = f"FAIL: {exc}"

        # Step 4 — legacy crop helper
        try:
            crop = _crop_largest_face(frame)
            results["step4_haar_crop"] = "FAIL: returned None" if crop is None else f"OK shape={crop.shape}"
        except Exception as exc:
            results["step4_haar_crop"] = f"FAIL: {exc}"

        # Step 5 — insightface in-process (RetinaFace + ArcFace r100)
        try:
            app_ok = _get_face_app() is not None
            results["step5_insightface_loaded"] = "OK" if app_ok else "FAIL: FaceAnalysis returned None"
            local_faces = _analyze_frame(frame)
            results["step5_insightface_local"] = (
                f"faces={len(local_faces)}"
                + (f" first_bbox={local_faces[0]['bbox']} emb_len={local_faces[0]['embedding'].size}"
                   if local_faces else "")
            )
        except Exception as exc:
            results["step5_insightface_local"] = f"FAIL: {exc}"

        # Step 6 — remote inference microservice (if configured)
        if _inf_remote():
            try:
                remote_faces = _inf_analyze(frame)
                results["step6_inference_remote"] = f"faces={len(remote_faces)}"
            except Exception as exc:
                results["step6_inference_remote"] = f"FAIL: {exc}"
        else:
            results["step6_inference_remote"] = "SKIP: INFERENCE_URL not set"

        return jsonify({"status": "ok", "results": results})

    except Exception as exc:
        logger.error("debug-face failed: %s\n%s", exc, traceback.format_exc())
        return jsonify({"status": "error", "message": "Debug pipeline failed."}), 500


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------


@app.route("/api/auth/signup", methods=["POST"])
@limiter.limit("5 per hour")
def auth_signup():
    """
    Create a new Supabase Auth user.

    Request body (JSON)
    -------------------
    email    : str
    password : str

    Response body (JSON)
    --------------------
    status        "success" | "error"
    access_token  str | null  — null when email confirmation is required
    refresh_token str | null
    expires_in    int | null  — seconds until the access token expires
    user          {id, email}
    message       str
    """
    try:
        payload  = request.get_json(silent=True) or {}
        email    = (payload.get("email")    or "").strip()
        password = (payload.get("password") or "").strip()

        if not email or not password:
            return jsonify({
                "status":  "error",
                "message": "Email and password are required.",
            }), 400

        if not _is_valid_email(email):
            return jsonify({
                "status":  "error",
                "message": "Please enter a valid email address.",
            }), 400

        if len(password) < 6:
            return jsonify({
                "status":  "error",
                "message": "Password must be at least 6 characters.",
            }), 400

        resp    = _get_auth_client().auth.sign_up({"email": email, "password": password})
        session = resp.session
        user    = resp.user

        if session:
            return jsonify({
                "status":        "success",
                "access_token":  session.access_token,
                "refresh_token": session.refresh_token,
                "expires_in":    session.expires_in,
                "user": {"id": user.id, "email": user.email},
                "message": "Account created successfully.",
            })

        # Email confirmation required — session is None until confirmed
        return jsonify({
            "status":        "success",
            "access_token":  None,
            "refresh_token": None,
            "expires_in":    None,
            "user": {
                "id":    user.id    if user else None,
                "email": user.email if user else email,
            },
            "message": "Check your email to confirm your account before signing in.",
        })

    except Exception as exc:
        logger.error("Error in POST /api/auth/signup:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": str(exc)}), 400


@app.route("/api/auth/login", methods=["POST"])
@limiter.limit("10 per minute")
def auth_login():
    """
    Sign in with email and password.

    Request body (JSON)
    -------------------
    email    : str
    password : str

    Response body (JSON)
    --------------------
    status        "success" | "error"
    access_token  str  — include as: Authorization: Bearer <access_token>
    refresh_token str
    expires_in    int
    user          {id, email}
    """
    try:
        payload  = request.get_json(silent=True) or {}
        email    = (payload.get("email")    or "").strip()
        password = (payload.get("password") or "").strip()

        if not email or not password:
            return jsonify({
                "status":  "error",
                "message": "Email and password are required.",
            }), 400

        resp    = _get_auth_client().auth.sign_in_with_password(
            {"email": email, "password": password}
        )
        session = resp.session
        user    = resp.user

        if not session:
            return jsonify({
                "status":  "error",
                "message": "Authentication failed — check your credentials.",
            }), 401

        logger.info("User %s signed in.", user.id)
        return jsonify({
            "status":        "success",
            "access_token":  session.access_token,
            "refresh_token": session.refresh_token,
            "expires_in":    session.expires_in,
            "user": {"id": user.id, "email": user.email},
        })

    except Exception as exc:
        logger.error("Error in POST /api/auth/login:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": str(exc)}), 401


@app.route("/api/auth/refresh", methods=["POST"])
def auth_refresh():
    """
    Exchange a Supabase refresh_token for a new access_token.

    Request body (JSON)
    -------------------
    refresh_token : str

    Response body (JSON)
    --------------------
    status        "success" | "error"
    access_token  str
    refresh_token str   — new refresh token (rotation)
    expires_in    int
    """
    try:
        payload       = request.get_json(silent=True) or {}
        refresh_token = (payload.get("refresh_token") or "").strip()

        if not refresh_token:
            return jsonify({"status": "error", "message": "refresh_token is required"}), 400

        resp    = _get_auth_client().auth.refresh_session(refresh_token)
        session = resp.session

        if not session:
            return jsonify({"status": "error", "message": "Token refresh failed — please log in again."}), 401

        return jsonify({
            "status":        "success",
            "access_token":  session.access_token,
            "refresh_token": session.refresh_token,
            "expires_in":    session.expires_in,
        })

    except Exception as exc:
        logger.error("Error in POST /api/auth/refresh:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": str(exc)}), 401


@app.route("/api/auth/reset-password", methods=["POST"])
@limiter.limit("5 per hour")
def auth_reset_password():
    """Send a password-reset email via Supabase Auth.

    Responds success even when the email is unknown, so attackers can't
    enumerate accounts by comparing responses. Rate-limited per IP.
    """
    payload   = request.get_json(silent=True) or {}
    email     = (payload.get("email") or "").strip()
    redirect  = (payload.get("redirect_to") or "").strip()

    if not _is_valid_email(email):
        return jsonify({
            "status":  "error",
            "message": "Please enter a valid email address.",
        }), 400

    # Enforce a same-origin redirect: only accept the caller's Origin header.
    origin = (request.headers.get("Origin") or "").strip()
    if not redirect.startswith(origin) if origin else True:
        redirect = f"{origin}/reset-password" if origin else redirect

    try:
        _get_auth_client().auth.reset_password_for_email(
            email,
            {"redirect_to": redirect} if redirect else {},
        )
    except Exception as exc:
        # Log but return success to avoid enumeration.
        logger.warning("reset-password Supabase call failed for %s: %s", email, exc)

    return jsonify({
        "status":  "success",
        "message": "If that email is registered, a reset link is on its way.",
    })


@app.route("/api/assistant/chat", methods=["POST"])
@require_auth
@limiter.limit("60 per hour")
def assistant_chat():
    """In-app RecallPal helper. Body: { message, history?, context? }."""
    from assistant import chat as _assistant_chat, is_configured as _assistant_on
    if not _assistant_on():
        return jsonify({
            "status":  "error",
            "message": "Assistant not configured. Set ANTHROPIC_API_KEY on the server.",
        }), 503
    payload  = request.get_json(silent=True) or {}
    message  = (payload.get("message") or "").strip()
    history  = payload.get("history")  or []
    context  = payload.get("context")  or {}
    if not isinstance(history, list): history = []
    if not isinstance(context, dict): context = {}
    if not message and not context:
        return jsonify({"status": "error", "message": "message is required."}), 400
    reply = _assistant_chat(user_message=message, history=history, context=context)
    return jsonify({"status": "success", "reply": reply})


@app.route("/api/auth/me", methods=["GET"])
@require_auth
def auth_me():
    """
    Return the currently authenticated user's Supabase profile.

    Requires: Authorization: Bearer <token>

    Response body (JSON)
    --------------------
    status str
    user   {id, email, created_at}
    """
    try:
        token    = request.headers["Authorization"][7:]   # strip "Bearer "
        resp     = _get_auth_client().auth.get_user(token)
        user     = resp.user

        # Pull profile row (display_name, avatar_url).  If missing (e.g.
        # first request after signup), auto-create with sensible defaults
        # derived from the user's email + OAuth metadata.
        from face_engine import SupabaseEmbeddingStore
        svc = SupabaseEmbeddingStore()._client

        profile_row = None
        try:
            r = svc.table("profiles").select("display_name, avatar_url").eq("id", user.id).limit(1).execute()
            profile_row = (r.data or [None])[0]
        except Exception as exc:
            logger.warning("profiles fetch failed for %s: %s", user.id, exc)

        # Prefer stored profile fields; fall back to OAuth metadata (Google
        # avatar, full name) and finally to the email local-part.
        meta = getattr(user, "user_metadata", None) or {}
        google_avatar = meta.get("avatar_url") or meta.get("picture") or ""
        google_name   = meta.get("full_name")  or meta.get("name")    or ""

        display_name  = (profile_row or {}).get("display_name") or google_name or (user.email or "").split("@")[0]
        avatar_url    = (profile_row or {}).get("avatar_url")   or google_avatar or ""

        # If nothing was stored yet, seed the profile so the values are
        # stable across sessions (and so the trigger stamps updated_at).
        if not profile_row:
            try:
                svc.table("profiles").upsert({
                    "id":           user.id,
                    "display_name": display_name,
                    "avatar_url":   avatar_url or None,
                }).execute()
            except Exception as exc:
                logger.warning("profile upsert failed for %s: %s", user.id, exc)

        return jsonify({
            "status": "success",
            "user": {
                "id":           user.id,
                "email":        user.email,
                "created_at":   str(user.created_at) if user.created_at else None,
                "display_name": display_name,
                "avatar_url":   avatar_url or None,
            },
        })
    except Exception as exc:
        logger.error("Error in GET /api/auth/me:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": str(exc)}), 400


# ---------------------------------------------------------------------------
# Profile update endpoints
# ---------------------------------------------------------------------------

_MAX_AVATAR_BYTES = 512 * 1024   # 512 KB after base64 decode


@app.route("/api/me/profile", methods=["POST"])
@require_auth
@limiter.limit("30 per hour")
def update_profile():
    """Update display_name for the current user."""
    payload      = request.get_json(silent=True) or {}
    display_name = (payload.get("display_name") or "").strip()
    if not display_name or len(display_name) > 80:
        return jsonify({"status": "error", "message": "Display name must be 1–80 characters."}), 400
    try:
        user_id = _get_user_id()
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 401
    from face_engine import SupabaseEmbeddingStore
    SupabaseEmbeddingStore()._client.table("profiles").update({
        "display_name": display_name,
    }).eq("id", user_id).execute()
    return jsonify({"status": "success", "display_name": display_name})


@app.route("/api/me/avatar", methods=["POST", "DELETE"])
@require_auth
@limiter.limit("20 per hour")
def update_avatar():
    """POST { image: <data URL or base64 JPEG/PNG> } to set; DELETE to clear."""
    try:
        user_id = _get_user_id()
    except ValueError as exc:
        return jsonify({"status": "error", "message": str(exc)}), 401
    from face_engine import SupabaseEmbeddingStore
    tbl = SupabaseEmbeddingStore()._client.table("profiles")

    if request.method == "DELETE":
        tbl.update({"avatar_url": None}).eq("id", user_id).execute()
        return jsonify({"status": "success", "avatar_url": None})

    payload = request.get_json(silent=True) or {}
    image   = (payload.get("image") or "").strip()
    if not image:
        return jsonify({"status": "error", "message": "Image required."}), 400

    if not image.startswith("data:image/"):
        # Bare base64 — wrap as data URL with a safe default mime
        image = f"data:image/jpeg;base64,{image}"

    # Size guard so we don't blow up the row storage (Supabase text limit
    # is generous but we don't want megapixel uploads by accident).
    try:
        b64 = image.split(",", 1)[1]
        decoded_len = (len(b64) * 3) // 4
    except Exception:
        return jsonify({"status": "error", "message": "Invalid image data."}), 400
    if decoded_len > _MAX_AVATAR_BYTES:
        return jsonify({
            "status":  "error",
            "message": f"Image too large ({decoded_len // 1024} KB). Max 512 KB.",
        }), 400

    tbl.update({"avatar_url": image}).eq("id", user_id).execute()
    return jsonify({"status": "success", "avatar_url": image})


# ---------------------------------------------------------------------------
# Global JSON error handlers — prevent Werkzeug HTML pages leaking to client
# ---------------------------------------------------------------------------

@app.errorhandler(400)
def bad_request(e):
    return jsonify({"status": "error", "message": str(e)}), 400

@app.errorhandler(401)
def unauthorized(e):
    return jsonify({"status": "error", "message": str(e)}), 401

@app.errorhandler(404)
def not_found(e):
    return jsonify({"status": "error", "message": str(e)}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"status": "error", "message": str(e)}), 405

@app.errorhandler(500)
def internal_error(e):
    return jsonify({"status": "error", "message": str(e)}), 500

@app.errorhandler(Exception)
def unhandled_exception(e):
    logger.error("Unhandled exception: %s", e, exc_info=True)
    return jsonify({"status": "error", "message": "Internal server error"}), 500


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    debug_mode = os.environ.get("FLASK_DEBUG", "True").lower() in ("true", "1", "yes")
    logger.info("Starting Flask server on 0.0.0.0:5000 (debug=%s)", debug_mode)
    app.run(host="0.0.0.0", port=5000, debug=debug_mode, use_reloader=False)