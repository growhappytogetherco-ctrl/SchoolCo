-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00034: Messaging V2 — Expanded statuses and priorities
--
-- Adds: waiting_parent, waiting_staff, closed, reopened to status
-- Adds: low to priority
-- ═══════════════════════════════════════════════════════════════════════════

-- ── conversations.status ──────────────────────────────────────────────────
-- Drop old 2-value constraint and replace with full set.

alter table conversations
  drop constraint if exists conversations_status_check;

alter table conversations
  add constraint conversations_status_check
  check (status in ('open','waiting_parent','waiting_staff','resolved','closed','reopened'));

-- ── conversations.priority ────────────────────────────────────────────────
-- Add 'low' below 'normal'.

alter table conversations
  drop constraint if exists conversations_priority_check;

alter table conversations
  add constraint conversations_priority_check
  check (priority in ('low','normal','high','urgent'));

-- ── Full-text search indexes ──────────────────────────────────────────────
-- Allow searching conversations by subject (GIN on tsvector).

create index if not exists idx_conversations_subject_search
  on conversations using gin(to_tsvector('english', subject));

-- Allow searching messages by body (used by staff search, never parent-exposed alone).

create index if not exists idx_messages_body_search
  on messages using gin(to_tsvector('english', body));
