/** Platform-level constants. Never hard-code organization names here. */

export const APP_NAME = "SchoolCo";
export const APP_TAGLINE =
  "Every Child Known. Every Family Connected. Every Leader Developed.";

// ── User Roles ────────────────────────────────────────────────────────────
// Ordered lowest → highest privilege.
// A user can hold different roles in different organizations simultaneously.

export const ROLES = {
  STUDENT_FUTURE: "student_future",
  PARENT:         "parent",
  VOLUNTEER:      "volunteer",
  TEACHER:        "teacher",
  STAFF:          "staff",
  REGISTRAR:      "registrar",
  ADMIN:          "admin",
  FULL_ADMIN:     "full_admin",
  PLATFORM_ADMIN: "platform_admin",
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_HIERARCHY: UserRole[] = [
  "student_future",
  "parent",
  "volunteer",
  "teacher",
  "staff",
  "registrar",
  "admin",
  "full_admin",
  "platform_admin",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  student_future: "Future Student",
  parent:         "Parent / Guardian",
  volunteer:      "Volunteer",
  teacher:        "Teacher",
  staff:          "Staff",
  registrar:      "Registrar",
  admin:          "Administrator",
  full_admin:     "Director",
  platform_admin: "Platform Admin",
};

export const STAFF_ROLES: UserRole[] = [
  "teacher", "staff", "registrar", "admin", "full_admin", "platform_admin",
];

export const ADMIN_ROLES: UserRole[] = [
  "admin", "full_admin", "platform_admin",
];

// ── Display ID Prefixes ───────────────────────────────────────────────────
// Used by next_org_display_id() in PostgreSQL to generate human-readable IDs.
// Format: {ORG_SHORT_NAME}-{PREFIX}{ZERO_PADDED_4_DIGIT_NUMBER}
// Example: RLA-S0001, RLA-F0001, RLA-H0001

export const DISPLAY_ID_PREFIXES = {
  FAMILY:          "F",
  HOUSEHOLD:       "H",
  STUDENT:         "S",
  PARENT:          "P",
  TEACHER:         "T",
  ADMIN:           "A",    // admin + full_admin + platform_admin
  VOLUNTEER:       "V",
  STAFF:           "ST",
  REGISTRAR:       "RG",
  STUDENT_FUTURE:  "SF",
} as const;

/** Returns the display ID prefix for an org member role */
export function getMemberIdPrefix(role: UserRole): string {
  switch (role) {
    case "parent":         return DISPLAY_ID_PREFIXES.PARENT;
    case "teacher":        return DISPLAY_ID_PREFIXES.TEACHER;
    case "admin":
    case "full_admin":
    case "platform_admin": return DISPLAY_ID_PREFIXES.ADMIN;
    case "volunteer":      return DISPLAY_ID_PREFIXES.VOLUNTEER;
    case "staff":          return DISPLAY_ID_PREFIXES.STAFF;
    case "registrar":      return DISPLAY_ID_PREFIXES.REGISTRAR;
    case "student_future": return DISPLAY_ID_PREFIXES.STUDENT_FUTURE;
    default:               return "M";
  }
}

// ── Navigation by Role ────────────────────────────────────────────────────
// Each role gets a distinct navigation set.

export const NAV_ITEMS_BY_ROLE: Record<UserRole, NavItem[]> = {
  platform_admin: [
    { label: "Dashboard",         href: "/dashboard/home",          icon: "LayoutDashboard" },
    { label: "Organizations",     href: "/dashboard/organizations", icon: "Building2" },
    { label: "All Users",         href: "/dashboard/users",         icon: "Users" },
    { label: "Audit Logs",        href: "/dashboard/audit",         icon: "ShieldCheck" },
    { label: "Platform Settings", href: "/dashboard/settings",      icon: "Settings" },
  ],
  full_admin: [
    { label: "Dashboard",         href: "/dashboard/home",           icon: "LayoutDashboard" },
    { label: "Students",          href: "/dashboard/students",       icon: "GraduationCap" },
    { label: "Families",          href: "/dashboard/families",       icon: "Home" },
    { label: "Attendance",        href: "/dashboard/attendance",     icon: "ClipboardCheck" },
    { label: "Staff",             href: "/dashboard/staff",          icon: "UserCheck" },
    { label: "Documents",         href: "/dashboard/documents",      icon: "FolderOpen" },
    { label: "Incident Reports",  href: "/dashboard/incidents",      icon: "AlertTriangle" },
    { label: "Leadership",        href: "/dashboard/leadership",     icon: "Award" },
    { label: "Entrepreneurship",  href: "/dashboard/entrepreneurship", icon: "Briefcase" },
    { label: "Reports",           href: "/dashboard/reports",        icon: "BarChart2" },
    { label: "Settings",          href: "/dashboard/settings",       icon: "Settings" },
  ],
  admin: [
    { label: "Dashboard",         href: "/dashboard/home",           icon: "LayoutDashboard" },
    { label: "Students",          href: "/dashboard/students",       icon: "GraduationCap" },
    { label: "Families",          href: "/dashboard/families",       icon: "Home" },
    { label: "Attendance",        href: "/dashboard/attendance",     icon: "ClipboardCheck" },
    { label: "Staff",             href: "/dashboard/staff",          icon: "UserCheck" },
    { label: "Documents",         href: "/dashboard/documents",      icon: "FolderOpen" },
    { label: "Incident Reports",  href: "/dashboard/incidents",      icon: "AlertTriangle" },
    { label: "Leadership",        href: "/dashboard/leadership",     icon: "Award" },
    { label: "Entrepreneurship",  href: "/dashboard/entrepreneurship", icon: "Briefcase" },
    { label: "Reports",           href: "/dashboard/reports",        icon: "BarChart2" },
    { label: "Settings",          href: "/dashboard/settings",       icon: "Settings" },
  ],
  registrar: [
    { label: "Dashboard",         href: "/dashboard/home",           icon: "LayoutDashboard" },
    { label: "Students",          href: "/dashboard/students",       icon: "GraduationCap" },
    { label: "Families",          href: "/dashboard/families",       icon: "Home" },
    { label: "Attendance",        href: "/dashboard/attendance",     icon: "ClipboardCheck" },
    { label: "Documents",         href: "/dashboard/documents",      icon: "FolderOpen" },
    { label: "Reports",           href: "/dashboard/reports",        icon: "BarChart2" },
  ],
  staff: [
    { label: "Dashboard",         href: "/dashboard/home",           icon: "LayoutDashboard" },
    { label: "Students",          href: "/dashboard/students",       icon: "GraduationCap" },
    { label: "Attendance",        href: "/dashboard/attendance",     icon: "ClipboardCheck" },
    { label: "Incident Reports",  href: "/dashboard/incidents",      icon: "AlertTriangle" },
  ],
  teacher: [
    { label: "Dashboard",         href: "/dashboard/home",           icon: "LayoutDashboard" },
    { label: "Students",          href: "/dashboard/students",       icon: "GraduationCap" },
    { label: "Attendance",        href: "/dashboard/attendance",     icon: "ClipboardCheck" },
    { label: "Incident Reports",  href: "/dashboard/incidents",      icon: "AlertTriangle" },
    { label: "Leadership",        href: "/dashboard/leadership",     icon: "Award" },
  ],
  volunteer: [
    { label: "Dashboard",  href: "/dashboard/home",     icon: "LayoutDashboard" },
    { label: "Schedule",   href: "/dashboard/schedule", icon: "Calendar" },
    { label: "Messages",   href: "/dashboard/comms",    icon: "MessageSquare" },
  ],
  parent: [
    { label: "Home",           href: "/dashboard/home",        icon: "Home" },
    { label: "My Children",    href: "/dashboard/children",    icon: "Heart" },
    { label: "Academics",      href: "/dashboard/academics",   icon: "BookOpen" },
    { label: "Attendance",     href: "/dashboard/attendance",  icon: "ClipboardCheck" },
    { label: "Communications", href: "/dashboard/comms",       icon: "MessageSquare" },
    { label: "School Life",    href: "/dashboard/school-life", icon: "Star" },
    { label: "Giving",         href: "/dashboard/giving",      icon: "Gift" },
  ],
  student_future: [
    { label: "Welcome",     href: "/dashboard/home",       icon: "Home" },
    { label: "My Profile",  href: "/dashboard/profile",    icon: "User" },
    { label: "Enrollment",  href: "/dashboard/enrollment", icon: "ClipboardList" },
    { label: "Messages",    href: "/dashboard/comms",      icon: "MessageSquare" },
  ],
};

export interface NavItem {
  label:  string;
  href:   string;
  icon:   string;
  badge?: string | number;
}

// ── Organization Types ────────────────────────────────────────────────────

export const ORG_TYPES = {
  ACADEMY:    "academy",
  FOUNDATION: "foundation",
  PROGRAM:    "program",
  OUTREACH:   "outreach",
  CHURCH:     "church",
  TUTORING:   "tutoring",
  OTHER:      "other",
} as const;

export type OrgType = (typeof ORG_TYPES)[keyof typeof ORG_TYPES];

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  academy:    "Academy / Co-op",
  foundation: "Foundation",
  program:    "Program",
  outreach:   "Outreach",
  church:     "Church School",
  tutoring:   "Tutoring Center",
  other:      "Other",
};

