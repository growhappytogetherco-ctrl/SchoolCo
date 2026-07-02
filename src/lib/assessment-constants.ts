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
