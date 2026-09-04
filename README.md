# RecallPal

Hey — I built this because my grandmother stopped recognising me last winter, and there was nothing on the shelf that felt gentle enough to actually put in her home. Everything was either a hospital-grade device with a price tag to match, or a face-unlock demo dressed up as an app.

RecallPal is a webcam sits on the table. When someone walks in, a soft card slides in beside their face saying "This is Sayantan, your grandson, 22, likes chess." The voice announces it too, once, quietly. That's it. No alarms. No dashboards. No "engagement metrics."

---

## What it does

- **Live face recognition** — webcam feed → face detected → matched against people the caregiver has enrolled → memory card overlaid on screen.
- **Voice cue** — a natural-sounding sentence spoken the moment recognition happens: *"This is Alice, your daughter."* Once per person, per visit. Silent for strangers.
- **Memory recall** — name, relation, age, likes/interests, notes, "last seen" timestamp, and a small conversation suggestion ("Ask Alice about her garden") because the hardest part isn't recognising — it's what to say next.
- **Face tracking across frames** — cards follow the right face when more than one person is in the room. No mixing up.
- **Enrol in seconds** — 5–10 webcam snaps of a person, a name, relation, done. Behind the scenes each photo becomes a 512-d vector.
- **Consent + audit built in** — biometric data is Article 9 special-category under GDPR, so every enrol requires an explicit consent record, every deletion is logged, and there's a one-click "erase everything about me" endpoint.
- **Visit log + daily recap** — who visited today, how many times, first / last time.

---

## How it works (quick version)

```
webcam → Next.js frontend → Flask backend → insightface (ArcFace ONNX) → 512-d vector
                                          ↓
                             pgvector HNSW k-NN in Supabase
                                          ↓
                          nearest person + memory + suggestion
                                          ↓
                       face card overlay + one-shot TTS on the client
```

