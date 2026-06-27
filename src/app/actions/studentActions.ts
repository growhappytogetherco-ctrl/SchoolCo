"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";

// ── Check In ──────────────────────────────────────────────────────────────

export async function checkInStudent(studentId: string): Promise<
  { success: true; already: boolean } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();
  const today    = new Date().toISOString().split("T")[0];

  // Check if already checked in today
  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id, check_in_at")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("date", today)
    .maybeSingle();

  const existingRow = existing as { id: string; check_in_at: string | null } | null;

  if (existingRow?.check_in_at) {
    return { success: true, already: true };
  }

  const now = new Date().toISOString();

  if (existingRow) {
    // Record exists but no check-in time yet — update it
    const { error } = await supabase
      .from("attendance_records")
      .update({ check_in_at: now, status: "present", check_in_by: user.id } as never)
      .eq("id", existingRow.id);
    if (error) return { success: false, error: error.message };
  } else {
    // Create new record
    const { error } = await supabase
      .from("attendance_records")
      .insert({
        organization_id: orgId,
        student_id:      studentId,
        date:            today,
        status:          "present",
        check_in_at:     now,
        check_in_by:     user.id,
      } as never);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/home");
  return { success: true, already: false };
}

// ── Check Out ─────────────────────────────────────────────────────────────

export interface CheckOutPayload {
  released_to:    string;
  released_to_id: string | null;
  notes:          string;
}

export async function checkOutStudent(
  studentId: string,
  payload: CheckOutPayload
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!payload.released_to.trim()) return { success: false, error: "Released-to name is required" };

  const supabase = await createClient();
  const today    = new Date().toISOString().split("T")[0];
  const now      = new Date().toISOString();

  const { data: existing } = await supabase
    .from("attendance_records")
    .select("id, check_out_at")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("date", today)
    .maybeSingle();

  const existingRow = existing as { id: string; check_out_at: string | null } | null;

  if (existingRow?.check_out_at) {
    return { success: false, error: "Student already checked out today" };
  }

  if (existingRow) {
    const { error } = await supabase
      .from("attendance_records")
      .update({
        check_out_at:         now,
        status:               "present",
        check_out_by:         user.id,
        checkout_released_to:     payload.released_to.trim(),
        checkout_released_to_id:  payload.released_to_id,
        checkout_notes:           payload.notes || null,
      } as never)
      .eq("id", existingRow.id);
    if (error) return { success: false, error: error.message };
  } else {
    // No check-in — create a record with only checkout (manual)
    const { error } = await supabase
      .from("attendance_records")
      .insert({
        organization_id:          orgId,
        student_id:               studentId,
        date:                     today,
        status:                   "present",
        check_out_at:             now,
        checked_out_by:           user.id,
        checkout_released_to:     payload.released_to.trim(),
        checkout_released_to_id:  payload.released_to_id,
        checkout_notes:           payload.notes || null,
      } as never);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/attendance");
  revalidatePath("/dashboard/home");
  return { success: true };
}

// ── Add Staff Note ────────────────────────────────────────────────────────

export interface StaffNotePayload {
  title:          string;
  body:           string;
  category:       string;
  priority:       string;
  is_pinned:      boolean;
  follow_up:      boolean;
  staff_only:     boolean;
}

export async function addStaffNote(
  studentId: string,
  payload: StaffNotePayload
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!payload.title.trim()) return { success: false, error: "Title is required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("timeline_entries")
    .insert({
      organization_id: orgId,
      student_id:      studentId,
      author_id:       user.id,
      entry_type:      payload.staff_only ? "staff_note" : "staff_note_shared",
      title:           payload.title.trim(),
      body:            payload.body || null,
      category:        payload.category || null,
      priority:        payload.priority || "normal",
      is_pinned:       payload.is_pinned,
      follow_up_needed: payload.follow_up,
      staff_only:      payload.staff_only,
    } as never);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/students/${studentId}`);
  return { success: true };
}

// ── Add Incident ──────────────────────────────────────────────────────────

export interface IncidentPayload {
  title:         string;
  description:   string;
  incident_type: string;
  severity:      string;
  location:      string;
  occurred_at:   string;
  parent_notified: boolean;
}

export async function createIncident(
  studentId: string | null,
  payload: IncidentPayload
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!payload.title.trim()) return { success: false, error: "Title is required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("incidents")
    .insert({
      organization_id:  orgId,
      student_id:       studentId,
      reported_by:      user.id,
      title:            payload.title.trim(),
      description:      payload.description || null,
      incident_type:    payload.incident_type || "behavioral",
      severity:         payload.severity || null,
      location:         payload.location || null,
      occurred_at:      payload.occurred_at || new Date().toISOString(),
      status:           "open",
      parent_notified:  payload.parent_notified,
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to create incident" };

  if (studentId) revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/incidents");
  revalidatePath("/dashboard/home");
  return { success: true, id: (data as unknown as { id: string }).id };
}

// ── Add Work Sample ───────────────────────────────────────────────────────

export interface WorkSamplePayload {
  title:            string;
  subject:          string;
  description:      string;
  sample_date:      string;
  external_url:     string;
  parent_visible:   boolean;
  yearbook_eligible: boolean;
  teacher_comments: string;
  quality_rating:   number | null;
}

export async function addWorkSample(
  studentId: string,
  payload: WorkSamplePayload
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!payload.title.trim()) return { success: false, error: "Title is required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_samples")
    .insert({
      organization_id:    orgId,
      student_id:         studentId,
      uploaded_by:        user.id,
      title:              payload.title.trim(),
      subject:            payload.subject || null,
      description:        payload.description || null,
      work_date:          payload.sample_date || new Date().toISOString().split("T")[0],
      external_url:       payload.external_url || null,
      visible_to_parent:  payload.parent_visible,
      include_in_yearbook: payload.yearbook_eligible,
      teacher_comments:   payload.teacher_comments || null,
      quality_rating:     payload.quality_rating,
      file_type:          "link",
    } as never);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/students/${studentId}`);
  return { success: true };
}
