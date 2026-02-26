-- Migration: add_leads_table
-- Run this once in the Supabase SQL editor.

create table if not exists leads (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  source      text default 'homepage',
  created_at  timestamptz default now()
);

alter table leads enable row level security;

-- No user-facing RLS policies needed.
-- Inserts happen via the service role key from the /api/leads route.
-- Reads are only accessible to project admins via the Supabase dashboard.
