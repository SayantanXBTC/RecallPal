# Voice Notes Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continuously capture speech via the browser mic, attribute each transcribed sentence to whoever is currently recognized on-camera, and persist it as a timestamped voice note in Supabase so caregivers can build up a living record of what was said about each person.

**Architecture:** The browser's native Web Speech API runs continuous recognition in CameraPanel; when a final sentence arrives the component looks at the currently-displayed faces, picks the most-prominent recognized person (largest bbox area), and POSTs the transcript to a new Flask endpoint that writes to a `voice_notes` Supabase table. Voice notes are displayed as a scrollable log inside each PersonCard in PeopleSidebar, loaded on demand via a GET endpoint.

**Tech Stack:** Web Speech API (`SpeechRecognition`), React custom hook, Flask + supabase-py, Supabase Postgres (new `voice_notes` table), existing `@require_auth` pattern, existing Framer Motion + Tailwind CSS design system.

---

## File Structure

| Path | Action | Responsibility |
|------|--------|---------------|
| `supabase_schema.sql` | Modify | Add `voice_notes` table + RLS policies |
| `app.py` | Modify | Add `POST /api/voice-note` and `GET /api/voice-notes` endpoints |
| `frontend/lib/types.ts` | Modify | Add `VoiceNote` interface |
| `frontend/hooks/useSpeechCapture.ts` | Create | Web Speech API abstraction hook |
| `frontend/components/CameraPanel.tsx` | Modify | Mic button, attribution logic, live transcript overlay |
| `frontend/components/PeopleSidebar.tsx` | Modify | Voice notes log section in PersonCard |
| `tests/test_voice_notes.py` | Create | pytest tests for the two new Flask endpoints |

---

## Task 1: Supabase table + Flask endpoints

**Files:**
- Modify: `dementia-assist/supabase_schema.sql` (append section 10)
- Modify: `dementia-assist/app.py` (add two routes after the `clear_events` route)
- Create: `dementia-assist/tests/test_voice_notes.py`

### Context

`app.py` exposes routes decorated with `@require_auth`. The decorator stores the user UUID in `flask.g.user_id`; `_get_user_id()` reads it. All Supabase writes go through the service-role client already imported as `client`. Look at the `clear_events` route (the most recent DELETE addition) for the exact pattern to follow.

The existing `people.notes` column is free-form text set by the user. Voice notes are *separate* — timestamped, append-only, attributed to a specific person. They live in a new `voice_notes` table.

---

- [ ] **Step 1.1: Add `voice_notes` table to supabase_schema.sql**

Open `dementia-assist/supabase_schema.sql` and append the following block at the end of the file (after section 9):

```sql
-- -----------------------------------------------------------
-- 10.  voice_notes
--      Append-only log of speech-to-text transcripts.
--      Each row is one recognised sentence attributed to one person.
-- -----------------------------------------------------------

create table if not exists public.voice_notes (
    id           uuid        primary key default gen_random_uuid(),
    user_id      uuid        not null
                             references public.profiles (id) on delete cascade,
    person_name  text        not null check (person_name = lower(person_name) and length(person_name) >= 2),
    transcript   text        not null check (length(transcript) >= 1),
    recorded_at  timestamptz not null default now()
);

comment on table  public.voice_notes              is 'Speech-to-text notes captured during live face recognition sessions.';
comment on column public.voice_notes.person_name  is 'Lowercase person name matching people.name at capture time.';
comment on column public.voice_notes.transcript   is 'Raw transcribed sentence from Web Speech API.';

create index if not exists voice_notes_user_person_idx
    on public.voice_notes (user_id, person_name, recorded_at desc);

alter table public.voice_notes enable row level security;

drop policy if exists "voice_notes: select own" on public.voice_notes;
create policy "voice_notes: select own"
    on public.voice_notes for select
    using (user_id = auth.uid());

drop policy if exists "voice_notes: insert own" on public.voice_notes;
create policy "voice_notes: insert own"
    on public.voice_notes for insert
    with check (user_id = auth.uid());

drop policy if exists "voice_notes: delete own" on public.voice_notes;
create policy "voice_notes: delete own"
    on public.voice_notes for delete
    using (user_id = auth.uid());
```

- [ ] **Step 1.2: Run the SQL in Supabase Dashboard**

