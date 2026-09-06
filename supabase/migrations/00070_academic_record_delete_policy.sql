-- ============================================================
-- Migration 00070 — Add DELETE policy for student_documents
-- SchoolCo Platform
-- ============================================================
-- The existing RLS policies on student_documents cover SELECT,
-- INSERT, and UPDATE for is_staff_or_above. This migration adds
-- the DELETE policy so staff can remove academic records through
-- the session client.
-- ============================================================

drop policy if exists "staff_delete_student_docs" on student_documents;

create policy "staff_delete_student_docs"
  on student_documents for delete
  using (is_staff_or_above(organization_id));
