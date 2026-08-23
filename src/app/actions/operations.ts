"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/constants";
import { getActiveRole } from "@/lib/supabase/org-context";

// ═══════════════════════════════════════════════════════════════════
// Daily Operations Dashboard — server action
//
// Attendance state per student (canonical definitions):
//
//   not_arrived    — no attendance_records row, OR row exists but
//                    check_in_at is null and status is not absent/excused
//   on_campus      — check_in_at set, check_out_at null, not absent/excused
//   checked_out    — check_in_at set AND check_out_at set
//   absent         — status = 'absent' (check_in_at may or may not be set)
//   excused        — status = 'excused' (check_in_at may or may not be set)
//   manual_present — status = 'present' but no check_in_at (manual entry)
//
// A student with check_in_at AND status='absent' is treated as absent
// (the absence marking takes priority over the timestamp).
// ═══════════════════════════════════════════════════════════════════

export type CampusState =
  | "not_arrived"
  | "on_campus"
  | "checked_out"
  | "absent"
  | "excused"
  | "manual_present";

export interface StudentSafetyAlert {
  id:               string;
  severity:         "critical" | "high";
  instruction:      string;
  safety_roles:     string[] | null; // null = all staff
}

export interface PickupRestriction {
  guardian_name:        string;
  can_pickup:           boolean;
  pickup_restrictions:  string | null;
  custody_type:         string;
}

export interface AttendanceRecord {
  id:                         string;
  status:                     string;
  check_in_at:                string | null;
  check_out_at:               string | null;
  is_late:                    boolean;
  is_early_pickup:            boolean;
  notes:                      string | null;
  check_in_method:            string | null;
  check_out_method:           string | null;
  checkout_released_to:       string | null;
  checkout_override_used:     boolean;
}

export interface OperationsStudent {
  student_id:               string;
  first_name:               string;
  last_name:                string;
  preferred_name:           string | null;
  grade_level:              string | null;
  attendance_qr_token:      string | null;
  campus_state:             CampusState;
  record:                   AttendanceRecord | null;
  has_safety_alert:         boolean;
  safety_alerts:            StudentSafetyAlert[];
  has_emergency_medical:    boolean;
  has_pickup_restriction:   boolean;
  pickup_restrictions:      PickupRestriction[];
  authorized_pickup_notes:  string | null;
}

export interface OperationsSummary {
  total_enrolled:     number;
  checked_in:         number;      // has check_in_at (includes those later checked out)
  on_campus:          number;      // check_in_at set, check_out_at null
  checked_out:        number;      // check_in_at set AND check_out_at set
  not_arrived:        number;      // no check_in_at, not absent/excused
  absent:             number;
  excused:            number;
  with_safety_alerts: number;
}

export interface OrgSettings {
  arrival_cutoff:  string; // "HH:MM"
  dismissal_time:  string; // "HH:MM"
  timezone:        string;
}

export interface OperationsDashboardData {
  date:        string;  // YYYY-MM-DD
  org_settings: OrgSettings;
  summary:     OperationsSummary;
  students:    OperationsStudent[];
  fetched_at:  string;  // ISO timestamp
  role:        string;
}

// ── Access guard ───────────────────────────────────────────────────────────

const OPS_ROLES = new Set([
  "teacher", "staff", "registrar", "admin", "full_admin", "platform_admin",
]);

// ── Main query ─────────────────────────────────────────────────────────────