Go to your Supabase project → SQL Editor → paste and run ONLY the new section 10 block above (from `create table if not exists public.voice_notes` through the last `create policy`). Do NOT re-run the entire file (it contains `drop trigger` which would re-fire the auth trigger).

Verify by checking Table Editor — `voice_notes` should appear with columns `id`, `user_id`, `person_name`, `transcript`, `recorded_at`.

- [ ] **Step 1.3: Write failing tests**

Create `dementia-assist/tests/test_voice_notes.py`:

```python
"""Tests for POST /api/voice-note and GET /api/voice-notes endpoints."""

import json
import os
import sys

import pytest

# Allow importing app.py from the project root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture
def client(monkeypatch):
    """Flask test client with auth bypassed via DEFAULT_USER_ID."""
    monkeypatch.setenv("DEFAULT_USER_ID", "00000000-0000-0000-0000-000000000001")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "")  # force dev-mode auth bypass
    import app as flask_app
    flask_app.app.config["TESTING"] = True
    with flask_app.app.test_client() as c:
        yield c


def test_save_voice_note_missing_fields(client):
    """POST with missing person_name returns 400."""
    res = client.post(
        "/api/voice-note",
        data=json.dumps({"transcript": "Hello world"}),
        content_type="application/json",
    )
    assert res.status_code == 400
    body = res.get_json()
    assert body["status"] == "error"
    assert "person_name" in body["message"].lower()


def test_save_voice_note_missing_transcript(client):
    """POST with missing transcript returns 400."""
    res = client.post(
        "/api/voice-note",
        data=json.dumps({"person_name": "sayantan"}),
        content_type="application/json",
    )
    assert res.status_code == 400
    body = res.get_json()
    assert body["status"] == "error"
    assert "transcript" in body["message"].lower()


def test_get_voice_notes_missing_name(client):
    """GET without ?name= param returns 400."""
    res = client.get("/api/voice-notes")
    assert res.status_code == 400
    body = res.get_json()
    assert body["status"] == "error"


def test_voice_note_roundtrip(client, monkeypatch):
    """POST then GET returns the saved note (mocked Supabase)."""
    saved = []

    class FakeResult:
        data = []

    class FakeQuery:
        def insert(self, row):
            saved.append(row)
            return self
        def select(self, *a):
            return self
        def eq(self, *a):
            return self
        def order(self, *a):
            return self
        def limit(self, *a):
            return self
        def execute(self):
            r = FakeResult()
            r.data = saved
            return r

    class FakeClient:
        def table(self, name):
            return FakeQuery()

    import app as flask_app
    monkeypatch.setattr(flask_app, "client", FakeClient())

    # Save a note
    res = client.post(
        "/api/voice-note",
        data=json.dumps({"person_name": "sayantan", "transcript": "He loves chess"}),
        content_type="application/json",
    )
    assert res.status_code == 200
    assert res.get_json()["status"] == "success"

    # Retrieve it
    res2 = client.get("/api/voice-notes?name=sayantan")
    assert res2.status_code == 200
    body = res2.get_json()
    assert "notes" in body
```

- [ ] **Step 1.4: Run tests to confirm they fail**

```bash
cd dementia-assist
python -m pytest tests/test_voice_notes.py -v
```

Expected: 4 failures — `ImportError` or `404` because the routes don't exist yet.

- [ ] **Step 1.5: Implement `POST /api/voice-note` in app.py**

In `app.py`, add the following route after the `clear_events` route (around line 1040, after the `@app.route("/api/events", methods=["DELETE"])` block):

