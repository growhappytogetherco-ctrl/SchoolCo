"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId, resolveProfileId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveRole } from "@/lib/supabase/org-context";
import { writeAuditLog } from "@/lib/audit";
// ── Types ─────────────────────────────────────────────────────────────────

type AR = { success: true } | { success: false; error: string };

export type AttendanceMethod = "qr" | "manual" | "kiosk" | "parent_qr";
export type AttendanceStatus =
  | "present"
  | "absent"
  | "tardy"
  | "excused"
  | "checked_in"
  | "early_dismissal";

// ── Helpers ───────────────────────────────────────────────────────────────

function todayDate(): string {
  return new Date().toISOString().split("T")[0]; // YYYY-MM-DD
}

/** Returns the org's arrival cutoff and IANA timezone from org_settings */
async function getArrivalCutoff(orgId: string): Promise<{ cutoff: string; timezone: string }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("arrival_cutoff, timezone")
    .eq("organization_id", orgId)
    .single();
  return {
    cutoff:   (data?.arrival_cutoff as string | null)?.slice(0, 5) ?? "09:00",
    timezone: (data?.timezone as string | null) ?? "America/New_York",
  };
}

/**
 * Returns true if the current moment is strictly after the cutoff wall-clock
 * time in the org's timezone. AT the cutoff (e.g. exactly 09:00:00) = on time.
 */
function isLate(cutoffHHMM: string, timezone: string): boolean {
  const now = new Date();
  // Format UTC-now as HH:MM:SS in the org's timezone (e.g. "09:05:23")
  const nowInTz = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour:   "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  const [ch, cm] = cutoffHHMM.split(":").map(Number);
  const cutoffStr = `${String(ch).padStart(2, "0")}:${String(cm).padStart(2, "0")}:00`;
  return nowInTz > cutoffStr; // "09:00:01" > "09:00:00" → late; "09:00:00" → on time
}

// ── Check In ──────────────────────────────────────────────────────────────

export async function checkInStudent(
  studentId: string,
  method: AttendanceMethod = "manual"
): Promise<AR & { alreadyCheckedIn?: boolean }> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  // Resolve canonical profiles.id — for stub accounts auth.uid() ≠ profiles.id
  // (e.g. Mel). check_in_by has FK to profiles(id) so we must use profiles.id.
  const profileId = await resolveProfileId(user.id);

  const supabase = await createClient();
  const date = todayDate();
  const now = new Date().toISOString();

  // Check for existing record
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id, check_in_at, check_out_at")
    .eq("organization_id", orgId)
    .eq("student_id", studentId)
    .eq("date", date)
    .single();

  if (existing?.check_in_at) {
    return {
      success: false,
      error: "Student is already checked in today.",
      alreadyCheckedIn: true,
    };
  }

  const { cutoff, timezone } = await getArrivalCutoff(orgId);
  const late = isLate(cutoff, timezone);

  if (existing) {
    // Update existing row (e.g. was marked absent earlier)
    const { error } = await supabase
      .from("attendance_records")
      .update({
        status: "checked_in",
        check_in_at: now,
        check_in_by: profileId,
        check_in_method: method,
        is_late: late,
      })
      .eq("id", existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    // Insert fresh row
    const { error } = await supabase.from("attendance_records").insert({
      organization_id: orgId,
      student_id: studentId,
      date,
      status: "checked_in",
      check_in_at: now,
      check_in_by: profileId,
      check_in_method: method,
      is_late: late,
    });
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/home");
  return { success: true };
}

// ── Check Out ─────────────────────────────────────────────────────────────

export async function checkOutStudent(
  studentId: string,
  method: AttendanceMethod = "manual"
): Promise<AR & { notCheckedIn?: boolean; alreadyCheckedOut?: boolean }> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const profileId = await resolveProfileId(user.id);

  const supabase = await createClient();
  const date = todayDate();
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id, check_in_at, check_out_at")
    .eq("organization_id", orgId)
    .eq("student_id", studentId)
    .eq("date", date)
    .single();

  if (!existing?.check_in_at) {
    return { success: false, error: "Student has not been checked in today.", notCheckedIn: true };
  }

  if (existing.check_out_at) {
    return { success: false, error: "Student is already checked out.", alreadyCheckedOut: true };
  }

  // Determine if early pickup (before org dismissal time)
  const supabase2 = await createClient();
  const { data: settings } = await supabase2
    .from("org_settings")
    .select("dismissal_time")
    .eq("organization_id", orgId)
    .single();

  const dismissalTime = (settings?.dismissal_time as string | null)?.slice(0, 5) ?? "15:00";
  const [hh, mm] = dismissalTime.split(":").map(Number);
  const dismissalCutoff = new Date();
  dismissalCutoff.setHours(hh, mm, 0, 0);
  const earlyPickup = new Date() < dismissalCutoff;

  const { error } = await supabase
    .from("attendance_records")
    .update({
      status: "present",
      check_out_at: now,
      check_out_by: profileId,
      check_out_method: method,
      is_early_pickup: earlyPickup,
    })
    .eq("id", existing.id);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/home");
  return { success: true };
}

