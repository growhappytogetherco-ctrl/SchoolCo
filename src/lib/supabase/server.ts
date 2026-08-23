import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import type { TimelineEntry } from "@/types/database";
export { getActiveOrgId, getActiveRole } from "./org-context";

/**
 * Server-side Supabase client.
 * Use this in Server Components, Route Handlers, and Server Actions.
 * Never import this in client components — use src/lib/supabase/client.ts instead.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookie setting is expected to fail here.
            // Actual cookie writing happens in middleware.
          }
        },
      },
    }
  );
}

// ── Auth Helpers ──────────────────────────────────────────────────────────

/**
 * Returns the currently authenticated Supabase user, or null if unauthenticated.
 * Always call this first in server components that touch user data.
 */
export async function getUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Returns the profile row for the given user ID, or null if not found.
 */
export async function getProfile(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) return null;
  return data;
}

/**
 * Returns all active organization memberships for the given user,
 * joined with organization data. Used by the mission switcher.
 */
export async function getUserOrganizations(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select(`
      role,
      status,
      display_id,
      organizations (
        id, name, slug, short_name, tagline,
        logo_url, primary_color, is_active
      )
    `)
    .eq("profile_id", userId)
    .eq("status", "active");

  if (error) return [];
  return data ?? [];
}

// ── Organization Helpers ──────────────────────────────────────────────────

/**
 * Returns the active org membership row for the current user in a given org.
 * Used in server actions to verify role before mutations.
 */
export async function getOrgMembership(userId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("*")
    .eq("profile_id", userId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  if (error) return null;
  return data;
}

/**
 * Returns org-level aggregate stats for the dashboard home page.
 * Only counts active (non-archived) records.
 */
export async function getOrgStats(orgId: string) {
  const supabase = await createClient();

  const [membersResult, studentsResult, familiesResult] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active"),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("enrollment_status", "enrolled")
      .is("archived_at", null),
    supabase
      .from("families")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("archived_at", null),
  ]);

  return {
    memberCount:  membersResult.count  ?? 0,
    studentCount: studentsResult.count ?? 0,
    familyCount:  familiesResult.count ?? 0,
  };
}

// ── Student Helpers ───────────────────────────────────────────────────────

/**
 * Returns a paginated list of enrolled students for an org.
 * Includes family name and student display ID.
 * Only accessible to staff+ (enforced by RLS).
 */
