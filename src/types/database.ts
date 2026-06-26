/**
 * SchoolCo database type definitions.
 * These mirror the Supabase schema exactly.
 *
 * SOURCE OF TRUTH: UserRole, MembershipStatus, OrgType, RelationshipType,
 * CustodyType, EnrollmentStatus are defined in src/lib/constants.ts
 * and re-exported here to keep a single source of truth.
 *
 * When Supabase CLI is configured, run `supabase gen types typescript`
 * to regenerate this file from the live schema.
 */

// Re-export from constants (single source of truth)
export type {
  UserRole,
  MembershipStatus,
  OrgType,
  RelationshipType,
  CustodyType,
  EnrollmentStatus,
} from "@/lib/constants";

import type {
  UserRole,
  MembershipStatus,
  OrgType,
  RelationshipType,
  CustodyType,
  EnrollmentStatus,
} from "@/lib/constants";

// ── Standard Column Pattern ───────────────────────────────────────────────
// All operational tables include these columns.

export interface StandardColumns {
  id:              string;
  organization_id: string;
  created_at:      string;
  created_by:      string | null;
  updated_at:      string;
  updated_by:      string | null;
  status:          string;         // "active" | table-specific values
  archived_at:     string | null;  // Soft-delete timestamp. Null = active record.
  archived_by:     string | null;
}

// ── Organizations ─────────────────────────────────────────────────────────

export interface Organization {
  id:                string;
  name:              string;
  short_name:        string | null;
  slug:              string;
  organization_type: OrgType | null;
  tagline:           string | null;
  logo_url:          string | null;
  primary_color:     string | null;
  secondary_color:   string | null;
  accent_color:      string | null;
  phone:             string | null;
  email:             string | null;
  website:           string | null;
  address:           OrgAddress | null;
  timezone:          string;
  theme_json:        OrgTheme | null;
  settings_json:     OrgSettings | null;
  is_active:         boolean;
  created_at:        string;
  updated_at:        string;
}

export interface OrgAddress {
  street1?: string;
  street2?: string;
  city?:    string;
  state?:   string;
  zip?:     string;
  country?: string;
}

export interface OrgTheme {
  primary_color?:   string;
  secondary_color?: string;
  accent_color?:    string;
  font_heading?:    string;
  font_body?:       string;
  logo_url?:        string;
  favicon_url?:     string;
  [key: string]:    string | undefined;
}

export interface OrgSettings {
  features?: {
    attendance?:     boolean;
    grades?:         boolean;
    communications?: boolean;
    giving?:         boolean;
    badge_studio?:   boolean;
    qr_checkin?:     boolean;
    ai_assist?:      boolean;
  };
  enrollment?: {
    require_approval?: boolean;
    open_enrollment?:  boolean;
    max_students?:     number;
  };
  [key: string]: unknown;
}

// ── Profiles ──────────────────────────────────────────────────────────────

export interface Profile {
  id:         string;   // Matches auth.users.id exactly
  email:      string;
  full_name:  string;
  avatar_url: string | null;
  phone:      string | null;
  created_at: string;
  updated_at: string;
}

// ── Organization Members ──────────────────────────────────────────────────

export interface OrganizationMember {
  id:              string;
  organization_id: string;
  profile_id:      string;
  role:            UserRole;
  status:          MembershipStatus;
  display_id:      string | null;  // e.g. "RLA-P0001", "RLA-T0001" — auto-generated
  invited_by:      string | null;
  joined_at:       string | null;
  created_at:      string;
  updated_at:      string;
}

// ── Families ──────────────────────────────────────────────────────────────

export interface Family extends StandardColumns {
  family_display_id:  string | null;  // "RLA-F0001" — auto-generated on insert
  family_name:        string;          // "The Thompson Family"
  notes:              string | null;   // Staff-only. Never exposed to parent sessions.
  is_split_household: boolean;         // true = multiple households with different addresses
}

// ── Households ────────────────────────────────────────────────────────────

export interface HouseholdAddress {
  street1?:  string;
  street2?:  string;
  city?:     string;
  state?:    string;
  zip?:      string;
  country?:  string;
}

export interface Household extends StandardColumns {
  household_display_id: string | null;   // "RLA-H0001" — auto-generated on insert
  family_id:            string;           // FK → families
  household_label:      string;           // "Thompson Family – Primary"
  sort_order:           number;           // 1 = primary, 2 = secondary
  address_json:         HouseholdAddress | null;
  phone:                string | null;
  email:                string | null;
}

// ── Students ──────────────────────────────────────────────────────────────

export interface Student extends StandardColumns {
  student_display_id:  string | null;   // "RLA-S0001" — auto-generated on insert
  family_id:           string | null;   // FK → families
  first_name:          string;
  last_name:           string;
  preferred_name:      string | null;   // Nickname shown in UI
  grade_level:         string | null;   // "K", "1st", "7th" — flexible text
  enrollment_status:   EnrollmentStatus;
  enrollment_date:     string | null;
  expected_graduation: string | null;
  track:               string | null;   // "classical", "entrepreneurship"
  homeroom_teacher:    string | null;   // FK → profiles
}

// ── Guardian Visibility ───────────────────────────────────────────────────

export interface GuardianVisibility {
  academics:      boolean;
  attendance:     boolean;
  report_cards:   boolean;
  communications: boolean;
  health_records: boolean;
  incidents:      boolean;
  behavior_notes: boolean;
}

