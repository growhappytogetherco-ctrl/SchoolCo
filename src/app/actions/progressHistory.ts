"use server";

import { createClient, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import { SUBJECT_LABELS } from "@/lib/academics-constants";

function isStaffOrAbove(role: string | null | undefined) {
  return !["parent", "student_future", "volunteer"].includes(role ?? "");
}
import type { ConfidenceLevel } from "@/lib/progress-constants";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ProgressRecord {
  id: string;
  student_id: string;
  organization_id: string;
  subject: string;
  recorded_date: string;          // YYYY-MM-DD
  curriculum_enrollment_id: string | null;
  assessment_id: string | null;
  growth_goal_id: string | null;
  staff_member_id: string | null;
  staff_name: string | null;      // joined from profiles
  curriculum_name: string | null;
  current_level: string | null;
  current_lesson: string | null;
  current_unit: string | null;
  skill_or_topic: string | null;
  mastery_pct: number | null;
  confidence_level: ConfidenceLevel | null;
  notes: string | null;
  next_steps: string | null;
  parent_visible: boolean;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ProgressPayload {
  subject: string;
  curriculum_enrollment_id: string | null;
  assessment_id: string | null;
  growth_goal_id: string | null;
  staff_member_id: string | null;
  recorded_date: string;
  curriculum_name: string | null;
  current_level: string | null;
  current_lesson: string | null;
  current_unit: string | null;
  skill_or_topic: string | null;
  mastery_pct: number | null;
  confidence_level: ConfidenceLevel | null;
  notes: string | null;
  next_steps: string | null;
  parent_visible: boolean;
}

export interface SubjectGrowthEntry {
  subject: string;
  subjectLabel: string;
  recordCount: number;
  latestDate: string | null;
  latestMastery: number | null;
  latestLevel: string | null;
  latestConfidence: ConfidenceLevel | null;
  latestNotes: string | null;
  masteryDelta: number | null;         // compared to earliest record
  daysSinceUpdate: number | null;
  isStale: boolean;                    // no update in 30 days
}

export interface ProgressSnapshot {
  totalRecords: number;
  subjectCount: number;
  latestDate: string | null;
  isStale: boolean;
  stalenessMessage: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fromRow(row: Record<string, unknown>): ProgressRecord {
  return {
    id:                       row.id as string,
    student_id:               row.student_id as string,
    organization_id:          row.organization_id as string,
    subject:                  row.subject as string,
    recorded_date:            row.recorded_date as string,
    curriculum_enrollment_id: (row.curriculum_enrollment_id as string) ?? null,
    assessment_id:            (row.assessment_id as string) ?? null,
    growth_goal_id:           (row.growth_goal_id as string) ?? null,
    staff_member_id:          (row.staff_member_id as string) ?? null,
    staff_name:               (row.staff_name as string) ?? null,
    curriculum_name:          (row.curriculum_name as string) ?? null,
    current_level:            (row.current_level as string) ?? null,
    current_lesson:           (row.current_lesson as string) ?? null,
    current_unit:             (row.current_unit as string) ?? null,
    skill_or_topic:           (row.skill_or_topic as string) ?? null,
    mastery_pct:              row.mastery_pct != null ? Number(row.mastery_pct) : null,
    confidence_level:         (row.confidence_level as ConfidenceLevel) ?? null,
    notes:                    (row.notes as string) ?? null,
    next_steps:               (row.next_steps as string) ?? null,
    parent_visible:           Boolean(row.parent_visible),
    created_at:               row.created_at as string,
    updated_at:               (row.updated_at as string) ?? row.created_at as string,
    archived_at:              (row.archived_at as string) ?? null,
  };
}

// ── Server Actions ────────────────────────────────────────────────────────────

export async function getProgressRecords(
  studentId: string,
  opts?: { subject?: string; includeArchived?: boolean }
): Promise<ProgressRecord[]> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) return [];

  const supabase = await createClient();

  let q = supabase
    .from("academic_progress")
    .select(`
      id, student_id, organization_id, subject,
      recorded_date, curriculum_enrollment_id, assessment_id,
      growth_goal_id, staff_member_id, curriculum_name,
      current_level, current_lesson, current_unit,
      skill_or_topic, mastery_pct, confidence_level,
      notes, next_steps, parent_visible,
      created_at, updated_at, archived_at,
      profiles:recorded_by ( full_name )
    `)
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .order("recorded_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts?.subject) q = q.eq("subject", opts.subject);
  if (!opts?.includeArchived) q = q.is("archived_at", null);

  const { data, error } = await q;
  if (error || !data) return [];

  return (data as unknown as Record<string, unknown>[]).map((row) => {
    const staffProfile = row.profiles as { full_name?: string } | null;
    return fromRow({ ...row, staff_name: staffProfile?.full_name ?? null });
  });
}

export async function createProgressRecord(
  studentId: string,
  payload: ProgressPayload
): Promise<{ id: string } | { error: string }> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) return { error: "Unauthorized" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const insert = {
    student_id:               studentId,
    organization_id:          orgId,
    subject:                  payload.subject,
    recorded_date:            payload.recorded_date || new Date().toISOString().split("T")[0],
    curriculum_enrollment_id: payload.curriculum_enrollment_id || null,
    assessment_id:            payload.assessment_id || null,
    growth_goal_id:           payload.growth_goal_id || null,
    staff_member_id:          payload.staff_member_id || null,
    recorded_by:              userId,
    curriculum_name:          payload.curriculum_name || null,
    current_level:            payload.current_level || null,
    current_lesson:           payload.current_lesson || null,
    current_unit:             payload.current_unit || null,
    skill_or_topic:           payload.skill_or_topic || null,
    mastery_pct:              payload.mastery_pct ?? null,
    confidence_level:         payload.confidence_level || null,
    notes:                    payload.notes || null,
    next_steps:               payload.next_steps || null,
    parent_visible:           payload.parent_visible ?? false,
    updated_by:               userId,
  };

  const { data, error } = await supabase
    .from("academic_progress")
    .insert(insert as never)
    .select("id")
    .single();

  if (error) return { error: error.message };
  return { id: (data as unknown as { id: string }).id };
}

export async function updateProgressRecord(
  recordId: string,
  payload: ProgressPayload
): Promise<{ success: true } | { error: string }> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) return { error: "Unauthorized" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const update = {
    subject:                  payload.subject,
    recorded_date:            payload.recorded_date,
    curriculum_enrollment_id: payload.curriculum_enrollment_id || null,
    assessment_id:            payload.assessment_id || null,
    growth_goal_id:           payload.growth_goal_id || null,
    staff_member_id:          payload.staff_member_id || null,
    curriculum_name:          payload.curriculum_name || null,
    current_level:            payload.current_level || null,
    current_lesson:           payload.current_lesson || null,
    current_unit:             payload.current_unit || null,
    skill_or_topic:           payload.skill_or_topic || null,
    mastery_pct:              payload.mastery_pct ?? null,
    confidence_level:         payload.confidence_level || null,
    notes:                    payload.notes || null,
    next_steps:               payload.next_steps || null,
    parent_visible:           payload.parent_visible ?? false,
    updated_by:               userId,
    updated_at:               new Date().toISOString(),
  };

  const { error } = await supabase
    .from("academic_progress")
    .update(update as never)
    .eq("id", recordId)
    .eq("organization_id", orgId);

  if (error) return { error: error.message };
  return { success: true };
}