// ── Membership Status ─────────────────────────────────────────────────────

export const MEMBERSHIP_STATUS = {
  INVITED:   "invited",
  ACTIVE:    "active",
  SUSPENDED: "suspended",
  REMOVED:   "removed",
} as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[keyof typeof MEMBERSHIP_STATUS];

// ── Relationship Types ────────────────────────────────────────────────────

export const RELATIONSHIP_TYPES = {
  MOTHER:         "mother",
  FATHER:         "father",
  STEPMOTHER:     "stepmother",
  STEPFATHER:     "stepfather",
  GRANDMOTHER:    "grandmother",
  GRANDFATHER:    "grandfather",
  AUNT:           "aunt",
  UNCLE:          "uncle",
  FOSTER_PARENT:  "foster_parent",
  LEGAL_GUARDIAN: "legal_guardian",
  OTHER:          "other",
} as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[keyof typeof RELATIONSHIP_TYPES];

export const RELATIONSHIP_LABELS: Record<RelationshipType, string> = {
  mother:         "Mother",
  father:         "Father",
  stepmother:     "Stepmother",
  stepfather:     "Stepfather",
  grandmother:    "Grandmother",
  grandfather:    "Grandfather",
  aunt:           "Aunt",
  uncle:          "Uncle",
  foster_parent:  "Foster Parent",
  legal_guardian: "Legal Guardian",
  other:          "Other",
};

