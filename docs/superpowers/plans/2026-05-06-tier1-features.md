# Tier 1 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement five Tier 1 features: recognition event history, photo re-enrollment, JWT token refresh, caregiver absence alerts, and accessibility/large-text mode.

**Architecture:** Flask backend (Python) proxied via Next.js rewrites to `localhost:5000`. Frontend is Next.js 16 App Router + TypeScript + Tailwind + Framer Motion. DB is Supabase (Postgres + pgvector). Auth is Supabase JWT (HS256), verified server-side in `require_auth`. Each feature is independent — implement in any order.

**Tech Stack:** Flask, supabase-py, Next.js 16, TypeScript, Tailwind CSS 3, Framer Motion 12, Web Speech API

---

> **Scope note:** These are 5 independent subsystems. If handing to subagents, dispatch one subagent per feature section (F1–F5). Each section is fully self-contained.

---

## File Map

| Feature | New files | Modified files |
|---------|-----------|----------------|
| F1 Recognition History | `frontend/components/VisitHistory.tsx` | `app.py`, `supabase_schema.sql`, `frontend/lib/types.ts`, `frontend/app/(app)/dashboard/page.tsx`, `frontend/components/PeopleSidebar.tsx` |
| F2 Re-enrollment | `frontend/components/AddPhotosModal.tsx` | `app.py`, `face_engine.py`, `frontend/components/PeopleSidebar.tsx`, `frontend/lib/types.ts` |
| F3 Token Refresh | — | `frontend/lib/auth-context.tsx`, `app.py` |
| F4 Caregiver Alerts | `frontend/components/AlertBanner.tsx`, `frontend/app/(app)/settings/page.tsx` | `app.py`, `supabase_schema.sql`, `frontend/app/(app)/dashboard/page.tsx`, `frontend/app/(app)/layout.tsx` |
| F5 Accessibility | `frontend/lib/accessibility-context.tsx`, `frontend/components/AccessibilityPanel.tsx` | `frontend/app/layout.tsx`, `frontend/app/(app)/dashboard/page.tsx`, `frontend/components/CameraPanel.tsx`, `frontend/components/PeopleSidebar.tsx` |

---

## F1 — Recognition History / Visit Log

### Task F1-1: DB migration — recognition_events table

**Files:**
- Modify: `supabase_schema.sql`

- [ ] **Step 1: Add the SQL migration to supabase_schema.sql**

Append to the end of `supabase_schema.sql`:

```sql
-- -----------------------------------------------------------
-- 8.  recognition_events
--     One row per successful face recognition event.
--     Drives the visit-history timeline in the frontend.
-- -----------------------------------------------------------

create table if not exists public.recognition_events (
    id              uuid        primary key default gen_random_uuid(),
    user_id         uuid        not null
                                references public.profiles (id) on delete cascade,
    person_name     text        not null,
    confidence      float4      not null check (confidence >= 0 and confidence <= 1),
    recognized_at   timestamptz not null default now()
);

comment on table  public.recognition_events              is 'Audit log of every successful face recognition event.';
comment on column public.recognition_events.person_name is 'Lowercase name matching people.name at event time.';

create index if not exists recognition_events_user_time_idx
    on public.recognition_events (user_id, recognized_at desc);

alter table public.recognition_events enable row level security;

create policy "recognition_events: select own"
    on public.recognition_events for select
    using (user_id = auth.uid());

create policy "recognition_events: insert own"
    on public.recognition_events for insert
    with check (user_id = auth.uid());

create policy "recognition_events: delete own"
    on public.recognition_events for delete
    using (user_id = auth.uid());
```

- [ ] **Step 2: Run migration in Supabase SQL editor**

Copy the block above and run in Supabase Dashboard → SQL Editor. Verify no errors.

- [ ] **Step 3: Confirm table exists**

In Supabase Table Editor, confirm `recognition_events` table appears with columns `id`, `user_id`, `person_name`, `confidence`, `recognized_at`.

---

### Task F1-2: Backend — log events on recognition + GET /api/events

**Files:**
- Modify: `app.py` (after the recognize route, around line 510)

- [ ] **Step 1: Add event-logging helper in app.py**

Add this function after the `generate_suggestion` function (after line 372):

```python
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
```

- [ ] **Step 2: Call _log_recognition_event inside /api/recognize**

Find the return statement in the `recognized` branch of `/api/recognize` (around line 500). Before the `return jsonify(...)`, add:

```python
        # Log recognition event (throttled)
        _log_recognition_event(user_id, name_key, confidence)
```

The full block should look like:

```python
        recalled = mm.recall_person(name_key)
        mm.update_last_seen(name_key)

        # ... memory_payload building ...

        display_name = recalled.get("name", matched_name) if recalled else matched_name.title()
        suggestion = generate_suggestion(display_name, recalled)

        # Log recognition event (throttled)
        _log_recognition_event(user_id, name_key, confidence)

        logger.info("Fetched memory for '%s': %s", display_name, memory_payload)

        return jsonify({
            "status":     "recognized",
            "name":       display_name,
            "confidence": round(confidence, 4),
            "memory":     memory_payload,
            "suggestion": suggestion,
        })
```

- [ ] **Step 3: Add GET /api/events endpoint in app.py**

Add after the `/api/seed` route (after line ~818):

```python
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
```

- [ ] **Step 4: Restart Flask and verify**

Run: `python app.py`

Then in a terminal: `curl -s http://localhost:5000/api/health`
Expected: `{"status":"ok",...}`

---

