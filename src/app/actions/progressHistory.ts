"use server";

import { createClient, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import { SUBJECT_LABELS } from "@/lib/academics-constants";
import type { CheckInType, CheckInStatus, ConfidenceLevel } from "@/lib/progress-constants";

function isStaffOrAbove(role: string | null | undefined) {
  return !["parent", "student_future", "volunteer"].includes(role ?? "");
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CheckIn {
  id: string;
  student_id: string;
  organization_id: string;
  subject: string;
  check_in_type: CheckInType | null;
  recorded_date: string;
  lesson_topic: string | null;
  what_was_worked_on: string | null;
  student_response: string | null;
  progress_observed: string | null;
  next_steps: string | null;
  confidence_level: ConfidenceLevel | null;
  parent_follow_up_required: boolean;
  parent_follow_up_notes: string | null;
  curriculum_enrollment_id: string | null;
  growth_goal_id: string | null;
  assessment_id: string | null;
  staff_member_id: string | null;   // recorded_by profile id
  staff_name: string | null;        // joined full_name
  assigned_staff_id: string | null;
  assigned_staff_name: string | null;
  due_date: string | null;
  status: CheckInStatus;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface CheckInPayload {
  subject: string;
  check_in_type: CheckInType | null;
  recorded_date: string;
  lesson_topic: string | null;
  what_was_worked_on: string | null;
  student_response: string | null;
  progress_observed: string | null;
  next_steps: string | null;
  confidence_level: ConfidenceLevel | null;
  parent_follow_up_required: boolean;
  parent_follow_up_notes: string | null;
  curriculum_enrollment_id: string | null;
  growth_goal_id: string | null;
  assessment_id: string | null;
  assigned_staff_id: string | null;
  due_date: string | null;
  status: CheckInStatus;
}

export interface ProgressSummary {
  totalCheckIns: number;
  totalOneSessions: number;
  lastUpdateDate: string | null;
  lastUpdatedBy: string | null;
  monitoredSubjects: string[];   // display labels
  openFollowUps: number;
}

export interface ProgressSnapshot {
  totalRecords: number;
  lastCheckInDate: string | null;
  lastStaffName: string | null;
  lastSubject: string | null;
  openFollowUps: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fromRow(row: Record<string, unknown>): CheckIn {
  const staffProfile    = row.profiles as { full_name?: string } | null;
  const assignedProfile = row.assigned_staff as { full_name?: string } | null;

  return {
    id:                        row.id as string,
    student_id:                row.student_id as string,
    organization_id:           row.organization_id as string,
    subject:                   row.subject as string,
    check_in_type:             (row.check_in_type as CheckInType) ?? null,
    recorded_date:             row.recorded_date as string,
    lesson_topic:              (row.lesson_topic as string) ?? null,
    what_was_worked_on:        (row.what_was_worked_on as string) ?? (row.notes as string) ?? null,
    student_response:          (row.student_response as string) ?? null,
    progress_observed:         (row.progress_observed as string) ?? null,
    next_steps:                (row.next_steps as string) ?? null,
    confidence_level:          (row.confidence_level as ConfidenceLevel) ?? null,
    parent_follow_up_required: Boolean(row.parent_follow_up_required),
    parent_follow_up_notes:    (row.parent_follow_up_notes as string) ?? null,
    curriculum_enrollment_id:  (row.curriculum_enrollment_id as string) ?? null,
    growth_goal_id:            (row.growth_goal_id as string) ?? null,
    assessment_id:             (row.assessment_id as string) ?? null,
    staff_member_id:           (row.recorded_by as string) ?? null,
    staff_name:                staffProfile?.full_name ?? null,
    assigned_staff_id:         (row.assigned_staff_id as string) ?? null,
    assigned_staff_name:       assignedProfile?.full_name ?? null,
    due_date:                  (row.due_date as string) ?? null,
    status:                    ((row.status as CheckInStatus) || "open"),
    created_at:                row.created_at as string,
    updated_at:                (row.updated_at as string) ?? (row.created_at as string),
    archived_at:               (row.archived_at as string) ?? null,
  };
}

// School year start: July 1 of current or previous calendar year
function schoolYearStart(): string {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-07-01`;
}

// ── Server Actions ────────────────────────────────────────────────────────────

export async function getCheckIns(
  studentId: string,
  opts?: {
    subject?: string;
    checkInType?: string;
    status?: string;
    staffId?: string;
    dateFrom?: string;
    dateTo?: string;
    includeArchived?: boolean;
  }
): Promise<CheckIn[]> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) return [];

  const supabase = await createClient();

  let q = supabase
    .from("academic_progress")
    .select(`
      id, student_id, organization_id, subject,
      check_in_type, recorded_date,
      lesson_topic, what_was_worked_on, notes,
      student_response, progress_observed, next_steps,
      confidence_level, parent_follow_up_required, parent_follow_up_notes,
      curriculum_enrollment_id, assessment_id, growth_goal_id,
      recorded_by, staff_member_id, assigned_staff_id,
      due_date, status,
      created_at, updated_at, archived_at,
      profiles:recorded_by ( full_name ),
      assigned_staff:assigned_staff_id ( full_name )
    `)
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .order("recorded_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts?.subject)      q = q.eq("subject", opts.subject);
  if (opts?.checkInType)  q = q.eq("check_in_type", opts.checkInType);
  if (opts?.status)       q = q.eq("status", opts.status);
  if (opts?.staffId)      q = q.eq("recorded_by", opts.staffId);
  if (opts?.dateFrom)     q = q.gte("recorded_date", opts.dateFrom);
  if (opts?.dateTo)       q = q.lte("recorded_date", opts.dateTo);
  if (!opts?.includeArchived) q = q.is("archived_at", null);

  const { data, error } = await q;
  if (error || !data) return [];

  return (data as unknown as Record<string, unknown>[]).map(fromRow);
}

export async function getProgressSummary(studentId: string): Promise<ProgressSummary> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) {
    return { totalCheckIns: 0, totalOneSessions: 0, lastUpdateDate: null, lastUpdatedBy: null, monitoredSubjects: [], openFollowUps: 0 };
  }

  const supabase = await createClient();
  const syStart = schoolYearStart();

  const { data } = await supabase
    .from("academic_progress")
    .select(`
      id, subject, check_in_type, recorded_date,
      parent_follow_up_required, status,
      profiles:recorded_by ( full_name )
    `)
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .gte("recorded_date", syStart)
    .order("recorded_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!data || data.length === 0) {
    return { totalCheckIns: 0, totalOneSessions: 0, lastUpdateDate: null, lastUpdatedBy: null, monitoredSubjects: [], openFollowUps: 0 };
  }

  const rows = data as unknown as Record<string, unknown>[];
  const latest = rows[0];
  const latestStaff = latest.profiles as { full_name?: string } | null;

  const subjects = new Set(rows.map((r) => r.subject as string));
  const monitoredSubjects = Array.from(subjects).map(
    (s) => SUBJECT_LABELS[s as keyof typeof SUBJECT_LABELS] ?? s
  );

  const totalOneSessions = rows.filter((r) => r.check_in_type === "one_on_one_session").length;
  const openFollowUps = rows.filter(
    (r) => r.parent_follow_up_required === true && r.status !== "completed"
  ).length;

  return {
    totalCheckIns:     rows.length,
    totalOneSessions,
    lastUpdateDate:    latest.recorded_date as string,
    lastUpdatedBy:     latestStaff?.full_name ?? null,
    monitoredSubjects,
    openFollowUps,
  };
}

export async function getProgressSnapshot(studentId: string): Promise<ProgressSnapshot> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) {
    return { totalRecords: 0, lastCheckInDate: null, lastStaffName: null, lastSubject: null, openFollowUps: 0 };
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from("academic_progress")
    .select("subject, recorded_date, parent_follow_up_required, status, profiles:recorded_by ( full_name )")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("recorded_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!data || data.length === 0) {
    return { totalRecords: 0, lastCheckInDate: null, lastStaffName: null, lastSubject: null, openFollowUps: 0 };
  }

  const rows = data as unknown as Record<string, unknown>[];
  const latest = rows[0];
  const latestStaff = latest.profiles as { full_name?: string } | null;

  const openFollowUps = rows.filter(
    (r) => r.parent_follow_up_required === true && r.status !== "completed"
  ).length;

  return {
    totalRecords:    rows.length,
    lastCheckInDate: latest.recorded_date as string,
    lastStaffName:   latestStaff?.full_name ?? null,
    lastSubject:     SUBJECT_LABELS[(latest.subject as keyof typeof SUBJECT_LABELS)] ?? (latest.subject as string),
    openFollowUps,
  };
}

export async function createCheckIn(
  studentId: string,
  payload: CheckInPayload
): Promise<{ id: string } | { error: string }> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) return { error: "Unauthorized" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const insert = {
    student_id:                studentId,
    organization_id:           orgId,
    subject:                   payload.subject,
    check_in_type:             payload.check_in_type || null,
    recorded_date:             payload.recorded_date || new Date().toISOString().split("T")[0],
    lesson_topic:              payload.lesson_topic || null,
    what_was_worked_on:        payload.what_was_worked_on || null,
    notes:                     payload.what_was_worked_on || null,   // keep notes column in sync
    student_response:          payload.student_response || null,
    progress_observed:         payload.progress_observed || null,
    next_steps:                payload.next_steps || null,
    confidence_level:          payload.confidence_level || null,
    parent_follow_up_required: payload.parent_follow_up_required ?? false,
    parent_follow_up_notes:    payload.parent_follow_up_notes || null,
    curriculum_enrollment_id:  payload.curriculum_enrollment_id || null,
    growth_goal_id:            payload.growth_goal_id || null,
    assessment_id:             payload.assessment_id || null,
    recorded_by:               userId,
    assigned_staff_id:         payload.assigned_staff_id || null,
    due_date:                  payload.due_date || null,
    status:                    payload.status || "open",
    updated_by:                userId,
  };

  const { data, error } = await supabase
    .from("academic_progress")
    .insert(insert as never)
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: (data as unknown as { id: string }).id };
}

export async function updateCheckIn(
  recordId: string,
  payload: CheckInPayload
): Promise<{ success: true } | { error: string }> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) return { error: "Unauthorized" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const update = {
    subject:                   payload.subject,
    check_in_type:             payload.check_in_type || null,
    recorded_date:             payload.recorded_date,
    lesson_topic:              payload.lesson_topic || null,
    what_was_worked_on:        payload.what_was_worked_on || null,
    notes:                     payload.what_was_worked_on || null,
    student_response:          payload.student_response || null,
    progress_observed:         payload.progress_observed || null,
    next_steps:                payload.next_steps || null,
    confidence_level:          payload.confidence_level || null,
    parent_follow_up_required: payload.parent_follow_up_required ?? false,
    parent_follow_up_notes:    payload.parent_follow_up_notes || null,
    curriculum_enrollment_id:  payload.curriculum_enrollment_id || null,
    growth_goal_id:            payload.growth_goal_id || null,
    assessment_id:             payload.assessment_id || null,
    assigned_staff_id:         payload.assigned_staff_id || null,
    due_date:                  payload.due_date || null,
    status:                    payload.status || "open",
    updated_by:                userId,
    updated_at:                new Date().toISOString(),
  };

  const { error } = await supabase
    .from("academic_progress")
    .update(update as never)
    .eq("id", recordId)
    .eq("organization_id", orgId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function archiveCheckIn(
  recordId: string
): Promise<{ success: true } | { error: string }> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) return { error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("academic_progress")
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("id", recordId)
    .eq("organization_id", orgId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function restoreCheckIn(
  recordId: string
): Promise<{ success: true } | { error: string }> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) return { error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("academic_progress")
    .update({ archived_at: null } as never)
    .eq("id", recordId)
    .eq("organization_id", orgId);

  if (error) return { error: error.message };
  return { success: true };
}
