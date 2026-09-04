-- =============================================================
-- Migration 002 — Biometric consent + audit log
--
-- GDPR Art. 9 treats face embeddings as special-category biometric
-- data.  This migration adds:
--   1. consents               (per-subject explicit opt-in, versioned)
--   2. audit_log              (append-only trail of privileged actions)
--   3. delete_user_data(uuid) (right-to-erasure cascade)
--
-- Idempotent.
-- =============================================================

-- ---- 1. consents ----------------------------------------------------------
create table if not exists public.consents (
    id                    uuid        primary key default gen_random_uuid(),
    user_id               uuid        not null
                                       references public.profiles(id) on delete cascade,
    subject_person_id     uuid                references public.people(id)   on delete cascade,
    consent_type          text        not null,   -- e.g. 'biometric_enrolment'
    consent_text_version  text        not null,   -- e.g. 'v1.0'
    granter_name          text        not null,   -- who signed (patient/guardian)
    granter_relation      text        not null default '',
    granted_at            timestamptz not null default now(),
    revoked_at            timestamptz
);

create index if not exists consents_user_subject_idx
    on public.consents (user_id, subject_person_id, consent_type)
    where revoked_at is null;

alter table public.consents enable row level security;

drop policy if exists "consents: select own" on public.consents;
create policy "consents: select own"
    on public.consents for select
    using (user_id = auth.uid());

drop policy if exists "consents: insert own" on public.consents;
create policy "consents: insert own"
    on public.consents for insert
    with check (user_id = auth.uid());

-- Revocation is an update, not delete — audit trail preserved.
drop policy if exists "consents: revoke own" on public.consents;
create policy "consents: revoke own"
    on public.consents for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- ---- 2. audit_log ---------------------------------------------------------
create table if not exists public.audit_log (
    id           bigserial   primary key,
    user_id      uuid                references public.profiles(id) on delete set null,
    actor        text        not null default 'user',   -- user | system | worker
    action       text        not null,                  -- enrol_person | delete_person | grant_consent | revoke_consent | erase_user | export_data
    target_type  text        not null default '',       -- person | consent | user
    target_id    text        not null default '',
    metadata     jsonb       not null default '{}'::jsonb,
    ip           inet,
    user_agent   text,
    at           timestamptz not null default now()
);

create index if not exists audit_log_user_at_idx
    on public.audit_log (user_id, at desc);

alter table public.audit_log enable row level security;

-- Users see only their own audit rows.
drop policy if exists "audit: select own" on public.audit_log;
create policy "audit: select own"
    on public.audit_log for select
    using (user_id = auth.uid());

-- Nobody except service_role writes to audit_log (server enforces).
drop policy if exists "audit: no client insert" on public.audit_log;
create policy "audit: no client insert"
    on public.audit_log for insert
    with check (false);

-- ---- 3. right to erasure --------------------------------------------------
-- Server calls this from the /api/me DELETE endpoint. Cascades through
-- profiles → people → face_embeddings → recognition_events → consents.
create or replace function public.delete_user_data(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    delete from public.recognition_events where user_id = target;
    delete from public.face_embeddings   where user_id = target;
    delete from public.consents          where user_id = target;
    delete from public.people            where user_id = target;
    delete from public.profiles          where id      = target;

    insert into public.audit_log (user_id, actor, action, target_type, target_id, metadata)
    values (null, 'system', 'erase_user', 'user', target::text,
            jsonb_build_object('cascaded', true));
end;
$$;

revoke all on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;

comment on function public.delete_user_data is
  'Right-to-erasure cascade. Server-only. Logs to audit_log before wiping profile.';
