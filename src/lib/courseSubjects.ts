// Shared subject list for Add Course and Edit Course forms.
// Values flow to course_sections.subject and, on finalization, to
// student_course_records.subject_area. All values must have entries in
// SUBJECT_AREA_TO_CATEGORY (graduationPlan.ts), DEPT_LABEL (transcript.ts),
// and SUBJECT_LABEL (TranscriptDocument.tsx) before being added here.
export const COURSE_SUBJECTS: { value: string; label: string }[] = [
  { value: "art",              label: "Art" },
  { value: "bible",            label: "Bible" },
  { value: "ela",              label: "ELA (English Language Arts)" },
  { value: "elective",         label: "Elective" },
  { value: "entrepreneurship", label: "Entrepreneurship" },
  { value: "geography",        label: "Geography" },
  { value: "history",          label: "History" },
  { value: "leadership",       label: "Leadership" },
  { value: "math",             label: "Math" },
  { value: "music",            label: "Music" },
  { value: "pe",               label: "PE (Physical Education)" },
  { value: "personal_finance", label: "Personal Financial Literacy" },
  { value: "science",          label: "Science" },
  { value: "spanish",          label: "Spanish" },
  { value: "stem",             label: "STEM" },
  { value: "other",            label: "Other" },
];
