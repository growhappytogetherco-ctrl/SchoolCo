-- ============================================================
-- SchoolCo — Add tagline column to organizations
-- Migration: 00003_add_tagline
-- Only needed if you already ran 00001_initial_schema.sql.
-- If starting fresh, 00001 already includes this column.
-- ============================================================

alter table organizations
  add column if not exists tagline text;

comment on column organizations.tagline is
  'One-line mission statement displayed in the mission switcher and welcome screen.';
