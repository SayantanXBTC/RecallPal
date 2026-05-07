# Conversation Starter Engine + Daily Visitor Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two features to RecallPal — (1) show contextual conversation prompts below the camera when a face is recognised, and (2) a `/summary` page showing a daily visitor report aggregated from `recognition_events`.

**Architecture:** Feature 1 is purely frontend — a pure TypeScript generator function derives 2-3 prompts from the already-returned `RecognitionMemory` data and renders them in a new `ConversationStarters` component below the camera. Feature 2 adds one new Flask route (`GET /api/summary/daily`) that aggregates `recognition_events` from Supabase, a Next.js proxy route, new TypeScript types, and a full `/summary` page with a date picker and per-visitor cards.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Framer Motion, Tailwind CSS, Flask (Python), Supabase (PostgreSQL via supabase-py)

---

## File Structure

**Create:**
- `frontend/lib/conversation-starters.ts` — pure function: `generateStarters(face: FaceResult): string[]`
- `frontend/components/ConversationStarters.tsx` — renders prompt chips for the active recognised face
- `frontend/app/api/summary/route.ts` — Next.js proxy GET → Flask `/api/summary/daily`
- `frontend/app/(app)/summary/page.tsx` — daily visitor summary page with date picker

**Modify:**
- `frontend/lib/types.ts` — add `VisitorSummaryEntry`, `DailySummary` interfaces
- `frontend/app/(app)/dashboard/page.tsx` — mount `<ConversationStarters>` below camera; add summary nav link in header
- `dementia-assist/app.py` — add `GET /api/summary/daily` route

---

## Task 1: Conversation starter generator (pure function)

**Files:**
- Create: `frontend/lib/conversation-starters.ts`

- [ ] **Step 1: Create the file with full implementation**

```typescript
// frontend/lib/conversation-starters.ts
import { FaceResult } from './types';

const RELATION_PROMPTS: Record<string, string[]> = {
  son:           ['How is school or work going?', 'Have you been staying healthy?'],
  daughter:      ['How is school or work going?', 'Have you been keeping well?'],
  husband:       ['How has your day been?', 'Shall we have some tea together?'],
  wife:          ['How has your day been?', 'Shall we have some tea together?'],
  partner:       ['How has your day been?', 'What shall we do today?'],
  father:        ['How are you feeling today?', 'Do you need anything from me?'],
  mother:        ['How are you feeling today?', 'Did you eat well today?'],
  brother:       ['What have you been up to lately?', 'How is everything going?'],
  sister:        ['What have you been up to lately?', 'How is everything going?'],
  grandfather:   ['How is your health today?', 'Tell me about your day.'],
  grandmother:   ['How is your health today?', 'Did you sleep well?'],
  grandson:      ['How is school?', 'What games have you been playing?'],
  granddaughter: ['How is school?', 'What have you been doing lately?'],
  friend:        ['How have you been?', "How's life treating you?"],
  neighbour:     ['How is everything in the neighbourhood?', 'Have things been quiet lately?'],
  caregiver:     ['How am I doing today?', 'Is there anything I should know?'],
  doctor:        ['Any updates on my health?', 'Should I be doing anything differently?'],
  nurse:         ['How am I doing today?', 'Any important reminders for me?'],
};

export function generateStarters(face: FaceResult): string[] {
  const starters: string[] = [];
  const mem  = face.memory;
  const name = face.name
    ? face.name.charAt(0).toUpperCase() + face.name.slice(1)
    : 'them';

  if (!mem) return [`Say hello to ${name}!`];

  // 1. From likes — pick one random interest
  if (mem.likes && mem.likes.length > 0) {
    const pick = mem.likes[Math.floor(Math.random() * mem.likes.length)];
    starters.push(`Ask about ${pick}`);
  }

  // 2. From relation — lookup contextual prompt
  const rel       = (mem.relation ?? '').toLowerCase().trim();
  const relPool   = RELATION_PROMPTS[rel];
  if (relPool && relPool.length > 0) {
    const pick = relPool[Math.floor(Math.random() * relPool.length)];
    if (!starters.includes(pick)) starters.push(pick);
  }

  // 3. From last_seen — time-aware context
  if (mem.last_seen) {
    try {
      const diffDays = Math.floor((Date.now() - new Date(mem.last_seen).getTime()) / 86_400_000);
      if (diffDays > 30) {
        starters.push(`It has been over a month since you last met!`);
      } else if (diffDays > 7) {
        starters.push(`It has been ${diffDays} days — catch up on what you missed!`);
      } else if (diffDays === 0 && starters.length < 3) {
        starters.push(`You saw ${name} earlier today.`);
      }
    } catch { /* ignore invalid date string */ }
  }

  // 4. From notes — surface first sentence if still need a starter
  if (starters.length < 3 && mem.notes && mem.notes.trim().length > 10) {
    const snippet = mem.notes.trim().split('.')[0].trim();
    if (snippet.length > 0 && snippet.length < 80) {
      starters.push(`Remember: "${snippet}"`);
    }
  }

  return starters.slice(0, 3);
}
```