### Task F1-3: Frontend types + VisitHistory component

**Files:**
- Modify: `frontend/lib/types.ts`
- Create: `frontend/components/VisitHistory.tsx`

- [ ] **Step 1: Add RecognitionEvent type to types.ts**

In [frontend/lib/types.ts](frontend/lib/types.ts), append:

```typescript
export interface RecognitionEvent {
  id: string;
  person_name: string;
  confidence: number;
  recognized_at: string;
}
```

- [ ] **Step 2: Create VisitHistory component**

Create [frontend/components/VisitHistory.tsx](frontend/components/VisitHistory.tsx):

```typescript
'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RecognitionEvent } from '@/lib/types';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';

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

function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 360;
}

interface VisitHistoryProps {
  refreshTrigger?: number;
}

export default function VisitHistory({ refreshTrigger = 0 }: VisitHistoryProps) {
  const { theme } = useTheme();
  const { token } = useAuth();
  const dark = theme === 'dark';

  const [events,  setEvents]  = useState<RecognitionEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/events?limit=30', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setEvents(d.events ?? []); })
      .catch(() => { if (!cancelled) setEvents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshTrigger, token]);

  const softColor = dark ? '#8A7D72' : '#9A8C84';
  const textMain  = dark ? '#F5EFE8' : '#3A2F28';

  return (
    <div className="flex flex-col h-full">
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div
            className="w-5 h-5 border-2 rounded-full animate-spin"
            style={{ borderColor: 'rgba(201,148,58,0.25)', borderTopColor: '#C9943A' }}
          />
        </div>
      )}

      {!loading && events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(201,148,58,0.08)', border: '1.5px dashed rgba(201,148,58,0.25)' }}
          >
            <svg className="w-6 h-6" style={{ color: 'rgba(201,148,58,0.40)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-dm-sans" style={{ color: softColor }}>
            No visits recorded yet
          </p>
        </div>
      )}

      {!loading && events.length > 0 && (
        <div
          className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(201,148,58,0.25) transparent' }}
        >
          {events.map((ev, i) => {
            const hue = nameHue(ev.person_name);
            return (
              <motion.div
                key={ev.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03, duration: 0.18 }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{
                  background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)',
                  border: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'}`,
                }}
              >
                {/* Color dot */}
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: `hsl(${hue},60%,55%)` }}
                />
                {/* Name */}
                <span
                  className="flex-1 text-sm font-semibold font-dm-sans capitalize truncate"
                  style={{ color: textMain }}
                >
                  {ev.person_name}
                </span>
                {/* Confidence */}
                <span
                  className="text-[11px] font-dm-sans shrink-0"
                  style={{ color: softColor }}
                >
                  {Math.round(ev.confidence * 100)}%
                </span>
                {/* Time */}
                <span
                  className="text-[11px] font-dm-sans shrink-0"
                  style={{ color: softColor }}
                >
                  {timeAgo(ev.recognized_at)}
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

---

### Task F1-4: Wire VisitHistory into PeopleSidebar as a tab

**Files:**
- Modify: `frontend/components/PeopleSidebar.tsx`

- [ ] **Step 1: Add tab state and import in PeopleSidebar.tsx**

At the top of [frontend/components/PeopleSidebar.tsx](frontend/components/PeopleSidebar.tsx), add import:

```typescript
import VisitHistory from '@/components/VisitHistory';
```

- [ ] **Step 2: Add tab state to PeopleSidebar function body**

Inside `export default function PeopleSidebar(...)`, add after the existing state declarations:

```typescript
const [activeTab, setActiveTab] = useState<'people' | 'history'>('people');
```

- [ ] **Step 3: Replace the sidebar header with a tab bar**

Replace the existing `{/* Header */}` div (the one containing "Known People" and the Add button) with:

```tsx
{/* Tab bar + header */}
<div className="flex flex-col shrink-0 px-3 pt-3 pb-0">
  {/* Tabs */}
  <div
    className="flex gap-1 p-1 rounded-xl mb-3"
    style={{ background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
  >
    {(['people', 'history'] as const).map((tab) => (
      <button
        key={tab}
        onClick={() => setActiveTab(tab)}
        className="flex-1 py-1.5 rounded-lg text-xs font-semibold font-dm-sans transition-all capitalize"
        style={{
          background: activeTab === tab
            ? dark ? 'rgba(201,148,58,0.18)' : 'white'
            : 'transparent',
          color: activeTab === tab ? '#C9943A' : dark ? '#8A7D72' : '#9A8C84',
          boxShadow: activeTab === tab
            ? dark ? 'none' : '0 1px 4px rgba(0,0,0,0.08)'
            : 'none',
        }}
      >
        {tab === 'people' ? 'People' : 'Visit Log'}
      </button>
    ))}
  </div>

  {/* People tab header row */}
  {activeTab === 'people' && (
    <div className="flex items-center justify-between px-1 mb-2">
      <span className="text-[11px] font-semibold uppercase tracking-widest font-dm-sans" style={{ color: dark ? '#8A7D72' : '#9A8C84' }}>
        {people.length} enrolled
      </span>
      <button
        onClick={onAddPerson}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold font-dm-sans transition-all"
        style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', color: 'white', boxShadow: '0 2px 10px rgba(201,148,58,0.30)' }}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 4: Render VisitHistory in the history tab**

In the `{/* List */}` section, wrap the existing people list and add a history tab branch:

```tsx
{/* Tab content */}
{activeTab === 'history' ? (
  <VisitHistory refreshTrigger={refreshTrigger} />
) : (
  <div
    className="flex-1 overflow-y-auto px-3 pb-3 space-y-2.5"
    style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(201,148,58,0.25) transparent' }}
  >
    {/* ...existing loading/empty/people.map() JSX unchanged... */}
  </div>
)}
```

- [ ] **Step 5: Test**

1. Start Flask: `python app.py`
2. Start Next.js: `cd frontend && npm run dev`
3. Log in, start camera, let it recognize someone
4. Click "Visit Log" tab in the sidebar
5. Verify recognized events appear within ~60 seconds of recognition

- [ ] **Step 6: Commit**

```bash
git add dementia-assist/supabase_schema.sql dementia-assist/app.py dementia-assist/frontend/lib/types.ts dementia-assist/frontend/components/VisitHistory.tsx dementia-assist/frontend/components/PeopleSidebar.tsx
git commit -m "feat: add recognition event history with visit log tab"
```

---

## F2 — Re-enrollment (Add More Photos to Existing Person)

### Task F2-1: Backend /api/add-photos endpoint

**Files:**
- Modify: `app.py`

- [ ] **Step 1: Add POST /api/add-photos in app.py**

Add after the `/api/update-person` route (after line ~750):

```python
@app.route("/api/add-photos", methods=["POST"])
@require_auth
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

        if name_key not in engine.database:
            return jsonify({
                "status":  "error",
                "message": f"'{name}' is not enrolled. Use Add Person to enroll them first.",
            }), 404

        existing_count = len(engine.database[name_key])

        # Reuse FaceEngine.add_person to generate + filter + save embeddings,
        # but call it with a lower MIN_EMBEDDINGS by temporarily patching.
        # Instead, generate embeddings directly to append.
        raw_embeddings = []
        skipped = 0
        from face_engine import _augment_frame

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
        if added > 0:
            engine.database[name_key].extend(kept_embeddings[:added + save_failures][:added])
            engine._rebuild_emb_cache()

        total = len(engine.database[name_key])
        logger.info(
            "add-photos: added %d embeddings for '%s' (was %d, now %d).",
            added, name_key, existing_count, total,
        )

        return jsonify({
            "status":           "success",
            "embeddings_added": added,
            "total_embeddings": total,
            "message":          f"Added {added} new photo(s) for {name.title()}. Total: {total} samples.",
        })

    except Exception:
        logger.error("Error in POST /api/add-photos:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Add photos failed unexpectedly"}), 500
```

- [ ] **Step 2: Verify endpoint manually**

```bash
curl -s -X POST http://localhost:5000/api/add-photos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name":"sayantan","images":[]}'
```
Expected: `{"message":"Please provide at least 3 photos (0 received).","status":"error"}`

---

### Task F2-2: Frontend AddPhotosModal component

**Files:**
- Create: `frontend/components/AddPhotosModal.tsx`

- [ ] **Step 1: Create AddPhotosModal.tsx**

Create [frontend/components/AddPhotosModal.tsx](frontend/components/AddPhotosModal.tsx):

```typescript
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';

interface AddPhotosModalProps {
  isOpen:    boolean;
  personName: string;
  onClose:   () => void;
  onSuccess: (added: number) => void;
}

const MIN_PHOTOS = 3;
const MAX_PHOTOS = 10;

