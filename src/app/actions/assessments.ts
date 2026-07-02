"use server";

import { createClient, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import { SUBJECTS, SUBJECT_LABELS as SUBJ_LABELS } from "@/lib/academics-constants";

export type { AssessmentPeriod, AssessmentType, PerformanceLevel } from "@/lib/assessment-constants";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Assessment {
  id:                      string;
  organization_id:         string;
  student_id:              string;
  subject:                 string;
  assessment_name:         string;
  assessment_type:         string | null;
  assessment_period:       string;
  administered_at:         string;     // maps to assessment_date column
  staff_member_id:         string | null;
  staff_name:              string | null;
  curriculum_enrollment_id:string | null;
  growth_goal_id:          string | null;
  score_raw:               number | null;
  score_max:               number | null;
  score_pct:               number | null;
  performance_level:       string | null;
  grade_equivalent:        string | null;
  placement_level:         string | null;
  percentile_rank:         number | null;
  stanine:                 number | null;
  fluency_wpm:             number | null;
  accuracy_percent:        number | null;
  mastery_percent:         number | null;
  notes:                   string | null;
  staff_interpretation:    string | null;
  recommended_next_steps:  string | null;
  parent_visible:          boolean;
  attachment_url:          string | null;
  created_at:              string;
  updated_at:              string;
  created_by:              string | null;
  archived_at:             string | null;
}

export type AssessmentPayload = Omit<
  Assessment,
  "id" | "organization_id" | "student_id" | "created_at" | "updated_at" | "created_by" | "archived_at"
>;

export interface GrowthEntry {
  subject:          string;
  subjectLabel:     string;
  baselineDate:     string;
  baselinePeriod:   string;
  baselineScore:    number | null;
  baselineLevel:    string | null;
  latestDate:       string;
  latestScore:      number | null;
  latestLevel:      string | null;
  delta:            number | null;
  direction:        "improved" | "declined" | "no_change" | "insufficient_data";
}

export const BLANK_PAYLOAD: AssessmentPayload = {
  subject:                  "math",
  assessment_name:          "",
  assessment_type:          null,
  assessment_period:        "additional",
  administered_at:          new Date().toISOString().split("T")[0],
  staff_member_id:          null,
  staff_name:               null,
  curriculum_enrollment_id: null,
  growth_goal_id:           null,
  score_raw:                null,
  score_max:                null,
  score_pct:                null,
  performance_level:        null,
  grade_equivalent:         null,
  placement_level:          null,
  percentile_rank:          null,
  stanine:                  null,
  fluency_wpm:              null,
  accuracy_percent:         null,
  mastery_percent:          null,
  notes:                    null,
  staff_interpretation:     null,
  recommended_next_steps:   null,
  parent_visible:           false,
  attachment_url:           null,
};

// ── Role guard ────────────────────────────────────────────────────────────────

function isStaffOrAbove(role: string | null | undefined) {
  return role && !["parent", "student_future", "volunteer"].includes(role);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toRow(payload: AssessmentPayload, orgId: string, studentId: string, userId: string) {
  // Auto-compute score_pct if not provided (DB trigger also does this, belt-and-suspenders)
  let pct = payload.score_pct;
  if (pct == null && payload.score_raw != null && payload.score_max != null && payload.score_max > 0) {
    pct = Math.round((payload.score_raw / payload.score_max) * 10000) / 100;
  }
  return {
    organization_id:          orgId,
    student_id:               studentId,
    subject:                  payload.subject,
    assessment_name:          payload.assessment_name,
    assessment_type:          payload.assessment_type,
    assessment_period:        payload.assessment_period,
    assessment_date:          payload.administered_at,   // column name in DB
    staff_member_id:          payload.staff_member_id,
    staff_name:               payload.staff_name,
    curriculum_enrollment_id: payload.curriculum_enrollment_id,
    growth_goal_id:           payload.growth_goal_id,
    score_raw:                payload.score_raw,
    score_max:                payload.score_max,
    score_pct:                pct,
    performance_level:        payload.performance_level,
    grade_equivalent:         payload.grade_equivalent,
    placement_level:          payload.placement_level,
    percentile_rank:          payload.percentile_rank,
    stanine:                  payload.stanine,
    fluency_wpm:              payload.fluency_wpm,
    accuracy_percent:         payload.accuracy_percent,
    mastery_percent:          payload.mastery_percent,
    notes:                    payload.notes,
    teacher_comments:         payload.notes,   // legacy column alias
    staff_interpretation:     payload.staff_interpretation,
    recommended_next_steps:   payload.recommended_next_steps,
    parent_visible:           payload.parent_visible,
    attachment_url:           payload.attachment_url,
    updated_by:               userId,
  };
}

function fromRow(row: Record<string, unknown>): Assessment {
  return {
    id:                       row.id as string,
    organization_id:          row.organization_id as string,
    student_id:               row.student_id as string,
    subject:                  row.subject as string,
    assessment_name:          row.assessment_name as string,
    assessment_type:          (row.assessment_type ?? null) as string | null,
    assessment_period:        row.assessment_period as string,
    administered_at:          row.assessment_date as string,
    staff_member_id:          (row.staff_member_id ?? null) as string | null,
    staff_name:               (row.staff_name ?? null) as string | null,
    curriculum_enrollment_id: (row.curriculum_enrollment_id ?? null) as string | null,
    growth_goal_id:           (row.growth_goal_id ?? null) as string | null,
    score_raw:                (row.score_raw ?? null) as number | null,
    score_max:                (row.score_max ?? null) as number | null,
    score_pct:                (row.score_pct ?? null) as number | null,
    performance_level:        (row.performance_level ?? null) as string | null,
    grade_equivalent:         (row.grade_equivalent ?? null) as string | null,
    placement_level:          (row.placement_level ?? null) as string | null,
    percentile_rank:          (row.percentile_rank ?? null) as number | null,
    stanine:                  (row.stanine ?? null) as number | null,
    fluency_wpm:              (row.fluency_wpm ?? null) as number | null,
    accuracy_percent:         (row.accuracy_percent ?? null) as number | null,
    mastery_percent:          (row.mastery_percent ?? null) as number | null,
    notes:                    ((row.notes ?? row.teacher_comments) ?? null) as string | null,
    staff_interpretation:     (row.staff_interpretation ?? null) as string | null,
    recommended_next_steps:   (row.recommended_next_steps ?? null) as string | null,
    parent_visible:           (row.parent_visible ?? false) as boolean,
    attachment_url:           (row.attachment_url ?? null) as string | null,
    created_at:               row.created_at as string,
    updated_at:               row.updated_at as string,
    created_by:               (row.created_by ?? null) as string | null,
    archived_at:              (row.archived_at ?? null) as string | null,
  };
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getAssessments(
  studentId: string,
  options?: { subject?: string; period?: string; type?: string; includeArchived?: boolean }
): Promise<Assessment[]> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return [];
    const role = await getActiveRole();
    if (!isStaffOrAbove(role)) return [];

    const supabase = await createClient();
    let q = supabase
      .from("assessments")
      .select("*")
      .eq("student_id", studentId)
      .eq("organization_id", orgId);

    if (!options?.includeArchived) q = q.is("archived_at", null);
    if (options?.subject) q = q.eq("subject", options.subject);
    if (options?.period)  q = q.eq("assessment_period", options.period);
    if (options?.type)    q = q.eq("assessment_type", options.type);

    const { data } = await q.order("assessment_date", { ascending: false });
    return (data ?? []).map((r) => fromRow(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function getGrowthSummary(studentId: string): Promise<GrowthEntry[]> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return [];
    const role = await getActiveRole();
    if (!isStaffOrAbove(role)) return [];

    const supabase = await createClient();
    const { data } = await supabase
      .from("assessments")
      .select("subject, assessment_period, assessment_date, score_pct, performance_level")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("assessment_date", { ascending: true });

    if (!data || data.length === 0) return [];

    // Group by subject
    const bySubject = new Map<string, typeof data>();
    for (const row of data) {
      const arr = bySubject.get(row.subject) ?? [];
      arr.push(row);
      bySubject.set(row.subject, arr);
    }

    const entries: GrowthEntry[] = [];
    for (const [subject, rows] of bySubject) {
      if (rows.length < 1) continue;

      // Prefer BOY as baseline; fallback to earliest
      const baseline = rows.find((r) => r.assessment_period === "boy") ?? rows[0];
      const latest   = rows[rows.length - 1];

      const baselineScore = baseline.score_pct != null ? Number(baseline.score_pct) : null;
      const latestScore   = latest.score_pct   != null ? Number(latest.score_pct)   : null;

      let delta: number | null = null;
      let direction: GrowthEntry["direction"] = "insufficient_data";

      const isBaseline = baseline.assessment_date === latest.assessment_date;
      if (!isBaseline && baselineScore != null && latestScore != null) {
        delta = Math.round((latestScore - baselineScore) * 10) / 10;
        direction = delta > 0 ? "improved" : delta < 0 ? "declined" : "no_change";
      } else if (isBaseline) {
        direction = "insufficient_data";
      }

      entries.push({
        subject,
        subjectLabel: SUBJ_LABELS[subject as keyof typeof SUBJ_LABELS] ?? subject,
        baselineDate:   baseline.assessment_date,
        baselinePeriod: baseline.assessment_period,
        baselineScore,
        baselineLevel:  baseline.performance_level,
        latestDate:     latest.assessment_date,
        latestScore,
        latestLevel:    latest.performance_level,
        delta,
        direction,
      });
    }

    return entries.sort((a, b) =>
      SUBJECTS.indexOf(a.subject as never) - SUBJECTS.indexOf(b.subject as never)
    );
  } catch {
    return [];
  }
}

export async function getAssessmentSnapshot(studentId: string): Promise<{
  totalCount: number;
  latestDate: string | null;
  subjectsAssessed: string[];
  missingBOY: string[];
  needsSupport: { subject: string; level: string }[];
}> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { totalCount: 0, latestDate: null, subjectsAssessed: [], missingBOY: [], needsSupport: [] };
    const role = await getActiveRole();
    if (!isStaffOrAbove(role)) return { totalCount: 0, latestDate: null, subjectsAssessed: [], missingBOY: [], needsSupport: [] };

    const supabase = await createClient();
    const { data } = await supabase
      .from("assessments")
      .select("subject, assessment_period, assessment_date, performance_level")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("assessment_date", { ascending: false });

    if (!data) return { totalCount: 0, latestDate: null, subjectsAssessed: [], missingBOY: [], needsSupport: [] };

    const subjectsAssessed = [...new Set(data.map((r) => r.subject))];
    const boySubjects      = new Set(data.filter((r) => r.assessment_period === "boy").map((r) => r.subject));
    // Only check core subjects for BOY completeness
    const CORE = ["math", "reading", "writing", "ela", "science"];
    const missingBOY = CORE.filter((s) => subjectsAssessed.includes(s) && !boySubjects.has(s));

    // Latest "needs support" levels per subject (most recent assessment per subject)
    const latestPerSubject = new Map<string, string | null>();
    for (const row of data) {
      if (!latestPerSubject.has(row.subject)) latestPerSubject.set(row.subject, row.performance_level);
    }
    const needsSupport = [...latestPerSubject.entries()]
      .filter(([, level]) => level && ["needs_intensive_support","needs_support"].includes(level))
      .map(([subject, level]) => ({ subject, level: level! }));

    return {
      totalCount:       data.length,
      latestDate:       data[0]?.assessment_date ?? null,
      subjectsAssessed,
      missingBOY,
      needsSupport,
    };
  } catch {
    return { totalCount: 0, latestDate: null, subjectsAssessed: [], missingBOY: [], needsSupport: [] };
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createAssessment(
  studentId: string,
  payload: AssessmentPayload
): Promise<{ success: true; data: Assessment } | { success: false; error: string }> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };
    const role = await getActiveRole();
    if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    const row = { ...toRow(payload, orgId, studentId, user.id), created_by: user.id };
    const { data, error } = await supabase.from("assessments").insert(row as never).select().single();
    if (error) return { success: false, error: error.message };

    return { success: true, data: fromRow(data as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function updateAssessment(
  id: string,
  payload: AssessmentPayload
): Promise<{ success: true; data: Assessment } | { success: false; error: string }> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };
    const role = await getActiveRole();
    if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "Not authenticated" };

    // Fetch student_id from existing record
    const { data: existing } = await supabase.from("assessments").select("student_id").eq("id", id).single();
    if (!existing) return { success: false, error: "Assessment not found" };

    const row = toRow(payload, orgId, (existing as Record<string, string>).student_id, user.id);
    const { data, error } = await supabase.from("assessments").update(row as never).eq("id", id).select().single();
    if (error) return { success: false, error: error.message };

    return { success: true, data: fromRow(data as Record<string, unknown>) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function archiveAssessment(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };
    const role = await getActiveRole();
    if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("assessments")
      .update({ archived_at: new Date().toISOString() } as never)
      .eq("id", id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function restoreAssessment(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };
    const role = await getActiveRole();
    if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };

    const supabase = await createClient();
    const { error } = await supabase
      .from("assessments")
      .update({ archived_at: null } as never)
      .eq("id", id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