// ── Mark Attendance (manual statuses) ────────────────────────────────────

export async function markAttendance(
  studentId: string,
  status: AttendanceStatus,
  notes?: string
): Promise<AR> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const supabase = await createClient();
  const date = todayDate();

  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id")
    .eq("organization_id", orgId)
    .eq("student_id", studentId)
    .eq("date", date)
    .single();

  const payload = {
    organization_id: orgId,
    student_id: studentId,
    date,
    status,
    check_in_method: "manual" as AttendanceMethod,
    notes: notes ?? null,
    updated_at: new Date().toISOString(),
  };

  let error;
  if (existing) {
    ({ error } = await supabase
      .from("attendance_records")
      .update(payload)
      .eq("id", existing.id));
  } else {
    ({ error } = await supabase.from("attendance_records").insert(payload));
  }

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/home");
  return { success: true };
}

// ── Undo last QR action (admin override) ─────────────────────────────────

export type UndoResult =
  | { success: true; undid: "checkin" | "checkout" }
  | { success: false; error: string };

export async function undoAttendanceAction(studentId: string): Promise<UndoResult> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const supabase = await createClient();
  const date = todayDate();

  const { data: record } = await supabase
    .from("attendance_records")
    .select("id, check_in_at, check_out_at")
    .eq("organization_id", orgId)
    .eq("student_id", studentId)
    .eq("date", date)
    .single();

  if (!record) return { success: false, error: "No attendance record found for today." };

  if (record.check_out_at) {
    // Undo checkout: clear check_out fields
    const { error } = await supabase
      .from("attendance_records")
      .update({ check_out_at: null, check_out_by: null, check_out_method: null, is_early_pickup: false })
      .eq("id", record.id);
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/attendance");
    revalidatePath("/dashboard/home");
    return { success: true, undid: "checkout" };
  }

  if (record.check_in_at) {
    // Undo checkin: remove the record entirely
    const { error } = await supabase
      .from("attendance_records")
      .delete()
      .eq("id", record.id);
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/attendance");
    revalidatePath("/dashboard/home");
    return { success: true, undid: "checkin" };
  }

  return { success: false, error: "No check-in or check-out to undo." };
}

// ── Admin Attendance Correction ───────────────────────────────────────────
// Admin+ can correct a student's attendance status for any date.
// E.g. clear an erroneous checkout, mark absent → present, etc.

export type CorrectionAction =
  | "undo_checkout"    // clear check_out_at (student is back to checked-in)
  | "undo_checkin"     // delete the record entirely
  | "mark_absent"      // set status = absent, clear check times
  | "mark_present"     // set status = present (keep existing times)
  | "mark_excused";    // set status = excused

