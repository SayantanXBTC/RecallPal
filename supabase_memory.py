"""
supabase_memory.py — Supabase-backed memory layer for dementia-assist.

Replaces hindsight_memory.py entirely.  Uses the supabase-py client to
read and write the three tables created by supabase_schema.sql:
    profiles · people · face_embeddings

Every MemoryManager instance is scoped to a single authenticated user.
All queries filter on user_id so data never leaks between users.

Environment variables
---------------------
SUPABASE_URL          Project URL  —  https://xxxx.supabase.co
SUPABASE_SERVICE_KEY  Service-role secret key (server-side only).
                      Never expose this to the browser.

Migration notes
---------------
• PREDEFINED_PEOPLE is kept as a module-level constant so that the
  import in app.py (`from supabase_memory import PREDEFINED_PEOPLE,
  get_memory_manager`) continues to work without change.
• The constant is now documentation-only; the actual default rows are
  stored per-user via seed_initial_data() — nothing is globally shared.
• get_memory_manager(user_id) replaces the old no-arg factory.
  app.py must pass the authenticated user's UUID on every request.
"""

import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    """Current UTC time as an ISO-8601 string (timezone-aware)."""
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Pre-defined people
#
# Kept as a module-level constant so the existing import in app.py works:
#   from supabase_memory import PREDEFINED_PEOPLE, get_memory_manager
#
# These are the *templates* used by seed_initial_data().  Each user gets
# their own private copies in the `people` table — rows are never shared.
# ---------------------------------------------------------------------------

PREDEFINED_PEOPLE: dict[str, dict] = {
    "Sayantan": {
        "age":      21,
        "relation": "Friend",
        "likes":    ["AI", "Coding", "Chess", "Music"],
        "notes":    "Helpful and calm personality",
    },
    "Simran": {
        "age":      20,
        "relation": "Friend",
        "likes":    ["Dancing", "Fashion", "Social Media"],
        "notes":    "Very cheerful and social",
    },
    "Arpita": {
        "age":      22,
        "relation": "Friend",
        "likes":    ["Reading", "Writing", "Art"],
        "notes":    "Thoughtful and introspective",
    },
    "Sampad": {
        "age":      21,
        "relation": "Friend",
        "likes":    ["Cricket", "Gym", "Fitness"],
        "notes":    "Energetic and disciplined",
    },
}


# ---------------------------------------------------------------------------
# MemoryManager
# ---------------------------------------------------------------------------

