"""
Biometric consent + audit-log helpers.

Enforces the GDPR Art. 9 requirement that face embeddings may only be
processed with an explicit, versioned opt-in from the data subject (or
their legal guardian).

Public surface:
- CURRENT_CONSENT_VERSION       — bump when the consent text changes.
- has_active_consent(user_id, subject_person_name) -> bool
- grant_consent(...) -> str     — returns consent uuid
- revoke_consent(user_id, consent_id) -> bool
- list_consents(user_id) -> list[dict]
- audit(user_id, action, ...)   — inserts into audit_log
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from flask import request

logger = logging.getLogger(__name__)

CURRENT_CONSENT_VERSION = os.environ.get("CONSENT_TEXT_VERSION", "v1.0")
CONSENT_TYPE_BIOMETRIC  = "biometric_enrolment"


def _client():
    """Lazy import — supabase client only when consent module is exercised."""
    from face_engine import SupabaseEmbeddingStore
    return SupabaseEmbeddingStore()._client


# ---------------------------------------------------------------------------
# Consent
# ---------------------------------------------------------------------------

def _resolve_person_id(user_id: str, subject_name: str) -> Optional[str]:
    subject = (subject_name or "").strip().lower()
    if not subject:
        return None
    resp = (
        _client().table("people")
        .select("id")
        .eq("user_id", user_id)
        .eq("name", subject)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0]["id"] if rows else None


def has_active_consent(user_id: str, subject_name: str) -> bool:
    """True when a non-revoked biometric consent exists for the named subject.

    A consent granted before the person row exists (typical for first
    enrolment) is accepted by treating subject_person_id IS NULL as a
    provisional grant tied to the subject *name* via metadata search.
    """
    if not user_id or not subject_name:
        return False
    subject = subject_name.strip().lower()
    try:
        person_id = _resolve_person_id(user_id, subject)
        q = (
            _client().table("consents")
            .select("id, subject_person_id, granter_name, granted_at")
            .eq("user_id",       user_id)
            .eq("consent_type",  CONSENT_TYPE_BIOMETRIC)
            .is_("revoked_at",   "null")
        )
        rows = (q.execute().data or [])
        for r in rows:
            spid = r.get("subject_person_id")
            if person_id and spid == person_id:
                return True
            if spid is None and (r.get("granter_name") or "").strip().lower() == subject:
                # Provisional pre-enrolment grant keyed by subject name.
                return True
        return False
    except Exception as exc:
        logger.warning("has_active_consent failed for %s/%s: %s", user_id, subject_name, exc)
        return False


def grant_consent(
    user_id:          str,
    subject_name:     str,
    granter_name:     str,
    granter_relation: str = "",
) -> str:
    """Insert consent row. Returns consent uuid."""
    person_id = _resolve_person_id(user_id, subject_name)
    payload: dict[str, Any] = {
        "user_id":              user_id,
        "subject_person_id":    person_id,
        "consent_type":         CONSENT_TYPE_BIOMETRIC,
        "consent_text_version": CURRENT_CONSENT_VERSION,
        "granter_name":         (granter_name or subject_name).strip(),
        "granter_relation":     granter_relation.strip(),
    }
    resp = _client().table("consents").insert(payload).execute()
    row  = (resp.data or [{}])[0]
    cid  = row.get("id", "")
    audit(user_id, "grant_consent",
          target_type="consent", target_id=cid,
          metadata={"subject": subject_name.strip().lower(),
                    "version": CURRENT_CONSENT_VERSION})
    return cid


def revoke_consent(user_id: str, consent_id: str) -> bool:
    if not consent_id:
        return False
    try:
        _client().table("consents").update({"revoked_at": "now()"}) \
            .eq("id", consent_id).eq("user_id", user_id).execute()
        audit(user_id, "revoke_consent",
              target_type="consent", target_id=consent_id)
        return True
    except Exception as exc:
        logger.warning("revoke_consent failed for %s/%s: %s", user_id, consent_id, exc)
        return False


def list_consents(user_id: str) -> list[dict]:
    try:
        resp = (
            _client().table("consents")
            .select("id, subject_person_id, consent_type, consent_text_version, "
                    "granter_name, granter_relation, granted_at, revoked_at")
            .eq("user_id", user_id)
            .order("granted_at", desc=True)
            .execute()
        )
        return resp.data or []
    except Exception as exc:
        logger.warning("list_consents failed for %s: %s", user_id, exc)
        return []


# ---------------------------------------------------------------------------
# Audit log (server-side inserts only — RLS forbids client writes)
# ---------------------------------------------------------------------------

def audit(
    user_id:      Optional[str],
    action:       str,
    target_type:  str = "",
    target_id:    str = "",
    metadata:     Optional[dict] = None,
    actor:        str = "user",
) -> None:
    """Best-effort append to audit_log. Never raises."""
    try:
        ip = None
        ua = ""
        try:
            ip = (request.headers.get("X-Forwarded-For") or request.remote_addr or "").split(",")[0].strip() or None
            ua = (request.headers.get("User-Agent") or "")[:512]
        except Exception:
            pass
        _client().table("audit_log").insert({
            "user_id":     user_id,
            "actor":       actor,
            "action":      action,
            "target_type": target_type,
            "target_id":   target_id,
            "metadata":    metadata or {},
            "ip":          ip,
            "user_agent":  ua,
        }).execute()
    except Exception as exc:
        logger.warning("audit insert failed (%s / %s): %s", action, target_id, exc)


def list_audit(user_id: str, limit: int = 200) -> list[dict]:
    try:
        resp = (
            _client().table("audit_log")
            .select("id, actor, action, target_type, target_id, metadata, ip, user_agent, at")
            .eq("user_id", user_id)
            .order("at", desc=True)
            .limit(min(max(1, limit), 500))
            .execute()
        )
        return resp.data or []
    except Exception as exc:
        logger.warning("list_audit failed for %s: %s", user_id, exc)
        return []


# ---------------------------------------------------------------------------
# Right to erasure
# ---------------------------------------------------------------------------

def erase_user(user_id: str) -> bool:
    """Call the server-only RPC that wipes profile + cascades."""
    try:
        _client().rpc("delete_user_data", {"target": user_id}).execute()
        return True
    except Exception as exc:
        logger.error("erase_user failed for %s: %s", user_id, exc)
        return False
