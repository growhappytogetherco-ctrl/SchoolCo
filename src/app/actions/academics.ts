"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import { isAdminRole } from "@/lib/constants";

// ── Subjects ────────────────────────────────────────────────────────────────

export const SUBJECTS = [
  "math", "reading", "writing", "ela", "science", "history",
  "bible", "spanish", "leadership", "entrepreneurship",
  "elective", "art", "music", "pe", "other",
] as const;

export type Subject = typeof SUBJECTS[number];

export const SUBJECT_LABELS: Record<Subject, string> = {
  math:            "Math",
  reading:         "Reading",
  writing:         "Writing",
  ela:             "ELA",
  science:         "Science",
  history:         "History",
  bible:           "Bible",
  spanish:         "Spanish",
  leadership:      "Leadership",
  entrepreneurship:"Entrepreneurship",
  elective:        "Elective",
  art:             "Art",
  music:           "Music",
  pe:              "PE",
  other:           "Other",
};

export type CurriculumStatus =
  | "not_started" | "active" | "paused" | "completed" | "changed_curriculum" | "dropped";

export type InterventionStatus = "monitoring" | "active" | "completed" | "discontinued";
export type OOORequestedBy     = "parent" | "teacher" | "assessment" | "student_success_plan" | "other";
export type OOOPriority        = "low" | "medium" | "high";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CurriculumEnrollment {
  id:                        string;
  student_id:                string;
  subject:                   Subject;
  curriculum_name:           string;
  publisher:                 string | null;
  current_level:             string | null;
  current_unit:              string | null;
  current_lesson:            string | null;
  teacher_id:                string | null;
  teacher_name:              string | null;
  start_date:                string | null;
  expected_completion:       string | null;
  completion_pct:            number;
  status:                    CurriculumStatus;
  visibility:                string;
  notes:                     string | null;
  linked_goal_id:            string | null;
  archived_at:               string | null;
  one_on_one_needed:         boolean;
  one_on_one_requested_by:   OOORequestedBy | null;
  one_on_one_reason:         string | null;
  one_on_one_priority:       OOOPriority;
  one_on_one_date_identified:string | null;
  intervention_status:       InterventionStatus | null;
  created_at:                string;
  updated_at:                string;
}

export type CurriculumPayload = Omit<CurriculumEnrollment,
  "id" | "student_id" | "created_at" | "updated_at" | "archived_at"
>;

export interface InterventionSession {
  id:                       string;
  student_id:               string;
  curriculum_enrollment_id: string;
  session_date:             string;
  subject:                  string;
  staff_id:                 string | null;
  duration_minutes:         number | null;
  focus_skill:              string | null;
  lesson_unit_covered:      string | null;
  student_response:         string | null;
  progress_observed:        string | null;
  next_steps:               string | null;
  parent_followup_needed:   boolean;
  created_at:               string;
  updated_at:               string;
  created_by:               string | null;
}

export type InterventionSessionPayload = Omit<InterventionSession,
  "id" | "student_id" | "created_at" | "updated_at" | "created_by"
>;

// Legacy types kept for existing callers
export interface AcademicProgressRecord {
  id: string;
  student_id: string;
  curriculum_enrollment_id: string | null;
  subject: string;
  curriculum_name: string | null;
  level: string | null;
  lesson: string | null;
  mastery_pct: number | null;
  notes: string | null;
  recorded_date: string;
  recorded_by: string | null;
  recorder_name?: string | null;
}

export interface Assessment {
  id: string;
  student_id: string;
  subject: string;
  assessment_name: string;
  assessment_period: "boy" | "moy" | "eoy" | "additional";
  assessment_date: string;
  score_raw: number | null;
  score_max: number | null;
  score_pct: number | null;
  grade_equivalent: string | null;
  performance_level: string | null;
  stanine: number | null;
  percentile_rank: number | null;
  teacher_comments: string | null;
  google_drive_file_url: string | null;
  visibility: string;
  created_at: string;
  created_by: string | null;
  creator_name?: string | null;
}

// ── Role guard ───────────────────────────────────────────────────────────────

function isStaffOrAbove(role: string | null | undefined) {
  return role && !["parent", "student_future", "volunteer"].includes(role);
}

// ── Curriculum CRUD ──────────────────────────────────────────────────────────

export async function getCurriculumEnrollments(studentId: string): Promise<CurriculumEnrollment[]> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return [];

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("curriculum_enrollments")
      .select("*")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("subject");

    if (error) {
      // Fallback: try without the archived_at filter in case schema cache is stale
      const { data: fallback } = await supabase
        .from("curriculum_enrollments")
        .select("*")
        .eq("student_id", studentId)
        .eq("organization_id", orgId)
        .order("subject");
      return ((fallback ?? []) as unknown as CurriculumEnrollment[])
        .filter((r) => !r.archived_at);
    }

    return (data ?? []) as unknown as CurriculumEnrollment[];
  } catch {
    return [];
  }
}

