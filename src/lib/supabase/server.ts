import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import type { TimelineEntry } from "@/types/database";
export { getActiveOrgId } from "./org-context";

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
  options: { limit?: number; offset?: number; search?: string } = {}
) {
  const { limit = 50, offset = 0, search } = options;
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
      *,
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
          can_pickup, pickup_restrictions, household_id, visibility_json,
          communication_json, status, archived_at,
          profiles ( id, full_name, email, phone, avatar_url )
        )
      )
    `)
    .eq("id", familyId)
    .is("archived_at", null)
    .single();

  if (error) return null;
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
      profiles: { id: string; full_name: string; email: string; phone: string | null; avatar_url: string | null } | null;
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
 * RLS enforces split-household isolation automatically.
 */
export async function getGuardianChildren(userId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("guardianships")
    .select(`
      id, relationship_type, custody_type, is_primary_contact,
      is_emergency_contact, can_pickup, visibility_json, communication_json,
      household_id, status,
      students (
        id, student_display_id, first_name, last_name, preferred_name,
        grade_level, enrollment_status, track, family_id, archived_at,
        families ( family_name, family_display_id, is_split_household )
      )
    `)
    .eq("profile_id", userId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("archived_at", null);

  if (error) return [];
  return (data ?? []).filter((g) => {
    const student = g.students as { enrollment_status: string; archived_at: string | null } | null;
    return student && student.archived_at === null && student.enrollment_status === "enrolled";
  });
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
