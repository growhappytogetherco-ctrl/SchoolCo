-- Migration 00087: Fix over-restrictive students unique constraint
--
-- The original constraint unique(organization_id, first_name, last_name) prevents
-- two students with the same name but different dates of birth from enrolling in the
-- same org. This blocks legitimate cases such as same-name students transferred from
-- another school year, or a common name across unrelated families.
--
-- Replace with a constraint that includes date_of_birth. PostgreSQL treats NULL values
-- as distinct in unique indexes, so same-name students with a null DOB are also allowed
-- (the application layer handles those as possible_duplicate for admin review).

alter table students drop constraint if exists students_org_name_unique;

-- Case-insensitive unique index on (org, first, last, dob).
-- Two rows conflict only when all four values match (NULL DOBs are individually distinct).
create unique index if not exists students_org_name_dob_idx
  on students (organization_id, lower(first_name), lower(last_name), date_of_birth);
