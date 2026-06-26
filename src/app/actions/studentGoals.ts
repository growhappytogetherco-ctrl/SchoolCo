"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";

export type GoalCategory =
  | "confidence" | "perseverance" | "independence" | "critical_thinking"
  | "math" | "reading" | "writing" | "leadership" | "organization"
  | "social" | "behavioral" | "health" | "family" | "other";

export type GoalStatus = "active" | "achieved" | "paused" | "dropped";
export type GoalPriority = "low" | "normal" | "high" | "urgent";

export interface Goal {
  id: string;
  student_id: string;
  goal_text: string;
  category: GoalCategory;
  priority: GoalPriority;
  status: GoalStatus;
  progress_pct: number;
  target_review_date: string | null;
  last_reviewed_at: string | null;
  staff_observations: string | null;
  parent_comments: string | null;
  visibility: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  creator_name?: string | null;
}

export interface CreateGoalPayload {
  goal_text: string;
  category: GoalCategory;
  priority: GoalPriority;
  status?: GoalStatus;
  progress_pct?: number;
  target_review_date?: string | null;
  staff_observations?: string | null;
  visibility?: string;
}

export async function getStudentGoals(studentId: string): Promise<Goal[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_goals")
    .select("*, profiles:created_by(full_name)")
    .eq("student_id", studentId)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    const prof = row.profiles as Record<string, string> | null;
    return { ...row, creator_name: prof?.full_name ?? null } as Goal;
  });
}

export async function createGoal(studentId: string, payload: CreateGoalPayload): Promise<
  { success: true; id: string } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!payload.goal_text.trim()) return { success: false, error: "Goal text is required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_goals")
    .insert({
      organization_id:    orgId,
      student_id:         studentId,
      created_by:         user.id,
      updated_by:         user.id,
      goal_text:          payload.goal_text.trim(),
      category:           payload.category,
      priority:           payload.priority,
      status:             payload.status    ?? "active",
      progress_pct:       payload.progress_pct ?? 0,
      target_review_date: payload.target_review_date ?? null,
      staff_observations: payload.staff_observations ?? null,
      visibility:         payload.visibility ?? "parent_visible",
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Insert failed" };
  return { success: true, id: (data as unknown as { id: string }).id };
}

export async function updateGoal(
  goalId: string,
  studentId: string,
  payload: Partial<CreateGoalPayload> & { status?: GoalStatus; progress_pct?: number; staff_observations?: string | null },
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();
  const updates: Record<string, unknown> = { ...payload, updated_by: user.id };
  if (payload.status === "achieved" || payload.progress_pct === 100) {
    // Record review timestamp
    updates.last_reviewed_at = new Date().toISOString();
    updates.last_reviewed_by = user.id;
  }

  const { error } = await supabase
    .from("student_goals")
    .update(updates as never)
    .eq("id", goalId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  return error ? { success: false, error: error.message } : { success: true };
}

export async function deleteGoal(goalId: string, studentId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_goals")
    .delete()
    .eq("id", goalId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);
  return error ? { success: false, error: error.message } : { success: true };
}
