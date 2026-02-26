-- ============================================================
-- SiteScan Database Schema
-- Run this once in the Supabase SQL editor to set up from scratch.
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

-- profiles: one row per auth user, auto-created via trigger
create table if not exists profiles (
  id          uuid references auth.users on delete cascade primary key,
  email       text not null,
  created_at  timestamptz default now()
);

-- sites: domains/URLs submitted by users
-- Note: last_scan_id FK added via ALTER TABLE below (circular ref with scans)
create table if not exists sites (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles(id) on delete cascade not null,
  url           text not null,
  display_name  text,
  last_scan_id  uuid,                  -- FK added after scans table exists
  created_at    timestamptz default now(),
  constraint unique_user_url unique(user_id, url)
);

-- scans: one row per scan run
create table if not exists scans (
  id                uuid primary key default gen_random_uuid(),
  site_id           uuid references sites(id) on delete cascade not null,
  user_id           uuid references profiles(id),
  status            text default 'queued',
  consent_given     boolean not null default false,
  consent_at        timestamptz,
  agent_plan        jsonb,
  check_ssl         jsonb,
  check_headers     jsonb,
  check_redirects   jsonb,
  check_credentials jsonb,
  check_api_probe   jsonb,
  overall_score     integer,
  report_summary    text,
  remediation       jsonb,
  error_message     text,
  created_at        timestamptz default now(),
  completed_at      timestamptz
);

-- audit_log: immutable event log (service role inserts only)
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id),
  scan_id     uuid references scans(id),
  event       text,
  metadata    jsonb,
  created_at  timestamptz default now()
);

-- Resolve circular FK: sites.last_scan_id -> scans.id
alter table sites
  add constraint fk_sites_last_scan
  foreign key (last_scan_id) references scans(id)
  on delete set null;

-- Required for Supabase Realtime: include all columns in WAL UPDATE records
-- so the Realtime server can evaluate RLS policies (e.g. user_id = auth.uid()).
-- Without FULL, UPDATE events only contain the PK and changed columns — the
-- user_id column is absent, RLS evaluation fails, and events are silently dropped.
alter table scans replica identity full;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles  enable row level security;
alter table sites     enable row level security;
alter table scans     enable row level security;
alter table audit_log enable row level security;

-- ---- profiles ----
create policy "profiles: users can read own row"
  on profiles for select
  using (id = auth.uid());

create policy "profiles: users can update own row"
  on profiles for update
  using (id = auth.uid());

-- ---- sites ----
create policy "sites: users can read own rows"
  on sites for select
  using (user_id = auth.uid());

create policy "sites: users can insert own rows"
  on sites for insert
  with check (user_id = auth.uid());

create policy "sites: users can update own rows"
  on sites for update
  using (user_id = auth.uid());

create policy "sites: users can delete own rows"
  on sites for delete
  using (user_id = auth.uid());

-- ---- scans ----
-- Users can read their own scans
create policy "scans: users can read own rows"
  on scans for select
  using (user_id = auth.uid());

-- Users can insert scans for their own sites
create policy "scans: users can insert own rows"
  on scans for insert
  with check (user_id = auth.uid());

-- Edge Function uses service role key — service role bypasses RLS for updates.
-- No explicit update policy needed for regular users.

-- ---- audit_log ----
-- Users can read their own audit events
create policy "audit_log: users can read own rows"
  on audit_log for select
  using (user_id = auth.uid());

-- Only service role can insert (service role bypasses RLS).
-- No insert policy for regular users — this is intentional.

-- ============================================================
-- AUTO-PROFILE CREATION TRIGGER
-- Fires when a new user signs up via Supabase Auth.
-- Inserts a corresponding row into profiles automatically.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

-- Drop trigger if it already exists (safe for re-runs)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================
-- SUBSCRIPTION PLANS
-- ============================================================

create table if not exists plans (
  id            text primary key,              -- 'free' | 'pro' | 'max'
  display_name  text not null,
  description   text,
  scans_per_day integer,                       -- NULL = unlimited (Max tier)
  can_schedule  boolean not null default false,
  price_monthly integer not null default 0,    -- cents; 0 = free (future-proofed for payments)
  features      jsonb not null default '[]',   -- string[] for plan card UI
  sort_order    integer not null default 0,
  created_at    timestamptz default now()
);

alter table plans enable row level security;

-- Everyone (including anon) can read plan definitions for the settings page
create policy "plans: anyone can read"
  on plans for select
  using (true);

-- Seed the three tiers — idempotent via ON CONFLICT DO NOTHING
insert into plans (id, display_name, description, scans_per_day, can_schedule, features, sort_order)
values
  ('free', 'Free', 'For personal use', 2, false,
   '["2 scans per day","SSL & header checks","AI remediation report","Fix with Claude prompt"]'::jsonb, 0),
  ('pro',  'Pro',  'For developers and teams', 10, false,
   '["10 scans per day","All Free features","Credential exposure scan","API attack probing","Attack vector detection"]'::jsonb, 1),
  ('max',  'Max',  'For security-focused teams', null, true,
   '["Unlimited scans per day","All Pro features","Scheduled weekly/monthly scans","Priority scan queue"]'::jsonb, 2)
on conflict (id) do nothing;

-- ============================================================
-- PROFILE ADDITIONS
-- ============================================================

alter table profiles
  add column if not exists display_name text,
  add column if not exists plan_id text references plans(id) on delete set null default 'free';

-- Backfill existing users to the free plan
update profiles set plan_id = 'free' where plan_id is null;

-- Update handle_new_user() to include the new columns
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, plan_id)
  values (new.id, new.email, null, 'free');
  return new;
end;
$$;

-- ============================================================
-- SCHEDULED SCANS (Max tier only)
-- ============================================================

create table if not exists scheduled_scans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade not null,
  site_id     uuid references sites(id) on delete cascade not null,
  frequency   text not null check (frequency in ('weekly', 'monthly')),
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  created_at  timestamptz default now(),
  -- One schedule per site per user (use DELETE + INSERT to change frequency)
  constraint unique_user_site_schedule unique (user_id, site_id)
);

create index if not exists scheduled_scans_next_run_idx
  on scheduled_scans (next_run_at);

alter table scheduled_scans enable row level security;

-- Users can manage their own schedules; scheduler uses service role (bypasses RLS)
create policy "scheduled_scans: users manage own"
  on scheduled_scans for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
