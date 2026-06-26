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
    record: recordMap.get(s.id) ?? null,
  }));
}
