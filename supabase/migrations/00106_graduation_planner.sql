-- ============================================================
-- Migration 00106 — High School Graduation Planner
-- SchoolCo Platform
-- ============================================================
-- Adds 7 new tables for the student-specific Graduation Planner.
-- ADDITIVE ONLY: no existing tables, columns, or data are modified.
-- No DROP, no ALTER TABLE on existing tables, no UPDATE/DELETE on existing data.
--
-- Florida Graduation Framework Reference:
--   Statute:  s. 1003.4282, F.S.
--   Source:   https://www.fldoe.org/academics/graduation-req/
--   Cohort:   Students entering 9th grade 2023-24 and thereafter
--   Credits:  24.0 total (ELA 4.0, Math 4.0, Science 3.0, Social Studies 3.0,
--             Personal Financial Literacy 0.5, Fine Arts/CTE/Speech 1.0,
--             PE with Health 1.0, Electives 7.5)
--
-- RLS: All policies use the existing is_full_admin_or_above(org_id) helper
-- which correctly resolves identity via profile_id = auth.uid().
-- Defined in migration 00002_rls_policies.sql.
--
-- Initial access restricted to full_admin and platform_admin only.
-- Broader staff access may be granted in a future migration.
--
-- Table creation order (dependency chain):
--   1. graduation_requirement_templates
--   2. graduation_requirements
--   3. graduation_plans
--   4. student_graduation_requirements
--   5. graduation_plan_entries
--   6. graduation_plan_manual_credits
--   7. graduation_guidance_reviews
-- ============================================================

-- ── 1. graduation_requirement_templates ──────────────────────────────────────
-- Versioned Florida DOE requirement sets, keyed by ninth-grade cohort year.
-- organization_id = NULL means platform-wide (visible to all orgs).
-- IMMUTABLE after creation: no UPDATE or DELETE RLS policies are created.
-- New cohorts get new rows; existing rows are never modified.

create table if not exists graduation_requirement_templates (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid references organizations(id) on delete cascade,
  cohort_year             int not null,       -- 2023 = "entering 9th grade 2023-24"
  label                   text not null,
  total_credits_required  numeric(5,2) not null default 24.0,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  constraint grt_cohort_org_unique unique (cohort_year, organization_id)
);

comment on table graduation_requirement_templates is
  'Versioned graduation requirement frameworks (Florida DOE). Immutable after seeding. '
  'organization_id IS NULL = platform-wide template available to all orgs.';

-- ── 2. graduation_requirements ───────────────────────────────────────────────
-- Individual requirement rows within a template (ELA 4.0, Math 4.0, etc.).
-- IMMUTABLE after creation: no UPDATE or DELETE RLS policies.

create table if not exists graduation_requirements (
  id                  uuid primary key default gen_random_uuid(),
  template_id         uuid not null references graduation_requirement_templates(id) on delete cascade,
  sort_order          int not null default 0,
  category            text not null,         -- 'ela','math','science','social_studies',
                                             -- 'personal_finance','fine_arts','pe_health','elective'
  requirement_name    text not null,
  default_credits     numeric(4,2) not null,
  is_repeatable       boolean not null default false,  -- true for electives
  notes               text,
  constraint gr_category_check check (category in (
    'ela','math','science','social_studies',
    'personal_finance','fine_arts','pe_health','elective'
  ))
);

comment on table graduation_requirements is
  'Individual graduation requirement rows within a template. Immutable after seeding.';

-- ── 3. graduation_plans ──────────────────────────────────────────────────────
-- One row per student per organization. Created by full_admin on first visit.
-- Planner overrides (ninth_grade_entry_year, expected_graduation_year) never
-- write back to the students table.

