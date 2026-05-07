# Dementia Assist — AI Memory Companion

Real-time face recognition system that helps dementia patients recognise people
and recall contextual memories about them.

---

## How It Works

1. The webcam continuously captures frames and runs them through an ArcFace model
2. Recognised faces are matched against per-user embeddings stored in Supabase
3. The system retrieves stored memories from the Supabase `people` table
4. The UI displays the person's name, relationship, notes, last-seen time, and a
   conversation suggestion tailored to what's stored in memory
5. Unknown people can be enrolled live — capture 5–10 photos, fill in their details,
   and they are immediately recognisable in the next scan cycle
6. Voice output announces who the person is when a new face is recognised

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
2. Open the SQL editor and run `supabase_schema.sql` from the project root to
   create the `profiles`, `people`, and `face_embeddings` tables.
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
frontend/          Next.js 14 (App Router) + Tailwind CSS
├── app/           Pages
├── components/    React components (StatusBar, AddPersonModal, Toast)
└── lib/           Shared types (types.ts)

app.py             Flask REST API
face_engine.py     ArcFace embedding engine (DeepFace + OpenCV)
supabase_memory.py Supabase-backed memory manager
```

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

Same request shape as signup. Returns the same response shape with a live
`access_token` ready to use as a Bearer token.

#### GET `/api/auth/me`

Requires `Authorization: Bearer <token>`. Returns:
```json
{
  "status": "success",
  "user": { "id": "uuid", "email": "user@example.com", "created_at": "..." }
}
```

---

### Recognition & People

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/health` | No | System status |
| POST | `/api/recognize` | Yes | Identify person from webcam frame |
| POST | `/api/add-person` | Yes | Enrol a new person |
| POST | `/api/confirm-person` | Yes | Manual confirmation fallback |
| GET | `/api/people` | Yes | List all enrolled people |
| POST | `/api/update-person` | Yes | Update a person's details |
| POST | `/api/seed` | Yes | Seed default people for new user |

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
{ "image": "<base64-encoded frame>" }
```

Response:
```json
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
  "suggestion": "Ask Alice about her garden"
}
```

`status` is one of: `recognized` · `unknown` · `no_face` · `error`

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

Minimum 5 images required. Recommended 8–10 for best accuracy.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Yes | Service-role key (server only, never exposed to browser) |
| `SUPABASE_ANON_KEY` | Yes | Anon key for auth endpoints |
| `SUPABASE_JWT_SECRET` | Yes (prod) | JWT signing secret for token verification |
| `FLASK_SECRET_KEY` | Yes | Flask session secret |
| `DEFAULT_USER_ID` | Dev only | Skip JWT auth in local dev without Supabase |
| `FLASK_DEBUG` | No | Enable Flask debug mode (default: true) |
