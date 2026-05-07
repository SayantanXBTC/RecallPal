-- =============================================================
-- dementia-assist — Supabase Schema
--
-- Run the entire file in the Supabase SQL Editor (single pass).
-- Replaces face_db.pkl and memory_store.json with three tables:
--   profiles · people · face_embeddings
--
-- Prerequisites
--   • pgvector extension (enabled below)
--   • Supabase Auth enabled in your project
--
-- MIGRATION (if you ran an older version of this file):
--   face_embeddings.embedding was vector(128) with FaceNet.
--   ArcFace produces 512-d vectors — run this before enrolling faces:
--
--     ALTER TABLE face_embeddings
--       ALTER COLUMN embedding TYPE vector(512);
--
-- =============================================================


-- -----------------------------------------------------------
-- 0.  Extensions
-- -----------------------------------------------------------

-- pgvector supplies the vector(512) type used for FaceNet embeddings.
-- Supabase projects have it available by default; this is a no-op if
-- it is already enabled.
create extension if not exists vector with schema extensions;


-- -----------------------------------------------------------
-- 1.  profiles
--     One row per authenticated user (auth.users).
--     Created automatically by the trigger in section 5.
-- -----------------------------------------------------------

create table if not exists public.profiles (
    id          uuid        primary key
                            references auth.users (id) on delete cascade,
    created_at  timestamptz not null default now()
);

comment on table  public.profiles         is 'One profile row per Supabase Auth user.';
comment on column public.profiles.id      is 'Mirrors auth.users.id — no surrogate key needed.';