```python
@app.route("/api/voice-note", methods=["POST"])
@require_auth
def save_voice_note():
    """
    Save a single speech-to-text transcript attributed to a recognised person.

    Request body (JSON)
    -------------------
    person_name : str  — lowercase name of the recognised person
    transcript  : str  — transcribed sentence from Web Speech API

    Response body (JSON)
    --------------------
    status : "success"
    id     : str  — UUID of the created voice_notes row
    """
    try:
        user_id  = _get_user_id()
        payload  = request.get_json(force=True) or {}

        person_name: str = (payload.get("person_name") or "").strip().lower()
        transcript:  str = (payload.get("transcript")  or "").strip()

        if not person_name:
            return jsonify({"status": "error", "message": "person_name is required."}), 400
        if not transcript:
            return jsonify({"status": "error", "message": "transcript is required."}), 400

        result = client.table("voice_notes").insert({
            "user_id":     user_id,
            "person_name": person_name,
            "transcript":  transcript,
        }).execute()

        row_id = result.data[0]["id"] if result.data else None
        return jsonify({"status": "success", "id": row_id})

    except Exception:
        logger.error("save_voice_note error:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Failed to save voice note."}), 500


@app.route("/api/voice-notes", methods=["GET"])
@require_auth
def list_voice_notes():
    """
    Return voice notes for a specific person, newest-first.

    Query params
    ------------
    name  : str  — person name (case-insensitive)
    limit : int  — max rows (default 30, max 100)

    Response body (JSON)
    --------------------
    notes : list of { id, transcript, recorded_at }
    """
    try:
        user_id = _get_user_id()
        name    = (request.args.get("name") or "").strip().lower()
        if not name:
            return jsonify({"status": "error", "message": "name query param is required."}), 400

        limit = min(int(request.args.get("limit", 30)), 100)

        result = (
            client.table("voice_notes")
            .select("id, transcript, recorded_at")
            .eq("user_id", user_id)
            .eq("person_name", name)
            .order("recorded_at", desc=True)
            .limit(limit)
            .execute()
        )

        return jsonify({"notes": result.data or []})

    except Exception:
        logger.error("list_voice_notes error:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Failed to fetch voice notes."}), 500
```

- [ ] **Step 1.6: Run tests — expect all 4 to pass**

```bash
cd dementia-assist
python -m pytest tests/test_voice_notes.py -v
```

Expected output:
```
PASSED tests/test_voice_notes.py::test_save_voice_note_missing_fields
PASSED tests/test_voice_notes.py::test_save_voice_note_missing_transcript
PASSED tests/test_voice_notes.py::test_get_voice_notes_missing_name
PASSED tests/test_voice_notes.py::test_voice_note_roundtrip
```

- [ ] **Step 1.7: Commit**

```bash
git add dementia-assist/supabase_schema.sql dementia-assist/app.py dementia-assist/tests/test_voice_notes.py
git commit -m "feat: add voice_notes table and POST/GET Flask endpoints"
```

---

## Task 2: `useSpeechCapture` hook

**Files:**
- Create: `dementia-assist/frontend/hooks/useSpeechCapture.ts`
- Modify: `dementia-assist/frontend/lib/types.ts` (add `VoiceNote` interface)

### Context

The Web Speech API (`window.SpeechRecognition`) is browser-native — no npm packages needed. It fires two types of results: *interim* (still being spoken, may change) and *final* (sentence complete). We want to:
1. Stream interim results to show live feedback on screen.
2. Fire `onFinalResult(text)` only for final results so the caller can save/attribute them.

`continuous: true` keeps recognition alive across sentence gaps. `interimResults: true` enables live streaming. The hook must restart automatically when it stops unexpectedly (the browser ends recognition after ~60s of silence on Chrome).

The hook returns `supported: false` on browsers without the API (Firefox without flags, Safari < 14.1) so the UI can hide the mic button gracefully.

---

- [ ] **Step 2.1: Add `VoiceNote` to types.ts**

Open `dementia-assist/frontend/lib/types.ts` and append at the end:

```typescript
export interface VoiceNote {
  id:          string;
  transcript:  string;
  recorded_at: string;  // ISO-8601
}
```

- [ ] **Step 2.2: Create `useSpeechCapture.ts`**

Create `dementia-assist/frontend/hooks/useSpeechCapture.ts`:

