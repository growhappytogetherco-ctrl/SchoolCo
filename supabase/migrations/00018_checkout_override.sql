-- ── Migration 00018 — Checkout override tracking ─────────────────────────
-- Adds relationship, phone, and override fields to attendance_records.

alter table attendance_records
  add column if not exists checkout_released_to_relationship text,
  add column if not exists checkout_released_to_phone        text,
  add column if not exists checkout_override_used            boolean not null default false,
  add column if not exists checkout_override_reason          text;

comment on column attendance_records.checkout_override_used   is
  'True when an admin/full_admin overrode a NOT AUTHORIZED or restricted pickup.';
comment on column attendance_records.checkout_override_reason is
  'Required reason text when checkout_override_used is true.';
