-- Stage C1 refinement: add import_notes column to student_course_records
-- import_notes: AI normalization/interpretation notes (staff-only, not shown in official record)
-- source_notes: source-reported information that belongs with the academic record

alter table student_course_records
  add column if not exists import_notes text default null;

comment on column student_course_records.import_notes is
  'AI normalization/interpretation notes for staff review. Not shown in the official Academic Achievement Record or to parents.';