export async function correctAttendanceRecord(
  recordId: string,
  action: CorrectionAction,
  adminNote?: string
): Promise<AR> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };
  if (!["admin", "full_admin", "platform_admin", "registrar"].includes(role ?? "")) {
    return { success: false, error: "Admin access required to correct attendance." };
  }

  const supabase = await createClient();

  if (action === "undo_checkout") {
    const { error } = await supabase
      .from("attendance_records")
      .update({
        check_out_at:             null,
        check_out_by:             null,
        check_out_method:         null,
        is_early_pickup:          false,
        checkout_released_to:     null,
        checkout_released_to_id:  null,
        checkout_override_used:   false,
        checkout_override_reason: null,
        checkout_notes:           adminNote ? `[Admin correction] ${adminNote}` : null,
      } as never)
      .eq("id", recordId)
      .eq("organization_id", orgId);
    if (error) return { success: false, error: error.message };
  } else if (action === "undo_checkin") {
    const { error } = await supabase
      .from("attendance_records")
      .delete()
      .eq("id", recordId)
      .eq("organization_id", orgId);
    if (error) return { success: false, error: error.message };
  } else {
    const statusMap: Record<string, string> = {
      mark_absent:  "absent",
      mark_present: "present",
      mark_excused: "excused",
    };
    const { error } = await supabase
      .from("attendance_records")
      .update({ status: statusMap[action] } as never)
      .eq("id", recordId)
      .eq("organization_id", orgId);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/home");
  return { success: true };
}

// ── Manual attendance entry (from ManualEntryForm) ───────────────────────
// Saves a full attendance record for any date. check_in_at / check_out_at
// must already be UTC ISO strings (caller converts from Eastern wall-clock).
// After the upsert, SELECT the row back and verify both timestamps were persisted.

export async function saveManualAttendance(params: {
  studentId:     string;
  date:          string;
  status:        string;
  checkInAt:     string | null;
  checkOutAt:    string | null;
  isLate:        boolean;
  isEarlyPickup: boolean;
  notes:         string | null;
}): Promise<AR> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };

  // Validate status against DB constraint before hitting the DB
  const VALID_STATUSES = ["present", "absent", "tardy", "excused", "checked_in", "early_dismissal"];
  if (!VALID_STATUSES.includes(params.status)) {
    return { success: false, error: `Invalid status: "${params.status}". Valid values: ${VALID_STATUSES.join(", ")}` };
  }

  const admin = createAdminClient();

  // Upsert into the canonical attendance record for this student/date.
  // onConflict matches the unique constraint: (organization_id, student_id, date).
  // On conflict, ALL provided columns are updated (merge-duplicates behavior).
  // Uses admin client so RLS never silently blocks writes for stub-account staff.
  const { error: upsertError } = await admin
    .from("attendance_records")
    .upsert({
      organization_id: orgId,
      student_id:      params.studentId,
      date:            params.date,
      status:          params.status,
      check_in_at:     params.checkInAt,
      check_out_at:    params.checkOutAt,
      is_late:         params.isLate,
      is_early_pickup: params.isEarlyPickup,
      notes:           params.notes,
      check_in_method: "manual",
    } as never, {
      onConflict: "organization_id,student_id,date",
    });

  if (upsertError) return { success: false, error: upsertError.message };

  // Verify: read the row back from the DB. Do not report success until confirmed.
  const { data: saved, error: fetchError } = await admin
    .from("attendance_records")
    .select("check_in_at, check_out_at, status")
    .eq("organization_id", orgId)
    .eq("student_id", params.studentId)
    .eq("date", params.date)
    .single();

  if (fetchError || !saved) {
    return { success: false, error: "Attendance was written but could not be verified. Please check Attendance History." };
  }

  if (params.checkInAt !== null && new Date(saved.check_in_at).getTime() !== new Date(params.checkInAt).getTime()) {
    return { success: false, error: `Check-in time verification failed. Expected ${params.checkInAt}, got ${saved.check_in_at}. Please retry.` };
  }
  if (params.checkOutAt !== null && new Date(saved.check_out_at).getTime() !== new Date(params.checkOutAt).getTime()) {
    return { success: false, error: `Check-out time verification failed. Expected ${params.checkOutAt}, got ${saved.check_out_at}. Please retry.` };
  }

  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/home");
  return { success: true };
}

// ── Admin: set exact check-in / check-out timestamps ──────────────────────
// Accepts UTC ISO strings (caller converts from Eastern wall-clock).

