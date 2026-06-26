-- ============================================================
-- Migration 00012 — Import Jobs
-- SchoolCo Platform
-- ============================================================
-- Tracks every data import attempt (CSV or future API).
-- Enables dry-run preview, rollback, and audit trail.
-- Run AFTER: 00001 – 00011
-- ============================================================

create table if not exists import_jobs (
  id                  uuid          primary key default gen_random_uuid(),
  organization_id     uuid          not null references organizations(id) on delete cascade,
  created_by          uuid          references profiles(id),
  created_at          timestamptz   not null default now(),
  completed_at        timestamptz,

  -- Source metadata
  source              text          not null default 'airtable_csv'
                        check (source in ('airtable_csv', 'airtable_api', 'manual')),
  file_name           text,
  file_size_bytes     bigint,

  -- Status lifecycle:
  --   pending → validating → dry_run → ready → importing → completed
  --                                              ↓
  --                                            failed → rolled_back
  status              text          not null default 'pending'
                        check (status in (
                          'pending','validating','dry_run','ready',
                          'importing','completed','failed','rolled_back'
                        )),

  -- Row counts (populated after validation)
  total_rows          int           default 0,
  valid_rows          int           default 0,
  error_rows          int           default 0,

  -- Inserted record IDs — used for rollback
  -- Stored as { students: uuid[], families: uuid[], households: uuid[],
  --             profiles: uuid[], guardianships: uuid[],
  --             student_medical: uuid[], staff_notes: uuid[] }
  inserted_ids        jsonb         not null default '{}',

  -- Counts of actually inserted records
  inserted_students   int           default 0,
  inserted_families   int           default 0,
  inserted_households int           default 0,
  inserted_guardians  int           default 0,
  inserted_medical    int           default 0,
  inserted_notes      int           default 0,

  -- Skipped due to duplicate detection
  skipped_students    int           default 0,
  skipped_families    int           default 0,
  skipped_guardians   int           default 0,

  -- Validation errors and warnings per row
  -- Array of { row: number, field: string, value: string, error: string, fatal: boolean }
  validation_errors   jsonb         not null default '[]',

  -- Full import log — array of { ts, level, message }
  import_log          jsonb         not null default '[]',

  -- Snapshot of the raw parsed rows (first 100 for preview; full rows for audit)
  preview_rows        jsonb         not null default '[]',

  -- Error from fatal failure
  error_message       text
);

create index idx_import_jobs_org    on import_jobs(organization_id, created_at desc);
create index idx_import_jobs_status on import_jobs(organization_id, status);

alter table import_jobs enable row level security;

-- Only org admins can manage imports
create policy "admin_all_import_jobs"
  on import_jobs for all
  using (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));
