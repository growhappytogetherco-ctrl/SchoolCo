-- ============================================================================
-- 00083 — Credit-field security triggers + section-level grading_period_id
-- ============================================================================
-- Purpose:
--   1. Add grading_period_id to course_sections (section-level term default).
--   2. Create a BEFORE UPDATE trigger that prevents teacher/staff from
--      modifying HS-credit configuration fields on either table at the
--      database level, regardless of which update path is used.
--
-- Security rationale:
--   PostgreSQL RLS is row-level, not column-level.  The existing
--   "staff_update_course_sections" / "staff_update_curriculum" policies
--   allow any teacher/staff to UPDATE these rows.  To protect the credit
--   configuration columns without disrupting ordinary staff workflows we
--   use a BEFORE UPDATE trigger that inspects auth.uid() against
--   organization_members.  auth.uid() is populated by PostgREST from the
--   JWT for every authenticated request; it is null only for the service
--   role (which is intentionally unrestricted).
--
-- Protected columns:
--   course_sections:        counts_toward_high_school_credit,
--                           credits_attempted, course_level,
--                           grading_period_id (new)
--   curriculum_enrollments: counts_toward_high_school_credit,
--                           credits_attempted, course_level,
--                           grading_period_id
--
-- Authorized roles: registrar, admin, full_admin, platform_admin.
-- Teachers and ordinary staff retain all other UPDATE rights on both tables.
-- ============================================================================

-- ── 1. Add grading_period_id to course_sections ──────────────────────────────

alter table course_sections
  add column if not exists grading_period_id uuid
    references grading_periods(id) on delete set null;

comment on column course_sections.grading_period_id is
  'Section-level term default (FK → grading_periods). '
  'Null = term not specified at the section level. '
  'Never auto-interpreted as Full Year. '
  'Enrollment-level grading_period_id takes precedence via ?? in application layer.';

create index if not exists idx_course_sections_grading_period
  on course_sections(grading_period_id)
  where grading_period_id is not null;

-- ── 2. Trigger function ───────────────────────────────────────────────────────

create or replace function enforce_credit_fields_registrar_only()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid  uuid;
  v_role text;
begin
  -- Service role / migrations: auth.uid() is null → unrestricted
  v_uid := auth.uid();
  if v_uid is null then
    return new;
  end if;

  -- Short-circuit: only check when a protected field actually changed
  if not (
    (old.counts_toward_high_school_credit is distinct from new.counts_toward_high_school_credit) or
    (old.credits_attempted                is distinct from new.credits_attempted)                or
    (old.course_level                     is distinct from new.course_level)                     or
    (old.grading_period_id                is distinct from new.grading_period_id)
  ) then
    return new;
  end if;

  -- Cross-organization guard: always use the row's own organization_id
  select role into v_role
  from   organization_members
  where  organization_id = new.organization_id
    and  profile_id      = v_uid
    and  status          = 'active';

  if v_role is null or v_role not in ('registrar', 'admin', 'full_admin', 'platform_admin') then
    raise exception
      'insufficient_privilege: registrar or above required to modify credit configuration'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

comment on function enforce_credit_fields_registrar_only() is
  'BEFORE UPDATE trigger: blocks modifications to HS-credit configuration fields '
  'unless auth.uid() belongs to a registrar/admin/full_admin/platform_admin in the '
  'row''s own organization.  Service-role operations (auth.uid() = null) are allowed.';

-- ── 3. Attach trigger to course_sections ─────────────────────────────────────

drop trigger if exists trg_credit_fields_course_sections on course_sections;

create trigger trg_credit_fields_course_sections
  before update on course_sections
  for each row
  execute function enforce_credit_fields_registrar_only();

-- ── 4. Attach trigger to curriculum_enrollments ───────────────────────────────

drop trigger if exists trg_credit_fields_curriculum_enrollments on curriculum_enrollments;

create trigger trg_credit_fields_curriculum_enrollments
  before update on curriculum_enrollments
  for each row
  execute function enforce_credit_fields_registrar_only();

-- ── Verification queries (informational — not executed by migration runner) ───
-- select tgname, tgrelid::regclass from pg_trigger
--   where tgname like 'trg_credit_fields_%';
-- select column_name from information_schema.columns
--   where table_name = 'course_sections' and column_name = 'grading_period_id';