export interface GuardianCommunication {
  channels: {
    email:  boolean;
    sms:    boolean;
    in_app: boolean;
    push:   boolean;
  };
  receive: {
    attendance_alerts:       boolean;
    grade_reports:           boolean;
    announcements:           boolean;
    incident_notifications:  boolean;
    direct_messages:         boolean;
    payment_reminders:       boolean;
  };
  quiet_hours: {
    enabled:    boolean;
    start_time: string | null;
    end_time:   string | null;
  };
  preferred_language: string;
}

// ── Guardianships ─────────────────────────────────────────────────────────

export interface Guardianship extends StandardColumns {
  profile_id:              string;                // FK → profiles (the guardian)
  student_id:              string;                // FK → students
  household_id:            string | null;         // FK → households
  relationship_type:       RelationshipType;
  household_label:         string | null;         // Denormalized label for display
  custody_type:            CustodyType;
  is_legal_guardian:       boolean;
  court_order_on_file:     boolean;
  court_order_notes:       string | null;         // Staff-only — never in parent responses
  is_primary_contact:      boolean;
  is_emergency_contact:    boolean;
  emergency_contact_order: number | null;
  can_pickup:              boolean;
  pickup_restrictions:     string | null;
  visibility_json:         GuardianVisibility;
  communication_json:      GuardianCommunication;
}

// ── Timeline Entries ──────────────────────────────────────────────────────

export type TimelineEntryType =
  | "enrollment"
  | "grade_transition"
  | "track_change"
  | "report_card_published"
  | "badge_earned"
  | "service_milestone"
  | "business_milestone"
  | "attendance_milestone"
  | "character_recognition"
  | "staff_note_shared"
  | "announcement"
  | "communication_sent"
  | "incident_resolved"
  | "guardian_linked"
  | "ai_summary"
  | "celebration"
  | "custom";

export interface TimelineEntry {
  id:                    string;
  organization_id:       string;
  student_id:            string | null;
  family_id:             string | null;
  entry_type:            TimelineEntryType;
  title:                 string;
  body:                  string | null;
  icon:                  string | null;
  color_key:             string;
  source_event_name:     string | null;
  source_resource_type:  string | null;
  source_resource_id:    string | null;
  staff_only:            boolean;
  requires_approval:     boolean;
  approved_by:           string | null;
  approved_at:           string | null;
  hidden_at:             string | null;
  hidden_by:             string | null;
  ai_generated:          boolean;
  ai_reviewed:           boolean;
  ai_reviewed_by:        string | null;
  is_celebration:        boolean;
  org_wide_shared:       boolean;
  org_wide_shared_at:    string | null;
  metadata:              Record<string, unknown> | null;
  occurred_at:           string;
  created_at:            string;
  created_by:            string | null;
  updated_at:            string;
  updated_by:            string | null;
}

// ── Audit Logs ────────────────────────────────────────────────────────────

export interface AuditLog {
  id:              string;
  organization_id: string | null;
  actor_id:        string;
  action:          string;
  entity_type:     string | null;
  entity_id:       string | null;
  previous_values: Record<string, unknown> | null;
  new_values:      Record<string, unknown> | null;
  ip_address:      string | null;
  user_agent:      string | null;
  device:          string | null;
  session_id:      string | null;
  created_at:      string;
}

// ── Joined / View Types ───────────────────────────────────────────────────

export interface ProfileWithMembership extends Profile {
  membership: OrganizationMember;
}

export interface OrganizationWithRole extends Organization {
  viewer_role:   UserRole;
  viewer_status: MembershipStatus;
}

export interface StudentWithFamily extends Student {
  family: Family | null;
}

export interface GuardianshipWithProfile extends Guardianship {
  profile: Profile;
}

export interface FamilyWithHouseholds extends Family {
  households:   Household[];
  student_count: number;
}

// ── Supabase Database Shape ───────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row:    Organization;
        Insert: Omit<Organization, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Organization, "id" | "created_at">>;
      };
      profiles: {
        Row:    Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id" | "created_at">>;
      };
      organization_members: {
        Row:    OrganizationMember;
        Insert: Omit<OrganizationMember, "id" | "created_at" | "updated_at" | "display_id">;
        Update: Partial<Omit<OrganizationMember, "id" | "created_at" | "display_id">>;
      };
      families: {
        Row:    Family;
        Insert: Omit<Family, "id" | "created_at" | "updated_at" | "family_display_id">;
        Update: Partial<Omit<Family, "id" | "created_at" | "family_display_id">>;
      };
      households: {
        Row:    Household;
        Insert: Omit<Household, "id" | "created_at" | "updated_at" | "household_display_id">;
        Update: Partial<Omit<Household, "id" | "created_at" | "household_display_id">>;
      };
      students: {
        Row:    Student;
        Insert: Omit<Student, "id" | "created_at" | "updated_at" | "student_display_id">;
        Update: Partial<Omit<Student, "id" | "created_at" | "student_display_id">>;
      };
      guardianships: {
        Row:    Guardianship;
        Insert: Omit<Guardianship, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Guardianship, "id" | "created_at">>;
      };
      audit_logs: {
        Row:    AuditLog;
        Insert: Omit<AuditLog, "id" | "created_at">;
        Update: never;   // Audit logs are append-only — no updates ever
      };
      timeline_entries: {
        Row:    TimelineEntry;
        Insert: Omit<TimelineEntry, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<TimelineEntry, "id" | "created_at">>;
      };
    };
    Views:     Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      user_role:         UserRole;
      membership_status: MembershipStatus;
      relationship_type: RelationshipType;
      custody_type:      CustodyType;
      enrollment_status: EnrollmentStatus;
    };
  };
}
