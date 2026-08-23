"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
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

/** Returns the org's arrival cutoff as a local time string "HH:MM" */
async function getArrivalCutoff(orgId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_settings")
    .select("arrival_cutoff")
    .eq("organization_id", orgId)
    .single();
  // arrival_cutoff comes back as "HH:MM:SS" — take first 5 chars
  return (data?.arrival_cutoff as string | null)?.slice(0, 5) ?? "08:30";
}

function isLate(cutoffTime: string): boolean {
  const now = new Date();
  const [hh, mm] = cutoffTime.split(":").map(Number);
  const cutoff = new Date();
  cutoff.setHours(hh, mm, 0, 0);
  return now > cutoff;
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

  const cutoff = await getArrivalCutoff(orgId);
  const late = isLate(cutoff);

  if (existing) {
    // Update existing row (e.g. was marked absent earlier)
    const { error } = await supabase
      .from("attendance_records")
      .update({
        status: "present",
        check_in_at: now,
        check_in_by: user.id,
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
      status: "present",
      check_in_at: now,
      check_in_by: user.id,
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
      check_out_at: now,
      check_out_by: user.id,
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
  const { getActiveRole } = await import("@/lib/supabase/org-context");
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

export async function saveManualAttendance(params: {
  studentId: string;
  date: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  isLate: boolean;
  isEarlyPickup: boolean;
  notes: string | null;
}): Promise<AR> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };

  const supabase = await createClient();
  const { error } = await supabase
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

  if (error) return { success: false, error: error.message };
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
  const { getActiveRole } = await import("@/lib/supabase/org-context");
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

// ── Full attendance correction (admin / staff) ────────────────────────────
// Replaces ALL fields on a record. Caller converts times from Eastern → UTC.

export async function correctAttendanceFull(params: {
  recordId: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  isLate: boolean;
  isEarlyPickup: boolean;
  notes: string | null;
  adminNote?: string;
}): Promise<AR> {
  const { getActiveRole } = await import("@/lib/supabase/org-context");
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };
  if (!["admin", "full_admin", "platform_admin", "registrar", "staff", "teacher"].includes(role ?? "")) {
    return { success: false, error: "Staff access required." };
  }

  const validStatuses = ["present", "absent", "tardy", "excused", "checked_in", "early_dismissal"];
  const safeStatus = validStatuses.includes(params.status) ? params.status : "present";

  const supabase = await createClient();

  const { data: prev } = await supabase
    .from("attendance_records")
    .select("status, check_in_at, check_out_at, is_late, is_early_pickup, notes")
    .eq("id", params.recordId)
    .eq("organization_id", orgId)
    .single();

  const { error } = await supabase
    .from("attendance_records")
    .update({
      status:          safeStatus,
      check_in_at:     params.checkInAt,
      check_out_at:    params.checkOutAt,
      is_late:         params.isLate,
      is_early_pickup: params.isEarlyPickup,
      notes:           params.notes,
    } as never)
    .eq("id", params.recordId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  const { writeAuditLog } = await import("@/lib/audit");
  await writeAuditLog(supabase, {
    organizationId: orgId,
    actorId:        user.id,
    action:         "attendance.corrected",
    resourceType:   "attendance_record",
    resourceId:     params.recordId,
    previousValues: prev ?? {},
    newValues:      {
      status:          safeStatus,
      check_in_at:     params.checkInAt,
      check_out_at:    params.checkOutAt,
      is_late:         params.isLate,
      is_early_pickup: params.isEarlyPickup,
    },
    metadata: { adminNote: params.adminNote ?? null },
  });

  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/home");
  return { success: true };
}

// ── Reset attendance for a day (deletes record; student → "Not Recorded") ──

export async function resetAttendanceDay(
  recordId: string,
  adminNote?: string
): Promise<AR> {
  const { getActiveRole } = await import("@/lib/supabase/org-context");
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };
  if (!["admin", "full_admin", "platform_admin", "registrar", "staff", "teacher"].includes(role ?? "")) {
    return { success: false, error: "Staff access required." };
  }

  const supabase = await createClient();

  const { data: prev } = await supabase
    .from("attendance_records")
    .select("student_id, date, status, check_in_at, check_out_at")
    .eq("id", recordId)
    .eq("organization_id", orgId)
    .single();

  const { error } = await supabase
    .from("attendance_records")
    .delete()
    .eq("id", recordId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  const { writeAuditLog } = await import("@/lib/audit");
  await writeAuditLog(supabase, {
    organizationId: orgId,
    actorId:        user.id,
    action:         "attendance.reset",
    resourceType:   "attendance_record",
    resourceId:     recordId,
    previousValues: prev ?? {},
    metadata:       { adminNote: adminNote ?? null },
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
