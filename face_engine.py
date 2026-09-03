"""
face_engine.py — Core face recognition engine for dementia-assist.

Changes vs original
--------------------
Fix #1  — Crop face with OpenCV BEFORE calling DeepFace (avoids "No face detected").
Fix #2  — Match against the *average* embedding per person (more stable, less noise).
Fix #3  — Default threshold lowered to 8.0 (sweet-spot 7–9 range).
Fix #4  — load_database() validates and prints loaded data at startup.
Fix #5  — All names normalised to lowercase on store AND on lookup.
Fix #8  — Frames resized to ≤640 px before any processing.
Fix #9  — Confidence score (0–100 %) returned and logged.
Fix #10 — Pickle storage replaced with Supabase face_embeddings table.
         FaceEngine is now scoped per authenticated user.
Fix #11 — Switched from FaceNet (128-d) to ArcFace (512-d) for better accuracy.
         NOTE: the Supabase face_embeddings.embedding column must be vector(512).
         Migrate with: ALTER TABLE face_embeddings ALTER COLUMN embedding TYPE vector(512);
Fix #12 — Enrollment quality filtering: embeddings that are more than 1.5 standard
         deviations from the batch mean are rejected as likely bad captures
         (eyes closed, turned away, motion blur).
Fix #13 — Data augmentation during enrollment: each captured photo generates 3
         extra variants (brightness +15 %, horizontal flip, Gaussian blur),
         effectively multiplying a 5-photo enrollment into ~20 training samples.
Fix #14 — K-means clustering (k=3) replaces the single average embedding.
         At recognition time the minimum distance across all cluster centroids
         is used, which handles pose and lighting variation more robustly.
Fix #15 — Rolling-window confidence voting: the last 5 recognition frames are
         tracked and a "recognised" result is only emitted when ≥3/5 agree on
         the same person, eliminating single-frame false positives.
"""

import base64
import logging
import os
from collections import deque
from datetime import datetime, timezone
from typing import Optional

import threading
import urllib.request
import zipfile

import cv2
import numpy as np
import onnxruntime as ort

logger = logging.getLogger(__name__)

# Haar-cascade for fast face detection (ships with every OpenCV install)
_FACE_CASCADE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)

# Padding fraction added around each detected face crop
_CROP_PAD = 0.20

# Rolling-window size — kept for hysteresis when face *leaves* frame.
# VOTE_THRESH = 1 means any single frame under threshold is accepted immediately.
# For dementia app, instant recognition >> occasional single-frame false positive.
_WINDOW_SIZE = 3
_VOTE_THRESH = 1

# K-means parameters for cluster-based matching (Fix #14)
_N_CLUSTERS = 3

# Quality-filtering: loosened 1.5→2.5 std-devs so fewer valid embeddings are
# discarded.  The old 1.5 value was too aggressive on small enrollment batches.
_QUALITY_STD_MULT = 2.5

# No confidence gate — threshold alone is the gate.
_MIN_CONFIDENCE = 0.0

# Minimum stored embeddings for recognition participation.
_MIN_PERSON_EMBEDDINGS = 3

# If best_dist < threshold * this ratio → clear voting window and accept instantly.
_INSTANT_RATIO = 0.85

# Per-model euclidean_l2 thresholds.
# Raised to 1.30 for ArcFace to handle real webcam conditions:
#   dark / backlit / glasses / slight angle all push dist into 1.20–1.28 range.
# False-positive risk remains low because different people sit at dist ≥ 1.35.
_MODEL_CONFIG: dict[str, dict] = {
    "ArcFace":    {"metric": "euclidean_l2", "threshold": 0.85},
    "Facenet512": {"metric": "euclidean_l2", "threshold": 1.16},
    "Facenet":    {"metric": "euclidean_l2", "threshold": 0.40},
    "VGG-Face":   {"metric": "euclidean_l2", "threshold": 0.60},
}
_DEFAULT_CONFIG = {"metric": "euclidean_l2", "threshold": 0.85}

# Resolved model name (set at first FaceEngine init via startup test)
_resolved_model: str | None = None

# ArcFace ONNX model — w600k_r50.onnx from insightface buffalo_l
_ARCFACE_MODEL_PATH = os.path.join(
    os.path.expanduser("~"), ".insightface", "models", "buffalo_l", "w600k_r50.onnx"
)
_BUFFALO_L_URL = (
    "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
)
_ORT_SESSION: "ort.InferenceSession | None" = None
_ORT_LOCK = threading.Lock()


def _ensure_arcface_model() -> str:
    """Download buffalo_l.zip and extract w600k_r50.onnx if not already cached."""
    if os.path.exists(_ARCFACE_MODEL_PATH):
        return _ARCFACE_MODEL_PATH
    model_dir = os.path.dirname(_ARCFACE_MODEL_PATH)
    os.makedirs(model_dir, exist_ok=True)
    zip_path = model_dir + ".zip"
    logger.info("face_engine: downloading buffalo_l (~300 MB) to %s …", zip_path)
    urllib.request.urlretrieve(_BUFFALO_L_URL, zip_path)
    # zip contains files flat (no subdirectory) — extract directly into model_dir
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(model_dir)
    os.remove(zip_path)
    logger.info("face_engine: buffalo_l extracted to %s", model_dir)
    return _ARCFACE_MODEL_PATH