export default function AddPhotosModal({ isOpen, personName, onClose, onSuccess }: AddPhotosModalProps) {
  const { theme } = useTheme();
  const { token } = useAuth();
  const dark = theme === 'dark';

  const videoRef  = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [photos,   setPhotos]   = useState<string[]>([]);
  const [camError, setCamError] = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);

  const startCamera = async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCamError('Camera access denied. Allow camera permissions and try again.');
    }
  };

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPhotos([]);
      setError(null);
      startCamera();
    } else {
      stopCamera();
      setPhotos([]);
    }
    return () => stopCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const capturePhoto = () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || photos.length >= MAX_PHOTOS) return;

    canvas.width  = Math.min(video.videoWidth  || 640, 640);
    canvas.height = Math.min(video.videoHeight || 480, 480);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const b64 = canvas.toDataURL('image/jpeg', 0.80).split(',')[1];
    setPhotos((prev) => [...prev, b64]);
  };

  const handleSubmit = async () => {
    if (photos.length < MIN_PHOTOS) {
      setError(`Capture at least ${MIN_PHOTOS} photos first.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/add-photos', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: personName, images: photos }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        onSuccess(data.embeddings_added as number);
        onClose();
      } else {
        setError(data.message ?? 'Failed to add photos.');
      }
    } catch {
      setError('Connection error — try again.');
    } finally {
      setSaving(false);
    }
  };

  const cardBg  = dark ? '#1C1710' : '#FDFAF5';
  const textMain = dark ? '#F5EFE8' : '#3A2F28';
  const textSoft = dark ? '#8A7D72' : '#9A8C84';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(8px)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-md rounded-3xl flex flex-col overflow-hidden"
            style={{ background: cardBg, boxShadow: '0 24px 80px rgba(0,0,0,0.45)', maxHeight: '90vh' }}
            initial={{ scale: 0.92, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 16 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <div>
                <h2 className="text-lg font-serif font-bold" style={{ color: textMain }}>
                  Add More Photos
                </h2>
                <p className="text-sm font-dm-sans capitalize" style={{ color: textSoft }}>
                  for {personName}
                </p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)', color: textSoft }}
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Camera */}
            <div className="relative mx-4 rounded-2xl overflow-hidden bg-black" style={{ height: 240 }}>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay muted playsInline
                style={{ display: cameraOn ? 'block' : 'none' }}
              />
              <canvas ref={canvasRef} className="hidden" aria-hidden />
              {!cameraOn && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="text-sm font-dm-sans" style={{ color: 'rgba(255,255,255,0.40)' }}>
                    {camError ?? 'Starting camera…'}
                  </p>
                </div>
              )}
              {/* Photo count badge */}
              <div
                className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full text-xs font-semibold font-dm-sans"
                style={{ background: 'rgba(0,0,0,0.60)', color: photos.length >= MIN_PHOTOS ? '#86efac' : '#F0C97A' }}
              >
                {photos.length}/{MAX_PHOTOS}
              </div>
            </div>

            {/* Progress dots */}
            <div className="flex gap-1.5 justify-center py-3">
              {Array.from({ length: MAX_PHOTOS }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-200"
                  style={{
                    width:      i < photos.length ? 10 : 6,
                    height:     i < photos.length ? 10 : 6,
                    background: i < photos.length
                      ? (i < MIN_PHOTOS ? '#C9943A' : '#86efac')
                      : dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
                  }}
                />
              ))}
            </div>

            {/* Hint */}
            <p className="text-center text-xs font-dm-sans px-6" style={{ color: textSoft }}>
              {photos.length < MIN_PHOTOS
                ? `Capture ${MIN_PHOTOS - photos.length} more photo${MIN_PHOTOS - photos.length > 1 ? 's' : ''} — look at the camera`
                : photos.length < MAX_PHOTOS
                  ? `${MAX_PHOTOS - photos.length} more optional — different angles improve accuracy`
                  : 'Maximum photos captured'}
            </p>

            {/* Error */}
            {error && (
              <p className="text-center text-xs text-red-400 font-dm-sans px-6 pt-2">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 px-6 py-5">
              <button
                onClick={capturePhoto}
                disabled={!cameraOn || photos.length >= MAX_PHOTOS}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold font-dm-sans transition-all disabled:opacity-40"
                style={{
                  background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  color: textMain,
                  border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'}`,
                }}
              >
                Capture
              </button>
              <button
                onClick={handleSubmit}
                disabled={photos.length < MIN_PHOTOS || saving}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold font-dm-sans transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg,#C9943A,#F0C97A)',
                  color: 'white',
                  boxShadow: '0 4px 16px rgba(201,148,58,0.35)',
                }}
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : 'Save Photos'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

---

### Task F2-3: Wire AddPhotosModal into PeopleSidebar

**Files:**
- Modify: `frontend/components/PeopleSidebar.tsx`

- [ ] **Step 1: Import AddPhotosModal in PeopleSidebar.tsx**

Add to imports:

```typescript
import AddPhotosModal from '@/components/AddPhotosModal';
```

- [ ] **Step 2: Add modal state to PersonCard**

Inside `PersonCard` component, add state after existing state declarations:

```typescript
const [addPhotosOpen, setAddPhotosOpen] = useState(false);
```

- [ ] **Step 3: Add "Add Photos" button to PersonCard row**

In the PersonCard person row, after the existing edit toggle button and before the delete button, add:

```tsx
{/* Add photos button */}
<button
  onClick={() => setAddPhotosOpen(true)}
  className="w-7 h-7 rounded-xl flex items-center justify-center transition-all shrink-0"
  style={{
    background: dark ? 'rgba(201,148,58,0.08)' : 'rgba(201,148,58,0.08)',
    border: '1px solid rgba(201,148,58,0.20)',
    color: 'rgba(201,148,58,0.70)',
  }}
  aria-label="Add more photos"
  title="Add more photos to improve recognition"
>
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
</button>
```

- [ ] **Step 4: Render AddPhotosModal inside PersonCard return**

At the bottom of PersonCard's return (before the closing `</div>`), add:

```tsx
<AddPhotosModal
  isOpen={addPhotosOpen}
  personName={person.name}
  onClose={() => setAddPhotosOpen(false)}
  onSuccess={(added) => {
    setAddPhotosOpen(false);
    onUpdated();
  }}
/>
```

- [ ] **Step 5: Test**

1. Open PeopleSidebar — each person card now has a camera icon button
2. Click it — modal opens with live camera
3. Capture 3+ photos, click "Save Photos"
4. Verify success toast and modal closes

- [ ] **Step 6: Commit**

```bash
git add dementia-assist/app.py dementia-assist/frontend/components/AddPhotosModal.tsx dementia-assist/frontend/components/PeopleSidebar.tsx
git commit -m "feat: add re-enrollment (add more photos) for existing persons"
```

---

## F3 — JWT Token Refresh

### Task F3-1: Backend /api/auth/refresh endpoint

**Files:**
- Modify: `app.py`

- [ ] **Step 1: Add POST /api/auth/refresh in app.py**

Add after the `/api/auth/login` route (after line ~1048):

```python
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
```

---

### Task F3-2: Frontend — store refresh token and auto-refresh

**Files:**
- Modify: `frontend/lib/auth-context.tsx`

- [ ] **Step 1: Add REFRESH_KEY and update storage helpers**

In [frontend/lib/auth-context.tsx](frontend/lib/auth-context.tsx), find the storage constants block and update:

