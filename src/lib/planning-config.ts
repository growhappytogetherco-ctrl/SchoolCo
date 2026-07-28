import type { EventCategory, EventVisibility, TaskStatus, TaskPriority } from "@/app/actions/planning";

export const EVENT_CATEGORY_CONFIG: Record<EventCategory, {
  label: string;
  color: string;
  textColor: string;
  borderColor: string;
  icon: string;
  defaultVisibility: EventVisibility;
}> = {
  school_day:        { label: "School Day",        color: "bg-sc-teal/20",      textColor: "text-sc-teal",      borderColor: "border-sc-teal/40",      icon: "GraduationCap",  defaultVisibility: "school_wide" },
  holiday:           { label: "Holiday",           color: "bg-sc-gold-50",      textColor: "text-sc-gold-700",  borderColor: "border-sc-gold-300",     icon: "Star",           defaultVisibility: "school_wide" },
  no_school:         { label: "No School",         color: "bg-sc-rose-50",      textColor: "text-sc-rose",      borderColor: "border-sc-rose-200",     icon: "XCircle",        defaultVisibility: "school_wide" },
  quarter_begins:    { label: "Quarter Begins",    color: "bg-emerald-50",      textColor: "text-emerald-700",  borderColor: "border-emerald-200",     icon: "PlayCircle",     defaultVisibility: "school_wide" },
  quarter_ends:      { label: "Quarter Ends",      color: "bg-orange-50",       textColor: "text-orange-700",   borderColor: "border-orange-200",      icon: "StopCircle",     defaultVisibility: "school_wide" },
  semester_begins:   { label: "Semester Begins",   color: "bg-emerald-50",      textColor: "text-emerald-700",  borderColor: "border-emerald-200",     icon: "PlayCircle",     defaultVisibility: "school_wide" },
  semester_ends:     { label: "Semester Ends",     color: "bg-orange-50",       textColor: "text-orange-700",   borderColor: "border-orange-200",      icon: "StopCircle",     defaultVisibility: "school_wide" },
  testing:           { label: "Testing",           color: "bg-purple-50",       textColor: "text-purple-700",   borderColor: "border-purple-200",      icon: "ClipboardList",  defaultVisibility: "school_wide" },
  leadership:        { label: "Leadership",        color: "bg-sc-navy/10",      textColor: "text-sc-navy",      borderColor: "border-sc-navy/30",      icon: "Award",          defaultVisibility: "school_wide" },
  entrepreneurship:  { label: "Entrepreneurship",  color: "bg-sc-gold-50",      textColor: "text-sc-gold-700",  borderColor: "border-sc-gold-300",     icon: "Zap",            defaultVisibility: "school_wide" },
  bible:             { label: "Bible",             color: "bg-violet-50",       textColor: "text-violet-700",   borderColor: "border-violet-200",      icon: "BookOpen",       defaultVisibility: "school_wide" },
  community_service: { label: "Community Service", color: "bg-green-50",        textColor: "text-green-700",    borderColor: "border-green-200",       icon: "Heart",          defaultVisibility: "school_wide" },
  field_trip:        { label: "Field Trip",        color: "bg-cyan-50",         textColor: "text-cyan-700",     borderColor: "border-cyan-200",        icon: "Bus",            defaultVisibility: "parents" },
  parent_meeting:    { label: "Parent Meeting",    color: "bg-indigo-50",       textColor: "text-indigo-700",   borderColor: "border-indigo-200",      icon: "Users",          defaultVisibility: "parents" },
  open_house:        { label: "Open House",        color: "bg-teal-50",         textColor: "text-teal-700",     borderColor: "border-teal-200",        icon: "Home",           defaultVisibility: "parents" },
  discovery_day:     { label: "Discovery Day",     color: "bg-amber-50",        textColor: "text-amber-700",    borderColor: "border-amber-200",       icon: "Compass",        defaultVisibility: "parents" },
  guest_speaker:     { label: "Guest Speaker",     color: "bg-pink-50",         textColor: "text-pink-700",     borderColor: "border-pink-200",        icon: "Mic",            defaultVisibility: "school_wide" },
  fundraiser:        { label: "Fundraiser",        color: "bg-yellow-50",       textColor: "text-yellow-700",   borderColor: "border-yellow-200",      icon: "Gift",           defaultVisibility: "parents" },
  volunteer_event:   { label: "Volunteer Event",   color: "bg-lime-50",         textColor: "text-lime-700",     borderColor: "border-lime-200",        icon: "Heart",          defaultVisibility: "parents" },
  graduation:        { label: "Graduation",        color: "bg-sc-gold-50",      textColor: "text-sc-gold-700",  borderColor: "border-sc-gold-300",     icon: "GraduationCap",  defaultVisibility: "school_wide" },
  medical:           { label: "Medical",           color: "bg-sc-rose-50",      textColor: "text-sc-rose",      borderColor: "border-sc-rose-200",     icon: "AlertCircle",    defaultVisibility: "staff_only" },
  sports:            { label: "Sports / PE",       color: "bg-sky-50",          textColor: "text-sky-700",      borderColor: "border-sky-200",         icon: "Activity",       defaultVisibility: "school_wide" },
  club:              { label: "Club",              color: "bg-fuchsia-50",      textColor: "text-fuchsia-700",  borderColor: "border-fuchsia-200",     icon: "Star",           defaultVisibility: "school_wide" },
  other:             { label: "Other",             color: "bg-sc-gray-100",     textColor: "text-sc-gray",      borderColor: "border-sc-gray-200",     icon: "Calendar",       defaultVisibility: "school_wide" },
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting: "Waiting",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const VISIBILITY_LABELS: Record<EventVisibility, string> = {
  school_wide: "School Wide",
  parents: "Parents",
  staff_only: "Staff Only",
  specific_grade: "Specific Grade",
  specific_student: "Specific Student",
  specific_family: "Specific Family",
  leadership_students: "Leadership Students",
  entrepreneurship_students: "Entrepreneurship Students",
  admin_private: "Admin Private",
};

export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "bg-sc-gray-100 text-sc-gray",
  normal: "bg-blue-50 text-blue-700",
  high: "bg-sc-gold-50 text-sc-gold-700",
  urgent: "bg-sc-rose-50 text-sc-rose",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  not_started: "bg-sc-gray-100 text-sc-gray",
  in_progress: "bg-blue-50 text-blue-700",
  waiting: "bg-amber-50 text-amber-700",
  blocked: "bg-sc-rose-50 text-sc-rose",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-sc-gray-100 text-sc-gray line-through",
};