export async function setAttendanceTimes(
  recordId: string,
  // undefined = leave unchanged; null = explicitly clear; string = set to value
  checkInAt: string | null | undefined,
  checkOutAt: string | null | undefined,
  adminNote?: string
): Promise<AR> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };
  if (!["admin", "full_admin", "platform_admin", "registrar", "staff"].includes(role ?? "")) {
    return { success: false, error: "Staff access required to set attendance times." };
  }

  const fields: Record<string, unknown> = {};
  if (checkInAt  !== undefined) fields.check_in_at  = checkInAt;
  if (checkOutAt !== undefined) fields.check_out_at = checkOutAt;
  if (adminNote)                fields.notes        = `[Time correction] ${adminNote}`;
  if (Object.keys(fields).length === 0) return { success: false, error: "No fields to update." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance_records")
    .update(fields as never)
    .eq("id", recordId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/home");
  return { success: true };
}

// ── Edit attendance record — FULL ADMIN ONLY ─────────────────────────────
// Updates ALL editable fields on a record. Caller passes UTC ISO strings.
// Uses admin client to bypass RLS. Role check enforces full_admin+ server-side.
// After update, reads the row back to confirm both times were persisted.

export async function editAttendanceRecord(params: {
  recordId:      string;
  date:          string;          // YYYY-MM-DD (for re-keying if date changes)
  status:        string;
  checkInAt:     string | null;
  checkOutAt:    string | null;
  isLate:        boolean;
  isEarlyPickup: boolean;
  notes:         string | null;
  reason?:       string;
}): Promise<AR> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };
  // FULL ADMIN ONLY — staff/teacher/registrar cannot edit historical records
  if (!["full_admin", "platform_admin"].includes(role ?? "")) {
    return { success: false, error: "Full Admin access required to edit attendance records." };
  }

  const VALID_STATUSES = ["present", "absent", "tardy", "excused", "checked_in", "early_dismissal"];
  if (!VALID_STATUSES.includes(params.status)) {
    return { success: false, error: `Invalid status: "${params.status}".` };
  }

  const admin = createAdminClient();

  const { data: prev } = await admin
    .from("attendance_records")
    .select("date, status, check_in_at, check_out_at, is_late, is_early_pickup, notes, student_id")
    .eq("id", params.recordId)
    .eq("organization_id", orgId)
    .single();

  if (!prev) return { success: false, error: "Attendance record not found." };

  const { error } = await admin
    .from("attendance_records")
    .update({
      date:            params.date,
      status:          params.status,
      check_in_at:     params.checkInAt,
      check_out_at:    params.checkOutAt,
      is_late:         params.isLate,
      is_early_pickup: params.isEarlyPickup,
      notes:           params.notes,
    } as never)
    .eq("id", params.recordId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  // Verify the write — read the row back
  const { data: saved, error: fetchError } = await admin
    .from("attendance_records")
    .select("date, check_in_at, check_out_at, status")
    .eq("id", params.recordId)
    .eq("organization_id", orgId)
    .single();

  if (fetchError || !saved) {
    return { success: false, error: "Record updated but could not be verified. Please check Attendance History." };
  }
  if (params.checkInAt !== null && new Date(saved.check_in_at).getTime() !== new Date(params.checkInAt).getTime()) {
    return { success: false, error: `Check-in verification failed (got ${saved.check_in_at}). Please retry.` };
  }
  if (params.checkOutAt !== null && new Date(saved.check_out_at).getTime() !== new Date(params.checkOutAt).getTime()) {
    return { success: false, error: `Check-out verification failed (got ${saved.check_out_at}). Please retry.` };
  }

  await writeAuditLog(admin, {
    organizationId: orgId,
    actorId:        user.id,
    action:         "attendance.edited",
    resourceType:   "attendance_record",
    resourceId:     params.recordId,
    previousValues: prev,
    newValues: {
      date:            params.date,
      status:          params.status,
      check_in_at:     params.checkInAt,
      check_out_at:    params.checkOutAt,
      is_late:         params.isLate,
      is_early_pickup: params.isEarlyPickup,
    },
    metadata: { reason: params.reason ?? null },
  });

  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/home");
  return { success: true };
}