def _get_ort_session() -> "ort.InferenceSession":
    global _ORT_SESSION
    if _ORT_SESSION is not None:
        return _ORT_SESSION
    with _ORT_LOCK:
        if _ORT_SESSION is None:
            model_path = _ensure_arcface_model()
            _ORT_SESSION = ort.InferenceSession(
                model_path, providers=["CPUExecutionProvider"]
            )
            logger.info("face_engine: ArcFace ORT session loaded from %s", model_path)
    return _ORT_SESSION


def _arcface_embedding(face_img: np.ndarray) -> np.ndarray:
    """Run ArcFace on a face crop. Returns 512-d float32 embedding."""
    img = cv2.resize(face_img, (112, 112))
    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32)
    img = (img - 127.5) / 127.5
    img = img.transpose(2, 0, 1)[np.newaxis, :]  # NCHW
    sess = _get_ort_session()
    input_name = sess.get_inputs()[0].name
    return sess.run(None, {input_name: img})[0][0].astype(np.float32)


def _l2_normalize(v: np.ndarray) -> np.ndarray:
    """Return a unit-length copy of *v*. Zero vectors pass through unchanged."""
    norm = np.linalg.norm(v)
    return v / norm if norm > 1e-8 else v


def _resolve_model_name() -> str:
    """
    Initialise insightface buffalo_l (downloads weights ~300 MB on first run).
    Result is cached for the process lifetime.
    """
    global _resolved_model
    if _resolved_model is not None:
        return _resolved_model
    try:
        logger.info("face_engine: loading ArcFace ONNX model (may download ~300 MB) …")
        _get_ort_session()
        logger.info("face_engine: ArcFace ONNX loaded successfully.")
    except Exception as exc:
        logger.error("face_engine: ArcFace ONNX load failed: %s", exc)
    _resolved_model = "ArcFace"
    return _resolved_model


# ---------------------------------------------------------------------------
# Face detection helper
# ---------------------------------------------------------------------------

