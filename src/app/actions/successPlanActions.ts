"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import { isAdminRole } from "@/lib/constants";

// ── Types ──────────────────────────────────────────────────────────────────

export type GoalCategory =
  | "academic" | "leadership" | "behavior" | "executive_function"
  | "social" | "emotional" | "independence" | "faith"
  | "communication" | "entrepreneurship" | "other";

export type GoalPriority = "low" | "medium" | "high";
export type GoalStatus   = "not_started" | "in_progress" | "completed" | "on_hold";

export type StrategyCategory =
  | "instruction" | "behavior" | "environment" | "medical"
  | "social" | "communication" | "sensory" | "transition" | "safety" | "general";

export type StrategyPriority = "normal" | "high" | "critical";
export type StrategyVisible  = "staff" | "admin_only";

export type LearningStyle =
  | "visual" | "auditory" | "reading_writing" | "hands_on"
  | "independent" | "collaborative";

export interface FamilyVision {
  id: string;
  student_id: string;
  family_vision_summary:        string | null;
  why_rla:                      string | null;
  parent_priorities:            string | null;
  family_concerns:              string | null;
  parent_hopes:                 string | null;
  teacher_initial_observations: string | null;
  last_reviewed_at:             string | null;
  created_at:                   string;
  updated_at:                   string;
  created_by:                   string | null;
  last_updated_by:              string | null;
}

export interface GrowthGoal {
  id:                    string;
  student_id:            string;
  title:                 string;
  category:              GoalCategory;
  priority:              GoalPriority;
  status:                GoalStatus;
  progress_pct:          number;
  baseline:              string | null;
  target_outcome:        string | null;
  success_indicators:    string | null;
  staff_observations:    string | null;
  assigned_staff_id:     string | null;
  target_review_date:    string | null;
  completed_date:        string | null;
  created_at:            string;
  updated_at:            string;
  archived_at:           string | null;
}

export type GrowthGoalPayload = Omit<GrowthGoal,
  "id" | "student_id" | "created_at" | "updated_at" | "archived_at"
>;

export interface SupportStrategy {
  id:             string;
  student_id:     string;
  title:          string;
  description:    string | null;
  category:       StrategyCategory;
  priority:       StrategyPriority;
  is_pinned:      boolean;
  visible_to:     StrategyVisible;
  expires_at:     string | null;
  created_at:     string;
  updated_at:     string;
  created_by:     string | null;
  last_updated_by:string | null;
}

export type SupportStrategyPayload = Omit<SupportStrategy,
  "id" | "student_id" | "created_at" | "updated_at" | "created_by" | "last_updated_by"
>;

export interface LearningProfile {
  id:                    string;
  student_id:            string;
  learning_styles:       LearningStyle[];
  strengths:             string | null;
  interests:             string | null;
  motivators:            string | null;
  challenges:            string | null;
  successful_strategies: string | null;
  teacher_tips:          string | null;
  created_at:            string;
  updated_at:            string;
}

export type LearningProfilePayload = Omit<LearningProfile,
  "id" | "student_id" | "created_at" | "updated_at"
>;

export interface SSPTimelineEntry {
  id:             string;
  event_type:     string;
  title:          string;
  description:    string | null;
  reference_id:   string | null;
  reference_type: string | null;
  created_at:     string;
  created_by:     string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function invalidates(studentId: string) {
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath(`/dashboard/students/${studentId}?tab=plan`);
}

async function logTimeline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string, studentId: string, userId: string,
  event_type: string, title: string, description?: string,
  reference_id?: string, reference_type?: string
) {
  await supabase.from("ssp_timeline").insert({
    organization_id: orgId,
    student_id:      studentId,
    event_type,
    title,
    description:     description ?? null,
    reference_id:    reference_id ?? null,
    reference_type:  reference_type ?? null,
    created_by:      userId,
  } as never);
}

function isStaffOrAbove(role: string | null | undefined) {
  return role && !["parent", "student_future", "volunteer"].includes(role);
}

// ── Family Vision ──────────────────────────────────────────────────────────

