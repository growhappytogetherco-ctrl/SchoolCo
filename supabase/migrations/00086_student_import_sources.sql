-- ============================================================
-- Migration 00086 — Student Import Source Mapping
-- SchoolCo Platform
-- ============================================================
-- Maps source-system record identifiers (e.g. Airtable record IDs)
-- to SchoolCo student records, enabling:
--   1. Detecting previously-imported students on repeat CSV uploads
--   2. Audit trail of where each student record originated
-- ============================================================

create table if not exists student_import_sources (
  id                  uuid          primary key default gen_random_uuid(),
  organization_id     uuid          not null references organizations(id) on delete cascade,
  student_id          uuid          not null references students(id) on delete cascade,
  import_job_id       uuid          references import_jobs(id) on delete set null,
  source_system       text          not null default 'airtable_csv',
  source_record_id    text          not null,
  imported_at         timestamptz   not null default now(),
  imported_by         uuid          references profiles(id),

  constraint uq_import_source_per_org
    unique (organization_id, source_system, source_record_id)
);

create index idx_student_import_sources_org
  on student_import_sources(organization_id, source_system);

create index idx_student_import_sources_student
  on student_import_sources(student_id);

alter table student_import_sources enable row level security;

drop policy if exists "admin_all_student_import_sources" on student_import_sources;
create policy "admin_all_student_import_sources"
  on student_import_sources for all
  using  (is_org_admin(organization_id))
  with check (is_org_admin(organization_id));
