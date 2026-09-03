-- =============================================================
-- Migration 001 — pgvector HNSW + user-scoped k-NN RPC
--
-- Adds:
--   1. face_embeddings.user_id (denormalised for fast filtering)
--   2. Trigger to auto-populate user_id on insert
--   3. Tuned HNSW index (m=16, ef_construction=64) over l2 ops
--   4. RPC match_face_embeddings(query, top_k, max_dist) — RLS-scoped
--
-- Idempotent: safe to re-run.
-- =============================================================

-- ---- 1. Denormalised user_id column ---------------------------------------
alter table public.face_embeddings
    add column if not exists user_id uuid;

-- Backfill from people table (join, one-shot).
update public.face_embeddings fe
   set user_id = p.user_id
  from public.people p
 where fe.person_id = p.id
   and fe.user_id is distinct from p.user_id;

alter table public.face_embeddings
    alter column user_id set not null;

alter table public.face_embeddings
    drop constraint if exists face_embeddings_user_id_fkey;
alter table public.face_embeddings
    add constraint face_embeddings_user_id_fkey
        foreign key (user_id) references public.profiles(id) on delete cascade;

create index if not exists face_embeddings_user_id_idx
    on public.face_embeddings (user_id);

-- ---- 2. Auto-populate user_id on insert -----------------------------------
create or replace function public.set_face_embedding_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.user_id is null then
        select user_id into new.user_id
          from public.people
         where id = new.person_id;
    end if;
    if new.user_id is null then
        raise exception 'face_embeddings.user_id could not be resolved from person_id %', new.person_id;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_set_face_embedding_user_id on public.face_embeddings;
create trigger trg_set_face_embedding_user_id
    before insert on public.face_embeddings
    for each row execute function public.set_face_embedding_user_id();

-- ---- 3. Tune HNSW index ---------------------------------------------------
-- Drop old un-tuned index (created by supabase_schema.sql), rebuild with
-- m=16 (default) and ef_construction=64 for better recall on small graphs.
drop index if exists public.face_embeddings_hnsw_idx;
create index face_embeddings_hnsw_idx
    on public.face_embeddings
    using hnsw (embedding vector_l2_ops)
    with (m = 16, ef_construction = 64);

-- ---- 4. Tighten RLS to use denormalised user_id (no subquery join) --------
drop policy if exists "face_embeddings: select own" on public.face_embeddings;
create policy "face_embeddings: select own"
    on public.face_embeddings for select
    using (user_id = auth.uid());

drop policy if exists "face_embeddings: insert own" on public.face_embeddings;
create policy "face_embeddings: insert own"
    on public.face_embeddings for insert
    with check (user_id = auth.uid());

drop policy if exists "face_embeddings: update own" on public.face_embeddings;
create policy "face_embeddings: update own"
    on public.face_embeddings for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "face_embeddings: delete own" on public.face_embeddings;
create policy "face_embeddings: delete own"
    on public.face_embeddings for delete
    using (user_id = auth.uid());

-- ---- 5. RPC: match_face_embeddings ----------------------------------------
-- Server (service_role) supplies target_user; RLS is bypassed but the
-- function itself filters by user_id, keeping data isolation intact.
--
-- Returns top-k rows with (person_id, person_name, distance) below max_dist.
drop function if exists public.match_face_embeddings(vector, integer, double precision, uuid);
create or replace function public.match_face_embeddings(
    query_embedding vector(512),
    top_k           integer,
    max_distance    double precision,
    target_user     uuid
)
returns table (
    person_id   uuid,
    person_name text,
    distance    double precision
)
language sql
stable
security definer
set search_path = public
as $$
    select
        fe.person_id,
        p.name                             as person_name,
        (fe.embedding <-> query_embedding) as distance
      from public.face_embeddings fe
      join public.people p on p.id = fe.person_id
     where fe.user_id = target_user
       and (fe.embedding <-> query_embedding) < max_distance
     order by fe.embedding <-> query_embedding
     limit greatest(top_k, 1);
$$;

comment on function public.match_face_embeddings is
  'k-NN face embedding search scoped to target_user. Uses HNSW l2 index.';

-- Grant execute to server roles only. anon must NOT call this directly
-- (would allow scanning other users when target_user is spoofed).
revoke all on function public.match_face_embeddings(vector, integer, double precision, uuid) from public, anon, authenticated;
grant execute on function public.match_face_embeddings(vector, integer, double precision, uuid) to service_role;

-- ---- 6. Session-level HNSW search tuning ----------------------------------
-- The Python client can execute: SELECT set_config('hnsw.ef_search','40',true);
-- before calling match_face_embeddings to trade latency for recall.
