"""
RecallPal assistant — Anthropic Claude wrapper.

Purpose: help a dementia patient (or their caregiver) use the app.
Answers "how do I add my daughter?", "what should I do now?", or
gets contextual nudges like "there is an unknown person on camera —
would you like to save them?".

Design notes:
- Very short, calm sentences. No jargon. No jokes. No emoji.
- Every reply ends with either a question or a single clear action.
- Model: claude-haiku-4-5 for latency + cost; can be overridden via
  ANTHROPIC_MODEL env var.
- Prompt caching applied to the (long, static) system prompt so the
  hot path is one small message + tiny per-request context block.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5-20251001")
_MAX_TOKENS      = int(os.environ.get("ASSISTANT_MAX_TOKENS", "400"))

_SYSTEM_PROMPT = """You are JARVIS, a gentle companion helping someone use the RecallPal app.

Your user may be an older adult, a dementia patient, or the person caring for them. Follow these rules without exception:

1. Speak with warmth. Short sentences. Grade-4 reading level.
2. Never use jargon or technical words (say "the camera screen", not "the dashboard").
3. Every reply is at most three sentences.
4. If the user seems stuck, offer ONE next step, phrased as a clear action starting with a verb.
5. Never invent features. If you don't know, say "I can help you save people, remember them, and see who visited today." and offer one of those.
6. IMPORTANT: return plain text only. Do not use markdown, asterisks, underscores, hashes, backticks, bullet points, or bold formatting. Your replies are read aloud, so special characters are read out literally.

What the app can do:
- The camera screen watches for faces. When it sees someone RecallPal knows, a small card appears with their name and how they are related to you.
- To save a new person: on the camera screen, tap "Add", take five to ten photos, type their name and how they are related to you, tick the consent box, then tap "Save Person".
- To add more photos of someone already saved: when their card appears next to their face, tap "Add More Photos".
- To see who visited today: tap the small calendar icon at the top of the camera screen.
- To change settings or your photo: tap your round profile picture at the top right.

If the user asks for something the app does not do, say so kindly and offer the closest thing that IS possible.

If given a CONTEXT block below, use it to give a specific reply — for example if it says an unknown face is on camera, offer to help save that person; if a known person is on camera, greet them by name and remind the user how they are related.

Never say the words "AI" or "model". You are JARVIS — a friend.
"""


def _client():
    """Lazy import so the app boots when anthropic isn't installed."""
    from anthropic import Anthropic
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured.")
    return Anthropic(api_key=key)


def is_configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY", "").strip())


def build_context_block(ctx: dict[str, Any] | None) -> str:
    """Turn the frontend snapshot into a compact plain-English brief."""
    if not ctx:
        return ""
    parts: list[str] = []

    faces = ctx.get("faces") or []
    if faces:
        recognized = [f.get("name") for f in faces if f.get("status") == "recognized" and f.get("name")]
        unknown_n  = sum(1 for f in faces if f.get("status") != "recognized")
        if recognized:
            parts.append(f"On camera right now: {', '.join(recognized)}.")
            # Include first person's relation if present.
            first_mem = (faces[0].get("memory") or {})
            rel = first_mem.get("relation") if isinstance(first_mem, dict) else None
            if rel and recognized:
                parts.append(f"{recognized[0]} is the user's {rel}.")
        if unknown_n:
            parts.append(
                f"There is an unknown person on camera (never seen before). "
                f"If it seems useful, gently offer to save them."
            )
    else:
        parts.append("No one is on camera right now.")

    people_count = ctx.get("people_count")
    if isinstance(people_count, int):
        parts.append(f"The user has saved {people_count} person(s) so far.")

    page = ctx.get("page")
    if page:
        parts.append(f"The user is on the {page} screen.")

    return "CONTEXT: " + " ".join(parts) if parts else ""


def chat(
    user_message:   str,
    history:        list[dict[str, str]] | None = None,
    context:        dict[str, Any] | None       = None,
) -> str:
    """Send a message to Claude and return the reply text.

    history: list of {"role": "user"|"assistant", "content": str}
    context: {"faces": [...], "people_count": int, "page": str}
    """
    if not is_configured():
        return "The assistant is not turned on right now. You can still use every button on the screen."

    ctx_block = build_context_block(context)
    messages: list[dict[str, Any]] = []
    for turn in (history or []):
        role = turn.get("role")
        text = (turn.get("content") or "").strip()
        if role in ("user", "assistant") and text:
            messages.append({"role": role, "content": text})

    user_full = user_message.strip()
    if ctx_block:
        user_full = f"{ctx_block}\n\n{user_full}" if user_full else ctx_block
    messages.append({"role": "user", "content": user_full or "Please help me."})

    try:
        resp = _client().messages.create(
            model      = _ANTHROPIC_MODEL,
            max_tokens = _MAX_TOKENS,
            system     = [
                {"type": "text", "text": _SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}},
            ],
            messages   = messages,
            temperature = 0.4,
        )
    except Exception as exc:
        logger.error("assistant.chat failed: %s", exc)
        return "I could not think just then. Please try again in a moment."

    parts: list[str] = []
    for block in resp.content or []:
        if getattr(block, "type", None) == "text":
            parts.append(getattr(block, "text", ""))
    reply = "".join(parts).strip()
    return reply or "I am here. What would you like to do?"