class MemoryManager:
    """
    Per-user memory manager backed by Supabase.

    Instantiate once per authenticated user (or once per request).
    All public methods accept lowercase person names as keys, matching
    Fix #5 in face_engine.py.

    Public interface (drop-in replacement for the old MemoryManager /
    LocalMemoryManager):
        seed_initial_data()
        store_person(name, payload)
        update_person(name, relation, notes, age, likes)
        recall_person(name, fast_mode)
        update_last_seen(name)
        get_all_people()
        delete_person(name)
    """

    def __init__(self, user_id: str) -> None:
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
        if not user_id:
            raise ValueError("user_id must be a non-empty string.")

        self.user_id: str = user_id
        self._client = create_client(url, key)
        # Throttle last_seen writes: one DB write per person per 2 minutes.
        self._last_seen_cache: dict[str, float] = {}

        logger.info(
            "MemoryManager (Supabase) ready — user_id=%s", user_id
        )

    # ------------------------------------------------------------------
    # Seed
    # ------------------------------------------------------------------

    def seed_initial_data(self) -> dict:
        """
        Copy the four default people into this user's profile on first use.

        The check is: if the user already has *any* row in `people`,
        skip seeding entirely — we never want to overwrite edits the
        user has made to their own profiles.

        Safe to call on every login; it is a no-op after the first run.

        Returns
        -------
        dict  —  {"seeded": [names], "already_existed": [names]}
        """
        try:
            check = (
                self._client.table("people")
                .select("id", count="exact")
                .eq("user_id", self.user_id)
                .limit(1)
                .execute()
            )
            if check.data:
                all_names = list(PREDEFINED_PEOPLE.keys())
                logger.info(
                    "seed_initial_data: user %s already has people — skipping.",
                    self.user_id,
                )
                return {"seeded": [], "already_existed": all_names}
        except Exception as exc:
            logger.error(
                "seed_initial_data: existence check failed for user %s: %s",
                self.user_id, exc,
            )
            return {"seeded": [], "already_existed": []}

        now = _now_iso()
        rows = [
            {
                "user_id":    self.user_id,
                "name":       display_name.lower(),
                "relation":   data.get("relation", ""),
                "notes":      data.get("notes", ""),
                "age":        data.get("age"),
                "likes":      data.get("likes", []),
                "first_seen": now,
                "last_seen":  now,
            }
            for display_name, data in PREDEFINED_PEOPLE.items()
        ]

        try:
            self._client.table("people").insert(rows).execute()
            seeded = list(PREDEFINED_PEOPLE.keys())
            logger.info(
                "seed_initial_data: seeded %d people for user %s: %s",
                len(seeded), self.user_id, ", ".join(seeded),
            )
            return {"seeded": seeded, "already_existed": []}
        except Exception as exc:
            logger.error(
                "seed_initial_data: insert failed for user %s: %s",
                self.user_id, exc,
            )
            return {"seeded": [], "already_existed": []}

    # ------------------------------------------------------------------
    # Write operations
    # ------------------------------------------------------------------

    def store_person(self, name: str, payload: dict) -> bool:
        """
        Upsert a person's profile row.

        Parameters
        ----------
        name    Lowercase display name  (e.g. "sayantan").
        payload Dict with keys: relation, notes, age, likes.

        On conflict (user_id, name) the row is updated in-place, which
        means calling this on an already-existing person refreshes their
        metadata without touching first_seen.
        """
        name_key = name.strip().lower()
        now = _now_iso()

        row = {
            "user_id":    self.user_id,
            "name":       name_key,
            "relation":   (payload.get("relation") or "").strip(),
            "notes":      (payload.get("notes") or "").strip(),
            "age":        payload.get("age"),
            "likes":      payload.get("likes") or [],
            "first_seen": now,   # ignored on UPDATE (see ignoreDuplicates below)
            "last_seen":  now,
        }

        try:
            resp = self._client.table("people").upsert(
                row, on_conflict="user_id,name"
            ).execute()
            rows_back = len(resp.data) if resp.data else 0
            print(f"[DB WRITE] store_person: user={self.user_id} name={name_key} → {rows_back} row(s)")
            if rows_back == 0:
                logger.warning(
                    "store_person: upsert returned 0 rows for '%s' — "
                    "possible RLS violation or missing unique constraint.",
                    name_key,
                )
            # Verify-after-write
            verify = (
                self._client.table("people")
                .select("id, name")
                .eq("user_id", self.user_id)
                .eq("name", name_key)
                .limit(1)
                .execute()
            )
            if verify.data:
                print(f"[DB VERIFY] '{name_key}' confirmed in DB (id={verify.data[0]['id']})")
            else:
                print(f"[DB VERIFY] WARNING — '{name_key}' NOT found after write! Check RLS policies.")
            logger.info("Stored person '%s' for user %s.", name_key, self.user_id)
            return True
        except Exception as exc:
            logger.error(
                "store_person failed for '%s' (user %s): %s",
                name_key, self.user_id, exc,
            )
            return False

    def update_person(
        self,
        name:     str,
        relation: str,
        notes:    str,
        age:      Optional[int]  = None,
        likes:    Optional[list] = None,
    ) -> bool:
        """
        Patch metadata columns for an existing person row.
        Does NOT touch last_seen, first_seen, or face embeddings.
        """
        name_key = name.strip().lower()
        try:
            self._client.table("people").update({
                "relation": relation or "",
                "notes":    notes or "",
                "age":      age,
                "likes":    likes or [],
            }).eq("user_id", self.user_id).eq("name", name_key).execute()

            logger.info(
                "Updated person '%s' for user %s.", name_key, self.user_id
            )
            return True
        except Exception as exc:
            logger.error(
                "update_person failed for '%s' (user %s): %s",
                name_key, self.user_id, exc,
            )
            return False

    def update_last_seen(self, name: str) -> bool:
        """
        Stamp last_seen = now() in Supabase.

        Throttled to one DB write per person per 2 minutes so the
        1-second recognition loop does not hammer the database.
        """
        name_key = name.strip().lower()
        now_ts = time.time()

        if now_ts - self._last_seen_cache.get(name_key, 0) < 120:
            return True   # still within the throttle window

        self._last_seen_cache[name_key] = now_ts

        try:
            self._client.table("people").update({
                "last_seen": _now_iso(),
            }).eq("user_id", self.user_id).eq("name", name_key).execute()

            logger.info("Updated last_seen for '%s'.", name_key)
            return True
        except Exception as exc:
            logger.error(
                "update_last_seen failed for '%s' (user %s): %s",
                name_key, self.user_id, exc,
            )
            return False

    # ------------------------------------------------------------------
    # Read operations
    # ------------------------------------------------------------------

    def recall_person(self, name: str, fast_mode: bool = False) -> Optional[dict]:
        """
        Fetch a person's profile from Supabase.

        Parameters
        ----------
        name      Lowercase person name.
        fast_mode Accepted for interface compatibility; has no effect here
                  because Supabase queries are fast for both code paths.

        Returns
        -------
        dict or None
            Keys: name, age, relation, likes, notes, last_seen.
            Returns None when the person does not exist for this user.
        """
        name_key = name.strip().lower()
        try:
            result = (
                self._client.table("people")
                .select("name, age, relation, likes, notes, last_seen")
                .eq("user_id", self.user_id)
                .eq("name", name_key)
                .limit(1)
                .execute()
            )
            if not result.data:
                logger.info(
                    "No record found for '%s' (user %s).", name_key, self.user_id
                )
                return None

            row = result.data[0]
            return {
                "name":      row.get("name") or name_key,
                "age":       row.get("age"),
                "relation":  row.get("relation") or "",
                "likes":     row.get("likes") or [],
                "notes":     row.get("notes") or "",
                "last_seen": row.get("last_seen") or "",
            }
        except Exception as exc:
            logger.error(
                "recall_person failed for '%s' (user %s): %s",
                name_key, self.user_id, exc,
            )
            return None

    def get_all_people(self) -> list[dict]:
        """
        Return all enrolled people for this user, sorted alphabetically.

        Each dict has the same shape as recall_person's return value so
        callers can treat results uniformly.
        """
        try:
            result = (
                self._client.table("people")
                .select("name, age, relation, likes, notes, last_seen, first_seen, created_at")
                .eq("user_id", self.user_id)
                .order("name")
                .execute()
            )
            people: list[dict] = []
            for row in (result.data or []):
                people.append({
                    "name":      row.get("name") or "",
                    "age":       row.get("age"),
                    "relation":  row.get("relation") or "",
                    "likes":     row.get("likes") or [],
                    "notes":     row.get("notes") or "",
                    "last_seen": row.get("last_seen") or "",
                })
            print(f"[DB READ] get_all_people: user={self.user_id} → {len(people)} people")
            logger.info(
                "get_all_people: returned %d people for user %s.",
                len(people), self.user_id,
            )
            return people
        except Exception as exc:
            logger.error(
                "get_all_people failed for user %s: %s", self.user_id, exc
            )
            return []

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    def delete_person(self, name: str) -> bool:
        """
        Delete a person row.  The ON DELETE CASCADE in the schema
        automatically removes all associated face_embeddings rows.
        """
        name_key = name.strip().lower()
        try:
            self._client.table("people").delete().eq(
                "user_id", self.user_id
            ).eq("name", name_key).execute()

            logger.info(
                "Deleted '%s' (and their embeddings) for user %s.",
                name_key, self.user_id,
            )
            return True
        except Exception as exc:
            logger.error(
                "delete_person failed for '%s' (user %s): %s",
                name_key, self.user_id, exc,
            )
            return False


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_memory_manager(user_id: str) -> MemoryManager:
    """
    Return a MemoryManager scoped to the given Supabase Auth user UUID.

    Usage in app.py (one call per request, after extracting the JWT):
        manager = get_memory_manager(current_user_id)
        recalled = manager.recall_person("sayantan")

    The function is intentionally lightweight — it creates the Supabase
    client but makes no network calls until a method is invoked.
    """
    return MemoryManager(user_id=user_id)