// ── Delete attendance record — FULL ADMIN ONLY ───────────────────────────
// Permanently deletes a canonical attendance record.
// Uses admin client (bypasses RLS). Role check is enforced server-side.
// Audit log captures who deleted, when, and why.

export async function deleteAttendanceRecord(
  recordId:  string,
  reason:    string
): Promise<AR> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };
  // FULL ADMIN ONLY
  if (!["full_admin", "platform_admin"].includes(role ?? "")) {
    return { success: false, error: "Full Admin access required to delete attendance records." };
  }

  const admin = createAdminClient();

  const { data: prev } = await admin
    .from("attendance_records")
    .select("student_id, date, status, check_in_at, check_out_at")
    .eq("id", recordId)
    .eq("organization_id", orgId)
    .single();

  if (!prev) return { success: false, error: "Attendance record not found." };

  const { error } = await admin
    .from("attendance_records")
    .delete()
    .eq("id", recordId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  // Confirm the record is gone
  const { data: stillThere } = await admin
    .from("attendance_records")
    .select("id")
    .eq("id", recordId)
    .maybeSingle();

  if (stillThere) {
    return { success: false, error: "Delete appeared to succeed but record still exists. Please retry." };
  }

  await writeAuditLog(admin, {
    organizationId: orgId,
    actorId:        user.id,
    action:         "attendance.deleted",
    resourceType:   "attendance_record",
    resourceId:     recordId,
    previousValues: prev,
    metadata:       { reason: reason || null },
  });

  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/home");
  return { success: true };
}

// ── Bulk load today's attendance for the list view ────────────────────────

export type StudentAttendanceRow = {
  student_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  grade_level: string | null;
  avatar_url: string | null;
  attendance_qr_token: string | null;
  medical_notes: string | null;
  allergies: string[] | null;
  has_emergency_medical: boolean;
  record: {
    id: string;
    status: string;
    check_in_at: string | null;
    check_out_at: string | null;
    is_late: boolean;
    is_early_pickup: boolean;
    notes: string | null;
  } | null;
};

export async function getTodayAttendance(): Promise<StudentAttendanceRow[]> {
  const user = await getUser();
  if (!user) return [];

  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const date = todayDate();

  const { data: students } = await supabase
    .from("students")
    .select(`
      id, first_name, last_name, preferred_name, grade_level,
      attendance_qr_token, medical_notes, allergies,
      profiles!students_homeroom_teacher_fkey ( avatar_url )
    `)
    .eq("organization_id", orgId)
    .eq("enrollment_status", "enrolled")
    .is("archived_at", null)
    .order("last_name");

  const { data: records } = await supabase
    .from("attendance_records")
    .select("id, student_id, status, check_in_at, check_out_at, is_late, is_early_pickup, notes")
    .eq("organization_id", orgId)
    .eq("date", date);

  // Emergency medical: life-threatening allergies or emergency medications
  const studentIds = (students ?? []).map((s) => s.id);
  const [{ data: emergencyAllergies }, { data: emergencyMeds }] = await Promise.all([
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
      .eq("is_active", true)
      .eq("is_emergency", true),
  ]);

  const emergencySet = new Set([
    ...(emergencyAllergies ?? []).map((a) => a.student_id as string),
    ...(emergencyMeds ?? []).map((m) => m.student_id as string),
  ]);

  const recordMap = new Map(records?.map((r) => [r.student_id, r]) ?? []);

  return (students ?? []).map((s) => ({
    student_id: s.id,
    first_name: s.first_name,
    last_name: s.last_name,
    preferred_name: s.preferred_name,
    grade_level: s.grade_level,
    avatar_url: null,
    attendance_qr_token: s.attendance_qr_token,
    medical_notes: s.medical_notes,
    allergies: s.allergies,
    has_emergency_medical: emergencySet.has(s.id),
    record: recordMap.get(s.id) ?? null,
  }));
}