```typescript
const TOKEN_KEY   = 'rp_access_token';
const REFRESH_KEY = 'rp_refresh_token';
const USER_KEY    = 'rp_user';
const EXPIRY_KEY  = 'rp_token_expiry';  // unix seconds

function loadStored(): { token: string | null; refreshToken: string | null; user: AuthUser | null; expiry: number | null } {
  if (typeof window === 'undefined') return { token: null, refreshToken: null, user: null, expiry: null };
  try {
    const token        = localStorage.getItem(TOKEN_KEY);
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    const raw          = localStorage.getItem(USER_KEY);
    const expiryRaw    = localStorage.getItem(EXPIRY_KEY);
    const user         = raw ? (JSON.parse(raw) as AuthUser) : null;
    const expiry       = expiryRaw ? parseInt(expiryRaw, 10) : null;
    return { token, refreshToken, user, expiry };
  } catch {
    return { token: null, refreshToken: null, user: null, expiry: null };
  }
}

function persist(token: string, refreshToken: string, user: AuthUser, expiresIn: number) {
  const expiry = Math.floor(Date.now() / 1000) + expiresIn;
  localStorage.setItem(TOKEN_KEY,   token);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY,    JSON.stringify(user));
  localStorage.setItem(EXPIRY_KEY,  String(expiry));
}

function clear() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}
```

- [ ] **Step 2: Update AuthContextValue interface**

```typescript
interface AuthContextValue {
  user:    AuthUser | null;
  token:   string   | null;
  loading: boolean;
  login:   (email: string, password: string) => Promise<void>;
  signup:  (email: string, password: string) => Promise<void>;
  logout:  () => void;
  refreshToken: () => Promise<boolean>;
}
```

- [ ] **Step 3: Update state and rehydration in AuthProvider**

Replace the `useState` declarations and `useEffect` rehydration block:

```typescript
const [user,         setUser]         = useState<AuthUser | null>(null);
const [token,        setToken]        = useState<string   | null>(null);
const [refreshTok,   setRefreshTok]   = useState<string   | null>(null);
const [tokenExpiry,  setTokenExpiry]  = useState<number   | null>(null);
const [loading,      setLoading]      = useState(true);

// Rehydrate from localStorage on mount
useEffect(() => {
  const stored = loadStored();
  if (stored.token && stored.user) {
    setToken(stored.token);
    setUser(stored.user);
    setRefreshTok(stored.refreshToken);
    setTokenExpiry(stored.expiry);
  }
  setLoading(false);
}, []);
```

- [ ] **Step 4: Add refreshToken function**

Add inside `AuthProvider`, after the `logout` callback:

```typescript
const refreshToken = useCallback(async (): Promise<boolean> => {
  const storedRefresh = localStorage.getItem('rp_refresh_token');
  if (!storedRefresh) return false;
  try {
    const res  = await fetch('/api/auth/refresh', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: storedRefresh }),
    });
    const data = await res.json();
    if (!res.ok || data.status !== 'success') return false;
    const currentUser = user;
    if (!currentUser) return false;
    persist(data.access_token, data.refresh_token, currentUser, data.expires_in);
    setToken(data.access_token);
    setRefreshTok(data.refresh_token);
    setTokenExpiry(Math.floor(Date.now() / 1000) + data.expires_in);
    return true;
  } catch {
    return false;
  }
}, [user]);
```

- [ ] **Step 5: Add proactive refresh — 5 minutes before expiry**

Add this `useEffect` inside `AuthProvider` after the refreshToken declaration:

```typescript
// Proactive refresh: fire 5 minutes before the token expires.
useEffect(() => {
  if (!tokenExpiry || !refreshTok) return;
  const msUntilRefresh = (tokenExpiry - 300) * 1000 - Date.now(); // 5 min early
  if (msUntilRefresh <= 0) {
    void refreshToken();
    return;
  }
  const timer = setTimeout(() => { void refreshToken(); }, msUntilRefresh);
  return () => clearTimeout(timer);
}, [tokenExpiry, refreshTok, refreshToken]);
```

- [ ] **Step 6: Update login and signup to persist refresh token**

Update the `persist(...)` call in `login`:

```typescript
persist(data.access_token, data.refresh_token ?? '', authUser, data.expires_in ?? 3600);
setToken(data.access_token);
setUser(authUser);
setRefreshTok(data.refresh_token ?? null);
setTokenExpiry(Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600));
```

Same in `signup` (for the `if (data.access_token)` branch):

```typescript
persist(data.access_token, data.refresh_token ?? '', authUser, data.expires_in ?? 3600);
setToken(data.access_token);
setUser(authUser);
setRefreshTok(data.refresh_token ?? null);
setTokenExpiry(Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600));
```

- [ ] **Step 7: Update AuthContext.Provider value**

```typescript
<AuthContext.Provider value={{ user, token, loading, login, signup, logout, refreshToken }}>
```

- [ ] **Step 8: Test**

1. Log in, open DevTools → Application → Local Storage
2. Verify `rp_refresh_token` and `rp_token_expiry` are stored
3. Manually set `rp_token_expiry` to a past timestamp, reload page
4. Watch Network tab — should see `POST /api/auth/refresh` fire on mount

- [ ] **Step 9: Commit**

```bash
git add dementia-assist/app.py dementia-assist/frontend/lib/auth-context.tsx
git commit -m "feat: JWT token refresh — proactive refresh 5 min before expiry"
```

---

## F4 — Caregiver Absence Alerts

### Task F4-1: DB migration — alert_days on profiles

**Files:**
- Modify: `supabase_schema.sql`

- [ ] **Step 1: Add alert_days column migration**

Append to `supabase_schema.sql`:

```sql
-- -----------------------------------------------------------
-- 9.  Alert settings — absence threshold per user
-- -----------------------------------------------------------

alter table public.profiles
    add column if not exists alert_days integer not null default 3
        check (alert_days >= 1 and alert_days <= 90);

comment on column public.profiles.alert_days is
    'Days of absence before a caregiver alert is triggered for a person.';
```

- [ ] **Step 2: Run in Supabase SQL editor**

Run the ALTER TABLE above. Verify `profiles` table now has `alert_days` column with default 3.

---

### Task F4-2: Backend alert endpoints

**Files:**
- Modify: `app.py`

- [ ] **Step 1: Add GET + POST /api/alerts/settings**

Add after the `/api/events` route:

```python
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
```

---

### Task F4-3: Frontend AlertBanner component

**Files:**
- Create: `frontend/components/AlertBanner.tsx`

- [ ] **Step 1: Create AlertBanner.tsx**

Create [frontend/components/AlertBanner.tsx](frontend/components/AlertBanner.tsx):

```typescript
'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

interface OverduePerson {
  name:       string;
  relation:   string;
  days_since: number | null;
}

export default function AlertBanner() {
  const { token } = useAuth();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [overdue,  setOverdue]  = useState<OverduePerson[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch('/api/alerts/check', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d.overdue) setOverdue(d.overdue);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  if (dismissed || overdue.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="overflow-hidden"
      >
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{
            background: dark ? 'rgba(246,173,85,0.10)' : 'rgba(246,173,85,0.15)',
            borderBottom: '1px solid rgba(246,173,85,0.30)',
          }}
        >
          <svg className="w-4 h-4 shrink-0" style={{ color: '#f6ad55' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="flex-1 text-xs font-dm-sans" style={{ color: dark ? '#fbd38d' : '#92400e' }}>
            <span className="font-semibold">Reminder: </span>
            {overdue.length === 1
              ? `${overdue[0].name.charAt(0).toUpperCase() + overdue[0].name.slice(1)} (${overdue[0].relation || 'person'}) hasn't been seen${overdue[0].days_since != null ? ` in ${overdue[0].days_since} day${overdue[0].days_since !== 1 ? 's' : ''}` : ' yet'}.`
              : `${overdue.length} people haven't been seen recently: ${overdue.map((p) => p.name).join(', ')}.`
            }
          </p>
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 text-xs font-dm-sans font-medium"
            style={{ color: dark ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.35)' }}
            aria-label="Dismiss alert"
          >
            Dismiss
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Mount AlertBanner in dashboard page**

In [frontend/app/(app)/dashboard/page.tsx](frontend/app/(app)/dashboard/page.tsx), add import:

```typescript
import AlertBanner from '@/components/AlertBanner';
```

In the JSX, add `<AlertBanner />` immediately after the opening `<div className="min-h-screen...">` and before `{/* ── Header */}`:

```tsx
<div className="min-h-screen flex flex-col" style={{ minHeight: '100vh' }}>
  <AlertBanner />
  {/* ── Header ... */}
```

---

### Task F4-4: Settings page for alert threshold

**Files:**
- Create: `frontend/app/(app)/settings/page.tsx`

- [ ] **Step 1: Create settings page**

Create [frontend/app/(app)/settings/page.tsx](frontend/app/(app)/settings/page.tsx):

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';

export default function SettingsPage() {
  const { token } = useAuth();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [alertDays, setAlertDays] = useState(3);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/alerts/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.alert_days) setAlertDays(d.alert_days); })
      .catch(() => {});
  }, [token]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/alerts/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ alert_days: alertDays }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(data.message ?? 'Save failed');
      }
    } catch {
      setError('Connection error');
    } finally {
      setSaving(false);
    }
  };

  const textMain = dark ? '#F5EFE8' : '#3A2F28';
  const textSoft = dark ? '#8A7D72' : '#9A8C84';
  const cardBg   = dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)';

  return (
    <div className="min-h-screen p-6 max-w-lg mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard" className="text-sm font-dm-sans" style={{ color: textSoft }}>
          ← Dashboard
        </Link>
        <h1 className="text-xl font-serif font-bold" style={{ color: textMain }}>Settings</h1>
      </div>

      <div
        className="rounded-2xl p-5"
        style={{ background: cardBg, border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}` }}
      >
        <h2 className="text-sm font-semibold font-dm-sans mb-1" style={{ color: textMain }}>
          Absence Alert Threshold
        </h2>
        <p className="text-xs font-dm-sans mb-4" style={{ color: textSoft }}>
          Show a reminder banner when a person hasn't been seen for this many days.
        </p>

        <div className="flex items-center gap-4">
          <input
            type="range" min={1} max={30} value={alertDays}
            onChange={(e) => setAlertDays(parseInt(e.target.value, 10))}
            className="flex-1"
            aria-label="Alert threshold in days"
          />
          <span className="text-sm font-bold font-dm-sans w-16 text-right" style={{ color: '#C9943A' }}>
            {alertDays} {alertDays === 1 ? 'day' : 'days'}
          </span>
        </div>

        {error && <p className="text-xs text-red-400 font-dm-sans mt-3">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold font-dm-sans transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#C9943A,#F0C97A)', color: 'white' }}
        >
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Settings link in dashboard header**

In [frontend/app/(app)/dashboard/page.tsx](frontend/app/(app)/dashboard/page.tsx), inside the header's right controls `<div>`, add a Settings link before the Sign out button:

```tsx
{/* Settings link */}
<Link
  href="/settings"
  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0"
  style={{
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
    color: textSoft,
  }}
  aria-label="Settings"
>
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
    <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
  </svg>
</Link>
```

- [ ] **Step 3: Test**

1. Go to `/settings`, change threshold, save
2. Curl `GET /api/alerts/check` — verify overdue list returns
3. Return to dashboard — AlertBanner appears if any person > threshold days

- [ ] **Step 4: Commit**

```bash
git add dementia-assist/supabase_schema.sql dementia-assist/app.py dementia-assist/frontend/components/AlertBanner.tsx dementia-assist/frontend/app/\(app\)/settings/page.tsx dementia-assist/frontend/app/\(app\)/dashboard/page.tsx
git commit -m "feat: caregiver absence alerts with configurable threshold"
```

---

## F5 — Accessibility / Large-Text Mode

### Task F5-1: Accessibility context

**Files:**
- Create: `frontend/lib/accessibility-context.tsx`

- [ ] **Step 1: Create accessibility-context.tsx**

Create [frontend/lib/accessibility-context.tsx](frontend/lib/accessibility-context.tsx):

```typescript
'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type FontSize = 'normal' | 'large' | 'xl';

interface AccessibilityContextValue {
  fontSize:       FontSize;
  highContrast:   boolean;
  setFontSize:    (s: FontSize) => void;
  toggleContrast: () => void;
}

const A11Y_FONT_KEY     = 'rp_font_size';
const A11Y_CONTRAST_KEY = 'rp_high_contrast';

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [fontSize,     setFontSizeState]     = useState<FontSize>('normal');
  const [highContrast, setHighContrastState] = useState(false);

  useEffect(() => {
    const savedFont     = localStorage.getItem(A11Y_FONT_KEY) as FontSize | null;
    const savedContrast = localStorage.getItem(A11Y_CONTRAST_KEY);
    if (savedFont)     setFontSizeState(savedFont);
    if (savedContrast) setHighContrastState(savedContrast === 'true');
  }, []);

  // Apply CSS variables to <html> so all rem-based sizes scale automatically
  useEffect(() => {
    const scales: Record<FontSize, string> = { normal: '16px', large: '19px', xl: '22px' };
    document.documentElement.style.setProperty('font-size', scales[fontSize]);
    localStorage.setItem(A11Y_FONT_KEY, fontSize);
  }, [fontSize]);

  useEffect(() => {
    if (highContrast) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }
    localStorage.setItem(A11Y_CONTRAST_KEY, String(highContrast));
  }, [highContrast]);

  const setFontSize    = useCallback((s: FontSize) => setFontSizeState(s), []);
  const toggleContrast = useCallback(() => setHighContrastState((c) => !c), []);

  return (
    <AccessibilityContext.Provider value={{ fontSize, highContrast, setFontSize, toggleContrast }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityContextValue {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility must be used inside <AccessibilityProvider>.');
  return ctx;
}
```

---

### Task F5-2: Mount AccessibilityProvider + high-contrast CSS

**Files:**
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Wrap app with AccessibilityProvider in layout.tsx**

In [frontend/app/layout.tsx](frontend/app/layout.tsx), import and wrap:

```typescript
import { AccessibilityProvider } from '@/lib/accessibility-context';

// Inside the return, wrap existing providers:
<AccessibilityProvider>
  {/* ...existing ThemeProvider / AuthProvider wrapping... */}
</AccessibilityProvider>
```

- [ ] **Step 2: Add high-contrast CSS overrides in globals.css**

Append to [frontend/app/globals.css](frontend/app/globals.css):

```css
/* ── High-contrast mode ─────────────────────────────────── */
html.high-contrast {
  --hc-bg:     #000000;
  --hc-text:   #ffffff;
  --hc-accent: #ffdd00;
  --hc-border: #ffffff;
}

html.high-contrast body {
  background: var(--hc-bg) !important;
  color:      var(--hc-text) !important;
}

html.high-contrast button,
html.high-contrast a {
  outline: 2px solid var(--hc-accent) !important;
  outline-offset: 2px;
}

html.high-contrast input,
html.high-contrast textarea,
html.high-contrast select {
  background: #111 !important;
  color:      var(--hc-text) !important;
  border:     2px solid var(--hc-border) !important;
}
```

---

### Task F5-3: AccessibilityPanel component

**Files:**
- Create: `frontend/components/AccessibilityPanel.tsx`

- [ ] **Step 1: Create AccessibilityPanel.tsx**

Create [frontend/components/AccessibilityPanel.tsx](frontend/components/AccessibilityPanel.tsx):

```typescript
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccessibility, FontSize } from '@/lib/accessibility-context';
import { useTheme } from '@/lib/theme-context';

export default function AccessibilityPanel() {
  const { fontSize, highContrast, setFontSize, toggleContrast } = useAccessibility();
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const [open, setOpen] = useState(false);

  const textMain = dark ? '#F5EFE8' : '#3A2F28';
  const textSoft = dark ? '#8A7D72' : '#9A8C84';
  const panelBg  = dark ? '#1C1710' : '#FDFAF5';

  const fontSizes: { value: FontSize; label: string }[] = [
    { value: 'normal', label: 'A'  },
    { value: 'large',  label: 'A+' },
    { value: 'xl',     label: 'A++'},
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
        style={{
          background: open
            ? 'rgba(201,148,58,0.15)'
            : dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
          border: `1px solid ${open ? 'rgba(201,148,58,0.35)' : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          color: open ? '#C9943A' : textSoft,
        }}
        aria-label="Accessibility options"
        aria-expanded={open}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -8 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.94,  y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-10 z-50 rounded-2xl p-4 w-64"
            style={{
              background:   panelBg,
              border:       `1px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}`,
              boxShadow:    '0 12px 40px rgba(0,0,0,0.25)',
            }}
          >
            <p className="text-xs font-semibold font-dm-sans uppercase tracking-widest mb-3" style={{ color: textSoft }}>
              Accessibility
            </p>

            {/* Font size */}
            <p className="text-xs font-dm-sans mb-2" style={{ color: textSoft }}>Text Size</p>
            <div className="flex gap-2 mb-4">
              {fontSizes.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFontSize(value)}
                  className="flex-1 py-2 rounded-xl text-sm font-bold font-dm-sans transition-all"
                  style={{
                    background: fontSize === value
                      ? 'linear-gradient(135deg,#C9943A,#F0C97A)'
                      : dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                    color: fontSize === value ? 'white' : textMain,
                  }}
                  aria-pressed={fontSize === value}
                  aria-label={`Set text size to ${value}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* High contrast */}
            <button
              onClick={toggleContrast}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: highContrast
                  ? 'rgba(201,148,58,0.15)'
                  : dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                border: `1px solid ${highContrast ? 'rgba(201,148,58,0.35)' : dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              }}
              aria-pressed={highContrast}
            >
              <span className="text-xs font-dm-sans" style={{ color: textMain }}>High Contrast</span>
              <div
                className="w-8 h-4 rounded-full transition-all relative"
                style={{ background: highContrast ? '#C9943A' : dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }}
              >
                <span
                  className="absolute top-0.5 rounded-full bg-white transition-all"
                  style={{ width: 12, height: 12, left: highContrast ? 14 : 2 }}
                />
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

---

### Task F5-4: Add aria-labels to CameraPanel and wire AccessibilityPanel into header

**Files:**
- Modify: `frontend/app/(app)/dashboard/page.tsx`
- Modify: `frontend/components/CameraPanel.tsx`

- [ ] **Step 1: Import and mount AccessibilityPanel in dashboard**

In [frontend/app/(app)/dashboard/page.tsx](frontend/app/(app)/dashboard/page.tsx):

```typescript
import AccessibilityPanel from '@/components/AccessibilityPanel';
```

In the header right controls, add before the dark mode toggle:

```tsx
{/* Accessibility */}
<AccessibilityPanel />
```

- [ ] **Step 2: Add aria-labels to CameraPanel interactive elements**

In [frontend/components/CameraPanel.tsx](frontend/components/CameraPanel.tsx), find the start/stop button and ensure it has a clear `aria-label` (it already has one — verify it reads `isActive ? 'Stop camera' : 'Start camera'`):

```tsx
<button
  onClick={isActive ? stopCamera : startCamera}
  aria-label={isActive ? 'Stop camera' : 'Start camera'}
  // ...rest unchanged
>
```

Add `role="status"` and `aria-live="polite"` to the recognition result area. Find the controls bar `<div>` and add `aria-live="polite"` to the status span:

```tsx
<span
  role="status"
  aria-live="polite"
  className="text-[11px] font-dm-sans"
  style={{ color: softColor }}
>
  {isActive ? 'Scanning every 0.7s' : 'Press Start Camera to begin'}
</span>
```

- [ ] **Step 3: Test accessibility**

1. Click the eye icon in the header — panel opens
2. Switch to "A+" — verify text grows across the whole UI
3. Enable High Contrast — verify black background + yellow accents
4. Use keyboard Tab to navigate the panel — all buttons focusable
5. Verify `aria-label` on camera start/stop button via browser DevTools → Accessibility tree

- [ ] **Step 4: Commit**

```bash
git add dementia-assist/frontend/lib/accessibility-context.tsx dementia-assist/frontend/components/AccessibilityPanel.tsx dementia-assist/frontend/app/layout.tsx dementia-assist/frontend/app/globals.css dementia-assist/frontend/app/\(app\)/dashboard/page.tsx dementia-assist/frontend/components/CameraPanel.tsx
git commit -m "feat: accessibility mode — font size scaling and high-contrast toggle"
```

---

## Self-Review Checklist

| Requirement | Covered by |
|-------------|-----------|
| Recognition history logged per event | F1-2 `_log_recognition_event` + `recognition_events` table |
| Visit log visible in UI | F1-3 `VisitHistory` + F1-4 tab in `PeopleSidebar` |
| Re-enrollment API | F2-1 `POST /api/add-photos` |
| Re-enrollment UI | F2-2 `AddPhotosModal` + F2-3 camera button in `PersonCard` |
| Token auto-refresh | F3-1 backend endpoint + F3-2 proactive frontend refresh |
| Refresh token persisted | F3-2 `persist()` updated with `REFRESH_KEY` |
| Alert threshold stored per user | F4-1 `alert_days` on profiles |
| Alert check API | F4-2 `GET /api/alerts/check` |
| Alert banner in dashboard | F4-3 `AlertBanner` |
| Alert settings page | F4-4 `/settings` page |
| Font size scaling | F5-1 `AccessibilityProvider` + CSS font-size on `<html>` |
| High contrast mode | F5-1 + F5-2 CSS overrides |
| Accessibility panel UI | F5-3 `AccessibilityPanel` |
| aria-labels on camera | F5-4 |
| Debug endpoint still exposed | **NOT fixed here — remove `/api/debug-face` separately** |