export async function archiveProgressRecord(
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

export async function restoreProgressRecord(
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

export async function getStudentGrowthSummary(
  studentId: string
): Promise<SubjectGrowthEntry[]> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) return [];

  const supabase = await createClient();

  const { data } = await supabase
    .from("academic_progress")
    .select("subject, recorded_date, mastery_pct, current_level, confidence_level, notes, created_at")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("recorded_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return [];

  const bySubject = new Map<string, typeof data>();
  for (const row of data as unknown as Record<string, unknown>[]) {
    const sub = row.subject as string;
    if (!bySubject.has(sub)) bySubject.set(sub, []);
    bySubject.get(sub)!.push(row as never);
  }

  const today = new Date();
  const results: SubjectGrowthEntry[] = [];

  for (const [subject, rows] of Array.from(bySubject.entries())) {
    const earliest = rows[0] as unknown as Record<string, unknown>;
    const latest   = rows[rows.length - 1] as unknown as Record<string, unknown>;

    const earliestMastery = earliest.mastery_pct != null ? Number(earliest.mastery_pct) : null;
    const latestMastery   = latest.mastery_pct   != null ? Number(latest.mastery_pct)   : null;

    let masteryDelta: number | null = null;
    if (rows.length > 1 && earliestMastery != null && latestMastery != null) {
      masteryDelta = Math.round((latestMastery - earliestMastery) * 10) / 10;
    }

    const latestDate = latest.recorded_date as string | null;
    let daysSinceUpdate: number | null = null;
    if (latestDate) {
      const d = new Date(latestDate);
      daysSinceUpdate = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    }

    results.push({
      subject,
      subjectLabel:     SUBJECT_LABELS[subject as keyof typeof SUBJECT_LABELS] ?? subject,
      recordCount:      rows.length,
      latestDate,
      latestMastery,
      latestLevel:      (latest.current_level as string) ?? null,
      latestConfidence: (latest.confidence_level as ConfidenceLevel) ?? null,
      latestNotes:      (latest.notes as string) ?? null,
      masteryDelta,
      daysSinceUpdate,
      isStale:          daysSinceUpdate != null ? daysSinceUpdate > 30 : false,
    });
  }

  // Sort: most recently updated first
  results.sort((a, b) => {
    if (!a.latestDate) return 1;
    if (!b.latestDate) return -1;
    return b.latestDate.localeCompare(a.latestDate);
  });

  return results;
}

export async function getProgressSnapshot(
  studentId: string
): Promise<ProgressSnapshot> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) {
    return { totalRecords: 0, subjectCount: 0, latestDate: null, isStale: false, stalenessMessage: null };
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from("academic_progress")
    .select("subject, recorded_date")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("recorded_date", { ascending: false });

  if (!data || data.length === 0) {
    return { totalRecords: 0, subjectCount: 0, latestDate: null, isStale: false, stalenessMessage: null };
  }

  const rows = data as unknown as { subject: string; recorded_date: string }[];
  const subjects = new Set(rows.map((r) => r.subject));
  const latestDate = rows[0]?.recorded_date ?? null;

  let daysSince: number | null = null;
  if (latestDate) {
    const d = new Date(latestDate);
    daysSince = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  }

  const isStale = daysSince != null ? daysSince > 30 : false;
  const stalenessMessage = isStale
    ? `No progress update in ${daysSince} days`
    : null;

  return {
    totalRecords: rows.length,
    subjectCount: subjects.size,
    latestDate,
    isStale,
    stalenessMessage,
  };
}