```typescript
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SpeechCaptureState {
  listening: boolean;
  interim:   string;   // live partial transcript — update display only, do not save
  supported: boolean;
}

interface UseSpeechCaptureOptions {
  onFinalResult: (text: string) => void;
  lang?: string;  // BCP-47 language tag, default 'en-US'
}

declare global {
  interface Window {
    SpeechRecognition:       typeof SpeechRecognition | undefined;
    webkitSpeechRecognition: typeof SpeechRecognition | undefined;
  }
}

export function useSpeechCapture({ onFinalResult, lang = 'en-US' }: UseSpeechCaptureOptions): {
  state:   SpeechCaptureState;
  start:   () => void;
  stop:    () => void;
} {
  const SpeechRecognitionCtor =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition ?? window.webkitSpeechRecognition)
      : undefined;

  const supported = Boolean(SpeechRecognitionCtor);

  const [listening, setListening] = useState(false);
  const [interim,   setInterim]   = useState('');

  const recognitionRef  = useRef<SpeechRecognition | null>(null);
  const activeRef       = useRef(false);   // true while user wants mic ON
  const onFinalRef      = useRef(onFinalResult);
  useEffect(() => { onFinalRef.current = onFinalResult; }, [onFinalResult]);

  const createRecognition = useCallback((): SpeechRecognition | null => {
    if (!SpeechRecognitionCtor) return null;
    const r = new SpeechRecognitionCtor();
    r.continuous      = true;
    r.interimResults  = true;
    r.lang            = lang;
    r.maxAlternatives = 1;

    r.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (text.length > 0) onFinalRef.current(text);
        } else {
          interimText += result[0].transcript;
        }
      }
      setInterim(interimText);
    };

    r.onend = () => {
      setInterim('');
      if (activeRef.current) {
        // Auto-restart after silence timeout or unexpected stop
        try { r.start(); } catch { /* already started */ }
      } else {
        setListening(false);
      }
    };

    r.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        activeRef.current = false;
        setListening(false);
      }
      // 'no-speech' and 'aborted' are harmless — onend will auto-restart
    };

    return r;
  }, [SpeechRecognitionCtor, lang]);

  const start = useCallback(() => {
    if (!supported) return;
    activeRef.current = true;
    setListening(true);
    const r = createRecognition();
    recognitionRef.current = r;
    try { r?.start(); } catch { /* already started */ }
  }, [supported, createRecognition]);

  const stop = useCallback(() => {
    activeRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim('');
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    activeRef.current = false;
    recognitionRef.current?.stop();
  }, []);

  return {
    state: { listening, interim, supported },
    start,
    stop,
  };
}
```

- [ ] **Step 2.3: Verify TypeScript compiles**

```bash
cd dementia-assist/frontend
npx tsc --noEmit
```

Expected: no errors related to `useSpeechCapture.ts` or `types.ts`.

- [ ] **Step 2.4: Commit**

```bash
git add dementia-assist/frontend/hooks/useSpeechCapture.ts dementia-assist/frontend/lib/types.ts
git commit -m "feat: add useSpeechCapture hook and VoiceNote type"
```

---

## Task 3: CameraPanel — mic button, attribution, live transcript overlay

**Files:**
- Modify: `dementia-assist/frontend/components/CameraPanel.tsx`

### Context

`CameraPanel` already holds `displayFaces: FaceResult[]` — the live array of recognized faces. It already has `token` from `useAuth()`.

**Attribution rule:**
- 0 recognized faces → don't save, show "No one recognized" in mic indicator.
- 1 recognized face → attribute to that person.
- 2+ recognized faces → pick the face with the largest bbox area (`w * h`). This heuristic picks whoever is closest/most prominent. Show a small "Recording for [Name]" chip so the user knows who gets the note.

**Mic button placement:** Bottom-right corner of the camera frame, outside the video — same row as the "Stop" / scan controls area. Style it to match the existing amber/gold design system.

**Live transcript overlay:** Semi-transparent banner at the bottom of the video frame showing `speech.state.interim` while the user is speaking. Hidden when empty. Disappears after the final result fires.