export async function getStudents(
  orgId: string,
  options: { limit?: number; offset?: number; search?: string; enrollmentStatuses?: string[] } = {}
) {
  const { limit = 50, offset = 0, search, enrollmentStatuses } = options;
  const supabase = await createClient();

  let query = supabase
    .from("students")
    .select(`
      id, student_display_id, first_name, last_name, preferred_name,
      grade_level, enrollment_status, track, created_at,
      families ( family_name, family_display_id, is_split_household )
    `)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("last_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (enrollmentStatuses === undefined) {
    query = query.eq("enrollment_status", "enrolled");
  } else if (enrollmentStatuses.length > 0) {
    query = query.in("enrollment_status", enrollmentStatuses);
  }
  // empty array = no filter = show all statuses

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_display_id.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

/**
 * Returns a single student by ID with family, household, and guardian data.
 */
export async function getStudentById(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .select(`
      *,
      families (
        id, family_name, family_display_id, is_split_household,
        households ( id, household_label, household_display_id, address_json, phone, email, sort_order )
      ),
      guardianships (
        id, relationship_type, custody_type, is_legal_guardian,
        is_primary_contact, is_emergency_contact, emergency_contact_order,
        can_pickup, pickup_restrictions, household_id, visibility_json, communication_json,
        profiles ( id, full_name, email, phone, avatar_url )
      )
    `)
    .eq("id", studentId)
    .is("archived_at", null)
    .single();

  if (error) return null;
  return data;
}

// ── Family Helpers ────────────────────────────────────────────────────────

/**
 * Returns a paginated list of families for an org with student counts.
 * Only accessible to staff+ (enforced by RLS).
 */
export async function getFamilies(
  orgId: string,
  options: { limit?: number; offset?: number; search?: string } = {}
) {
  const { limit = 50, offset = 0, search } = options;
  const supabase = await createClient();

  let query = supabase
    .from("families")
    .select(`
      id, family_name, family_display_id, is_split_household, status, created_at,
      households ( id, household_label, household_display_id )
    `)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("family_name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(
      `family_name.ilike.%${search}%,family_display_id.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

/**
 * Returns a single family with full detail:
 * households, enrolled students, and guardianships with profiles.
 * Staff+ only (RLS enforced).
 */
export async function getFamily(familyId: string): Promise<FamilyDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("families")
    .select(`
      id, family_name, family_display_id, is_split_household, notes, archived_at,
      organization_id,
      households (
        id, household_display_id, household_label, sort_order,
        address_json, phone, email, status, archived_at
      ),
      students (
        id, student_display_id, first_name, last_name, preferred_name,
        grade_level, enrollment_status, track, archived_at,
        guardianships (
          id, relationship_type, custody_type, is_legal_guardian,
          is_primary_contact, is_emergency_contact, emergency_contact_order,
          can_pickup, pickup_restrictions, court_order_on_file,
          household_id, status, archived_at,
          profiles!guardianships_profile_id_fkey ( id, full_name, email, phone, auth_user_id )
        )
      )
    `)
    .eq("id", familyId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) {
    console.error("[getFamily] query error:", error.message);
    return null;
  }
  return data as unknown as FamilyDetail;
}

interface FamilyDetail {
  id: string;
  family_name: string;
  family_display_id: string | null;
  is_split_household: boolean;
  notes: string | null;
  archived_at: string | null;
  households: {
    id: string;
    household_display_id: string | null;
    household_label: string;
    sort_order: number;
    address_json: { street1?: string; city?: string; state?: string; zip?: string } | null;
    phone: string | null;
    email: string | null;
    status: string;
    archived_at: string | null;
  }[];
  students: {
    id: string;
    student_display_id: string | null;
    first_name: string;
    last_name: string;
    preferred_name: string | null;
    grade_level: string | null;
    enrollment_status: string;
    track: string | null;
    archived_at: string | null;
    guardianships: {
      id: string;
      relationship_type: string;
      custody_type: string;
      is_legal_guardian: boolean;
      is_primary_contact: boolean;
      is_emergency_contact: boolean;
      emergency_contact_order: number | null;
      can_pickup: boolean;
      pickup_restrictions: string | null;
      court_order_on_file: boolean;
      household_id: string | null;
      status: string;
      archived_at: string | null;
      profiles: { id: string; full_name: string; email: string | null; phone: string | null } | null;
    }[] | null;
  }[];
}

// ── Timeline Helpers ──────────────────────────────────────────────────────

/**
 * Returns the timeline for a student (staff view — all non-hidden entries).
 */
export async function getStudentTimeline(
  studentId:  string,
  orgId:      string,
  options:    { limit?: number; offset?: number } = {}
): Promise<TimelineEntry[]> {
  const { limit = 50, offset = 0 } = options;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("timeline_entries")
    .select("*")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .is("hidden_at", null)
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return [];
  return (data ?? []) as TimelineEntry[];
}

/**
 * Returns the timeline for a student (parent view):
 * non-staff-only, approved, not hidden.
 */
export async function getStudentTimelineForParent(
  studentId:  string,
  orgId:      string,
  options:    { limit?: number; offset?: number } = {}
): Promise<TimelineEntry[]> {
  const { limit = 50, offset = 0 } = options;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("timeline_entries")
    .select("*")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("staff_only", false)
    .is("hidden_at", null)
    .or("requires_approval.eq.false,approved_at.not.is.null")
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return [];
  return (data ?? []) as TimelineEntry[];
}

// ── Parent Portal Helpers ─────────────────────────────────────────────────

/**
 * Returns all active children for a guardian (parent portal view).
 * Returns student-shaped objects — safe for parent display only.
 * RLS enforces split-household isolation automatically.
 */
export async function getGuardianChildren(userId: string, orgId: string): Promise<ParentChild[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guardianships")
    .select(`
      id, relationship_type, custody_type,
      students (
        id, first_name, last_name, preferred_name,
        grade_level, enrollment_status, track, archived_at,
        avatar_url
      )
    `)
    .eq("profile_id", userId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("archived_at", null);

  if (error) return [];

  return (data ?? [])
    .filter((g) => {
      const s = g.students as { enrollment_status: string; archived_at: string | null } | null;
      return s && s.archived_at === null && s.enrollment_status !== "withdrawn";
    })
    .map((g) => {
      const s = g.students as {
        id: string; first_name: string; last_name: string; preferred_name: string | null;
        grade_level: string | null; enrollment_status: string; track: string | null;
        avatar_url: string | null;
      };
      return {
        id: s.id,
        first_name: s.first_name,
        last_name: s.last_name,
        preferred_name: s.preferred_name,
        grade_level: s.grade_level,
        enrollment_status: s.enrollment_status,
        track: s.track,
        avatar_url: s.avatar_url,
        relationship_type: g.relationship_type as string,
        guardianship_id: g.id,
      };
    });
}

export interface ParentChild {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  grade_level: string | null;
  enrollment_status: string;
  track: string | null;
  avatar_url: string | null;
  relationship_type: string;
  guardianship_id: string;
}

/**
 * Returns a student record verified to be owned by the calling parent.
 * Includes today's attendance status. Parent-safe fields only.
 * Returns null if the parent has no guardianship for this student.
 */
export async function getStudentForParent(
  studentId: string,
  userId: string,
  orgId: string
): Promise<ParentStudentDetail | null> {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // Verify guardianship (RLS enforces this too, but we do explicit check for clean 404)
  const { data: guardianship } = await supabase
    .from("guardianships")
    .select("id, relationship_type, custody_type")
    .eq("profile_id", userId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();

  if (!guardianship) return null;

  // Fetch parent-safe student fields only
  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, preferred_name, grade_level, track, enrollment_status, date_of_birth, avatar_url, enrollment_date, expected_graduation")
    .eq("id", studentId)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .single();

  if (!student) return null;

  // Today's attendance — parent-safe fields only
  const { data: attendance } = await supabase
    .from("attendance_records")
    .select("status, check_in_at, check_out_at, is_late, is_early_pickup")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("date", today)
    .maybeSingle();

  return {
    id: student.id as string,
    first_name: student.first_name as string,
    last_name: student.last_name as string,
    preferred_name: student.preferred_name as string | null,
    grade_level: student.grade_level as string | null,
    track: student.track as string | null,
    enrollment_status: student.enrollment_status as string,
    date_of_birth: student.date_of_birth as string | null,
    avatar_url: student.avatar_url as string | null,
    enrollment_date: student.enrollment_date as string | null,
    expected_graduation: student.expected_graduation as string | null,
    relationship_type: guardianship.relationship_type as string,
    today_attendance: attendance ? {
      status: attendance.status as string,
      check_in_at: attendance.check_in_at as string | null,
      check_out_at: attendance.check_out_at as string | null,
      is_late: attendance.is_late as boolean,
      is_early_pickup: attendance.is_early_pickup as boolean,
    } : null,
  };
}

export interface ParentStudentDetail {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  grade_level: string | null;
  track: string | null;
  enrollment_status: string;
  date_of_birth: string | null;
  avatar_url: string | null;
  enrollment_date: string | null;
  expected_graduation: string | null;
  relationship_type: string;
  today_attendance: {
    status: string;
    check_in_at: string | null;
    check_out_at: string | null;
    is_late: boolean;
    is_early_pickup: boolean;
  } | null;
}

// ── Attendance history ────────────────────────────────────────────────────

export interface AttendanceDay {
  date: string;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  is_late: boolean;
  is_early_pickup: boolean;
  absence_reason: string | null;
}

export async function getAttendanceHistoryForParent(
  studentId: string,
  userId: string,
  orgId: string,
  limit = 14
): Promise<AttendanceDay[]> {
  const supabase = await createClient();

  // Verify guardianship first
  const { data: gd } = await supabase
    .from("guardianships")
    .select("id")
    .eq("profile_id", userId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (!gd) return [];

  const { data, error } = await supabase
    .from("attendance_records")
    .select("date, status, check_in_at, check_out_at, is_late, is_early_pickup, absence_reason")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .order("date", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as AttendanceDay[];
}

// ── Teacher progress check-ins (parent-visible) ───────────────────────────

export interface ProgressCheckin {
  id: string;
  recorded_date: string;
  subject_area: string | null;
  lesson_topic: string | null;
  what_was_worked_on: string | null;
  student_response: string | null;
  progress_observed: string | null;
  parent_follow_up_notes: string | null;
  confidence_level: string | null;
}

export async function getProgressCheckinsForParent(
  studentId: string,
  userId: string,
  orgId: string,
  limit = 5
): Promise<ProgressCheckin[]> {
  const supabase = await createClient();

  const { data: gd } = await supabase
    .from("guardianships")
    .select("id")
    .eq("profile_id", userId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (!gd) return [];

  const { data, error } = await supabase
    .from("academic_progress")
    .select("id, recorded_date, subject_area, lesson_topic, what_was_worked_on, student_response, progress_observed, parent_follow_up_notes, confidence_level")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("parent_visible", true)
    .is("archived_at", null)
    .order("recorded_date", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as ProgressCheckin[];
}

// ── Student goals (parent_visible only) ──────────────────────────────────

export interface ParentGoal {
  id: string;
  goal_text: string;
  category: string;
  status: string;
  progress_pct: number;
  priority: string;
  target_review_date: string | null;
}

export async function getStudentGoalsForParent(
  studentId: string,
  userId: string,
  orgId: string
): Promise<ParentGoal[]> {
  const supabase = await createClient();

  const { data: gd } = await supabase
    .from("guardianships")
    .select("id")
    .eq("profile_id", userId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (!gd) return [];

  const { data, error } = await supabase
    .from("student_goals")
    .select("id, goal_text, category, status, progress_pct, priority, target_review_date")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("visibility", "parent_visible")
    .in("status", ["active", "achieved"])
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) return [];
  return (data ?? []) as ParentGoal[];
}

// ── Medical summary for parents ───────────────────────────────────────────

export interface MedicalSummary {
  allergies: { allergy_name: string; severity: string; emergency_medication_required: boolean }[];
  conditions: { condition_name: string; emergency_action_needed: boolean; action_instructions: string | null }[];
}

export async function getMedicalSummaryForParent(
  studentId: string,
  userId: string,
  orgId: string
): Promise<MedicalSummary> {
  const supabase = await createClient();

  const { data: gd } = await supabase
    .from("guardianships")
    .select("id")
    .eq("profile_id", userId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (!gd) return { allergies: [], conditions: [] };

  const [{ data: allergies }, { data: conditions }] = await Promise.all([
    supabase
      .from("student_allergies")
      .select("allergy_name, severity, emergency_medication_required")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .is("archived_at", null)
      .order("severity"),
    supabase
      .from("student_conditions")
      .select("condition_name, emergency_action_needed, action_instructions")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .is("archived_at", null),
  ]);

  return {
    allergies: (allergies ?? []) as MedicalSummary["allergies"],
    conditions: (conditions ?? []) as MedicalSummary["conditions"],
  };
}

/**
 * Returns all guardianships for a parent (for the settings page).
 */
export async function getMyGuardianships(userId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guardianships")
    .select(`
      id, relationship_type, custody_type, visibility_json, communication_json,
      is_primary_contact, is_emergency_contact, status,
      students ( id, first_name, last_name, preferred_name, grade_level )
    `)
    .eq("profile_id", userId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("archived_at", null);

  if (error) return [];
  return data ?? [];
}