// Includes archived (changed_curriculum) records for history view
export async function getCurriculumHistory(studentId: string): Promise<CurriculumEnrollment[]> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return [];

    const supabase = await createClient();
    const { data } = await supabase
      .from("curriculum_enrollments")
      .select("*")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(50);

    return (data ?? []) as unknown as CurriculumEnrollment[];
  } catch {
    return [];
  }
}

export async function createCurriculumRecord(
  studentId: string,
  payload: CurriculumPayload
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };
  if (!payload.curriculum_name.trim()) return { success: false, error: "Curriculum name is required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("curriculum_enrollments")
    .insert({
      organization_id:            orgId,
      student_id:                 studentId,
      created_by:                 user.id,
      last_updated_by:            user.id,
      updated_by:                 user.id,
      ...payload,
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Insert failed" };
  return { success: true, id: (data as unknown as { id: string }).id };
}

export async function updateCurriculumRecord(
  id: string,
  studentId: string,
  payload: Partial<CurriculumPayload>
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("curriculum_enrollments")
    .update({ ...payload, last_updated_by: user.id, updated_by: user.id } as never)
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  return error ? { success: false, error: error.message } : { success: true };
}

// Mark old record as changed_curriculum + create new active one
export async function changeCurriculum(
  oldId: string,
  studentId: string,
  newPayload: CurriculumPayload
): Promise<{ success: true; newId: string } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };
  if (!newPayload.curriculum_name.trim()) return { success: false, error: "Curriculum name is required" };

  const supabase = await createClient();

  // Archive old record
  const { error: archiveError } = await supabase
    .from("curriculum_enrollments")
    .update({
      status:          "changed_curriculum",
      archived_at:     new Date().toISOString(),
      last_updated_by: user.id,
      updated_by:      user.id,
    } as never)
    .eq("id", oldId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  if (archiveError) return { success: false, error: archiveError.message };

  // Create new record
  const { data, error: insertError } = await supabase
    .from("curriculum_enrollments")
    .insert({
      organization_id: orgId,
      student_id:      studentId,
      created_by:      user.id,
      last_updated_by: user.id,
      updated_by:      user.id,
      ...newPayload,
    } as never)
    .select("id")
    .single();

  if (insertError || !data) return { success: false, error: insertError?.message ?? "Insert failed" };
  return { success: true, newId: (data as unknown as { id: string }).id };
}

export async function archiveCurriculumRecord(
  id: string,
  studentId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("curriculum_enrollments")
    .update({
      archived_at:     new Date().toISOString(),
      last_updated_by: user.id,
      updated_by:      user.id,
    } as never)
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  return error ? { success: false, error: error.message } : { success: true };
}

// Legacy upsert kept for backward compatibility
export async function upsertCurriculum(
  studentId: string,
  payload: {
    id?: string;
    subject: Subject;
    curriculum_name: string;
    publisher?: string | null;
    current_level?: string | null;
    current_unit?: string | null;
    current_lesson?: string | null;
    teacher_name?: string | null;
    start_date?: string | null;
    expected_completion?: string | null;
    completion_pct?: number;
    status?: CurriculumStatus;
    visibility?: string;
  },
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  if (payload.id) {
    const r = await updateCurriculumRecord(payload.id, studentId, payload as Partial<CurriculumPayload>);
    return r.success ? { success: true, id: payload.id } : r;
  }
  return createCurriculumRecord(studentId, {
    subject:                    payload.subject,
    curriculum_name:            payload.curriculum_name,
    publisher:                  payload.publisher             ?? null,
    current_level:              payload.current_level         ?? null,
    current_unit:               payload.current_unit          ?? null,
    current_lesson:             payload.current_lesson        ?? null,
    teacher_name:               payload.teacher_name          ?? null,
    teacher_id:                 null,
    start_date:                 payload.start_date            ?? null,
    expected_completion:        payload.expected_completion   ?? null,
    completion_pct:             payload.completion_pct        ?? 0,
    status:                     payload.status                ?? "active",
    visibility:                 payload.visibility            ?? "parent_visible",
    notes:                      null,
    linked_goal_id:             null,
    one_on_one_needed:          false,
    one_on_one_requested_by:    null,
    one_on_one_reason:          null,
    one_on_one_priority:        "medium",
    one_on_one_date_identified: null,
    intervention_status:        null,
  });
}

// ── Student Snapshot — Academic Plan Summary ─────────────────────────────────

export interface AcademicPlanEntry {
  subject:     Subject;
  label:       string;
  name:        string;
  level:       string | null;
  lesson:      string | null;
  status:      CurriculumStatus;
  oo1_active:  boolean;    // has active 1:1 support
  oo1_status:  InterventionStatus | null;
}

export async function getAcademicPlanSummary(studentId: string): Promise<AcademicPlanEntry[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const role = await getActiveRole();
  if (!isStaffOrAbove(role)) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("curriculum_enrollments")
    .select("subject, curriculum_name, current_level, current_lesson, status, one_on_one_needed, intervention_status")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .in("status", ["active", "not_started", "paused"])
    .order("subject");

  return ((data ?? []) as unknown as CurriculumEnrollment[]).map((r) => ({
    subject:    r.subject,
    label:      SUBJECT_LABELS[r.subject] ?? r.subject,
    name:       r.curriculum_name,
    level:      r.current_level,
    lesson:     r.current_lesson,
    status:     r.status,
    oo1_active: r.one_on_one_needed,
    oo1_status: r.intervention_status,
  }));
}

// ── Dashboard Alerts (used by AlertsPanel on /dashboard/home) ────────────────

export interface StudentAlert {
  alert_type:   string;
  student_id:   string;
  student_name: string;
  message:      string;
  severity:     string;
  action_url:   string;
}

export async function getDashboardAlerts(): Promise<StudentAlert[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_student_alerts", { p_org_id: orgId } as never);
  return (data ?? []) as StudentAlert[];
}

// ── Intervention Sessions ────────────────────────────────────────────────────

export async function getInterventionSessions(
  curriculumEnrollmentId: string
): Promise<InterventionSession[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const role = await getActiveRole();
  if (!isStaffOrAbove(role)) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("intervention_sessions")
    .select("*")
    .eq("curriculum_enrollment_id", curriculumEnrollmentId)
    .eq("organization_id", orgId)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as InterventionSession[];
}

export async function logInterventionSession(
  studentId: string,
  payload: InterventionSessionPayload
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };
  if (!payload.session_date) return { success: false, error: "Session date is required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("intervention_sessions")
    .insert({
      organization_id: orgId,
      student_id:      studentId,
      created_by:      user.id,
      ...payload,
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Insert failed" };
  return { success: true, id: (data as unknown as { id: string }).id };
}

export async function updateInterventionSession(
  id: string,
  studentId: string,
  payload: Partial<InterventionSessionPayload>
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("intervention_sessions")
    .update(payload as never)
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  return error ? { success: false, error: error.message } : { success: true };
}

// ── Legacy read functions (kept for OverviewTab / AssessmentsTab) ────────────

export async function getAcademicProgress(
  studentId: string,
  subject?: string,
): Promise<AcademicProgressRecord[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  let q = supabase
    .from("academic_progress")
    .select("*, profiles:recorded_by(full_name)")
    .eq("student_id", studentId)
    .order("recorded_date", { ascending: false });
  if (subject) q = q.eq("subject", subject);
  const { data } = await q.limit(200);

  return ((data ?? []) as unknown[]).map((r) => {
    const row  = r as Record<string, unknown>;
    const prof = row.profiles as Record<string, string> | null;
    return { ...row, recorder_name: prof?.full_name ?? null } as AcademicProgressRecord;
  });
}

export async function recordProgress(
  studentId: string,
  payload: {
    curriculum_enrollment_id?: string | null;
    subject: string;
    curriculum_name?: string | null;
    level?: string | null;
    lesson?: string | null;
    mastery_pct?: number | null;
    notes?: string | null;
    recorded_date?: string;
  },
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_progress")
    .insert({
      organization_id:          orgId,
      student_id:               studentId,
      recorded_by:              user.id,
      curriculum_enrollment_id: payload.curriculum_enrollment_id ?? null,
      subject:                  payload.subject,
      curriculum_name:          payload.curriculum_name ?? null,
      level:                    payload.level           ?? null,
      lesson:                   payload.lesson          ?? null,
      mastery_pct:              payload.mastery_pct     ?? null,
      notes:                    payload.notes           ?? null,
      recorded_date:            payload.recorded_date   ?? new Date().toISOString().split("T")[0],
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Insert failed" };
  return { success: true, id: (data as unknown as { id: string }).id };
}

export async function getAssessments(
  studentId: string,
  subject?: string,
): Promise<Assessment[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  let q = supabase
    .from("assessments")
    .select("*, profiles:created_by(full_name)")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .order("assessment_date", { ascending: false });
  if (subject) q = q.eq("subject", subject);
  const { data } = await q.limit(100);

  return ((data ?? []) as unknown[]).map((r) => {
    const row  = r as Record<string, unknown>;
    const prof = row.profiles as Record<string, string> | null;
    return { ...row, creator_name: prof?.full_name ?? null } as Assessment;
  });
}

// Snapshot flag for any active 1:1 in OverviewTab
export async function getActiveInterventionSummary(
  studentId: string
): Promise<{ subject: Subject; label: string; intervention_status: InterventionStatus }[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const role = await getActiveRole();
  if (!isStaffOrAbove(role)) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("curriculum_enrollments")
    .select("subject, intervention_status")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("one_on_one_needed", true)
    .is("archived_at", null)
    .in("intervention_status", ["monitoring", "active"]);

  return ((data ?? []) as unknown as { subject: Subject; intervention_status: InterventionStatus }[]).map((r) => ({
    subject:             r.subject,
    label:               SUBJECT_LABELS[r.subject] ?? r.subject,
    intervention_status: r.intervention_status,
  }));
}