**Saving a note:** When `onFinalResult` fires, check attribution, POST to `/api/voice-note` with `{ person_name, transcript }` + Bearer token. Show a brief toast (use the existing `onRecognition` channel isn't ideal here; instead emit a local state toast within CameraPanel for 3 seconds).

---

- [ ] **Step 3.1: Add imports and `useVoiceNoteToast` local state to CameraPanel**

At the top of `CameraPanel.tsx`, add the import:

```typescript
import { useSpeechCapture } from '@/hooks/useSpeechCapture';
```

Inside the `CameraPanel` component body, after existing state declarations, add:

```typescript
const [voiceToast,    setVoiceToast]    = useState<string | null>(null);
const voiceToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

const showVoiceToast = useCallback((msg: string) => {
  if (voiceToastTimer.current) clearTimeout(voiceToastTimer.current);
  setVoiceToast(msg);
  voiceToastTimer.current = setTimeout(() => setVoiceToast(null), 3000);
}, []);

useEffect(() => () => {
  if (voiceToastTimer.current) clearTimeout(voiceToastTimer.current);
}, []);
```

- [ ] **Step 3.2: Add attribution helper function**

Add this function inside `CameraPanel` (after `showVoiceToast`):

```typescript
const getAttributionTarget = useCallback((): string | null => {
  const recognized = displayFaces.filter(f => f.status === 'recognized' && f.name);
  if (recognized.length === 0) return null;
  if (recognized.length === 1) return recognized[0].name!;
  // Multiple faces — pick the largest bbox area (closest / most prominent)
  return recognized.reduce((best, f) => {
    const area     = (f.bbox?.w ?? 0) * (f.bbox?.h ?? 0);
    const bestArea = (best.bbox?.w ?? 0) * (best.bbox?.h ?? 0);
    return area > bestArea ? f : best;
  }).name!;
}, [displayFaces]);
```

- [ ] **Step 3.3: Wire up `useSpeechCapture`**

Add the hook call inside `CameraPanel`, after `getAttributionTarget`:

```typescript
const saveVoiceNote = useCallback(async (transcript: string) => {
  const personName = getAttributionTarget();
  if (!personName) {
    showVoiceToast('🎤 No recognized person — note not saved.');
    return;
  }
  try {
    await fetch('/api/voice-note', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ person_name: personName, transcript }),
    });
    showVoiceToast(`🎤 Saved note for ${personName}`);
  } catch {
    showVoiceToast('🎤 Failed to save note');
  }
}, [getAttributionTarget, token, showVoiceToast]);

const { state: speech, start: startMic, stop: stopMic } = useSpeechCapture({
  onFinalResult: saveVoiceNote,
});
```

- [ ] **Step 3.4: Add mic button to the controls area**

In the JSX, find the existing controls row (the row with the "Stop Camera" / "Start Camera" button and the scan-key badge). Add the mic button as a sibling button in that same row:

```tsx
{speech.supported && (
  <button
    onClick={speech.listening ? stopMic : startMic}
    disabled={!isActive}
    title={speech.listening ? 'Stop recording' : 'Start recording voice notes'}
    className="w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30"
    style={{
      background: speech.listening
        ? 'rgba(239,68,68,0.20)'
        : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
      border: speech.listening
        ? '1px solid rgba(239,68,68,0.40)'
        : `1px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
      color: speech.listening ? '#ef4444' : (dark ? '#8A7D72' : '#9A8C84'),
    }}
    aria-label={speech.listening ? 'Stop voice recording' : 'Start voice recording'}
  >
    {speech.listening ? (
      /* Pulsing stop icon */
      <span className="w-3 h-3 rounded-sm animate-pulse" style={{ background: '#ef4444' }} />
    ) : (
      /* Mic icon */
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-7a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
      </svg>
    )}
  </button>
)}
```

- [ ] **Step 3.5: Add live transcript overlay inside the video frame**

Inside the camera frame `<div>` (the one containing `<video>` and `<canvas>`), add just before the closing `</div>`:

```tsx
{/* Live interim transcript */}
{speech.listening && speech.interim && (
  <div
    className="absolute bottom-0 left-0 right-0 px-3 py-2 text-sm font-dm-sans text-center"
    style={{
      background: 'rgba(0,0,0,0.68)',
      backdropFilter: 'blur(6px)',
      color: 'rgba(255,255,255,0.88)',
      lineHeight: 1.35,
    }}
  >
    {speech.interim}
  </div>
)}