export async function getOperationsDashboard(
  date?: string
): Promise<OperationsDashboardData | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { error: "No active organization." };

  const role = await getActiveRole();
  if (!role || !OPS_ROLES.has(role)) return { error: "Insufficient permissions." };

  const supabase = await createClient();

  // Use provided date or today in org's timezone (fall back to UTC date if not set)
  const queryDate = date ?? new Date().toISOString().split("T")[0];

  // ── 1. Org settings (arrival cutoff, dismissal time, timezone) ─────────
  const { data: settings } = await supabase
    .from("org_settings")
    .select("arrival_cutoff, dismissal_time, timezone")
    .eq("organization_id", orgId)
    .single();

  const orgSettings: OrgSettings = {
    arrival_cutoff: (settings?.arrival_cutoff as string | null)?.slice(0, 5) ?? "08:30",
    dismissal_time: (settings?.dismissal_time as string | null)?.slice(0, 5) ?? "15:00",
    timezone:       (settings?.timezone as string | null) ?? "America/New_York",
  };

  // ── 2. All enrolled students ───────────────────────────────────────────
  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name, preferred_name, grade_level, attendance_qr_token, authorized_pickup_notes")
    .eq("organization_id", orgId)
    .eq("enrollment_status", "enrolled")
    .is("archived_at", null)
    .order("last_name");

  if (!students?.length) {
    return {
      date:         queryDate,
      org_settings: orgSettings,
      summary: {
        total_enrolled: 0, checked_in: 0, on_campus: 0,
        checked_out: 0, not_arrived: 0, absent: 0, excused: 0, with_safety_alerts: 0,
      },
      students:   [],
      fetched_at: new Date().toISOString(),
      role,
    };
  }

  const studentIds = students.map((s) => s.id);

  // ── 3. Attendance records for the selected date ────────────────────────
  const { data: records } = await supabase
    .from("attendance_records")
    .select(`
      id, student_id, status, check_in_at, check_out_at,
      is_late, is_early_pickup, notes,
      check_in_method, check_out_method,
      checkout_released_to, checkout_override_used
    `)
    .eq("organization_id", orgId)
    .eq("date", queryDate);

  const recordMap = new Map(
    (records ?? []).map((r) => [r.student_id as string, r])
  );

  // ── 4. Safety alerts (staff_notes flagged is_safety_alert) ────────────
  // Only fetch for staff roles that can see medical detail
  const { data: safetyNotes } = isStaffRole(role)
    ? await supabase
        .from("staff_notes")
        .select("id, student_id, safety_severity, safety_instruction, safety_roles")
        .eq("organization_id", orgId)
        .eq("is_safety_alert", true)
        .is("archived_at", null)
        .in("student_id", studentIds)
    : { data: null };

  // Group safety alerts by student
  const safetyMap = new Map<string, StudentSafetyAlert[]>();
  for (const note of safetyNotes ?? []) {
    const sid = note.student_id as string;
    if (!safetyMap.has(sid)) safetyMap.set(sid, []);
    safetyMap.get(sid)!.push({
      id:           note.id as string,
      severity:     (note.safety_severity as "critical" | "high") ?? "high",
      instruction:  (note.safety_instruction as string) ?? "See student file",
      safety_roles: note.safety_roles as string[] | null,
    });
  }

  // ── 5. Emergency medical (life-threatening allergies + emergency meds) ─
  const [{ data: severeAllergies }, { data: emergencyMeds }] = await Promise.all([
    supabase
      .from("student_allergies")
      .select("student_id")
      .in("student_id", studentIds)
      .eq("severity", "life_threatening")
      .eq("is_active", true)
      .is("archived_at", null),
    supabase
      .from("medication_alerts")
      .select("student_id")
      .in("student_id", studentIds)
      .eq("is_emergency", true)
      .eq("is_active", true),
  ]);

  const emergencySet = new Set([
    ...(severeAllergies ?? []).map((a) => a.student_id as string),
    ...(emergencyMeds ?? []).map((m) => m.student_id as string),
  ]);

  // ── 6. Pickup restrictions ─────────────────────────────────────────────
  const { data: guardianships } = await supabase
    .from("guardianships")
    .select("student_id, pickup_restrictions, can_pickup, custody_type, profile_id, profiles!guardianships_profile_id_fkey(full_name)")
    .in("student_id", studentIds)
    .eq("status", "active")
    .is("archived_at", null);

  // Group guardianships with an affirmative restriction:
  //   can_pickup === false  → explicitly prohibited
  //   custody_type === 'supervised' → requires staff supervision
  //   pickup_restrictions non-null → has a restriction note
  // custody_type === 'none' alone is NOT a restriction — it means the
  // person has no legal custody but can still be authorized for pickup.
  const pickupMap = new Map<string, PickupRestriction[]>();
  for (const g of guardianships ?? []) {
    const sid = g.student_id as string;
    const hasRestriction =
      g.pickup_restrictions ||
      g.can_pickup === false ||
      g.custody_type === "supervised";
    if (!hasRestriction) continue;
    if (!pickupMap.has(sid)) pickupMap.set(sid, []);
    const profileData = g.profiles as { full_name: string } | null;
    pickupMap.get(sid)!.push({
      guardian_name:       profileData?.full_name ?? "Unknown Guardian",
      can_pickup:          g.can_pickup as boolean,
      pickup_restrictions: g.pickup_restrictions as string | null,
      custody_type:        g.custody_type as string,
    });
  }

  // ── 7. Build per-student state ─────────────────────────────────────────
  const operationsStudents: OperationsStudent[] = (students ?? []).map((s) => {
    const rec   = recordMap.get(s.id) ?? null;
    const state = deriveCampusState(rec);
    const alerts = safetyMap.get(s.id) ?? [];
    const pickupRestrictions = pickupMap.get(s.id) ?? [];

    return {
      student_id:              s.id,
      first_name:              s.first_name,
      last_name:               s.last_name,
      preferred_name:          s.preferred_name,
      grade_level:             s.grade_level,
      attendance_qr_token:     s.attendance_qr_token,
      campus_state:            state,
      record:                  rec ? {
        id:                      rec.id as string,
        status:                  rec.status as string,
        check_in_at:             rec.check_in_at as string | null,
        check_out_at:            rec.check_out_at as string | null,
        is_late:                 rec.is_late as boolean,
        is_early_pickup:         rec.is_early_pickup as boolean,
        notes:                   rec.notes as string | null,
        check_in_method:         rec.check_in_method as string | null,
        check_out_method:        rec.check_out_method as string | null,
        checkout_released_to:    rec.checkout_released_to as string | null,
        checkout_override_used:  rec.checkout_override_used as boolean,
      } : null,
      has_safety_alert:        alerts.length > 0,
      safety_alerts:           alerts,
      has_emergency_medical:   emergencySet.has(s.id),
      has_pickup_restriction:  pickupRestrictions.length > 0,
      pickup_restrictions:     pickupRestrictions,
      authorized_pickup_notes: s.authorized_pickup_notes,
    };
  });

  // ── 8. Summary counts ─────────────────────────────────────────────────
  let checkedIn  = 0, onCampus = 0, checkedOut = 0;
  let notArrived = 0, absent  = 0, excused    = 0, withAlerts = 0;

  for (const s of operationsStudents) {
    if (s.campus_state === "on_campus")      onCampus++;
    if (s.campus_state === "checked_out")    checkedOut++;
    if (s.campus_state === "absent")         absent++;
    if (s.campus_state === "excused")        excused++;
    if (s.campus_state === "not_arrived" || s.campus_state === "manual_present") notArrived++;
    if (s.campus_state === "on_campus" || s.campus_state === "checked_out") checkedIn++;
    if (s.has_safety_alert || s.has_emergency_medical) withAlerts++;
  }

  return {
    date:         queryDate,
    org_settings: orgSettings,
    summary: {
      total_enrolled:     operationsStudents.length,
      checked_in:         checkedIn,
      on_campus:          onCampus,
      checked_out:        checkedOut,
      not_arrived:        notArrived,
      absent,
      excused,
      with_safety_alerts: withAlerts,
    },
    students:   operationsStudents,
    fetched_at: new Date().toISOString(),
    role,
  };
}

// ── Campus state derivation ────────────────────────────────────────────────
// This is the canonical rule for the whole dashboard.

function deriveCampusState(
  rec: Record<string, unknown> | null
): CampusState {
  if (!rec) return "not_arrived";

  const status     = rec.status as string;
  const checkInAt  = rec.check_in_at as string | null;
  const checkOutAt = rec.check_out_at as string | null;

  // Explicit absence takes priority over timestamps
  if (status === "absent")  return "absent";
  if (status === "excused") return "excused";

  if (checkInAt && checkOutAt) return "checked_out";
  if (checkInAt && !checkOutAt) return "on_campus";

  // Has a record but no physical check-in
  if (status === "present") return "manual_present";

  return "not_arrived";
}