create table if not exists graduation_plans (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references organizations(id) on delete cascade,
  student_id                uuid not null references students(id) on delete cascade,
  ninth_grade_entry_year    int,
  expected_graduation_year  int,
  advisor_name              text,
  requirement_template_id   uuid references graduation_requirement_templates(id),
  post_graduation_goal      text check (post_graduation_goal in (
                              'university','community_college','technical_trade',
                              'military','workforce','other')),
  academic_planning_flags   jsonb not null default '{}'::jsonb,
  staff_notes               text,
  created_by                uuid references profiles(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint gp_student_org_unique unique (organization_id, student_id)
);

comment on table graduation_plans is
  'One graduation plan per student. Planner overrides do not write to the students table.';

-- ── 4. student_graduation_requirements ───────────────────────────────────────
-- Per-student requirement customizations and custom requirements.
-- organization_id denormalized for direct RLS evaluation without JOIN.

create table if not exists student_graduation_requirements (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  plan_id             uuid not null references graduation_plans(id) on delete cascade,
  requirement_id      uuid references graduation_requirements(id),  -- NULL = custom requirement
  custom_name         text,          -- required when requirement_id IS NULL
  credits_required    numeric(4,2) not null,
  is_substitution     boolean not null default false,
  substitution_notes  text,
  sort_order          int not null default 0,
  created_by          uuid references profiles(id),
  created_at          timestamptz not null default now(),
  constraint sgr_custom_name_check check (
    requirement_id is not null or (custom_name is not null and custom_name <> '')
  )
);

comment on table student_graduation_requirements is
  'Per-student requirement overrides and custom requirements. '
  'requirement_id IS NULL = custom requirement added by staff.';

-- ── 5. graduation_plan_entries ───────────────────────────────────────────────
-- Individual course entries in the graduation plan.
-- These are PLANNER-ONLY representations — source records are never modified.
-- display_* fields are overrides shown in the planner instead of source values.
-- course_record_id and enrollment_id are read-only links; both may be NULL
-- (manual entry). At most one source link per entry (single_source check).

create table if not exists graduation_plan_entries (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references organizations(id) on delete cascade,
  plan_id                   uuid not null references graduation_plans(id) on delete cascade,
  student_requirement_id    uuid references student_graduation_requirements(id) on delete set null,

  -- Source linkage — at most one non-null (enforced by constraint below).
  -- ON DELETE SET NULL: deleting a source record nulls the link here but
  -- never deletes the planner entry itself.
  course_record_id          uuid references student_course_records(id) on delete set null,
  enrollment_id             uuid references curriculum_enrollments(id) on delete set null,

  -- Planner-specific display overrides (NEVER written back to source records).
  display_name              text,          -- NULL = show source course_name
  display_credits_planned   numeric(4,2),
  institution_code          text check (institution_code in ('RLA','REC','COL','other')),
  institution_name_override text,          -- college name for COL entries
  college_course_code       text,
  college_credits           numeric(6,2),
  source_credit_unit        text check (source_credit_unit in (
                              'high_school_credit','college_semester_hours','college_quarter_hours')),

  -- Planning metadata
  grade_level_slot          text check (grade_level_slot in (
                              '9th','10th','11th','12th','pre_9th')),
  school_year_label         text,          -- free text "2026-2027"; display only
  entry_status              text not null default 'planned' check (entry_status in (
                              'planned','in_progress','completed','verified','withdrawn','transferred')),
  completion_indicator      boolean not null default false,
  notes                     text,
  sort_order                int not null default 0,

  created_by                uuid references profiles(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Duplicate prevention: a source record may appear at most once per plan.
  constraint gpe_unique_course_record unique nulls not distinct (plan_id, course_record_id),
  constraint gpe_unique_enrollment    unique nulls not distinct (plan_id, enrollment_id),

  -- At most one source link per entry.
  constraint gpe_single_source check (
    course_record_id is null or enrollment_id is null
  )
);

comment on table graduation_plan_entries is
  'Individual course entries in the graduation plan. '
  'display_* fields are planner overrides; source records are never modified. '
  'Deleting an entry never affects student_course_records or curriculum_enrollments.';

-- ── 6. graduation_plan_manual_credits ────────────────────────────────────────
-- Manual earned-credit verification for entries not linked to a course record.
-- ALL credits start as not_reviewed and are EXCLUDED from graduation totals
-- until staff explicitly resolves duplicate_status to confirmed_unique.
-- reconciled_course_record_id: set when this manual credit is later entered
-- into official Academic History — credit is then counted only from the
-- official record, not this row.

create table if not exists graduation_plan_manual_credits (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references organizations(id) on delete cascade,
  plan_entry_id               uuid not null references graduation_plan_entries(id) on delete cascade,

  credits_claimed             numeric(4,2) not null check (credits_claimed > 0),

  -- Verification workflow
  verification_status         text not null default 'unverified' check (
                                verification_status in ('unverified','verified')),
  verification_notes          text,
  verified_by                 uuid references profiles(id),
  verified_at                 timestamptz,

  -- Duplicate review — MUST be resolved to confirmed_unique before credit counts.
  -- not_reviewed (default) = excluded from all graduation totals.
  duplicate_status            text not null default 'not_reviewed' check (
                                duplicate_status in (
                                  'not_reviewed',
                                  'confirmed_unique',
                                  'confirmed_duplicate'
                                )),
  possible_duplicate_flag     boolean not null default false,
  duplicate_resolution_notes  text,
  duplicate_resolved_by       uuid references profiles(id),
  duplicate_resolved_at       timestamptz,

  -- Reconciliation: when official Academic History record is later created,
  -- set this FK to prevent double-counting. Credit counted from official record only.
  reconciled_course_record_id uuid references student_course_records(id) on delete set null,
  reconciled_at               timestamptz,
  reconciled_by               uuid references profiles(id),

  source_description          text,
  created_by                  uuid references profiles(id),
  created_at                  timestamptz not null default now(),

  -- Integrity: verified fields required when verification_status = 'verified'
  constraint gpmc_verified_fields check (
    verification_status = 'unverified'
    or (verified_by is not null and verified_at is not null)
  ),
  -- Integrity: resolution fields required when duplicate_status != 'not_reviewed'
  constraint gpmc_resolution_fields check (
    duplicate_status = 'not_reviewed'
    or (duplicate_resolved_by is not null and duplicate_resolved_at is not null)
  )
);

comment on table graduation_plan_manual_credits is
  'Manual credit claims for planner entries not linked to a course record. '
  'Credits excluded from totals until duplicate_status=confirmed_unique AND verification_status=verified. '
  'reconciled_course_record_id prevents double-counting when official record is later created.';

-- ── 7. graduation_guidance_reviews ───────────────────────────────────────────
-- Append-only guidance counseling records. Never overwritten.
-- No UPDATE or DELETE RLS policies are created.

create table if not exists graduation_guidance_reviews (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references organizations(id) on delete cascade,
  plan_id                   uuid not null references graduation_plans(id) on delete cascade,
  review_date               date not null default current_date,
  advisor_id                uuid references profiles(id),
  advisor_name              text not null,
  advisor_recommendations   text,
  parent_family_notes       text,
  academic_concerns         text,
  student_goals             text,
  next_steps                text,
  next_review_date          date,
  post_graduation_goal      text check (post_graduation_goal in (
                              'university','community_college','technical_trade',
                              'military','workforce','other')),
  created_at                timestamptz not null default now()
  -- No updated_at: append-only by design
);

comment on table graduation_guidance_reviews is
  'Append-only guidance counseling review records. No UPDATE or DELETE permitted.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists idx_grad_plans_org_student
  on graduation_plans(organization_id, student_id);

create index if not exists idx_grad_entries_plan_slot
  on graduation_plan_entries(plan_id, grade_level_slot, sort_order);

create index if not exists idx_grad_entries_course_rec
  on graduation_plan_entries(course_record_id)
  where course_record_id is not null;

create index if not exists idx_grad_entries_enrollment
  on graduation_plan_entries(enrollment_id)
  where enrollment_id is not null;

create index if not exists idx_grad_entries_req
  on graduation_plan_entries(student_requirement_id)
  where student_requirement_id is not null;

create index if not exists idx_grad_reviews_plan_date
  on graduation_guidance_reviews(plan_id, review_date desc);

create index if not exists idx_manual_credits_entry
  on graduation_plan_manual_credits(plan_entry_id);

create index if not exists idx_manual_credits_reconciled
  on graduation_plan_manual_credits(reconciled_course_record_id)
  where reconciled_course_record_id is not null;

-- ── Enable RLS on all 7 tables ────────────────────────────────────────────────

alter table graduation_requirement_templates  enable row level security;
alter table graduation_requirements           enable row level security;
alter table graduation_plans                  enable row level security;
alter table student_graduation_requirements   enable row level security;
alter table graduation_plan_entries           enable row level security;
alter table graduation_plan_manual_credits    enable row level security;
alter table graduation_guidance_reviews       enable row level security;

-- ── RLS Policies ─────────────────────────────────────────────────────────────
-- All policies use the existing is_full_admin_or_above(org_id) helper.
-- Identity: profile_id = auth.uid() (see migration 00002_rls_policies.sql).
-- Templates and reviews are immutable: SELECT + INSERT only, no UPDATE/DELETE.

-- graduation_requirement_templates
drop policy if exists "grad_templates_full_admin_select"   on graduation_requirement_templates;
drop policy if exists "grad_templates_platform_admin_insert" on graduation_requirement_templates;

create policy "grad_templates_full_admin_select" on graduation_requirement_templates
  for select using (
    organization_id is null
    or is_full_admin_or_above(organization_id)
  );

create policy "grad_templates_platform_admin_insert" on graduation_requirement_templates
  for insert with check (
    is_platform_admin()
  );

-- graduation_requirements (read via template, insert by platform_admin)
drop policy if exists "grad_requirements_full_admin_select" on graduation_requirements;
drop policy if exists "grad_requirements_platform_admin_insert" on graduation_requirements;

create policy "grad_requirements_full_admin_select" on graduation_requirements
  for select using (
    exists (
      select 1 from graduation_requirement_templates t
      where t.id = template_id
        and (t.organization_id is null or is_full_admin_or_above(t.organization_id))
    )
  );

create policy "grad_requirements_platform_admin_insert" on graduation_requirements
  for insert with check (
    exists (
      select 1 from graduation_requirement_templates t
      where t.id = template_id
        and is_platform_admin()
    )
  );

-- graduation_plans (full CRUD except DELETE for full_admin)
drop policy if exists "grad_plans_full_admin_select" on graduation_plans;
drop policy if exists "grad_plans_full_admin_insert" on graduation_plans;
drop policy if exists "grad_plans_full_admin_update" on graduation_plans;

create policy "grad_plans_full_admin_select" on graduation_plans
  for select using (is_full_admin_or_above(organization_id));

create policy "grad_plans_full_admin_insert" on graduation_plans
  for insert with check (is_full_admin_or_above(organization_id));

create policy "grad_plans_full_admin_update" on graduation_plans
  for update using (is_full_admin_or_above(organization_id))
  with check (is_full_admin_or_above(organization_id));

-- student_graduation_requirements (full CRUD for full_admin)
drop policy if exists "sgr_full_admin_all" on student_graduation_requirements;

create policy "sgr_full_admin_all" on student_graduation_requirements
  for all using (is_full_admin_or_above(organization_id))
  with check (is_full_admin_or_above(organization_id));

-- graduation_plan_entries (full CRUD for full_admin)
drop policy if exists "gpe_full_admin_all" on graduation_plan_entries;

create policy "gpe_full_admin_all" on graduation_plan_entries
  for all using (is_full_admin_or_above(organization_id))
  with check (is_full_admin_or_above(organization_id));

-- graduation_plan_manual_credits (SELECT/INSERT/UPDATE; no DELETE)
drop policy if exists "gpmc_full_admin_select" on graduation_plan_manual_credits;
drop policy if exists "gpmc_full_admin_insert" on graduation_plan_manual_credits;
drop policy if exists "gpmc_full_admin_update" on graduation_plan_manual_credits;

create policy "gpmc_full_admin_select" on graduation_plan_manual_credits
  for select using (is_full_admin_or_above(organization_id));

create policy "gpmc_full_admin_insert" on graduation_plan_manual_credits
  for insert with check (is_full_admin_or_above(organization_id));

create policy "gpmc_full_admin_update" on graduation_plan_manual_credits
  for update using (is_full_admin_or_above(organization_id))
  with check (is_full_admin_or_above(organization_id));

-- graduation_guidance_reviews (SELECT + INSERT only; no UPDATE/DELETE)
drop policy if exists "ggr_full_admin_select" on graduation_guidance_reviews;
drop policy if exists "ggr_full_admin_insert" on graduation_guidance_reviews;

create policy "ggr_full_admin_select" on graduation_guidance_reviews
  for select using (is_full_admin_or_above(organization_id));

create policy "ggr_full_admin_insert" on graduation_guidance_reviews
  for insert with check (is_full_admin_or_above(organization_id));

-- ── Seed Florida 24-Credit Standard Diploma Template (2023-24 cohort) ────────
-- Florida DOE Standard Diploma, s. 1003.4282, F.S.
-- Applies to students entering 9th grade 2023-24 and thereafter.
-- organization_id IS NULL = platform-wide template.
-- These rows are immutable after insertion (no UPDATE RLS policy on templates).
-- RLA is a homeschool co-op; EOC exams, GPA, and statewide assessment
-- requirements (FAST/FSA) are Florida public-school requirements that may
-- not apply to homeschool students. Those are tracked informational-only.

do $$
declare
  v_template_id uuid;
begin
  -- Insert template if not already seeded
  insert into graduation_requirement_templates
    (organization_id, cohort_year, label, total_credits_required, is_active)
  values
    (null, 2023,
     'Florida Standard Diploma — 24 Credits (Cohort 2023-24+)',
     24.0, true)
  on conflict (cohort_year, organization_id) do nothing;

  -- Get the template id (handles both insert and conflict cases)
  select id into v_template_id
  from graduation_requirement_templates
  where cohort_year = 2023 and organization_id is null;

  if v_template_id is null then
    raise exception 'Failed to find or create graduation_requirement_templates row';
  end if;

  -- Seed requirements only if none exist for this template yet
  if not exists (
    select 1 from graduation_requirements where template_id = v_template_id
  ) then

    -- English Language Arts: 4.0 credits
    insert into graduation_requirements (template_id, sort_order, category, requirement_name, default_credits, is_repeatable, notes) values
    (v_template_id, 10, 'ela', 'English Language Arts', 4.0, false,
     'English 1, English 2, English 3, English 4 (1.0 each). Honors, AP, AICE, IB, and qualifying dual-enrollment coursework accepted.');

    -- Mathematics: 4.0 credits
    insert into graduation_requirements (template_id, sort_order, category, requirement_name, default_credits, is_repeatable, notes) values
    (v_template_id, 20, 'math', 'Mathematics', 4.0, false,
     'Algebra 1 (1.0), Geometry (1.0), and two additional math courses (1.0 each). Math courses 3 and 4 have editable course names (e.g., Algebra 2, Precalculus, Statistics). Note: Algebra 1 EOC is a Florida public-school requirement; may not apply to homeschool students.');

    -- Science: 3.0 credits
    insert into graduation_requirements (template_id, sort_order, category, requirement_name, default_credits, is_repeatable, notes) values
    (v_template_id, 30, 'science', 'Science', 3.0, false,
     'Biology 1 (1.0) plus two additional science courses (1.0 each). Florida public-school rules require laboratory components; verify applicability for homeschool planning. Note: Biology 1 EOC is a Florida public-school requirement; may not apply to homeschool students.');

    -- Social Studies: 3.0 credits
    insert into graduation_requirements (template_id, sort_order, category, requirement_name, default_credits, is_repeatable, notes) values
    (v_template_id, 40, 'social_studies', 'Social Studies', 3.0, false,
     'World History (1.0), U.S. History (1.0), U.S. Government (0.5), Economics (0.5). Note: U.S. History EOC is a Florida public-school requirement; may not apply to homeschool students.');

    -- Personal Financial Literacy: 0.5 credits (separate from Economics)
    insert into graduation_requirements (template_id, sort_order, category, requirement_name, default_credits, is_repeatable, notes) values
    (v_template_id, 50, 'personal_finance', 'Personal Financial Literacy', 0.5, false,
     'Personal Financial Literacy and Money Management (0.5). Separate from and in addition to the Economics requirement within Social Studies.');

    -- Fine Arts / CTE / Speech / Practical Arts: 1.0 credit
    insert into graduation_requirements (template_id, sort_order, category, requirement_name, default_credits, is_repeatable, notes) values
    (v_template_id, 60, 'fine_arts', 'Fine Arts / Performing Arts / Speech / CTE / Practical Arts', 1.0, false,
     'One credit from Fine Arts, Performing Arts, Speech, Career and Technical Education (CTE), or Practical Arts. Verify eligible course categories against the applicable Florida framework.');

    -- Physical Education with Health: 1.0 credit
    insert into graduation_requirements (template_id, sort_order, category, requirement_name, default_credits, is_repeatable, notes) values
    (v_template_id, 70, 'pe_health', 'Physical Education with Health', 1.0, false,
     'Physical Education including the integration of Health (1.0). Qualifying equivalents permitted per applicable Florida guidance.');

    -- Electives: 7.5 credits
    insert into graduation_requirements (template_id, sort_order, category, requirement_name, default_credits, is_repeatable, notes) values
    (v_template_id, 80, 'elective', 'Electives', 7.5, true,
     'Unlimited customizable elective courses. Examples: Bible, Leadership, Entrepreneurship, Spanish, Robotics, SeaPerch. Support 0.5, 1.0, and other valid verified credit amounts.');

  end if;
end;
$$;

-- ── Verify seed data ──────────────────────────────────────────────────────────
do $$
declare
  v_template_count int;
  v_req_count int;
  v_total numeric;
begin
  select count(*) into v_template_count from graduation_requirement_templates where cohort_year = 2023;
  select count(*) into v_req_count from graduation_requirements r
    join graduation_requirement_templates t on t.id = r.template_id
    where t.cohort_year = 2023;
  select coalesce(sum(default_credits), 0) into v_total from graduation_requirements r
    join graduation_requirement_templates t on t.id = r.template_id
    where t.cohort_year = 2023;

  if v_template_count <> 1 then
    raise exception 'Expected 1 template for cohort 2023, found %', v_template_count;
  end if;
  if v_req_count <> 8 then
    raise exception 'Expected 8 requirement rows for cohort 2023, found %', v_req_count;
  end if;
  if v_total <> 24.0 then
    raise exception 'Expected total_credits = 24.0, found %', v_total;
  end if;
  raise notice 'Seed verification: % template, % requirements, % total credits — OK', v_template_count, v_req_count, v_total;
end;
$$;
