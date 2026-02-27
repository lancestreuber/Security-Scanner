-- Migration: add check_source_scan column
-- Stores results of HTML/JS source code scanning for leaked secrets.
-- Populated by the run-scan Edge Function alongside the other check_* columns.

alter table scans
  add column if not exists check_source_scan jsonb;
