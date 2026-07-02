// Shared constants for assessments — importable by both server and client code.

export const ASSESSMENT_PERIODS = [
  "boy", "moy", "eoy", "placement", "progress_check", "unit_assessment", "additional",
] as const;
export type AssessmentPeriod = typeof ASSESSMENT_PERIODS[number];

export const ASSESSMENT_PERIOD_LABELS: Record<AssessmentPeriod, string> = {
  boy:              "Beginning of Year",
  moy:              "Middle of Year",
  eoy:              "End of Year",
  placement:        "Placement",
  progress_check:   "Progress Check",
  unit_assessment:  "Unit Assessment",
  additional:       "Additional",
};

export const ASSESSMENT_PERIOD_SHORT: Record<AssessmentPeriod, string> = {
  boy:              "BOY",
  moy:              "MOY",
  eoy:              "EOY",
  placement:        "Placement",
  progress_check:   "Progress",
  unit_assessment:  "Unit",
  additional:       "Additional",
};

export const ASSESSMENT_TYPES = [
  "placement_test", "benchmark", "curriculum_test", "unit_test", "quiz",
  "reading_fluency", "math_facts", "writing_sample", "teacher_observation",
  "project_rubric", "oral_presentation", "custom",
] as const;
export type AssessmentType = typeof ASSESSMENT_TYPES[number];

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  placement_test:     "Placement Test",
  benchmark:          "Benchmark",
  curriculum_test:    "Curriculum Test",
  unit_test:          "Unit Test",
  quiz:               "Quiz",
  reading_fluency:    "Reading Fluency",
  math_facts:         "Math Facts",
  writing_sample:     "Writing Sample",
  teacher_observation:"Teacher Observation",
  project_rubric:     "Project Rubric",
  oral_presentation:  "Oral Presentation",
  custom:             "Custom",
};

export const PERFORMANCE_LEVELS = [
  "not_yet_assessed",
  "needs_intensive_support",
  "needs_support",
  "developing",
  "on_track",
  "above_expectations",
  "mastered",
] as const;
export type PerformanceLevel = typeof PERFORMANCE_LEVELS[number];

export const PERFORMANCE_LEVEL_LABELS: Record<PerformanceLevel, string> = {
  not_yet_assessed:       "Not Yet Assessed",
  needs_intensive_support:"Needs Intensive Support",
  needs_support:          "Needs Support",
  developing:             "Developing",
  on_track:               "On Track",
  above_expectations:     "Above Expectations",
  mastered:               "Mastered",
};

export const PERFORMANCE_LEVEL_COLORS: Record<PerformanceLevel, string> = {
  not_yet_assessed:       "bg-sc-gray-100 text-sc-gray-600 border-sc-gray-200",
  needs_intensive_support:"bg-sc-rose-100 text-sc-rose-800 border-sc-rose-300",
  needs_support:          "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200",
  developing:             "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",
  on_track:               "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",
  above_expectations:     "bg-sc-teal-100 text-sc-teal-800 border-sc-teal-300",
  mastered:               "bg-sc-navy/10 text-sc-navy border-sc-navy/20",
};

// Default blank payload for new assessment forms — kept here (not in 'use server')
// so client components can import it without triggering Next.js server-action errors.
export const BLANK_ASSESSMENT_PAYLOAD = {
  subject:                  "math",
  assessment_name:          "",
  assessment_type:          null as string | null,
  assessment_period:        "additional",
  administered_at:          "",   // set at runtime: new Date().toISOString().split("T")[0]
  staff_member_id:          null as string | null,
  staff_name:               null as string | null,
  curriculum_enrollment_id: null as string | null,
  growth_goal_id:           null as string | null,
  score_raw:                null as number | null,
  score_max:                null as number | null,
  score_pct:                null as number | null,
  performance_level:        null as string | null,
  grade_equivalent:         null as string | null,
  placement_level:          null as string | null,
  percentile_rank:          null as number | null,
  stanine:                  null as number | null,
  fluency_wpm:              null as number | null,
  accuracy_percent:         null as number | null,
  mastery_percent:          null as number | null,
  notes:                    null as string | null,
  staff_interpretation:     null as string | null,
  recommended_next_steps:   null as string | null,
  parent_visible:           false,
  attachment_url:           null as string | null,
};