{/* Attribution indicator */}
{speech.listening && (() => {
  const target = getAttributionTarget();
  return (
    <div
      className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold font-dm-sans"
      style={{
        background: 'rgba(239,68,68,0.18)',
        border: '1px solid rgba(239,68,68,0.40)',
        color: target ? '#fca5a5' : '#f6ad55',
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
      {target ? `Recording for ${target}` : 'No one recognized'}
    </div>
  );
})()}
```

- [ ] **Step 3.6: Add voice toast overlay**

Inside the camera frame `<div>`, also add:

```tsx
{/* Voice save toast */}
{voiceToast && (
  <div
    className="absolute bottom-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-semibold font-dm-sans whitespace-nowrap"
    style={{
      background: 'rgba(20,16,10,0.88)',
      border: '1px solid rgba(201,148,58,0.30)',
      color: '#F0C97A',
      zIndex: 30,
    }}
  >
    {voiceToast}
  </div>
)}
```

- [ ] **Step 3.7: Stop mic when camera stops**

In the existing `stopCamera` callback, add `stopMic();` at the top:

```typescript
const stopCamera = useCallback(() => {
  stopMic();  // ← add this line
  // ... rest of existing stopCamera body
}, [stopMic]);
```

Note: `stopCamera` already exists — just prepend `stopMic();` inside it and add `stopMic` to its dependency array.

- [ ] **Step 3.8: Verify TypeScript compiles**

```bash
cd dementia-assist/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3.9: Manual smoke test**

Start Flask backend: `cd dementia-assist && python app.py`
Start Next.js dev server: `cd dementia-assist/frontend && npm run dev`

1. Open the camera page.
2. Click the mic button → red pulsing square appears, "Recording for [Name]" chip shows.
3. Speak a sentence → interim text appears at the bottom of the video frame.
4. Finish speaking → toast "🎤 Saved note for [name]" appears.
5. Click mic button again → recording stops, indicators clear.

- [ ] **Step 3.10: Commit**

```bash
git add dementia-assist/frontend/components/CameraPanel.tsx dementia-assist/frontend/hooks/useSpeechCapture.ts
git commit -m "feat: add voice note capture to CameraPanel with attribution and live transcript overlay"
```

---

## Task 4: PeopleSidebar — voice notes log per person

**Files:**
- Modify: `dementia-assist/frontend/components/PeopleSidebar.tsx`

### Context

`PeopleSidebar` has `PersonCard` components. Each card already shows `person.notes`, `person.likes`, and an "Add Photos" button. We need to add a **Voice Notes** expandable section that lazy-loads voice notes from `GET /api/voice-notes?name=<name>` when the user taps a "Voice Notes" button.

The list should show notes newest-first with a relative timestamp (reuse the `timeAgo` function already in `VisitHistory.tsx` — copy it rather than importing, to keep components self-contained).

No infinite scroll needed — limit 20, show count in the button label.

---

- [ ] **Step 4.1: Add `VoiceNote` import and timeAgo helper to PeopleSidebar**

At the top of `PeopleSidebar.tsx`, add to the existing imports:

```typescript
import { VoiceNote } from '@/lib/types';
```

Add this function near the top of the file (before the `PersonCard` component):

```typescript
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hrs  < 24)  return `${hrs}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7)   return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
```

- [ ] **Step 4.2: Add voice notes state to PersonCard**

`PersonCard` already has local state (e.g. `addPhotosOpen`). Add the following state inside `PersonCard`:

```typescript
const [showVoiceNotes, setShowVoiceNotes] = useState(false);
const [voiceNotes,     setVoiceNotes]     = useState<VoiceNote[]>([]);
const [vNotesLoading,  setVNotesLoading]  = useState(false);
const [vNotesFetched,  setVNotesFetched]  = useState(false);  // prevent re-fetch on re-open
```

- [ ] **Step 4.3: Add fetch function inside PersonCard**

Add this inside `PersonCard` (after the state declarations):

```typescript
const loadVoiceNotes = useCallback(async () => {
  if (vNotesFetched) return;
  setVNotesLoading(true);
  try {
    const res = await fetch(`/api/voice-notes?name=${encodeURIComponent(person.name.toLowerCase())}&limit=20`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json();
    setVoiceNotes(data.notes ?? []);
  } catch {
    setVoiceNotes([]);
  } finally {
    setVNotesLoading(false);
    setVNotesFetched(true);
  }
}, [person.name, token, vNotesFetched]);
```

`PersonCard` must receive `token` as a prop. Add it to the `PersonCardProps` interface:

```typescript
interface PersonCardProps {
  // ... existing props ...
  token: string | null;
}
```

And pass it from `PeopleSidebar` when rendering `PersonCard`:

```tsx
<PersonCard
  key={p.name}
  person={p}
  dark={dark}
  token={token}         // ← add this
  onAddPhotos={...}
  // ... other existing props
/>
```

- [ ] **Step 4.4: Add "Voice Notes" toggle button to PersonCard JSX**

In the `PersonCard` JSX, find the row with the "Add Photos" button (camera icon button). Add a sibling "Voice Notes" button next to it:

```tsx
<button
  onClick={() => {
    const next = !showVoiceNotes;
    setShowVoiceNotes(next);
    if (next) loadVoiceNotes();
  }}
  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold font-dm-sans transition-all"
  style={{
    background: showVoiceNotes
      ? (dark ? 'rgba(201,148,58,0.18)' : 'rgba(201,148,58,0.12)')
      : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
    color: showVoiceNotes ? '#C9943A' : (dark ? '#8A7D72' : '#9A8C84'),
    border: showVoiceNotes ? '1px solid rgba(201,148,58,0.30)' : '1px solid transparent',
  }}
>
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-7a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
  </svg>
  Voice Notes
  {vNotesFetched && voiceNotes.length > 0 && (
    <span
      className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]"
      style={{ background: 'rgba(201,148,58,0.20)', color: '#C9943A' }}
    >
      {voiceNotes.length}
    </span>
  )}
</button>
```

- [ ] **Step 4.5: Add voice notes list panel below the button row**

In the PersonCard JSX, after the button row div, add:

```tsx
{showVoiceNotes && (
  <div
    className="mt-2 rounded-xl overflow-hidden"
    style={{ border: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}` }}
  >
    {vNotesLoading && (
      <div className="flex items-center justify-center py-4">
        <span
          className="w-4 h-4 border-2 rounded-full animate-spin"
          style={{ borderColor: 'rgba(201,148,58,0.25)', borderTopColor: '#C9943A' }}
        />
      </div>
    )}

    {!vNotesLoading && voiceNotes.length === 0 && (
      <p
        className="text-center text-xs font-dm-sans py-4 px-3"
        style={{ color: dark ? '#8A7D72' : '#9A8C84' }}
      >
        No voice notes yet — start recording on the camera screen.
      </p>
    )}

    {!vNotesLoading && voiceNotes.length > 0 && (
      <div
        className="max-h-48 overflow-y-auto divide-y"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(201,148,58,0.20) transparent',
          divideColor: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        }}
      >
        {voiceNotes.map((note) => (
          <div
            key={note.id}
            className="px-3 py-2"
            style={{ background: dark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.60)' }}
          >
            <p
              className="text-xs font-dm-sans leading-snug"
              style={{ color: dark ? '#D4C9C0' : '#4A3F38' }}
            >
              {note.transcript}
            </p>
            <p
              className="text-[10px] font-dm-sans mt-0.5"
              style={{ color: dark ? '#8A7D72' : '#9A8C84' }}
            >
              {timeAgo(note.recorded_at)}
            </p>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4.6: Verify TypeScript compiles**

```bash
cd dementia-assist/frontend
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4.7: Manual smoke test**

1. With Flask + dev server running, go to camera screen, start mic, say something with a recognized person on screen.
2. Navigate to People tab in sidebar.
3. Click "Voice Notes" on that person's card.
4. The note you just spoke should appear with a timestamp.
5. Speak another sentence on the camera screen while still on People tab (sidebar is visible in same view) — after navigating back, hit "Voice Notes" again → count increments (need to set `vNotesFetched = false` to re-fetch, or just reload page).

- [ ] **Step 4.8: Commit**

```bash
git add dementia-assist/frontend/components/PeopleSidebar.tsx
git commit -m "feat: add voice notes log to PeopleSidebar PersonCard"
```

---

## Self-Review

**Spec coverage check:**

| Requirement | Task |
|------------|------|
| Person speaks → transcript captured | Task 2 (hook) + Task 3 (mic button) |
| Stored as information against person's name | Task 1 (DB + POST endpoint) + Task 3 (saveVoiceNote) |
| Works for different persons on screen | Task 3 (attribution logic — largest bbox wins) |
| Multiple people on screen → correctly attributed | Task 3 (getAttributionTarget, attribution chip shows who gets the note) |
| User can see stored voice notes | Task 4 (PeopleSidebar voice notes section) |

**Placeholder scan:** None — all steps have exact code.

**Type consistency check:**
- `VoiceNote` defined in Task 2.1, used in Task 4.1 ✓
- `useSpeechCapture` exported in Task 2.2, imported in Task 3.1 ✓
- `POST /api/voice-note` body `{ person_name, transcript }` in Task 1.5, matches Task 3.3 fetch ✓
- `GET /api/voice-notes?name=` response `{ notes: VoiceNote[] }` in Task 1.5, consumed in Task 4.3 ✓
- `PersonCard` receives `token` prop added in Task 4.3 ✓

**Known limitation noted but not over-engineered:** When 2+ people are on screen, the plan picks the largest-bbox face. This is good enough for v1. A future plan can add a "switch attribution target" UI if needed.
