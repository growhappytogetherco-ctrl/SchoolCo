"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";

export const SUBJECTS = [
  "math", "ela", "science", "history", "bible",
  "spanish", "elective", "leadership", "entrepreneurship",
  "art", "music", "pe", "other",
] as const;

export type Subject = typeof SUBJECTS[number];

export interface CurriculumEnrollment {
  id: string;
  student_id: string;
  subject: Subject;
  curriculum_name: string;
  publisher: string | null;
  current_level: string | null;
  current_unit: string | null;
  current_lesson: string | null;
  teacher_name: string | null;
  start_date: string | null;
  expected_completion: string | null;
  completion_pct: number;
  status: "active" | "completed" | "paused" | "dropped";
  visibility: string;
  created_at: string;
  updated_at: string;
}

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

// ── Curriculum ──────────────────────────────────────────────────────────────

export async function getCurriculumEnrollments(studentId: string): Promise<CurriculumEnrollment[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("curriculum_enrollments")
    .select("*")
    .eq("student_id", studentId)
    .order("status")
    .order("subject");
  return (data ?? []) as unknown as CurriculumEnrollment[];
}

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
    status?: "active" | "completed" | "paused" | "dropped";
    visibility?: string;
  },
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!payload.curriculum_name.trim()) return { success: false, error: "Curriculum name is required" };

  const supabase = await createClient();
  const record = {
    organization_id:    orgId,
    student_id:         studentId,
    updated_by:         user.id,
    subject:            payload.subject,
    curriculum_name:    payload.curriculum_name.trim(),
    publisher:          payload.publisher         ?? null,
    current_level:      payload.current_level     ?? null,
    current_unit:       payload.current_unit      ?? null,
    current_lesson:     payload.current_lesson    ?? null,
    teacher_name:       payload.teacher_name      ?? null,
    start_date:         payload.start_date        ?? null,
    expected_completion:payload.expected_completion ?? null,
    completion_pct:     payload.completion_pct    ?? 0,
    status:             payload.status            ?? "active",
    visibility:         payload.visibility        ?? "parent_visible",
  };

  if (payload.id) {
    const { error } = await supabase.from("curriculum_enrollments").update(record as never).eq("id", payload.id);
    return error ? { success: false, error: error.message } : { success: true, id: payload.id };
  }

  const { data, error } = await supabase
    .from("curriculum_enrollments")
    .insert({ ...record, created_by: user.id } as never)
    .select("id")
    .single();
  if (error || !data) return { success: false, error: error?.message ?? "Insert failed" };
  return { success: true, id: (data as unknown as { id: string }).id };
}

// ── Academic Progress ────────────────────────────────────────────────────────

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

// ── Assessments ──────────────────────────────────────────────────────────────

export async function getAssessments(studentId: string): Promise<Assessment[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("assessments")
    .select("*, profiles:created_by(full_name)")
    .eq("student_id", studentId)
    .order("assessment_date", { ascending: false });

  return ((data ?? []) as unknown[]).map((r) => {
    const row  = r as Record<string, unknown>;
    const prof = row.profiles as Record<string, string> | null;
    return { ...row, creator_name: prof?.full_name ?? null } as Assessment;
  });
}

export async function createAssessment(
  studentId: string,
  payload: {
    subject: string;
    assessment_name: string;
    assessment_period: "boy" | "moy" | "eoy" | "additional";
    assessment_date: string;
    score_raw?: number | null;
    score_max?: number | null;
    score_pct?: number | null;
    grade_equivalent?: string | null;
    performance_level?: string | null;
    stanine?: number | null;
    percentile_rank?: number | null;
    teacher_comments?: string | null;
    google_drive_file_url?: string | null;
    visibility?: string;
  },
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  // Auto-compute score_pct if not provided
  let scorePct = payload.score_pct ?? null;
  if (!scorePct && payload.score_raw != null && payload.score_max != null && payload.score_max > 0) {
    scorePct = Math.round((payload.score_raw / payload.score_max) * 100 * 100) / 100;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("assessments")
    .insert({
      organization_id:      orgId,
      student_id:           studentId,
      created_by:           user.id,
      updated_by:           user.id,
      subject:              payload.subject,
      assessment_name:      payload.assessment_name,
      assessment_period:    payload.assessment_period,
      assessment_date:      payload.assessment_date,
      score_raw:            payload.score_raw          ?? null,
      score_max:            payload.score_max          ?? null,
      score_pct:            scorePct,
      grade_equivalent:     payload.grade_equivalent   ?? null,
      performance_level:    payload.performance_level  ?? null,
      stanine:              payload.stanine             ?? null,
      percentile_rank:      payload.percentile_rank    ?? null,
      teacher_comments:     payload.teacher_comments   ?? null,
      google_drive_file_url:payload.google_drive_file_url ?? null,
      visibility:           payload.visibility         ?? "internal",
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Insert failed" };
  return { success: true, id: (data as unknown as { id: string }).id };
}

export async function deleteAssessment(assessmentId: string, studentId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("assessments")
    .delete()
    .eq("id", assessmentId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);
  return error ? { success: false, error: error.message } : { success: true };
}

// ── Dashboard alerts ─────────────────────────────────────────────────────────

export interface StudentAlert {
  alert_type: string;
  student_id: string;
  student_name: string;
  message: string;
  severity: string;
  action_url: string;
}

export async function getDashboardAlerts(): Promise<StudentAlert[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_student_alerts", { p_org_id: orgId } as never);
  return (data ?? []) as StudentAlert[];
}
