# Dementia Assist — AI Memory Companion

Real-time face recognition system that helps dementia patients recognise people and recall contextual memories about them.

---

## Features

- **Live face recognition** — ArcFace model identifies multiple faces simultaneously from the webcam feed
- **Memory recall** — displays each person's name, relationship, age, last-seen time, interests, and a personalised conversation suggestion
- **Face card overlay** — non-intrusive card appears beside each detected face, following movement in real time
- **Multi-face support** — up to N people recognised in a single frame simultaneously
- **Live enrolment** — capture 5–10 photos or upload from device, fill in details, immediately recognisable in the next scan cycle
- **Add more photos** — improve recognition accuracy by appending photos to existing people at any time
- **Visit history** — timestamped log of every recognition event with clear-all option
- **Daily summary** — end-of-day recap showing who visited, how many times, their interests and notes
- **People management** — view enrolled people, edit details, delete people
- **Dark / light theme** — full dark mode support
- **Accessibility panel** — font size and contrast controls

---

## How It Works

1. Webcam continuously captures frames and sends them to the Flask backend
2. ArcFace model (via DeepFace) extracts 512-dimensional embeddings per detected face
3. Embeddings are compared against per-user vectors stored in Supabase using cosine similarity
4. Matched person's memory is retrieved from the Supabase `people` table
5. UI renders a face card beside each recognised face with name, relation, likes, notes, and a conversation suggestion
6. Every recognition event is logged to `recognition_events` for visit history and daily summaries

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- **Supabase account** — [supabase.com](https://supabase.com) (free tier works)
- A webcam

---

## Quick Start

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Open the SQL editor and run `supabase_schema.sql` from the project root to create all tables (`profiles`, `people`, `face_embeddings`, `recognition_events`).
3. In the Supabase dashboard go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret → `SUPABASE_SERVICE_KEY`
   - **anon** public key → `SUPABASE_ANON_KEY`
   - **JWT Secret** (Settings → API → JWT Settings) → `SUPABASE_JWT_SECRET`

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the keys from the previous step:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...
SUPABASE_JWT_SECRET=your-jwt-secret
FLASK_SECRET_KEY=any-random-string
```

### 3. Install dependencies and start

```bash
bash run.sh
```

This installs backend and frontend dependencies then starts both services:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

---

## Architecture

```
frontend/                     Next.js (App Router) + Tailwind CSS + Framer Motion
├── app/
│   ├── (app)/
│   │   ├── dashboard/        Main camera + recognition screen
│   │   ├── summary/          Daily visit summary
│   │   └── settings/         User preferences (alert threshold)
│   └── (marketing)/          Landing page, login, register
├── components/
│   ├── CameraPanel.tsx        Webcam capture + face card overlays
│   ├── PeopleSidebar.tsx      Enrolled people list + add/edit/delete
│   ├── AddPersonModal.tsx     Live enrolment flow (camera + upload)
│   ├── AddPhotosModal.tsx     Append photos to existing person
│   ├── VisitHistory.tsx       Recognition event log
│   ├── AlertBanner.tsx        Absence alert notifications
│   └── AccessibilityPanel.tsx Font size + contrast controls
└── lib/
    ├── types.ts               Shared TypeScript interfaces
    ├── auth-context.tsx        JWT auth state
    └── theme-context.tsx       Dark/light theme state

app.py                         Flask REST API
face_engine.py                 ArcFace embedding engine (DeepFace + OpenCV)
supabase_memory.py             Supabase-backed memory and event manager
supabase_schema.sql            Full database schema with RLS policies
```

---

## Deployment

### Backend → Render

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → New → Web Service → connect your repo.
3. Set the following in Render's service settings:
   - **Environment:** Docker
   - **Branch:** main
   - **Root Directory:** _(leave blank — Dockerfile is at repo root)_
4. Add environment variables in Render → Environment (same keys as `.env`).
5. Click Deploy. Copy the public Render URL (e.g. `https://dementia-assist.onrender.com`).

> **Note:** Render's free tier spins down after 15 minutes of inactivity. The first request after sleep takes ~30s to cold-start. Upgrade to a paid instance ($7/mo) to avoid this.

### Frontend → Vercel

1. Import the repo at [vercel.com](https://vercel.com) → New Project.
2. `vercel.json` sets the correct root directory automatically.
3. Add one environment variable in Vercel → Settings → Environment Variables:
   - `BACKEND_URL` = your Render URL from the step above
4. Deploy.

After first setup, every `git push` to `main` auto-deploys both services.

---

## API Reference

All protected routes require `Authorization: Bearer <access_token>`.

### Auth

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/signup` | Create a new account |
| POST | `/api/auth/login` | Sign in, returns `access_token` |
| GET | `/api/auth/me` | Get current user profile |

#### POST `/api/auth/signup`

```json
{ "email": "user@example.com", "password": "secret" }
```

Response:
```json
{
  "status": "success",
  "access_token": "eyJ...",
  "refresh_token": "...",
  "expires_in": 3600,
  "user": { "id": "uuid", "email": "user@example.com" }
}
```

#### POST `/api/auth/login`

Same request shape as signup. Returns the same response shape with a live `access_token`.

#### GET `/api/auth/me`

```json
{
  "status": "success",
  "user": { "id": "uuid", "email": "user@example.com", "created_at": "..." }
}
```

---

### Recognition

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/health` | No | System status |
| POST | `/api/recognize` | Yes | Identify all faces in a webcam frame |

#### GET `/api/health`

```json
{
  "status": "ok",
  "face_db_loaded": true,
  "people_count": 4,
  "memory_backend": "supabase"
}
```

#### POST `/api/recognize`

```json
{ "image": "<base64-encoded JPEG frame>" }
```

Response:
```json
{
  "faces": [
    {
      "status": "recognized",
      "name": "Alice",
      "confidence": 0.87,
      "memory": {
        "relation": "Daughter",
        "notes": "Lives in London",
        "last_seen": "2024-01-15T10:30:00Z",
        "age": 35,
        "likes": ["gardening", "music"]
      },
      "suggestion": "Ask Alice about her garden",
      "bbox": { "x": 120, "y": 80, "w": 160, "h": 160 },
      "frame_width": 640,
      "frame_height": 480
    }
  ]
}
```

`status` per face: `recognized` · `unknown`

---

### People

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/people` | Yes | List all enrolled people |
| POST | `/api/add-person` | Yes | Enrol a new person with photos |
| POST | `/api/add-photos` | Yes | Append photos to existing person |
| POST | `/api/update-person` | Yes | Update name, relation, notes, age, likes |
| POST | `/api/delete-person` | Yes | Remove person and all their embeddings |
| POST | `/api/confirm-person` | Yes | Manual confirmation fallback |

#### POST `/api/add-person`

```json
{
  "name": "Alice",
  "relation": "Daughter",
  "notes": "Lives in London",
  "age": 35,
  "likes": ["gardening", "music"],
  "images": ["<base64>", "<base64>", "..."]
}
```

Minimum 3 images required. Recommended 8–10 for best accuracy.

#### POST `/api/add-photos`

```json
{
  "name": "Alice",
  "images": ["<base64>", "<base64>", "..."]
}
```

#### POST `/api/update-person`

```json
{
  "name": "Alice",
  "relation": "Daughter",
  "notes": "Lives in London",
  "age": 35,
  "likes": ["gardening", "music"]
}
```

---

### Visit History & Summary

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/events` | Yes | Recent recognition events (max 50) |
| DELETE | `/api/events` | Yes | Clear all visit logs for current user |
| GET | `/api/daily-summary` | Yes | Today's visitor summary with per-person stats |

#### GET `/api/events?limit=50`

```json
{
  "events": [
    {
      "id": "uuid",
      "person_name": "alice",
      "confidence": 0.87,
      "recognized_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### GET `/api/daily-summary`

```json
{
  "date": "2024-01-15",
  "total_visitors": 2,
  "visitors": [
    {
      "person_name": "alice",
      "relation": "Daughter",
      "notes": "Lives in London",
      "likes": ["gardening", "music"],
      "visit_count": 3,
      "first_seen": "2024-01-15T09:00:00Z",
      "last_seen": "2024-01-15T14:30:00Z"
    }
  ]
}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Service-role key — server only, never exposed to browser |
| `SUPABASE_ANON_KEY` | Yes | Anon key for auth endpoints |
| `SUPABASE_JWT_SECRET` | Yes (prod) | JWT signing secret for token verification |
| `FLASK_SECRET_KEY` | Yes | Flask session secret |
| `BACKEND_URL` | Prod only | Full URL of deployed Flask backend — set in Vercel |
| `DEFAULT_USER_ID` | Dev only | Skip JWT auth in local dev without Supabase |
| `FLASK_DEBUG` | No | Enable Flask debug mode (default: true) |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS, Framer Motion |
| Backend | Flask, Gunicorn |
| Face recognition | DeepFace (ArcFace model), OpenCV |
| Database | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth (JWT, HS256) |
| Deployment | Vercel (frontend) + Render (backend) |
