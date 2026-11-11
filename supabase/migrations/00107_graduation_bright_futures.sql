-- 00107_graduation_bright_futures.sql
-- Adds Bright Futures readiness tracking to graduation_plans
-- Florida Bright Futures Scholarship Program (s. 1009.534, F.S.)

-- Add Bright Futures fields to graduation_plans
alter table graduation_plans
  add column if not exists bright_futures_pathway text
    check (bright_futures_pathway in ('FAS', 'FMS', 'FOS', 'undecided', 'none')),
  add column if not exists bright_futures_data jsonb not null default '{}';

-- bright_futures_data shape (stored in JSONB for flexibility):
-- {
--   "service_hours_completed": 0,
--   "work_hours_completed": 0,
--   "sat_score": null,
--   "act_score": null,
--   "gpa_weighted": null,
--   "world_language_credits_completed": 0,
--   "is_home_education": false,
--   "notes": ""
-- }

comment on column graduation_plans.bright_futures_pathway is
  'Bright Futures scholarship pathway: FAS (Academic Scholars), FMS (Medallion Scholars), FOS (Opportunity Scholars), undecided, or none';

comment on column graduation_plans.bright_futures_data is
  'JSON object storing Bright Futures tracking data: service_hours, sat_score, act_score, gpa_weighted, world_language_credits, is_home_education, notes';