-- -----------------------------------------------------------
-- 2.  people
--     Each enrolled person belongs to exactly one user profile.
--     Names are stored lowercase (matching face_engine.py Fix #5).
-- -----------------------------------------------------------

create table if not exists public.people (
    id          uuid        primary key default gen_random_uuid(),
    user_id     uuid        not null
                            references public.profiles (id) on delete cascade,
    name        text        not null check (name = lower(name) and length(name) >= 2),
    relation    text        not null default '',
    notes       text        not null default '',
    age         integer     check (age > 0 and age < 150),
    likes       jsonb       not null default '[]'::jsonb,
    last_seen   timestamptz,
    first_seen  timestamptz not null default now(),
    created_at  timestamptz not null default now(),

    -- Each user can only have one row per (lowercase) name
    unique (user_id, name)
);

comment on table  public.people           is 'Enrolled persons — one row per person per user.';
comment on column public.people.name      is 'Lowercase display name (e.g. "sayantan"). Enforced by CHECK.';
comment on column public.people.likes     is 'JSON array of interest strings, e.g. ["Chess","Music"].';
comment on column public.people.last_seen is 'UTC timestamp of the most recent recognition event.';

-- Fast lookups by user + name (the unique index already covers this,
-- but a dedicated index helps the planner on large tables).
create index if not exists people_user_id_name_idx
    on public.people (user_id, name);


-- -----------------------------------------------------------
-- 3.  face_embeddings
--     Stores individual 512-d ArcFace vectors.
--     Multiple rows per person (one per captured photo).
-- -----------------------------------------------------------

create table if not exists public.face_embeddings (
    id          uuid        primary key default gen_random_uuid(),
    person_id   uuid        not null
                            references public.people (id) on delete cascade,
    embedding   vector(512) not null,   -- pgvector; falls back to float8[] if unavailable
    created_at  timestamptz not null default now()
);

comment on table  public.face_embeddings           is 'Per-photo ArcFace (512-d) embeddings for each enrolled person.';
comment on column public.face_embeddings.embedding is '512-dimensional float vector produced by DeepFace ArcFace.';

-- HNSW index enables fast approximate nearest-neighbour search by
-- Euclidean distance — matches np.linalg.norm used in face_engine.py.
create index if not exists face_embeddings_hnsw_idx
    on public.face_embeddings
    using hnsw (embedding vector_l2_ops);

-- Lookup all embeddings for a person in insertion order
create index if not exists face_embeddings_person_id_idx
    on public.face_embeddings (person_id, created_at);


-- -----------------------------------------------------------
-- 4.  Row Level Security (RLS)
--     Users can only read / write their own rows.
-- -----------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.people          enable row level security;
alter table public.face_embeddings enable row level security;

-- ── profiles ─────────────────────────────────────────────

create policy "profiles: select own row"
    on public.profiles for select
    using (id = auth.uid());

create policy "profiles: insert own row"
    on public.profiles for insert
    with check (id = auth.uid());

create policy "profiles: update own row"
    on public.profiles for update
    using (id = auth.uid())
    with check (id = auth.uid());

create policy "profiles: delete own row"
    on public.profiles for delete
    using (id = auth.uid());

-- ── people ───────────────────────────────────────────────

create policy "people: select own"
    on public.people for select
    using (user_id = auth.uid());

create policy "people: insert own"
    on public.people for insert
    with check (user_id = auth.uid());

create policy "people: update own"
    on public.people for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

create policy "people: delete own"
    on public.people for delete
    using (user_id = auth.uid());

-- ── face_embeddings ──────────────────────────────────────
-- Access is determined by whether the parent person belongs to the caller.
-- A sub-select on people is used rather than a join so the planner can
-- use the (user_id, name) index efficiently.

create policy "face_embeddings: select own"
    on public.face_embeddings for select
    using (
        person_id in (
            select id from public.people where user_id = auth.uid()
        )
    );

create policy "face_embeddings: insert own"
    on public.face_embeddings for insert
    with check (
        person_id in (
            select id from public.people where user_id = auth.uid()
        )
    );

create policy "face_embeddings: update own"
    on public.face_embeddings for update
    using (
        person_id in (
            select id from public.people where user_id = auth.uid()
        )
    );

create policy "face_embeddings: delete own"
    on public.face_embeddings for delete
    using (
        person_id in (
            select id from public.people where user_id = auth.uid()
        )
    );


-- -----------------------------------------------------------
-- 5.  Default-people seed function
--     Called for every new user inside the auth trigger.
--     Uses ON CONFLICT DO NOTHING so it is fully idempotent.
-- -----------------------------------------------------------

create or replace function public.seed_default_people(p_user_id uuid)
returns void
language plpgsql
security definer                 -- runs as the function owner, bypassing RLS
set search_path = public
as $$
begin
    insert into public.people
        (user_id, name, relation, notes, age, likes, first_seen, last_seen)
    values
        -- Sayantan ─────────────────────────────────────────────────────
        (
            p_user_id,
            'sayantan',
            'Friend',
            'Helpful and calm personality',
            21,
            '["AI","Coding","Chess","Music"]'::jsonb,
            now(), now()
        ),
        -- Simran ────────────────────────────────────────────────────────
        (
            p_user_id,
            'simran',
            'Friend',
            'Very cheerful and social',
            20,
            '["Dancing","Fashion","Social Media"]'::jsonb,
            now(), now()
        ),
        -- Arpita ────────────────────────────────────────────────────────
        (
            p_user_id,
            'arpita',
            'Friend',
            'Thoughtful and introspective',
            22,
            '["Reading","Writing","Art"]'::jsonb,
            now(), now()
        ),
        -- Sampad ────────────────────────────────────────────────────────
        (
            p_user_id,
            'sampad',
            'Friend',
            'Energetic and disciplined',
            21,
            '["Cricket","Gym","Fitness"]'::jsonb,
            now(), now()
        )
    on conflict (user_id, name) do nothing;   -- idempotent: skip if already present
end;
$$;

comment on function public.seed_default_people(uuid) is
    'Copies the four default enrolled people to a new user''s profile. '
    'Each user gets their own private copies — rows are never shared.';


-- -----------------------------------------------------------
-- 6.  Auth trigger
--     Fires after INSERT on auth.users (new sign-up or OAuth login
--     that creates a user for the first time).
--     Creates the profile row, then seeds default people.
-- -----------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    -- 1. Create the profile row for this user.
    insert into public.profiles (id)
    values (new.id)
    on conflict (id) do nothing;   -- guard against duplicate-fire edge cases

    -- 2. Seed the four default enrolled people for this user.
    perform public.seed_default_people(new.id);

    return new;
end;
$$;

comment on function public.handle_new_user() is
    'Trigger function: auto-creates a profiles row and seeds default people '
    'whenever a new row is inserted into auth.users.';

-- Drop and re-create so re-running this file is idempotent.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute procedure public.handle_new_user();


-- -----------------------------------------------------------
-- 7.  Convenience views (optional — useful during development)
-- -----------------------------------------------------------

-- v_people_with_embedding_count:
-- Shows every person alongside how many face embeddings they have.
-- Respects RLS automatically because it queries public.people.
create or replace view public.v_people_with_embedding_count
    with (security_invoker = true)   -- RLS of underlying tables is enforced
as
select
    p.id,
    p.user_id,
    p.name,
    p.relation,
    p.notes,
    p.age,
    p.likes,
    p.last_seen,
    p.first_seen,
    p.created_at,
    count(fe.id)::integer as embeddings_count
from  public.people          p
left  join public.face_embeddings fe on fe.person_id = p.id
group by p.id;

comment on view public.v_people_with_embedding_count is
    'People rows annotated with their face-embedding count. '
    'Equivalent to the /api/people response shape.';

-- -----------------------------------------------------------
-- 8.  recognition_events
--     One row per successful face recognition event.
--     Drives the visit-history timeline in the frontend.
-- -----------------------------------------------------------

create table if not exists public.recognition_events (
    id              uuid        primary key default gen_random_uuid(),
    user_id         uuid        not null
                                references public.profiles (id) on delete cascade,
    person_name     text        not null check (person_name = lower(person_name) and length(person_name) >= 2),
    confidence      float4      not null check (confidence >= 0 and confidence <= 1),
    recognized_at   timestamptz not null default now()
);

comment on table  public.recognition_events              is 'Audit log of every successful face recognition event.';
comment on column public.recognition_events.person_name is 'Lowercase name matching people.name at event time.';

create index if not exists recognition_events_user_time_idx
    on public.recognition_events (user_id, recognized_at desc);

alter table public.recognition_events enable row level security;

-- No UPDATE policy: recognition_events is an append-only audit log; events are immutable.
drop policy if exists "recognition_events: select own" on public.recognition_events;
create policy "recognition_events: select own"
    on public.recognition_events for select
    using (user_id = auth.uid());

drop policy if exists "recognition_events: insert own" on public.recognition_events;
create policy "recognition_events: insert own"
    on public.recognition_events for insert
    with check (user_id = auth.uid());

drop policy if exists "recognition_events: delete own" on public.recognition_events;
create policy "recognition_events: delete own"
    on public.recognition_events for delete
    using (user_id = auth.uid());

-- -----------------------------------------------------------
-- 9.  Alert settings — absence threshold per user
-- -----------------------------------------------------------

alter table public.profiles
    add column if not exists alert_days integer not null default 3
        check (alert_days >= 1 and alert_days <= 90);

comment on column public.profiles.alert_days is
    'Days of absence before a caregiver alert is triggered for a person.';