// ── Custody Types ─────────────────────────────────────────────────────────

export const CUSTODY_TYPES = {
  PRIMARY:    "primary",
  JOINT:      "joint",
  SECONDARY:  "secondary",
  SUPERVISED: "supervised",
  NONE:       "none",
} as const;

export type CustodyType = (typeof CUSTODY_TYPES)[keyof typeof CUSTODY_TYPES];

export const CUSTODY_LABELS: Record<CustodyType, string> = {
  primary:    "Primary Custody",
  joint:      "Joint Custody",
  secondary:  "Secondary / Visitation",
  supervised: "Supervised Visitation",
  none:       "No Custody (Emergency Contact Only)",
};

/** Returns true if this custody type requires a staff alert at pickup */
export function requiresSupervisionAlert(custody: CustodyType): boolean {
  return custody === "supervised" || custody === "none";
}

// ── Enrollment Status ─────────────────────────────────────────────────────

export const ENROLLMENT_STATUSES = {
  APPLICANT:  "applicant",
  WAITLISTED: "waitlisted",
  ENROLLED:   "enrolled",
  WITHDRAWN:  "withdrawn",
  GRADUATED:  "graduated",
  EXPELLED:   "expelled",
} as const;

export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[keyof typeof ENROLLMENT_STATUSES];

export const ENROLLMENT_LABELS: Record<EnrollmentStatus, string> = {
  applicant:  "Applicant",
  waitlisted: "Waitlisted",
  enrolled:   "Enrolled",
  withdrawn:  "Withdrawn",
  graduated:  "Graduated",
  expelled:   "Expelled",
};

// ── AI Restrictions ───────────────────────────────────────────────────────
// AI may suggest / draft / summarize but must NEVER autonomously execute these.

export const AI_RESTRICTED_ACTIONS = [
  "approve_incident",
  "modify_attendance",
  "change_medical_record",
  "grant_permission",
  "delete_record",
  "send_sensitive_communication",
] as const;

export type AiRestrictedAction = (typeof AI_RESTRICTED_ACTIONS)[number];
