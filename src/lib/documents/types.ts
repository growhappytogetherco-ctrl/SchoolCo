// Shared document types and label maps.
// This file must NOT have "use server" — it is imported by both
// server actions and client components.

export type AcademicRecordType =
  | "progress_report"
  | "report_card"
  | "transcript"
  | "academic_achievement_record"
  | "academic_summary"
  | "assessment_report"
  | "other_academic";

export type AcademicReportingPeriod =
  | "q1" | "q2" | "q3" | "q4"
  | "semester_1" | "semester_2"
  | "full_year" | "mid_year" | "beginning_of_year" | "end_of_year"
  | "other";

// DB constraint values: legacy_upload | schoolco_generated | external_school
// UI labels map these to user-facing concepts without changing stored values.
export type AcademicRecordSource =
  | "external_school"    // Previous School / Program
  | "legacy_upload"      // RLA Historical Record
  | "schoolco_generated"; // SchoolCo Generated

export const ACADEMIC_RECORD_TYPE_LABELS: Record<AcademicRecordType, string> = {
  progress_report:             "Progress Report",
  report_card:                 "Report Card",
  transcript:                  "Transcript",
  academic_achievement_record: "Academic Achievement Record",
  academic_summary:            "Academic Summary",
  assessment_report:           "Assessment Report",
  other_academic:              "Other Academic Record",
};

export const ACADEMIC_REPORTING_PERIOD_LABELS: Record<AcademicReportingPeriod, string> = {
  q1:               "Q1",
  q2:               "Q2",
  q3:               "Q3",
  q4:               "Q4",
  semester_1:       "Semester 1",
  semester_2:       "Semester 2",
  full_year:        "Full Year",
  mid_year:         "Mid-Year",
  beginning_of_year:"Beginning of Year",
  end_of_year:      "End of Year",
  other:            "Other",
};

export const ACADEMIC_RECORD_SOURCE_LABELS: Record<AcademicRecordSource, string> = {
  external_school:    "Previous School / Program",
  legacy_upload:      "RLA Historical Record",
  schoolco_generated: "SchoolCo Generated",
};

export const ACADEMIC_RECORD_TYPES: AcademicRecordType[] = [
  "progress_report",
  "report_card",
  "transcript",
  "academic_achievement_record",
  "academic_summary",
  "assessment_report",
  "other_academic",
];

export const ACADEMIC_REPORTING_PERIODS: AcademicReportingPeriod[] = [
  "q1", "q2", "q3", "q4",
  "semester_1", "semester_2",
  "full_year", "mid_year", "beginning_of_year", "end_of_year",
  "other",
];

export const ACADEMIC_SOURCE_OPTIONS: { value: AcademicRecordSource; label: string }[] = [
  { value: "external_school",    label: "Previous School / Program" },
  { value: "legacy_upload",      label: "RLA Historical Record"     },
  { value: "schoolco_generated", label: "SchoolCo Generated"        },
];