export async function getFamilyVision(studentId: string): Promise<FamilyVision | null> {
  const orgId = await getActiveOrgId();
  if (!orgId) return null;
  const role = await getActiveRole();
  if (!isStaffOrAbove(role)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("success_plan_family_vision")
    .select("*")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .maybeSingle();

  return data as FamilyVision | null;
}

export async function upsertFamilyVision(
  studentId: string,
  payload: Partial<Omit<FamilyVision, "id" | "student_id" | "created_at" | "updated_at">>
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };

  const supabase = await createClient();

  const existing = await supabase
    .from("success_plan_family_vision")
    .select("id")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .maybeSingle();

  const isNew = !existing.data;

  const { error } = await supabase
    .from("success_plan_family_vision")
    .upsert({
      organization_id: orgId,
      student_id:      studentId,
      last_updated_by: user.id,
      ...(isNew ? { created_by: user.id } : {}),
      ...payload,
    } as never, { onConflict: "organization_id,student_id" });

  if (error) return { success: false, error: error.message };

  await logTimeline(
    supabase, orgId, studentId, user.id,
    isNew ? "family_vision_created" : "family_vision_updated",
    isNew ? "Family Vision created" : "Family Vision updated",
    undefined, undefined, "family_vision"
  );

  invalidates(studentId);
  return { success: true };
}

// ── Growth Goals ───────────────────────────────────────────────────────────

export async function getGrowthGoals(studentId: string): Promise<GrowthGoal[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const role = await getActiveRole();
  if (!isStaffOrAbove(role)) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("growth_goals")
    .select("id,student_id,title,category,priority,status,progress_pct,baseline,target_outcome,success_indicators,staff_observations,assigned_staff_id,target_review_date,completed_date,created_at,updated_at,archived_at")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as GrowthGoal[];
}

