// Shared constants for teacher progress check-ins — importable by both server and client code.

export const CHECK_IN_TYPES = [
  "teacher_observation",
  "one_on_one_session",
  "intervention",
  "parent_follow_up",
  "behavior_academic",
  "skill_practice",
  "general",
] as const;
export type CheckInType = typeof CHECK_IN_TYPES[number];

export const CHECK_IN_TYPE_LABELS: Record<CheckInType, string> = {
  teacher_observation: "Teacher Observation",
  one_on_one_session:  "1:1 Session",
  intervention:        "Intervention",
  parent_follow_up:    "Parent Follow-up",
  behavior_academic:   "Behavior Affecting Academics",
  skill_practice:      "Skill Practice",
  general:             "General Academic Check-in",
};

export const CHECK_IN_TYPE_COLORS: Record<CheckInType, string> = {
  teacher_observation: "bg-sc-navy/5 text-sc-navy border-sc-navy/10",
  one_on_one_session:  "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",
  intervention:        "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200",
  parent_follow_up:    "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",
  behavior_academic:   "bg-sc-rose-100 text-sc-rose-800 border-sc-rose-300",
  skill_practice:      "bg-sc-teal-100 text-sc-teal-800 border-sc-teal-300",
  general:             "bg-sc-gray-100 text-sc-gray-600 border-sc-gray-200",
};

export const CONFIDENCE_LEVELS = [
  "very_low",
  "low",
  "moderate",
  "high",
  "very_high",
] as const;
export type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number];

export const CONFIDENCE_LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  very_low:  "Very Low",
  low:       "Low",
  moderate:  "Moderate",
  high:      "High",
  very_high: "Very High",
};

export const CONFIDENCE_LEVEL_COLORS: Record<ConfidenceLevel, string> = {
  very_low:  "bg-sc-rose-100 text-sc-rose-800 border-sc-rose-300",
  low:       "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200",
  moderate:  "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",
  high:      "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",
  very_high: "bg-sc-teal-100 text-sc-teal-800 border-sc-teal-300",
};

export const CHECK_IN_STATUSES = ["open", "in_progress", "completed"] as const;
export type CheckInStatus = typeof CHECK_IN_STATUSES[number];

export const CHECK_IN_STATUS_LABELS: Record<CheckInStatus, string> = {
  open:        "Open",
  in_progress: "In Progress",
  completed:   "Completed",
};

export const CHECK_IN_STATUS_COLORS: Record<CheckInStatus, string> = {
  open:        "bg-sc-gray-100 text-sc-gray-600 border-sc-gray-200",
  in_progress: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",
  completed:   "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",
};

// Default blank payload — kept here (NOT in 'use server') so client components
// can import without triggering Next.js server-action export violations.
export const BLANK_CHECKIN_PAYLOAD = {
  subject:                   "math",
  check_in_type:             null as CheckInType | null,
  recorded_date:             "",        // set at runtime: new Date().toISOString().split("T")[0]
  lesson_topic:              null as string | null,
  what_was_worked_on:        null as string | null,
  student_response:          null as string | null,
  progress_observed:         null as string | null,
  next_steps:                null as string | null,
  confidence_level:          null as ConfidenceLevel | null,
  parent_follow_up_required: false,
  parent_follow_up_notes:    null as string | null,
  curriculum_enrollment_id:  null as string | null,
  growth_goal_id:            null as string | null,
  assessment_id:             null as string | null,
  assigned_staff_id:         null as string | null,
  due_date:                  null as string | null,
  status:                    "open" as CheckInStatus,
};
