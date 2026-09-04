-- =============================================================
-- Migration 004 — conversation snippets tied to people
--
-- When a person is on camera and someone speaks, we capture the
-- transcript and attribute it to that person so a caregiver /
-- dementia patient can later recall "we spoke about X".
--
-- Idempotent.
-- =============================================================

create table if not exists public.conversations (
    id           uuid        primary key default gen_random_uuid(),
    user_id      uuid        not null
                              references public.profiles(id) on delete cascade,
    person_id    uuid        not null
                              references public.people(id)   on delete cascade,
    transcript   text        not null,
    topics       jsonb       not null default '[]'::jsonb,
    spoken_at    timestamptz not null default now()
);

create index if not exists conversations_user_person_time_idx
    on public.conversations (user_id, person_id, spoken_at desc);

alter table public.conversations enable row level security;

drop policy if exists "conversations: select own" on public.conversations;
create policy "conversations: select own"
    on public.conversations for select
    using (user_id = auth.uid());

drop policy if exists "conversations: insert own" on public.conversations;
create policy "conversations: insert own"
    on public.conversations for insert
    with check (user_id = auth.uid());

drop policy if exists "conversations: delete own" on public.conversations;
create policy "conversations: delete own"
    on public.conversations for delete
    using (user_id = auth.uid());