- [ ] **Step 2: Verify the file compiles (no TypeScript errors)**

Run from `frontend/`:
```bash
npx tsc --noEmit
```
Expected: no errors relating to `conversation-starters.ts`

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/conversation-starters.ts
git commit -m "feat: add generateStarters pure function for conversation prompts"
```

---

## Task 2: ConversationStarters component

**Files:**
- Create: `frontend/components/ConversationStarters.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/components/ConversationStarters.tsx
'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaceResult } from '@/lib/types';
import { generateStarters } from '@/lib/conversation-starters';
import { useTheme } from '@/lib/theme-context';

interface ConversationStartersProps {
  faces: FaceResult[];
}

const ICONS = ['💬', '💡', '📌'];

export default function ConversationStarters({ faces }: ConversationStartersProps) {
  const { theme } = useTheme();
  const dark = theme === 'dark';

  const face = faces.find(f => f.status === 'recognised' && f.name)
    ?? faces.find(f => f.status === 'recognized' && f.name)
    ?? null;

  const starters = useMemo(() => (face ? generateStarters(face) : []), [face]);

  const name = face?.name
    ? face.name.charAt(0).toUpperCase() + face.name.slice(1)
    : null;

  return (
    <AnimatePresence>
      {face && starters.length > 0 && (
        <motion.div
          key={`starters-${face.name}`}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          className="mt-3 rounded-2xl px-4 py-3"
          style={{
            background:     dark ? 'rgba(18,14,9,0.72)' : 'rgba(255,255,255,0.82)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${dark ? 'rgba(201,148,58,0.22)' : 'rgba(201,148,58,0.28)'}`,
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-2.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: '#C9943A' }}
            />
            <span
              className="text-xs font-semibold uppercase tracking-widest font-dm-sans"
              style={{ color: dark ? '#8A7D72' : '#9A8C84' }}
            >
              Conversation with {name}
            </span>
          </div>

          {/* Prompt chips */}
          <div className="flex flex-wrap gap-2">
            {starters.map((starter, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 px-3 py-2 rounded-xl text-sm font-dm-sans leading-snug"
                style={{
                  background: dark ? 'rgba(201,148,58,0.10)' : 'rgba(201,148,58,0.07)',
                  border:     `1px solid ${dark ? 'rgba(201,148,58,0.22)' : 'rgba(201,148,58,0.20)'}`,
                  color:      dark ? '#F5EFE8' : '#3A2F28',
                  maxWidth:   280,
                }}
              >
                <span style={{ fontSize: 13, lineHeight: 1.5, flexShrink: 0 }}>
                  {ICONS[i]}
                </span>
                <span>{starter}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ConversationStarters.tsx
git commit -m "feat: ConversationStarters component renders prompt chips below camera"
```

---

## Task 3: Wire ConversationStarters into dashboard

**Files:**
- Modify: `frontend/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Add import at top of dashboard/page.tsx**

Current imports block (around line 1–14):
```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import CameraPanel    from '@/components/CameraPanel';
import AddPersonModal from '@/components/AddPersonModal';
import PeopleSidebar  from '@/components/PeopleSidebar';
import { MultiRecognitionResult } from '@/lib/types';
import { useTheme } from '@/lib/theme-context';
import AlertBanner from '@/components/AlertBanner';
import AccessibilityPanel from '@/components/AccessibilityPanel';
```

Add `ConversationStarters` import:
```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import CameraPanel           from '@/components/CameraPanel';
import AddPersonModal        from '@/components/AddPersonModal';
import PeopleSidebar         from '@/components/PeopleSidebar';
import ConversationStarters  from '@/components/ConversationStarters';
import { MultiRecognitionResult } from '@/lib/types';
import { useTheme } from '@/lib/theme-context';
import AlertBanner from '@/components/AlertBanner';
import AccessibilityPanel from '@/components/AccessibilityPanel';
```

- [ ] **Step 2: Mount ConversationStarters below the CameraPanel in JSX**

Find this block in the JSX (around line 209–215):
```tsx
          <div className="flex-1" style={{ minHeight: 420 }}>
            <CameraPanel
              onRecognition={handleRecognition}
              currentResult={result}
              onAddRequest={() => setIsModalOpen(true)}
            />
          </div>
```

Replace with:
```tsx
          <div className="flex-1" style={{ minHeight: 420 }}>
            <CameraPanel
              onRecognition={handleRecognition}
              currentResult={result}
              onAddRequest={() => setIsModalOpen(true)}
            />
          </div>
          <ConversationStarters faces={result.faces ?? []} />
```

- [ ] **Step 3: Add summary link to dashboard header**

Find the Settings link in the header (around line 164–180):
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
```

Add a summary link immediately BEFORE the settings link:
```tsx
          {/* Daily summary link */}
          <Link
            href="/summary"
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0"
            style={{
              background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
              border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
              color: textSoft,
            }}
            aria-label="Daily summary"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              <line x1="16" y1="2" x2="16" y2="6" strokeWidth={2} strokeLinecap="round" />
              <line x1="8"  y1="2" x2="8"  y2="6" strokeWidth={2} strokeLinecap="round" />
              <line x1="3"  y1="10" x2="21" y2="10" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </Link>

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
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Test in browser**

Start dev server (`npm run dev` in `frontend/`). Open dashboard, start camera, point at a registered face. Below the camera a card should appear with 2–3 amber-styled prompt chips. Unregistered or no faces → card absent.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/\(app\)/dashboard/page.tsx
git commit -m "feat: mount ConversationStarters below camera and add summary nav link"
```

---

## Task 4: Daily summary backend endpoint

**Files:**
- Modify: `dementia-assist/app.py` (add after the existing `get_events` route, around line 1006)

- [ ] **Step 1: Add the route to app.py**

Find this line in app.py (around line 1006):
```python
    except Exception:
        logger.error("Error in GET /api/events:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Failed to retrieve events"}), 500


@app.route("/api/alerts/settings", methods=["GET", "POST"])
```

Insert the new route between `get_events` and `alert_settings`:

```python
    except Exception:
        logger.error("Error in GET /api/events:\n%s", traceback.format_exc())
        return jsonify({"status": "error", "message": "Failed to retrieve events"}), 500


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
        relation       str  (empty string when person not in DB)
        visit_count    int
        first_seen     str  (ISO-8601)
        last_seen      str  (ISO-8601)
        avg_confidence float (0–1)
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
        from collections import defaultdict
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
            .select("name, relation")
            .eq("user_id", user_id)
            .execute()
        )
        relation_map: dict[str, str] = {
            p["name"]: p.get("relation", "") for p in (people_result.data or [])
        }

        aggregated: dict[str, dict] = defaultdict(lambda: {
            "visit_count": 0,
            "confidences": [],
            "first_seen":  None,
            "last_seen":   None,
        })
        for ev in events:
            pname = ev["person_name"]
            agg   = aggregated[pname]
            agg["visit_count"] += 1
            agg["confidences"].append(ev["confidence"])
            ts = ev["recognized_at"]
            if agg["first_seen"] is None or ts < agg["first_seen"]:
                agg["first_seen"] = ts
            if agg["last_seen"] is None or ts > agg["last_seen"]:
                agg["last_seen"] = ts

        visitors = []
        for pname, agg in sorted(aggregated.items(),
                                  key=lambda x: x[1]["visit_count"], reverse=True):
            confs = agg["confidences"]
            visitors.append({
                "person_name":    pname,
                "relation":       relation_map.get(pname, ""),
                "visit_count":    agg["visit_count"],
                "first_seen":     agg["first_seen"],
                "last_seen":      agg["last_seen"],
                "avg_confidence": round(sum(confs) / len(confs), 4) if confs else 0.0,
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
```

- [ ] **Step 2: Restart Flask and smoke-test the endpoint**

```bash
# Restart Flask (Ctrl+C then):
python app.py

# In another terminal (replace TOKEN with a real JWT from browser devtools):
curl -H "Authorization: Bearer TOKEN" \
     "http://localhost:5000/api/summary/daily"
```
Expected: `{"date":"2026-05-07","total_visitors":N,"visitors":[...]}`

Test with explicit date:
```bash
curl -H "Authorization: Bearer TOKEN" \
     "http://localhost:5000/api/summary/daily?date=2026-05-07"
```
Expected: same shape.

Test with bad date:
```bash
curl -H "Authorization: Bearer TOKEN" \
     "http://localhost:5000/api/summary/daily?date=bad"
```
Expected: `{"message":"Invalid date — use YYYY-MM-DD","status":"error"}` with HTTP 400.

- [ ] **Step 3: Commit**

```bash
git add app.py
git commit -m "feat: add GET /api/summary/daily endpoint for daily visitor aggregation"
```

---

## Task 5: Add TypeScript types for summary

**Files:**
- Modify: `frontend/lib/types.ts`

- [ ] **Step 1: Append new interfaces to types.ts**

Current end of `frontend/lib/types.ts`:
```typescript
export interface RecognitionEvent {
  id: string;
  person_name: string;
  confidence: number;
  recognized_at: string;
}
```

Add after that last interface:
```typescript
export interface VisitorSummaryEntry {
  person_name:    string;
  relation:       string;
  visit_count:    number;
  first_seen:     string;   // ISO-8601
  last_seen:      string;   // ISO-8601
  avg_confidence: number;   // 0–1
}

export interface DailySummary {
  date:            string;  // YYYY-MM-DD
  total_visitors:  number;
  visitors:        VisitorSummaryEntry[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/types.ts
git commit -m "feat: add VisitorSummaryEntry and DailySummary types"
```

---

## Task 6: Summary API proxy route

**Files:**
- Create: `frontend/app/api/summary/route.ts`

- [ ] **Step 1: Create the proxy route**

```typescript
// frontend/app/api/summary/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const date  = req.nextUrl.searchParams.get('date') ?? '';
  const auth  = req.headers.get('Authorization') ?? '';
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  const url   = `http://localhost:5000/api/summary/daily${query}`;

  try {
    const res  = await fetch(url, {
      headers: { ...(auth ? { Authorization: auth } : {}) },
      cache:   'no-store',
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { status: 'error', message: 'Backend unreachable' },
      { status: 503 }
    );
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/summary/route.ts
git commit -m "feat: add /api/summary proxy route to Next.js"
```

---

## Task 7: Daily Summary page

**Files:**
- Create: `frontend/app/(app)/summary/page.tsx`

- [ ] **Step 1: Create the full page**

```tsx
// frontend/app/(app)/summary/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { DailySummary, VisitorSummaryEntry } from '@/lib/types';

function toLocalDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function nameHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h % 360;
}

function VisitorCard({ entry, dark }: { entry: VisitorSummaryEntry; dark: boolean }) {
  const hue     = nameHue(entry.person_name);
  const pct     = Math.round(entry.avg_confidence * 100);
  const capName = entry.person_name.charAt(0).toUpperCase() + entry.person_name.slice(1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 24 }}
      className="rounded-2xl p-4 flex flex-col gap-3"
      style={{
        background:     dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.80)',
        border:         `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Top row */}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-white text-sm"
          style={{ background: `hsl(${hue},55%,48%)` }}
        >
          {capName.slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="font-serif font-bold text-base leading-tight truncate"
              style={{ color: dark ? '#F5EFE8' : '#3A2F28' }}
            >
              {capName}
            </span>
            {entry.relation && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-semibold font-dm-sans shrink-0"
                style={{
                  background: 'rgba(201,148,58,0.14)',
                  border:     '1px solid rgba(201,148,58,0.30)',
                  color:      '#C9943A',
                }}
              >
                {entry.relation}
              </span>
            )}
          </div>
          <span
            className="text-[11px] font-dm-sans"
            style={{ color: dark ? '#8A7D72' : '#9A8C84' }}
          >
            {formatTime(entry.first_seen)}
            {entry.first_seen !== entry.last_seen && ` → ${formatTime(entry.last_seen)}`}
          </span>
        </div>

        {/* Visit count badge */}
        <div
          className="shrink-0 px-2.5 py-1 rounded-xl text-xs font-bold font-dm-sans"
          style={{
            background: 'rgba(201,148,58,0.12)',
            border:     '1px solid rgba(201,148,58,0.25)',
            color:      '#C9943A',
          }}
        >
          {entry.visit_count}×
        </div>
      </div>

      {/* Confidence bar */}
      <div>
        <div className="flex justify-between mb-1">
          <span className="text-[10px] font-dm-sans uppercase tracking-wider" style={{ color: dark ? '#8A7D72' : '#9A8C84' }}>
            Avg confidence
          </span>
          <span className="text-[10px] font-dm-sans font-medium" style={{ color: dark ? '#F5EFE8' : '#3A2F28' }}>
            {pct}%
          </span>
        </div>
        <div
          className="h-1.5 rounded-full overflow-hidden"
          style={{ background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg,#C9943A,#F0C97A)' }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}

export default function SummaryPage() {
  const { token }       = useAuth();
  const { theme }       = useTheme();
  const dark            = theme === 'dark';

  const todayStr        = toLocalDateStr(new Date());
  const [date, setDate] = useState(todayStr);
  const [summary,  setSummary]  = useState<DailySummary | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const fetchSummary = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/summary?date=${d}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Request failed');
      setSummary(data as DailySummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchSummary(date); }, [date, fetchSummary]);

  // Theme tokens
  const bg         = dark ? '#0D0A06'               : '#FAF6F1';
  const headerBg   = dark ? 'rgba(18,14,9,0.82)'    : 'rgba(255,255,255,0.78)';
  const borderCol  = dark ? 'rgba(255,255,255,0.08)': 'rgba(0,0,0,0.07)';
  const textMain   = dark ? '#F5EFE8'                : '#3A2F28';
  const textSoft   = dark ? '#8A7D72'                : '#9A8C84';

  return (
    <div className="min-h-screen flex flex-col" style={{ background: bg }}>
      {/* Header */}
      <header
        className="shrink-0 flex items-center gap-3 px-5 py-3 sticky top-0 z-40"
        style={{ background: headerBg, backdropFilter: 'blur(20px)', borderBottom: `1px solid ${borderCol}` }}
      >
        <Link
          href="/dashboard"
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all"
          style={{ background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: `1px solid ${borderCol}`, color: textSoft }}
          aria-label="Back to dashboard"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>

        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#C9943A' }} />
          <span className="font-serif font-bold text-lg" style={{ color: textMain }}>Daily Summary</span>
        </div>

        <div className="ml-auto">
          <input
            type="date"
            value={date}
            max={todayStr}
            onChange={e => setDate(e.target.value)}
            className="rounded-xl px-3 py-1.5 text-xs font-dm-sans outline-none"
            style={{
              background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              border:     `1px solid ${borderCol}`,
              color:      textMain,
            }}
          />
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 px-4 py-5 max-w-2xl mx-auto w-full">
        {/* Stats row */}
        {summary && !loading && (
          <div className="flex gap-3 mb-5">
            {/* Date card */}
            <div
              className="flex-1 rounded-2xl px-4 py-3"
              style={{
                background:     dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.80)',
                border:         `1px solid ${borderCol}`,
                backdropFilter: 'blur(12px)',
              }}
            >
              <p className="text-[10px] font-dm-sans uppercase tracking-widest mb-1" style={{ color: textSoft }}>Date</p>
              <p className="text-sm font-bold font-dm-sans" style={{ color: textMain }}>
                {new Date(summary.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
            </div>

            {/* Visitors card */}
            <div
              className="flex-1 rounded-2xl px-4 py-3"
              style={{
                background:     dark ? 'rgba(201,148,58,0.08)' : 'rgba(201,148,58,0.07)',
                border:         '1px solid rgba(201,148,58,0.22)',
                backdropFilter: 'blur(12px)',
              }}
            >
              <p className="text-[10px] font-dm-sans uppercase tracking-widest mb-1" style={{ color: '#C9943A' }}>Visitors</p>
              <p className="text-2xl font-bold font-serif leading-none" style={{ color: '#C9943A' }}>
                {summary.total_visitors}
              </p>
            </div>

            {/* Most frequent */}
            {summary.visitors.length > 0 && (
              <div
                className="flex-1 rounded-2xl px-4 py-3"
                style={{
                  background:     dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.80)',
                  border:         `1px solid ${borderCol}`,
                  backdropFilter: 'blur(12px)',
                }}
              >
                <p className="text-[10px] font-dm-sans uppercase tracking-widest mb-1" style={{ color: textSoft }}>Most seen</p>
                <p className="text-sm font-bold font-serif truncate" style={{ color: textMain }}>
                  {summary.visitors[0].person_name.charAt(0).toUpperCase() + summary.visitors[0].person_name.slice(1)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(201,148,58,0.40)', borderTopColor: '#C9943A' }} />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-2xl px-4 py-3 text-sm font-dm-sans" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && summary && summary.visitors.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ border: `2px dashed ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'}` }}
            >
              <svg className="w-8 h-8" style={{ color: dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" />
              </svg>
            </div>
            <p className="text-sm font-dm-sans" style={{ color: textSoft }}>No visitors recognised on this day</p>
          </div>
        )}

        {/* Visitor cards */}
        {!loading && !error && summary && summary.visitors.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#C9943A' }} />
              <span className="text-xs font-semibold uppercase tracking-widest font-dm-sans" style={{ color: textSoft }}>
                Visitors
              </span>
            </div>
            {summary.visitors.map((entry) => (
              <VisitorCard key={entry.person_name} entry={entry} dark={dark} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Test in browser**

Navigate to `http://localhost:3000/summary`. Should show today's summary. The date picker changes the displayed day. On a day with visits: visitor cards appear with names, relations, visit counts, time ranges, confidence bars. On a day with no visits: empty state illustration appears.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/\(app\)/summary/page.tsx
git commit -m "feat: daily visitor summary page with date picker and visitor cards"
```

---

## Self-Review

**Spec coverage:**
- ✅ Conversation starters shown when face recognised
- ✅ Starters derived from likes, relation, last_seen, notes
- ✅ Max 3 prompts per person
- ✅ Card absent when no recognised face
- ✅ Daily summary page accessible from dashboard header
- ✅ Date picker to browse any past day
- ✅ Per-visitor: name, relation, visit count, time range, confidence bar
- ✅ Stats row: total visitors, most-seen person
- ✅ Empty state for days with no visits
- ✅ Backend aggregates by person_name, sorts by visit_count desc

**Placeholder scan:** No TBD, TODO, or placeholder patterns found.

**Type consistency:**
- `VisitorSummaryEntry.person_name` used consistently in Task 5 types, Task 6 proxy, Task 7 page ✅
- `DailySummary.visitors` typed as `VisitorSummaryEntry[]` ✅
- `generateStarters(face: FaceResult)` signature matches import in `ConversationStarters.tsx` ✅
- `ConversationStarters` prop `faces: FaceResult[]` matches usage in `dashboard/page.tsx` ✅
