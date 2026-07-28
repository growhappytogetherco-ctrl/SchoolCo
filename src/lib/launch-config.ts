// Launch readiness checklist definition — shared between server actions and UI

export const CHECKLIST_DEFINITION = [
  { key: "org_configured",         label: "Organization configured",         section: "Setup",      auto: true  },
  { key: "school_profile",         label: "School profile complete",          section: "Setup",      auto: true  },
  { key: "school_year_configured", label: "School year configured",           section: "Setup",      auto: false },
  { key: "logo_uploaded",          label: "Logo uploaded",                    section: "Setup",      auto: false },
  { key: "staff_imported",         label: "Staff imported",                   section: "Data",       auto: true  },
  { key: "families_imported",      label: "Families imported",                section: "Data",       auto: true  },
  { key: "students_imported",      label: "Students imported",                section: "Data",       auto: true  },
  { key: "guardian_relationships", label: "Guardian relationships verified",  section: "Data",       auto: true  },
  { key: "emergency_contacts",     label: "Emergency contacts completed",     section: "Data",       auto: false },
  { key: "medical_alerts",         label: "Medical alerts reviewed",          section: "Data",       auto: false },
  { key: "academic_calendar",      label: "Academic calendar loaded",         section: "Calendar",   auto: true  },
  { key: "planning_templates",     label: "Planning templates loaded",        section: "Calendar",   auto: true  },
  { key: "qr_badges_generated",   label: "QR badges generated",              section: "Attendance", auto: true  },
  { key: "attendance_tested",      label: "Attendance tested",                section: "Attendance", auto: false },
  { key: "messaging_tested",       label: "Messaging tested",                 section: "Comms",      auto: false },
  { key: "parent_portal_tested",   label: "Parent portal tested",             section: "Comms",      auto: false },
  { key: "security_audit",         label: "Security audit completed",         section: "Final",      auto: false },
  { key: "daily_ops_tested",       label: "Daily Operations tested",          section: "Final",      auto: false },
  { key: "health_passed",          label: "Administrator Health passed",      section: "Final",      auto: false },
  { key: "planning_tested",        label: "Planning Center tested",           section: "Final",      auto: false },
  { key: "backup_created",         label: "System backup created",            section: "Final",      auto: false },
] as const;

export type ChecklistKey = typeof CHECKLIST_DEFINITION[number]["key"];