export async function createGrowthGoal(
  studentId: string,
  payload: GrowthGoalPayload
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };
  if (!payload.title.trim()) return { success: false, error: "Goal title is required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("growth_goals")
    .insert({
      organization_id:    orgId,
      student_id:         studentId,
      created_by:         user.id,
      last_updated_by:    user.id,
      ...payload,
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Insert failed" };

  const id = (data as unknown as { id: string }).id;
  await logTimeline(supabase, orgId, studentId, user.id,
    "goal_added", `Goal added: ${payload.title}`,
    `Category: ${payload.category} · Priority: ${payload.priority}`, id, "goal");

  invalidates(studentId);
  return { success: true, id };
}

export async function updateGrowthGoal(
  id: string,
  studentId: string,
  payload: Partial<GrowthGoalPayload>
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("growth_goals")
    .update({ ...payload, last_updated_by: user.id } as never)
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  const isCompleted = payload.status === "completed";
  await logTimeline(supabase, orgId, studentId, user.id,
    isCompleted ? "goal_completed" : "goal_updated",
    isCompleted ? `Goal completed` : `Goal updated`,
    undefined, id, "goal");

  invalidates(studentId);
  return { success: true };
}

export async function archiveGrowthGoal(
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
    .from("growth_goals")
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };
  invalidates(studentId);
  return { success: true };
}

// ── Support Strategies ─────────────────────────────────────────────────────

export async function getSupportStrategies(studentId: string): Promise<SupportStrategy[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const role = await getActiveRole();
  if (!isStaffOrAbove(role)) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("support_strategies")
    .select("*")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .order("is_pinned", { ascending: false })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  const all = (data ?? []) as unknown as SupportStrategy[];

  // Filter admin_only strategies unless caller is admin
  if (isAdminRole(role)) return all;
  return all.filter((s) => s.visible_to !== "admin_only");
}

// For the student header safety banner — pinned high/critical strategies
export async function getPinnedStrategies(studentId: string): Promise<Pick<SupportStrategy, "id" | "title" | "priority" | "visible_to">[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const role = await getActiveRole();
  if (!isStaffOrAbove(role)) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("support_strategies")
    .select("id, title, priority, visible_to")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("is_pinned", true)
    .in("priority", ["high", "critical"]);

  const all = (data ?? []) as unknown as Pick<SupportStrategy, "id" | "title" | "priority" | "visible_to">[];
  if (isAdminRole(role)) return all;
  return all.filter((s) => s.visible_to !== "admin_only");
}

export async function createSupportStrategy(
  studentId: string,
  payload: SupportStrategyPayload
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };
  if (!payload.title.trim()) return { success: false, error: "Title is required" };

  // Only admins can create admin_only strategies
  if (payload.visible_to === "admin_only" && !isAdminRole(role)) {
    return { success: false, error: "Admin access required for admin-only strategies" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("support_strategies")
    .insert({
      organization_id: orgId,
      student_id:      studentId,
      created_by:      user.id,
      last_updated_by: user.id,
      ...payload,
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Insert failed" };

  const id = (data as unknown as { id: string }).id;
  await logTimeline(supabase, orgId, studentId, user.id,
    "strategy_added", `Support strategy added: ${payload.title}`,
    `Category: ${payload.category} · Priority: ${payload.priority}`, id, "strategy");

  invalidates(studentId);
  return { success: true, id };
}

export async function updateSupportStrategy(
  id: string,
  studentId: string,
  payload: Partial<SupportStrategyPayload>
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("support_strategies")
    .update({ ...payload, last_updated_by: user.id } as never)
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  await logTimeline(supabase, orgId, studentId, user.id,
    "strategy_updated", `Support strategy updated: `,
    undefined, id, "strategy");

  invalidates(studentId);
  return { success: true };
}

export async function deleteSupportStrategy(
  id: string,
  studentId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("support_strategies")
    .delete()
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };
  invalidates(studentId);
  return { success: true };
}

// ── Learning Profile ───────────────────────────────────────────────────────

export async function getLearningProfile(studentId: string): Promise<LearningProfile | null> {
  const orgId = await getActiveOrgId();
  if (!orgId) return null;
  const role = await getActiveRole();
  if (!isStaffOrAbove(role)) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("learning_profiles")
    .select("*")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .maybeSingle();

  return data as LearningProfile | null;
}

export async function upsertLearningProfile(
  studentId: string,
  payload: LearningProfilePayload
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied" };

  const supabase = await createClient();
  const existing = await supabase
    .from("learning_profiles")
    .select("id")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .maybeSingle();

  const isNew = !existing.data;

  const { error } = await supabase
    .from("learning_profiles")
    .upsert({
      organization_id: orgId,
      student_id:      studentId,
      last_updated_by: user.id,
      ...(isNew ? { created_by: user.id } : {}),
      ...payload,
    } as never, { onConflict: "organization_id,student_id" });

  if (error) return { success: false, error: error.message };

  await logTimeline(supabase, orgId, studentId, user.id,
    "learning_profile_updated", "Learning Profile updated",
    undefined, undefined, "learning_profile");

  invalidates(studentId);
  return { success: true };
}

// ── SSP Timeline ───────────────────────────────────────────────────────────

export async function getSSPTimeline(studentId: string): Promise<SSPTimelineEntry[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const role = await getActiveRole();
  if (!isStaffOrAbove(role)) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("ssp_timeline")
    .select("id, event_type, title, description, reference_id, reference_type, created_at, created_by")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []) as unknown as SSPTimelineEntry[];
}

// ── SSP Summary for Overview tab ──────────────────────────────────────────

export async function getSSPSummary(studentId: string): Promise<{
  activeGoalCount: number;
  highPriorityStrategies: Pick<SupportStrategy, "id" | "title" | "priority">[];
  learningStyles: LearningStyle[];
  lastReviewedAt: string | null;
} | null> {
  const orgId = await getActiveOrgId();
  if (!orgId) return null;
  const role = await getActiveRole();
  if (!isStaffOrAbove(role)) return null;

  const supabase = await createClient();

  const [goalsRes, strategiesRes, profileRes, visionRes] = await Promise.all([
    supabase.from("growth_goals")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId).eq("organization_id", orgId)
      .is("archived_at", null).in("status", ["not_started", "in_progress"]),
    supabase.from("support_strategies")
      .select("id, title, priority, visible_to")
      .eq("student_id", studentId).eq("organization_id", orgId)
      .in("priority", ["high", "critical"]).eq("is_pinned", true).limit(5),
    supabase.from("learning_profiles")
      .select("learning_styles")
      .eq("student_id", studentId).eq("organization_id", orgId).maybeSingle(),
    supabase.from("success_plan_family_vision")
      .select("last_reviewed_at, updated_at")
      .eq("student_id", studentId).eq("organization_id", orgId).maybeSingle(),
  ]);

  const strategies = (strategiesRes.data ?? []) as unknown as Pick<SupportStrategy, "id" | "title" | "priority" | "visible_to">[];
  const filtered = isAdminRole(role) ? strategies : strategies.filter((s) => s.visible_to !== "admin_only");
  const lp = profileRes.data as unknown as { learning_styles: LearningStyle[] } | null;
  const vision = visionRes.data as unknown as { last_reviewed_at: string | null; updated_at: string } | null;

  return {
    activeGoalCount:          goalsRes.count ?? 0,
    highPriorityStrategies:   filtered,
    learningStyles:           lp?.learning_styles ?? [],
    lastReviewedAt:           vision?.last_reviewed_at ?? vision?.updated_at ?? null,
  };
}
