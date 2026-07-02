// Shared constants for progress history — importable by both server and client code.

export const CONFIDENCE_LEVELS = [
  "not_confident",
  "developing",
  "confident",
  "very_confident",
] as const;
export type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number];

export const CONFIDENCE_LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  not_confident:  "Not Confident",
  developing:     "Building Confidence",
  confident:      "Confident",
  very_confident: "Very Confident",
};

export const CONFIDENCE_LEVEL_COLORS: Record<ConfidenceLevel, string> = {
  not_confident:  "bg-sc-rose-100 text-sc-rose-800 border-sc-rose-300",
  developing:     "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",
  confident:      "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",
  very_confident: "bg-sc-teal-100 text-sc-teal-800 border-sc-teal-300",
};

export const OVERALL_STATUSES = [
  "on_track",
  "monitor",
  "needs_support",
  "not_started",
] as const;
export type OverallStatus = typeof OVERALL_STATUSES[number];

export const OVERALL_STATUS_LABELS: Record<OverallStatus, string> = {
  on_track:     "On Track",
  monitor:      "Monitor",
  needs_support:"Needs Support",
  not_started:  "Not Started",
};

export const OVERALL_STATUS_COLORS: Record<OverallStatus, string> = {
  on_track:     "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",
  monitor:      "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",
  needs_support:"bg-sc-rose-100 text-sc-rose-800 border-sc-rose-300",
  not_started:  "bg-sc-gray-100 text-sc-gray-600 border-sc-gray-200",
};

// Default blank payload — kept here (not in 'use server') so client components
// can import without triggering Next.js server-action validation errors.
export const BLANK_PROGRESS_PAYLOAD = {
  subject:                 "math",
  curriculum_enrollment_id: null as string | null,
  assessment_id:           null as string | null,
  growth_goal_id:          null as string | null,
  staff_member_id:         null as string | null,
  recorded_date:           "",   // set at runtime to today
  curriculum_name:         null as string | null,
  current_level:           null as string | null,
  current_lesson:          null as string | null,
  current_unit:            null as string | null,
  skill_or_topic:          null as string | null,
  mastery_pct:             null as number | null,
  confidence_level:        null as ConfidenceLevel | null,
  notes:                   null as string | null,
  next_steps:              null as string | null,
  parent_visible:          false,
};
