-- Guardian contacts may not have email addresses. Allow null email on profiles.
-- The unique constraint is retained; Postgres treats NULLs as distinct in unique indexes,
-- so multiple email-less guardian stubs can coexist.
alter table profiles
  alter column email drop not null;
