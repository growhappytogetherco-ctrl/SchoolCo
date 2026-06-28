-- ── Migration 00019 — Student Success Plan ────────────────────────────────
-- Five tables: family_vision, growth_goals, support_strategies,
-- learning_profiles, ssp_timeline (auto-generated).
-- All keyed to (organization_id, student_id) for multi-tenancy.

-- ── 1. Family Vision ──────────────────────────────────────────────────────

create table success_plan_family_vision (
  id                            uuid          primary key default gen_random_uuid(),
  organization_id               uuid          not null references organizations(id) on delete cascade,
  student_id                    uuid          not null references students(id) on delete cascade,

  family_vision_summary         text,
  why_rla                       text,
  parent_priorities             text,
  family_concerns               text,
  parent_hopes                  text,
  teacher_initial_observations  text,

  last_reviewed_at              timestamptz,
  created_at                    timestamptz   not null default now(),
  updated_at                    timestamptz   not null default now(),
  created_by                    uuid          references profiles(id) on delete set null,
  last_updated_by               uuid          references profiles(id) on delete set null,

  unique(organization_id, student_id)
);

create trigger trg_spfv_updated_at
  before update on success_plan_family_vision
  for each row execute function handle_updated_at();

create index idx_spfv_student on success_plan_family_vision(organization_id, student_id);

alter table success_plan_family_vision enable row level security;

create policy "spfv_staff_read" on success_plan_family_vision for select
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "spfv_teacher_write" on success_plan_family_vision for insert
  with check (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "spfv_teacher_update" on success_plan_family_vision for update
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

-- ── 2. Growth Goals ───────────────────────────────────────────────────────

create table growth_goals (
  id                    uuid          primary key default gen_random_uuid(),
  organization_id       uuid          not null references organizations(id) on delete cascade,
  student_id            uuid          not null references students(id) on delete cascade,

  title                 text          not null,
  category              text          not null default 'other',
  -- academic | leadership | behavior | executive_function | social | emotional
  -- independence | faith | communication | entrepreneurship | other
  priority              text          not null default 'medium',
  -- low | medium | high
  status                text          not null default 'not_started',
  -- not_started | in_progress | completed | on_hold
  progress_pct          integer       not null default 0 check (progress_pct between 0 and 100),

  baseline              text,
  target_outcome        text,
  success_indicators    text,
  staff_observations    text,
  future_parent_comments text,        -- prepared, not yet exposed to parents

  assigned_staff_id     uuid          references profiles(id) on delete set null,
  target_review_date    date,
  completed_date        date,

  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now(),
  created_by            uuid          references profiles(id) on delete set null,
  last_updated_by       uuid          references profiles(id) on delete set null,
  archived_at           timestamptz
);

create trigger trg_growth_goals_updated_at
  before update on growth_goals
  for each row execute function handle_updated_at();

create index idx_growth_goals_student on growth_goals(organization_id, student_id);
create index idx_growth_goals_status  on growth_goals(organization_id, student_id, status);

alter table growth_goals enable row level security;

create policy "gg_staff_read" on growth_goals for select
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "gg_teacher_insert" on growth_goals for insert
  with check (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "gg_teacher_update" on growth_goals for update
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

-- ── 3. Support Strategies ─────────────────────────────────────────────────

create table support_strategies (
  id              uuid          primary key default gen_random_uuid(),
  organization_id uuid          not null references organizations(id) on delete cascade,
  student_id      uuid          not null references students(id) on delete cascade,

  title           text          not null,
  description     text,
  category        text          not null default 'general',
  -- instruction | behavior | environment | medical | social | communication
  -- sensory | transition | safety | general
  priority        text          not null default 'normal',
  -- normal | high | critical
  is_pinned       boolean       not null default false,
  visible_to      text          not null default 'staff',
  -- staff | admin_only
  expires_at      date,

  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  created_by      uuid          references profiles(id) on delete set null,
  last_updated_by uuid          references profiles(id) on delete set null
);

create trigger trg_support_strategies_updated_at
  before update on support_strategies
  for each row execute function handle_updated_at();

create index idx_ss_student       on support_strategies(organization_id, student_id);
create index idx_ss_pinned_crit   on support_strategies(organization_id, student_id, is_pinned, priority)
  where is_pinned = true;

alter table support_strategies enable row level security;

-- Staff read: can see 'staff' strategies; admin-only strategies filtered at app layer
create policy "ss_staff_read" on support_strategies for select
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "ss_teacher_insert" on support_strategies for insert
  with check (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "ss_teacher_update" on support_strategies for update
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "ss_admin_delete" on support_strategies for delete
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role in ('admin','full_admin','platform_admin')
  ));

-- ── 4. Learning Profiles ──────────────────────────────────────────────────

create table learning_profiles (
  id                    uuid          primary key default gen_random_uuid(),
  organization_id       uuid          not null references organizations(id) on delete cascade,
  student_id            uuid          not null references students(id) on delete cascade,

  learning_styles       text[]        not null default '{}',
  -- visual | auditory | reading_writing | hands_on | independent | collaborative
  strengths             text,
  interests             text,
  motivators            text,
  challenges            text,
  successful_strategies text,
  teacher_tips          text,

  created_at            timestamptz   not null default now(),
  updated_at            timestamptz   not null default now(),
  created_by            uuid          references profiles(id) on delete set null,
  last_updated_by       uuid          references profiles(id) on delete set null,

  unique(organization_id, student_id)
);

create trigger trg_learning_profiles_updated_at
  before update on learning_profiles
  for each row execute function handle_updated_at();

create index idx_lp_student on learning_profiles(organization_id, student_id);

alter table learning_profiles enable row level security;

create policy "lp_staff_read" on learning_profiles for select
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "lp_teacher_insert" on learning_profiles for insert
  with check (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "lp_teacher_update" on learning_profiles for update
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

-- ── 5. SSP Timeline (auto-generated, never manually edited) ──────────────

create table ssp_timeline (
  id              uuid          primary key default gen_random_uuid(),
  organization_id uuid          not null references organizations(id) on delete cascade,
  student_id      uuid          not null references students(id) on delete cascade,

  event_type      text          not null,
  -- family_vision_created | family_vision_updated | goal_added | goal_updated
  -- goal_completed | strategy_added | strategy_updated | learning_profile_updated
  -- review_completed
  title           text          not null,
  description     text,
  reference_id    uuid,
  reference_type  text,
  -- goal | strategy | family_vision | learning_profile

  created_at      timestamptz   not null default now(),
  created_by      uuid          references profiles(id) on delete set null
);

create index idx_ssp_timeline_student on ssp_timeline(organization_id, student_id, created_at desc);

alter table ssp_timeline enable row level security;

create policy "timeline_staff_read" on ssp_timeline for select
  using (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));

create policy "timeline_insert" on ssp_timeline for insert
  with check (organization_id in (
    select organization_id from organization_members
    where profile_id = auth.uid() and status = 'active'
      and role not in ('parent','student_future','volunteer')
  ));