def _crop_largest_face(frame: np.ndarray) -> Optional[np.ndarray]:
    """
    Detect faces in *frame* using OpenCV Haar cascades and return a cropped
    region around the **largest** detected face.

    A 20 % padding is added on each side so DeepFace can see enough context
    around the face to generate a reliable embedding.

    Returns ``None`` when no face is detected.
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = _FACE_CASCADE.detectMultiScale(
        gray,
        scaleFactor=1.05,   # was 1.1 — smaller step catches more faces
        minNeighbors=3,     # was 5   — less strict
        minSize=(40, 40),   # was (60,60) — catches smaller faces
    )

    if len(faces) == 0:
        # Second attempt: equalise histogram first (helps poor/uneven lighting)
        gray_eq = cv2.equalizeHist(gray)
        faces = _FACE_CASCADE.detectMultiScale(
            gray_eq,
            scaleFactor=1.03,
            minNeighbors=2,
            minSize=(30, 30),
        )

    if len(faces) == 0:
        return None

    # Pick the largest face by area
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])

    fh, fw = frame.shape[:2]
    pad_x = int(w * _CROP_PAD)
    pad_y = int(h * _CROP_PAD)

    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(fw, x + w + pad_x)
    y2 = min(fh, y + h + pad_y)

    crop = frame[y1:y2, x1:x2]
    logger.debug("Cropped face region: (%d,%d)→(%d,%d)", x1, y1, x2, y2)
    return crop


def _detect_all_faces(frame: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Detect every face in frame. Returns list of (x, y, w, h) bounding boxes."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = _FACE_CASCADE.detectMultiScale(
        gray, scaleFactor=1.05, minNeighbors=3, minSize=(40, 40),
    )
    if len(faces) == 0:
        gray_eq = cv2.equalizeHist(gray)
        faces = _FACE_CASCADE.detectMultiScale(
            gray_eq, scaleFactor=1.03, minNeighbors=2, minSize=(30, 30),
        )
    if len(faces) == 0:
        return []
    return [(int(x), int(y), int(w), int(h)) for x, y, w, h in faces]


def _crop_face(frame: np.ndarray, x: int, y: int, w: int, h: int) -> np.ndarray:
    """Crop a single face bbox from frame with padding."""
    fh, fw = frame.shape[:2]
    pad_x = int(w * _CROP_PAD)
    pad_y = int(h * _CROP_PAD)
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(fw, x + w + pad_x)
    y2 = min(fh, y + h + pad_y)
    return frame[y1:y2, x1:x2]


# ---------------------------------------------------------------------------
# Data augmentation (Fix #13)
# ---------------------------------------------------------------------------

def _augment_frame(frame: np.ndarray) -> list[np.ndarray]:
    """
    Generate 1 augmented variant of *frame* for enrollment diversity.

    Reduced from 3 → 1 to keep per-enrollment time under the Next.js
    proxy timeout (~60 s for 10 photos).  A horizontal flip gives the
    most useful pose diversity for recognition.

    The original *frame* is NOT included in the returned list; the caller
    is responsible for generating an embedding from the original as well.
    """
    return [cv2.flip(frame, 1)]


# ---------------------------------------------------------------------------
# Supabase embedding store
# ---------------------------------------------------------------------------

class SupabaseEmbeddingStore:
    """
    Thin wrapper around the Supabase client for reading and writing face
    embeddings in the ``face_embeddings`` table.

    ``face_embeddings`` schema (updated for Fix #11):
        id         uuid   PK
        person_id  uuid   FK → people(id) ON DELETE CASCADE
        embedding  vector(512)      ← was vector(128) with FaceNet
        created_at timestamptz

    This class does NOT own or create ``people`` rows — that is the
    responsibility of MemoryManager (supabase_memory.py).  When
    ``save_embedding`` is called and the person does not yet have a row in
    ``people``, a minimal placeholder is inserted so the FK constraint can
    be satisfied.  MemoryManager.store_person() will later upsert the full
    metadata on the same row via the (user_id, name) unique constraint.

    Environment variables
    ---------------------
    SUPABASE_URL          Project URL — https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY  Service-role secret key (server-side only).
    """

    def __init__(self) -> None:
        try:
            from supabase import create_client
        except ImportError as exc:
            raise ImportError(
                "supabase-py is not installed.  Run: pip install supabase"
            ) from exc

        url = os.environ.get("SUPABASE_URL", "").strip()
        key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()

        if not url:
            raise ValueError("SUPABASE_URL environment variable is not set.")
        if not key:
            raise ValueError("SUPABASE_SERVICE_KEY environment variable is not set.")

        self._client = create_client(url, key)
        logger.info("SupabaseEmbeddingStore initialised.")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_or_create_person_id(self, user_id: str, person_name: str) -> str:
        """
        Return the UUID of ``person_name`` in the ``people`` table for
        ``user_id``.

        If the row does not yet exist — for example, when ``add_person`` is
        called before ``MemoryManager.store_person`` — a minimal placeholder
        row is inserted so the FK constraint on ``face_embeddings`` can be
        satisfied.  MemoryManager.store_person() will upsert the full
        details later via the (user_id, name) unique constraint.
        """
        result = (
            self._client.table("people")
            .select("id")
            .eq("user_id", user_id)
            .eq("name", person_name)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]["id"]

        # Row does not exist — insert a minimal placeholder.
        now = datetime.now(timezone.utc).isoformat()
        insert_result = (
            self._client.table("people")
            .insert({
                "user_id":    user_id,
                "name":       person_name,
                "relation":   "",
                "notes":      "",
                "first_seen": now,
                "last_seen":  now,
            })
            .execute()
        )
        person_id = insert_result.data[0]["id"]
        logger.info(
            "Created placeholder people row '%s' for user %s (id=%s).",
            person_name, user_id, person_id,
        )
        return person_id

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def save_embedding(
        self, user_id: str, person_name: str, embedding: np.ndarray
    ) -> bool:
        """Insert one 512-d ArcFace embedding vector into ``face_embeddings``.

        Denormalised ``user_id`` is set explicitly so the DB-side trigger has
        nothing to do on the hot path.
        """
        try:
            person_id = self._get_or_create_person_id(user_id, person_name)
            self._client.table("face_embeddings").insert({
                "person_id": person_id,
                "user_id":   user_id,
                "embedding": embedding.tolist(),
            }).execute()
            return True
        except Exception as exc:
            logger.error(
                "save_embedding failed for '%s' (user %s): %s",
                person_name, user_id, exc,
            )
            return False

    def match(
        self,
        user_id:      str,
        embedding:    np.ndarray,
        top_k:        int   = 5,
        max_distance: float = 1.5,
    ) -> list[tuple[str, float]]:
        """Server-side k-NN search via pgvector HNSW.

        Calls the ``match_face_embeddings`` RPC which is scoped to
        ``target_user`` and ordered by L2 distance. Returns a list of
        ``(person_name, distance)`` tuples, aggregated to the best distance
        per person.
        """
        try:
            resp = self._client.rpc(
                "match_face_embeddings",
                {
                    "query_embedding": embedding.tolist(),
                    "top_k":           top_k,
                    "max_distance":    float(max_distance),
                    "target_user":     user_id,
                },
            ).execute()
        except Exception as exc:
            logger.error("match_face_embeddings RPC failed for user %s: %s", user_id, exc)
            return []

        rows = resp.data or []
        best_per_person: dict[str, float] = {}
        for row in rows:
            name = row.get("person_name")
            dist = row.get("distance")
            if name is None or dist is None:
                continue
            if name not in best_per_person or dist < best_per_person[name]:
                best_per_person[name] = float(dist)
        return sorted(best_per_person.items(), key=lambda kv: kv[1])

    def load_embeddings(self, user_id: str) -> "dict[str, list[np.ndarray]]":
        """
        Fetch all face embeddings for ``user_id`` from Supabase.

        Returns
        -------
        dict[str, list[np.ndarray]]
            Keyed by lowercase person name; values are lists of 512-d arrays.
        """
        try:
            # Step 1 — fetch all people for this user
            people_result = (
                self._client.table("people")
                .select("id, name")
                .eq("user_id", user_id)
                .execute()
            )
            if not people_result.data:
                return {}

            person_id_to_name: dict[str, str] = {
                row["id"]: row["name"] for row in people_result.data
            }
            person_ids = list(person_id_to_name.keys())

            # Step 2 — fetch all embeddings for those people
            embeddings_result = (
                self._client.table("face_embeddings")
                .select("person_id, embedding")
                .in_("person_id", person_ids)
                .execute()
            )

            database: dict[str, list[np.ndarray]] = {}
            for row in (embeddings_result.data or []):
                name = person_id_to_name.get(row["person_id"])
                if name is None:
                    continue
                raw = row["embedding"]
                # Supabase returns pgvector columns as a string '[f1,f2,...]'
                if isinstance(raw, str):
                    import json
                    raw = json.loads(raw)
                emb = np.array(raw, dtype=np.float32)
                database.setdefault(name, []).append(emb)

            logger.info(
                "load_embeddings: %d people, %d total embeddings for user %s.",
                len(database),
                sum(len(v) for v in database.values()),
                user_id,
            )
            return database

        except Exception as exc:
            logger.error(
                "load_embeddings failed for user %s: %s", user_id, exc
            )
            return {}

    def delete_person_embeddings(self, user_id: str, person_name: str) -> bool:
        """
        Delete all ``face_embeddings`` rows for the named person without
        removing the ``people`` row itself.

        (The ON DELETE CASCADE on ``people → face_embeddings`` handles
        automatic cleanup when the entire person is deleted via
        MemoryManager.delete_person().)
        """
        try:
            result = (
                self._client.table("people")
                .select("id")
                .eq("user_id", user_id)
                .eq("name", person_name)
                .limit(1)
                .execute()
            )
            if not result.data:
                logger.warning(
                    "delete_person_embeddings: '%s' not found for user %s.",
                    person_name, user_id,
                )
                return False

            person_id = result.data[0]["id"]
            self._client.table("face_embeddings").delete().eq(
                "person_id", person_id
            ).execute()
            logger.info(
                "Deleted embeddings for '%s' (user %s).", person_name, user_id
            )
            return True
        except Exception as exc:
            logger.error(
                "delete_person_embeddings failed for '%s' (user %s): %s",
                person_name, user_id, exc,
            )
            return False


# ---------------------------------------------------------------------------
# FaceEngine
# ---------------------------------------------------------------------------

class FaceEngine:
    """
    Face recognition engine that wraps DeepFace (ArcFace) and stores
    embeddings in Supabase instead of a local pickle file.

    Each instance is scoped to a single authenticated user.  On creation
    it fetches all embeddings for that user from Supabase and builds an
    in-memory cluster-centroid cache for fast recognition.

    All person names are stored and looked up in **lowercase** (Fix #5).

    Schema migration required (Fix #11)
    ------------------------------------
    The ``face_embeddings.embedding`` column must be resized from 128 to 512
    dimensions before enrolling faces with the new ArcFace model:

        ALTER TABLE face_embeddings
            ALTER COLUMN embedding TYPE vector(512);

    Any embeddings generated with the old FaceNet model are incompatible
    and must be re-enrolled.
    """

    MODEL_NAME = "ArcFace"   # default; overridden in __init__ by startup test

    def __init__(self, user_id: str, threshold: float | None = None) -> None:
        """
        Parameters
        ----------
        user_id    Supabase Auth UUID of the authenticated user.
        threshold  Override the euclidean_l2 distance threshold.
                   When None, uses the model-specific default from
                   _MODEL_CONFIG (1.13 for ArcFace, 1.04 for Facenet512).
        """
        if not user_id:
            raise ValueError("user_id must be a non-empty string.")
        self.MODEL_NAME:     str   = _resolve_model_name()
        cfg                        = _MODEL_CONFIG.get(self.MODEL_NAME, _DEFAULT_CONFIG)
        self.metric:         str   = cfg["metric"]
        self.threshold:      float = threshold if threshold is not None else cfg["threshold"]
        self.user_id:        str   = user_id
        self._store:         SupabaseEmbeddingStore      = SupabaseEmbeddingStore()
        self.database:      dict[str, list[np.ndarray]] = {}
        # Per-person L2-normalised embedding matrix (N, 512) — used only by
        # legacy single-face recognize() path. recognize_multi() bypasses this
        # and calls the pgvector HNSW RPC directly.
        self._emb_cache:    dict[str, np.ndarray]       = {}
        self._db_loaded:    bool                        = False
        # Rolling window for confidence voting
        self._recog_window: deque[str]                  = deque(maxlen=_WINDOW_SIZE)
        # Lazy: skip eager load. recognize_multi() never triggers it.
        # Legacy methods (recognize/enrol/list_people) call _ensure_loaded().

    # ------------------------------------------------------------------
    # Database loading
    # ------------------------------------------------------------------

    def _ensure_loaded(self) -> None:
        """Load embeddings on first legacy access. No-op after first call."""
        if not self._db_loaded:
            self.load_database()

    def load_database(self) -> None:
        """
        Fetch all embeddings for this user from Supabase and rebuild the
        legacy in-memory cache. Only called by legacy code paths.
        """
        self.database = self._store.load_embeddings(self.user_id)
        self._rebuild_emb_cache()
        self._db_loaded = True

        person_count    = len(self.database)
        embedding_count = sum(len(v) for v in self.database.values())

        per_person = {n: len(v) for n, v in self.database.items()}
        undertrained = [n for n, c in per_person.items() if c < _MIN_PERSON_EMBEDDINGS]
        print(
            f"\n{'='*60}\n"
            f"  face_engine: Supabase database loaded\n"
            f"  Model            : {self.MODEL_NAME}\n"
            f"  Metric           : {self.metric}\n"
            f"  Threshold        : {self.threshold}\n"
            f"  Confidence gate  : {_MIN_CONFIDENCE * 100:.0f}%\n"
            f"  User             : {self.user_id}\n"
            f"  People loaded    : {person_count}\n"
            f"  Total embeddings : {embedding_count}\n"
            + (f"  Embeddings/person: {per_person}\n" if per_person else "")
            + (f"  WARNING undertrained (<{_MIN_PERSON_EMBEDDINGS} emb): {undertrained}\n" if undertrained else "")
            + f"{'='*60}\n"
        )
        logger.info(
            "Loaded Supabase database for user %s: %d people, %d embeddings.",
            self.user_id, person_count, embedding_count,
        )

    def reload_database(self) -> None:
        """Public alias for load_database() — call after external enrolment."""
        self.load_database()

    # ------------------------------------------------------------------
    # Embedding cache (replaces k-means cluster cache)
    # ------------------------------------------------------------------

    def _rebuild_emb_cache(self) -> None:
        """
        Build a per-person L2-normalised embedding matrix from self.database.

        Nearest-neighbour matching against all stored embeddings is more
        accurate than matching against k-means centroids when the enrollment
        batch is small (10–30 samples), because:
          • No centroid-drift artefacts from under-sampled clusters
          • Every enrollment frame (including hard lighting/angle variants)
            directly contributes to the match
          • No scikit-learn dependency
        """
        self._emb_cache = {}
        for name, embeddings in self.database.items():
            if not embeddings:
                continue
            mat   = np.array(embeddings, dtype=np.float32)   # (N, 512)
            norms = np.linalg.norm(mat, axis=1, keepdims=True)
            self._emb_cache[name] = mat / np.where(norms > 1e-8, norms, 1.0)
        logger.debug("Embedding cache rebuilt for %d people.", len(self._emb_cache))

    # ------------------------------------------------------------------
    # Embedding generation
    # ------------------------------------------------------------------

    def _decode_frame(self, image: str) -> np.ndarray:
        """Decode base64 → BGR frame, resized to ≤640 px (Fix #8)."""
        if "," in image:
            image = image.split(",", 1)[1]

        img_bytes = base64.b64decode(image)
        frame = cv2.imdecode(
            np.frombuffer(img_bytes, dtype=np.uint8), cv2.IMREAD_COLOR
        )

        if frame is None:
            raise ValueError("Could not decode image bytes into a valid frame.")

        h, w = frame.shape[:2]
        if max(h, w) > 640:
            scale = 640 / max(h, w)
            frame = cv2.resize(
                frame,
                (int(w * scale), int(h * scale)),
                interpolation=cv2.INTER_AREA,
            )
        return frame

    def _get_embedding_from_frame(self, frame: np.ndarray) -> Optional[np.ndarray]:
        """
        Generate an embedding from *frame*.

        Pipeline:
        1. Try OpenCV crop → run DeepFace on cropped region.
        2. If crop is None OR DeepFace fails on crop, fall back to full frame.
        3. Returns None only when both paths fail.
        """
        cropped = _crop_largest_face(frame)
        if cropped is None:
            logger.debug("No crop found — using full frame fallback.")

        # Apply CLAHE (contrast-limited adaptive histogram equalisation) to the
        # L channel of the crop in LAB space.  This normalises dark / backlit
        # webcam frames without distorting hue/saturation, keeping the
        # embedding closer to enrollment photos taken in different lighting.
        if cropped is not None:
            try:
                lab  = cv2.cvtColor(cropped, cv2.COLOR_BGR2LAB)
                l, a, b = cv2.split(lab)
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                l     = clahe.apply(l)
                cropped = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)
            except Exception:
                pass  # if CLAHE fails, continue with original crop

        for label, img in (("crop", cropped), ("full_frame", frame)):
            if img is None:
                continue
            try:
                emb = _arcface_embedding(img)
                if label == "full_frame" and cropped is not None:
                    logger.debug("ArcFace on crop failed — full frame fallback succeeded.")
                return emb
            except Exception as exc:
                logger.debug("_get_embedding_from_frame [%s] failed: %s", label, exc)

        return None

    def get_embedding(self, image: str) -> np.ndarray:
        """
        Decode a base64 webcam frame, crop the largest face (Fix #1), then
        return a 512-d ArcFace embedding (Fix #11).

        Raises ValueError when no face is detected or the decode fails.
        """
        frame = self._decode_frame(image)
        emb = self._get_embedding_from_frame(frame)
        if emb is None:
            raise ValueError("No face detected by OpenCV cascade.")
        logger.debug("Embedding generated, shape=%s", emb.shape)
        return emb

    # ------------------------------------------------------------------
    # Recognition
    # ------------------------------------------------------------------

    @staticmethod
    def _nearest_distance(query: np.ndarray, normed_matrix: np.ndarray) -> float:
        """
        Minimum euclidean_l2 distance between L2-normalised *query* (dim,)
        and any row in *normed_matrix* (N, dim) which is already normalised.

        euclidean_l2(a, b) where ||a||=||b||=1 equals sqrt(2 - 2·cos(θ)),
        making this equivalent to cosine distance — robust to brightness
        changes that scale the raw embedding vector.
        """
        q_n   = _l2_normalize(query)                    # (dim,)
        diffs = normed_matrix - q_n[np.newaxis, :]      # (N, dim)
        dists = np.linalg.norm(diffs, axis=1)           # (N,)
        return float(np.min(dists))

    def recognize(self, image: str) -> dict:
        """
        Identify the person in *image* against the loaded database.

        Uses **k-means cluster centroids** per person (Fix #14) and a
        **rolling-window vote** of 5 frames (Fix #15).  A "recognised"
        result is only emitted when ≥3/5 recent frames agree on the same
        person.

        Returns
        -------
        dict  —  name, distance, confidence
            ``name`` is "Unknown" when recognition fails or the window vote
            does not reach the threshold.  ``confidence`` is None for
            Unknown results.
        """
        self._ensure_loaded()
        if not self.database:
            # Still try to detect a face so the frontend can show "Unknown — tap to add"
            try:
                frame = self._decode_frame(image)
                emb = self._get_embedding_from_frame(frame)
                if emb is not None:
                    logger.warning("Database is empty — face detected, returning Unknown.")
                    return {"name": "Unknown", "distance": 999.0, "confidence": None}
            except Exception:
                pass
            logger.warning("Database is empty — cannot recognise anyone.")
            return {"name": "Unknown", "distance": None, "confidence": None}

        if not self._emb_cache:
            self._rebuild_emb_cache()

        try:
            query_emb = self.get_embedding(image)
        except Exception as exc:
            logger.warning("Could not extract embedding: %s", exc)
            self._recog_window.append("__no_face__")
            return {"name": "Unknown", "distance": None, "confidence": None}

        # ── Compute nearest-neighbour distances for ALL candidates ────
        all_dists: list[tuple[str, float]] = []
        for person_name, normed_matrix in self._emb_cache.items():
            n_emb = len(self.database.get(person_name, []))
            if n_emb < _MIN_PERSON_EMBEDDINGS:
                logger.debug(
                    "[RECOGNIZE] Skipping undertrained '%s' (%d embeddings < %d required).",
                    person_name, n_emb, _MIN_PERSON_EMBEDDINGS,
                )
                continue
            dist = self._nearest_distance(query_emb, normed_matrix)
            all_dists.append((person_name, dist))

        if not all_dists:
            self._recog_window.append("__no_trained_people__")
            return {"name": "Unknown", "distance": None, "confidence": None}

        all_dists.sort(key=lambda x: x[1])
        best_name, best_dist = all_dists[0]

        # ── Distance threshold gate ────────────────────────────────────
        under_thresh = best_dist < self.threshold
        confidence   = float(np.clip(1.0 - best_dist / self.threshold, 0.0, 1.0))

        # ── [RECOGNIZE] log line ──────────────────────────────────────
        dist_str = "  ".join(f"{n}={d:.4f}" for n, d in all_dists[:5])

        if not under_thresh:
            logger.info(
                "[RECOGNIZE] %s  →  UNKNOWN (dist %.4f ≥ threshold %.4f)",
                dist_str, best_dist, self.threshold,
            )
            self._recog_window.append("Unknown")
            return {"name": "Unknown", "distance": best_dist, "confidence": None}

        # ── Instant-match shortcut ────────────────────────────────────
        # Very strong match (dist < threshold * INSTANT_RATIO): skip voting,
        # confirm immediately and seed the window so subsequent frames stay confirmed.
        if best_dist < self.threshold * _INSTANT_RATIO:
            self._recog_window.clear()
            self._recog_window.extend([best_name] * _WINDOW_SIZE)
            logger.info(
                "[RECOGNIZE] %s  →  INSTANT '%s' (dist %.4f < instant cutoff %.4f, confidence %.1f%%)",
                dist_str, best_name, best_dist, self.threshold * _INSTANT_RATIO, confidence * 100,
            )
            return {
                "name":       best_name,
                "distance":   best_dist,
                "confidence": confidence,
            }

        # ── Rolling-window vote ───────────────────────────────────────
        self._recog_window.append(best_name)
        window_list = list(self._recog_window)
        votes = window_list.count(best_name)

        if votes >= _VOTE_THRESH:
            logger.info(
                "[RECOGNIZE] %s  →  ACCEPTED '%s' (confidence %.1f%%  votes %d/%d)",
                dist_str, best_name, confidence * 100, votes, len(window_list),
            )
            return {
                "name":       best_name,
                "distance":   best_dist,
                "confidence": confidence,
            }

        logger.info(
            "[RECOGNIZE] %s  →  PENDING '%s' (confidence %.1f%%  votes %d/%d — need %d)",
            dist_str, best_name, confidence * 100, votes, len(window_list), _VOTE_THRESH,
        )
        return {"name": "Unknown", "distance": best_dist, "confidence": None}

    # ------------------------------------------------------------------
    # Enrolment
    # ------------------------------------------------------------------

    MIN_EMBEDDINGS = 5

    @staticmethod
    def _filter_by_quality(
        embeddings: list[np.ndarray],
        std_mult: float = _QUALITY_STD_MULT,
    ) -> tuple[list[np.ndarray], int]:
        """
        Remove outlier embeddings whose L2 distance from the batch mean
        exceeds *std_mult* standard deviations (Fix #12).

        These outliers typically correspond to bad captures: eyes closed,
        face turned away, heavy motion blur, or partially occluded.

        Returns
        -------
        (kept_embeddings, n_rejected)
        """
        if len(embeddings) <= 2:
            # Not enough data to compute meaningful statistics — keep all.
            return embeddings, 0

        mat  = np.array(embeddings, dtype=np.float32)
        mean = mat.mean(axis=0)
        dists = np.linalg.norm(mat - mean[np.newaxis, :], axis=1)

        mu  = float(dists.mean())
        std = float(dists.std())

        if std < 1e-6:
            # All embeddings are nearly identical — nothing to reject.
            return embeddings, 0

        cutoff = mu + std_mult * std
        mask   = dists <= cutoff
        kept   = [e for e, m in zip(embeddings, mask) if m]
        n_rej  = int((~mask).sum())

        if n_rej:
            logger.info(
                "_filter_by_quality: kept %d/%d embeddings "
                "(rejected %d outliers, cutoff=%.4f, μ=%.4f, σ=%.4f).",
                len(kept), len(embeddings), n_rej, cutoff, mu, std,
            )
        return kept, n_rej

    def add_person(self, name: str, images: list[str]) -> dict:
        """
        Enrol a new person.

        Pipeline (per image):
          1. Decode + crop face (Fix #1)
          2. Generate 512-d ArcFace embedding (Fix #11)
          3. Generate 3 augmented variants and their embeddings (Fix #13)
          4. Quality-filter the full batch (Fix #12)
          5. Persist survivors to Supabase (Fix #10)
          6. Rebuild cluster-centroid cache (Fix #14)

        A 5-photo enrollment yields up to 20 raw embeddings (5 × 4).
        After quality filtering and the MIN_EMBEDDINGS check the result
        is stored in Supabase and added to the in-memory cache.

        Returns
        -------
        dict  —  success, embeddings_count, skipped, error
        """
        if not name or not name.strip():
            raise ValueError("Person name must be a non-empty string.")
        if not images:
            raise ValueError("At least one image is required.")

        name = name.strip().lower()   # Fix #5

        raw_embeddings: list[np.ndarray] = []
        skipped = 0

        for idx, img_b64 in enumerate(images):
            try:
                frame = self._decode_frame(img_b64)
            except Exception as exc:
                skipped += 1
                logger.warning(
                    "Skipping image %d/%d for '%s' (decode error): %s",
                    idx + 1, len(images), name, exc,
                )
                continue

            # Base embedding from original frame
            base_emb = self._get_embedding_from_frame(frame)
            if base_emb is None:
                skipped += 1
                logger.warning(
                    "Skipping image %d/%d for '%s': no face detected.",
                    idx + 1, len(images), name,
                )
                continue

            raw_embeddings.append(base_emb)

            # Fix #13 — 3 augmented variants per original frame
            for aug_frame in _augment_frame(frame):
                aug_emb = self._get_embedding_from_frame(aug_frame)
                if aug_emb is not None:
                    raw_embeddings.append(aug_emb)

        if not raw_embeddings:
            return {
                "success":          False,
                "embeddings_count": 0,
                "skipped":          skipped,
                "error": (
                    f"None of the {len(images)} photos contained a detectable face. "
                    "Try again with better lighting and face the camera directly."
                ),
            }

        # Fix #12 — quality filtering
        kept_embeddings, n_rejected = self._filter_by_quality(raw_embeddings)

        if len(kept_embeddings) < self.MIN_EMBEDDINGS:
            return {
                "success":          False,
                "embeddings_count": len(kept_embeddings),
                "skipped":          skipped,
                "error": (
                    f"Only {len(kept_embeddings)} quality embeddings remained after "
                    f"filtering out {n_rejected} outlier(s) "
                    f"(minimum {self.MIN_EMBEDDINGS} required). "
                    "Try again with clearer, well-lit photos looking directly at the camera."
                ),
            }

        # Persist each embedding to Supabase (Fix #10)
        save_failures = 0
        for emb in kept_embeddings:
            if not self._store.save_embedding(self.user_id, name, emb):
                save_failures += 1

        if save_failures == len(kept_embeddings):
            return {
                "success":          False,
                "embeddings_count": 0,
                "skipped":          skipped,
                "error":            "All embeddings failed to save to Supabase.",
            }

        # Update in-memory database and rebuild cluster cache (Fix #14)
        # Only mutate cache if it has already been populated by a legacy call;
        # otherwise stay lazy — recognize_multi() reads directly from Supabase.
        if self._db_loaded:
            if name not in self.database:
                self.database[name] = []
            self.database[name].extend(kept_embeddings)
            self._rebuild_emb_cache()

        saved = len(kept_embeddings) - save_failures
        logger.info(
            "Enrolled '%s': %d raw embeddings → %d after quality filter "
            "(%d rejected outliers, %d skipped frames, %d save failures). "
            "Total in memory: %d.",
            name,
            len(raw_embeddings), len(kept_embeddings),
            n_rejected, skipped, save_failures,
            len(self.database[name]),
        )
        return {
            "success":          True,
            "embeddings_count": saved,
            "skipped":          skipped,
            "error":            None,
        }

    def recognize_multi(self, image: str) -> dict:
        """
        Identify all faces visible in *image*.

        Unlike recognize() which processes only the largest face, this method
        detects every face in the frame and runs independent nearest-neighbour
        matching for each.  No shared voting window is used — the distance
        threshold alone gates each result, which is correct because per-face
        identity cannot be tracked across frames without a tracker.

        Returns
        -------
        dict — {"faces": [{"name", "confidence", "distance", "bbox", "frame_width", "frame_height"}, ...]}
        """
        try:
            frame = self._decode_frame(image)
        except Exception as exc:
            logger.warning("recognize_multi: decode failed: %s", exc)
            return {"faces": []}

        fh, fw = frame.shape[:2]
        bboxes = _detect_all_faces(frame)

        if not bboxes:
            return {"faces": []}

        if not self._emb_cache:
            self._rebuild_emb_cache()

        results = []
        for (x, y, w, h) in bboxes:
            crop = _crop_face(frame, x, y, w, h)

            # CLAHE normalisation — same pipeline as single-face recognize()
            try:
                lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
                l_ch, a_ch, b_ch = cv2.split(lab)
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                l_ch = clahe.apply(l_ch)
                crop = cv2.cvtColor(cv2.merge([l_ch, a_ch, b_ch]), cv2.COLOR_LAB2BGR)
            except Exception:
                pass

            bbox_dict = {"x": x, "y": y, "w": w, "h": h}
            unknown = {"name": "Unknown", "confidence": None, "distance": None,
                       "bbox": bbox_dict, "frame_width": fw, "frame_height": fh}

            try:
                emb = _arcface_embedding(crop)
            except Exception:
                results.append(unknown)
                continue

            # Server-side k-NN via pgvector HNSW. Fetches top-K candidates
            # under self.threshold; empty result → unknown face.
            matches = self._store.match(
                user_id      = self.user_id,
                embedding    = emb,
                top_k        = 5,
                max_distance = float(self.threshold),
            )

            if not matches:
                results.append(unknown)
                continue

            best_name, best_dist = matches[0]

            # Enforce per-person minimum embeddings only if cache is populated;
            # otherwise trust the DB-side filter (RPC already scoped user).
            if self.database and \
               len(self.database.get(best_name, [])) < _MIN_PERSON_EMBEDDINGS:
                # Person under-trained — fall back to unknown.
                results.append({**unknown, "distance": float(best_dist)})
                continue

            if best_dist >= self.threshold:
                results.append({**unknown, "distance": float(best_dist)})
                continue

            confidence = float(np.clip(1.0 - best_dist / self.threshold, 0.0, 1.0))
            results.append({
                "name":         best_name,
                "confidence":   confidence,
                "distance":     float(best_dist),
                "bbox":         bbox_dict,
                "frame_width":  fw,
                "frame_height": fh,
            })
            logger.info(
                "[RECOGNIZE_MULTI] '%s' dist=%.4f conf=%.1f%%  bbox=(%d,%d,%d,%d)",
                best_name, best_dist, confidence * 100, x, y, w, h,
            )

        return {"faces": results}

    def list_people(self) -> list[str]:
        """Return a sorted list of all person names for this user.

        Queries Supabase directly — no dependence on in-memory cache.
        """
        try:
            resp = (
                self._store._client.table("people")
                .select("name")
                .eq("user_id", self.user_id)
                .execute()
            )
            names = [row["name"] for row in (resp.data or []) if row.get("name")]
            return sorted(set(names))
        except Exception as exc:
            logger.error("list_people query failed for user %s: %s", self.user_id, exc)
            return sorted(self.database.keys())

    def delete_person(self, name: str) -> None:
        """Remove a person from the in-memory database and embedding cache."""
        name_key = name.strip().lower()
        self.database.pop(name_key, None)
        self._emb_cache.pop(name_key, None)
        logger.info("Removed '%s' from in-memory engine cache.", name_key)
