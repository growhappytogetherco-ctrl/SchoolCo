-- Add teaching_strategy column to intervention_sessions (omitted from original spec)
alter table intervention_sessions
  add column if not exists teaching_strategy text;