- **Detection + embedding:** [insightface](https://github.com/deepinsight/insightface) `buffalo_l` bundle — RetinaFace detects faces, then 5-point landmark alignment, then ArcFace r100 produces the embedding. All in one forward pass, all ONNX. GPU when available, CPU when not.
- **Storage:** Supabase (Postgres + pgvector). One HNSW index on the embeddings column, tuned `m=16, ef_construction=64`.
- **Search:** `match_face_embeddings(query, k, threshold, user_id)` — a `SECURITY DEFINER` SQL function so the k-NN is scoped to the caregiver's own rows even though the server uses the service-role key.
- **Auth:** Supabase Auth JWTs, verified against JWKS (asymmetric ES256/RS256) with an HS256 fallback for legacy projects. RLS on every table.

---

## Stack

| Layer            | What                                                        |
|------------------|-------------------------------------------------------------|
| Frontend         | Next.js 15 (App Router), React 19, Tailwind, Framer Motion  |
| Backend          | Flask, Gunicorn, python-jose, flask-limiter, flask-cors     |
| Face ML          | insightface (RetinaFace + ArcFace r100, ONNX runtime)       |
| Database         | Supabase — Postgres + pgvector (HNSW index)                 |
| Auth             | Supabase Auth (JWT, HS256 / ES256 via JWKS)                 |
| Observability    | Sentry + structlog JSON logs + Prometheus (`/metrics`)      |
| Optional GPU     | Split inference microservice + Redis-backed RQ queue        |
| Deploy           | Vercel (frontend) + Render (backend) — HTTPS auto           |

---

## Running it locally

You need:

- Python 3.10+ (3.11 is what I use)
- Node 18+
- A Supabase project (free tier is fine)
- A webcam

### 1. Supabase

Create a project at supabase.com. Open the SQL editor and run these files **in order**:

1. `supabase_schema.sql` — base tables (`profiles`, `people`, `face_embeddings`, `recognition_events`).
2. `migrations/001_pgvector_hnsw.sql` — denormalised `user_id`, tuned HNSW index, `match_face_embeddings` RPC.
3. `migrations/002_consent_audit.sql` — `consents` + `audit_log` tables + right-to-erasure RPC.
4. `migrations/003_profile_avatar.sql` — `display_name` + `avatar_url` on `profiles`.

Then Settings → API — grab:

- Project URL
- `service_role` secret
- `anon` public key
- JWT Secret (Settings → API → JWT Settings)

### 2. Backend

```bash
cp .env.example .env
# fill in the four SUPABASE_* keys + a random FLASK_SECRET_KEY
pip install -r requirements.txt
python app.py
```

First run downloads the buffalo_l model bundle (~300 MB) into `~/.insightface/`. Takes a minute, only happens once.

Listens on `:5000`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens on `:3000`. Register → grant camera permission → done.

---

## Deploying

**Backend on Render:**

- New Web Service → point at this repo → Environment: Docker → Root: `/` (Dockerfile is at repo root).
- Env vars: same keys as `.env`, plus `ALLOWED_ORIGINS=https://your-vercel-url.vercel.app`.

Render terminates TLS automatically — HTTPS just works. The app also sends HSTS + Referrer-Policy + X-Frame-Options + Permissions-Policy headers on every response.

**Frontend on Vercel:**

- Import the repo → set root to `frontend/`.
- One env var: `BACKEND_URL=https://your-render-url.onrender.com`.
- Deploy.

Vercel handles HTTPS + edge caching, plus my `next.config.js` also emits the security headers as a belt-and-braces layer.

**If you scale past a single pod:**

The repo also ships `Dockerfile.inference` (GPU insightface worker) and `Dockerfile.worker` (RQ enrol worker) plus a full `docker-compose.yml`. Wire it up with `INFERENCE_URL` + `REDIS_URL` env vars on the web pod and enrol becomes async, recognize goes to the GPU pod.

---

## Security posture (why I care)

Face embeddings are biometric data. Under GDPR they're **special category** — misusing them is a "please pay a lot of money" mistake. So:

- **JWT signature verified on every request** — HS256 or ES256/RS256 via JWKS. `alg=none` rejected. `service_role` tokens rejected on user routes.
- **Row Level Security everywhere.** Every `select`/`insert`/`update`/`delete` policy checks `user_id = auth.uid()`. Tested against anon-key spoofing.
- **CORS is an explicit allowlist**, never `*`.
- **Rate limits** on `/recognize` (30/min), `/add-person` (10/h), `/auth/login` (10/min), `/auth/signup` (5/h).
- **HTTPS forced** in production; HSTS preload; secure headers on every response.
- **No tracebacks in API responses** — errors log to Sentry, users see a friendly message.
- **Consent gate** — enrolment refuses without an active `consents` row for the subject. Grant/revoke is versioned, revocation is soft-delete so the paper trail survives.
- **Audit log** — enrol / delete / consent / erase all append to `audit_log`. Clients can `select` their own rows, no client can `insert` (RLS + `service_role` only).
- **Right to erasure** — `DELETE /api/me` calls a `SECURITY DEFINER` cascade that wipes profile → people → embeddings → events → consents in one go, then logs the erasure.
- **Local liveness heuristics** — Laplacian blur, pose variance, pairwise cosine dup detection reject the most common spoof attempts at enrol.
- **`.env` never committed.** `.gitignore` blocks it plus `*.pem`, `*.key`, `credentials*.json`, `service-account*.json`.

Still missing (roadmap): full-strength liveness (MiniFASNet / rPPG), signed audit trail (hash-chained), DPIA doc, DPA with Supabase + Render.

---

## API cheat-sheet

Everything under `/api/*`. Auth = `Authorization: Bearer <access_token>` unless noted.

| Method | Route                          | Auth | What                                              |
|--------|--------------------------------|------|---------------------------------------------------|
| GET    | `/api/health`                  | no   | liveness + subsystem status                       |
| GET    | `/api/ready`                   | no   | readiness — pings Supabase + inference            |
| POST   | `/api/auth/signup`             | no   | new account                                       |
| POST   | `/api/auth/login`              | no   | returns access + refresh tokens                   |
| POST   | `/api/auth/refresh`            | no   | refresh access token                              |
| GET    | `/api/auth/me`                 | yes  | current user profile                              |
| POST   | `/api/recognize`               | yes  | identify all faces in one frame                   |
| POST   | `/api/add-person`              | yes  | enrol (accepts inline consent block)              |
| POST   | `/api/add-photos`              | yes  | more embeddings for an existing person            |
| POST   | `/api/update-person`           | yes  | update metadata                                   |
| POST   | `/api/delete-person`           | yes  | remove one person                                 |
| GET    | `/api/people`                  | yes  | list enrolled                                     |
| GET    | `/api/consent`                 | yes  | list active consents                              |
| POST   | `/api/consent`                 | yes  | grant biometric consent                           |
| DELETE | `/api/consent/<id>`            | yes  | revoke                                            |
| GET    | `/api/audit`                   | yes  | user-scoped audit log                             |
| DELETE | `/api/me`                      | yes  | right-to-erasure — wipes everything               |
| GET    | `/api/events`                  | yes  | visit history                                     |
| GET    | `/api/daily-summary`           | yes  | today's visitor recap                             |
| GET    | `/metrics`                     | no   | Prometheus scrape                                 |

---

## What I got wrong (so far)

- **First cut used DeepFace + TensorFlow.** ~500 MB of dependencies for one model. Swapped to insightface ONNX — recognition is faster and the docker image is ~40% smaller.
- **First cut stored embeddings in a local pickle.** Broke horizontal scaling instantly. Moved to pgvector with an HNSW index; k-NN is now server-side and multi-pod safe.
- **First cut had `verify_signature: False` on the JWT decode.** That is exactly as bad as it sounds. Fixed with proper HS256 verification and later added JWKS support for Supabase's newer signing keys.
- **First blur threshold was 45.** Every normal home webcam failed it. Dropped to 12; genuinely blurred frames still get rejected.

---

## Structure

```
dementia-assist/
├── app.py                       # Flask REST API — auth, recognize, enrol, consent
├── face_engine.py               # insightface wrapper + Supabase embedding store
├── inference_service.py         # optional GPU-pod microservice
├── inference_client.py          # calls the microservice or runs in-process
├── enrol_queue.py               # RQ dispatcher for async enrol
├── consent.py                   # grant / revoke / audit helpers
├── liveness.py                  # blur + pose + dup checks
├── observability.py             # Sentry + structlog + Prometheus
├── supabase_schema.sql          # base tables
├── migrations/                  # ordered SQL migrations
├── frontend/
│   ├── app/                     # Next.js App Router pages
│   ├── components/              # CameraPanel, PeopleSidebar, AddPersonModal, ...
│   └── lib/                     # auth-context, theme-context, types
├── Dockerfile                   # web pod
├── Dockerfile.inference         # GPU insightface pod
├── Dockerfile.worker            # RQ enrol worker
└── docker-compose.yml           # local 4-service stack
```

---

## Thanks

To my grandmother, for putting up with me pointing a laptop at her face for a week straight while I calibrated thresholds. And to every unpaid family caregiver who quietly holds someone else's memory for them — this is meant for you.
