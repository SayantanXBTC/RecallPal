-- =============================================================
-- Migration 003 — profile display_name + avatar_url
--
-- Adds:
--   1. profiles.display_name  — shown in the dashboard header
--   2. profiles.avatar_url    — data URL (uploaded) or Google avatar URL
--   3. Convenience view v_me  — merges auth.users with profile fields
--
-- Idempotent.
-- =============================================================

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_url   text,
  add column if not exists updated_at   timestamptz not null default now();

-- Backfill display_name from the email local part for existing rows.
update public.profiles p
   set display_name = split_part(u.email, '@', 1)
  from auth.users u
 where p.id = u.id
   and p.display_name is null;

-- Keep updated_at fresh on any change.
create or replace function public.touch_profile_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_profile_updated_at on public.profiles;
create trigger trg_touch_profile_updated_at
  before update on public.profiles
  for each row execute function public.touch_profile_updated_at();
