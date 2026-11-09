"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { ActionResult } from "@/types/actions";

// ── Types ────────────────────────────────────────────────────────────────────

export type GraduationPlan = {
  id: string;
  organization_id: string;
  student_id: string;
  ninth_grade_entry_year: number | null;
  expected_graduation_year: number | null;
  advisor_name: string | null;
  requirement_template_id: string | null;
  post_graduation_goal: string | null;
  academic_planning_flags: Record<string, unknown>;
  staff_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentGraduationRequirement = {
  id: string;
  organization_id: string;
  plan_id: string;
  requirement_id: string | null;
  custom_name: string | null;
  credits_required: number;
  is_substitution: boolean;
  substitution_notes: string | null;
  sort_order: number;
};

export type GraduationPlanEntry = {
  id: string;
  organization_id: string;
  plan_id: string;
  student_requirement_id: string | null;
  course_record_id: string | null;
  enrollment_id: string | null;
  display_name: string | null;
  display_credits_planned: number | null;
  institution_code: string | null;
  institution_name_override: string | null;
  college_course_code: string | null;
  college_credits: number | null;
  source_credit_unit: string | null;
  grade_level_slot: string | null;
  school_year_label: string | null;
  entry_status: string;
  completion_indicator: boolean;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ManualCredit = {
  id: string;
  organization_id: string;
  plan_entry_id: string;
  credits_claimed: number;
  verification_status: string;
  verification_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  duplicate_status: string;
  possible_duplicate_flag: boolean;
  duplicate_resolution_notes: string | null;
  duplicate_resolved_by: string | null;
  duplicate_resolved_at: string | null;
  reconciled_course_record_id: string | null;
  reconciled_at: string | null;
  reconciled_by: string | null;
  source_description: string | null;
  created_at: string;
};

export type GuidanceReview = {
  id: string;
  organization_id: string;
  plan_id: string;
  review_date: string;
  advisor_id: string | null;
  advisor_name: string;
  advisor_recommendations: string | null;
  parent_family_notes: string | null;
  academic_concerns: string | null;
  student_goals: string | null;
  next_steps: string | null;
  next_review_date: string | null;
  post_graduation_goal: string | null;
  created_at: string;
};

export type GraduationRequirementTemplate = {
  id: string;
  organization_id: string | null;
  cohort_year: number;
  label: string;
  total_credits_required: number;
  is_active: boolean;
  requirements: Array<{
    id: string;
    sort_order: number;
    category: string;
    requirement_name: string;
    default_credits: number;
    is_repeatable: boolean;
    notes: string | null;
  }>;
};

// ── Auth Guard ───────────────────────────────────────────────────────────────

async function assertFullAdmin(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .in("role", ["full_admin", "platform_admin"])
    .eq("status", "active")
    .maybeSingle();

  if (!member) {
    throw new Error("Insufficient permissions: requires full_admin or platform_admin");
  }
}

async function validateEntryOwnership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entryId: string,
  planId: string
): Promise<void> {
  const { data: entry } = await supabase
    .from("graduation_plan_entries")
    .select("plan_id")
    .eq("id", entryId)
    .maybeSingle();

  if (!entry || entry.plan_id !== planId) {
    throw new Error("Entry does not belong to the specified plan");
  }
}

// ── 1. getOrCreateGraduationPlan ─────────────────────────────────────────────

export async function getOrCreateGraduationPlan(
  studentId: string
): Promise<ActionResult<GraduationPlan>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    // Try to get existing plan
    const { data: existing } = await supabase
      .from("graduation_plans")
      .select("*")
      .eq("organization_id", orgId)
      .eq("student_id", studentId)
      .maybeSingle();

    if (existing) return { success: true, data: existing as GraduationPlan };

    // Create new plan
    const { data: created, error } = await supabase
      .from("graduation_plans")
      .insert({
        organization_id: orgId,
        student_id: studentId,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: created as GraduationPlan };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 2. getGraduationPlanFull ──────────────────────────────────────────────────

export async function getGraduationPlanFull(studentId: string): Promise<
  ActionResult<{
    plan: GraduationPlan;
    requirements: StudentGraduationRequirement[];
    entries: (GraduationPlanEntry & {
      course_record: {
        course_name: string;
        subject_area: string | null;
        credits_earned: number | null;
        verification_status: string;
        completion_status: string;
        counts_toward_high_school_credit: boolean;
        school_year: string | null;
      } | null;
      enrollment: {
        status: string;
        counts_toward_high_school_credit: boolean;
        credits_attempted: number | null;
      } | null;
      manual_credits: ManualCredit[];
    })[];
    reviews: GuidanceReview[];
  }>
> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    const { data: plan, error: planErr } = await supabase
      .from("graduation_plans")
      .select("*")
      .eq("organization_id", orgId)
      .eq("student_id", studentId)
      .maybeSingle();

    if (planErr) return { success: false, error: planErr.message };
    if (!plan) return { success: false, error: "No graduation plan found" };

    const [reqResult, entryResult, reviewResult] = await Promise.all([
      supabase
        .from("student_graduation_requirements")
        .select("*")
        .eq("plan_id", plan.id)
        .order("sort_order"),
      supabase
        .from("graduation_plan_entries")
        .select(`
          *,
          course_record:student_course_records(
            course_name, subject_area, credits_earned, verification_status,
            completion_status, counts_toward_high_school_credit, school_year
          ),
          enrollment:curriculum_enrollments(
            status, counts_toward_high_school_credit, credits_attempted
          ),
          manual_credits:graduation_plan_manual_credits(*)
        `)
        .eq("plan_id", plan.id)
        .order("sort_order"),
      supabase
        .from("graduation_guidance_reviews")
        .select("*")
        .eq("plan_id", plan.id)
        .order("review_date", { ascending: false }),
    ]);

    if (reqResult.error) return { success: false, error: reqResult.error.message };
    if (entryResult.error) return { success: false, error: entryResult.error.message };
    if (reviewResult.error) return { success: false, error: reviewResult.error.message };

    return {
      success: true,
      data: {
        plan: plan as GraduationPlan,
        requirements: (reqResult.data ?? []) as StudentGraduationRequirement[],
        entries: (entryResult.data ?? []) as any,
        reviews: (reviewResult.data ?? []) as GuidanceReview[],
      },
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 3. updateGraduationPlan ───────────────────────────────────────────────────

export async function updateGraduationPlan(
  planId: string,
  updates: {
    ninth_grade_entry_year?: number | null;
    expected_graduation_year?: number | null;
    advisor_name?: string | null;
    requirement_template_id?: string | null;
    post_graduation_goal?: string | null;
    academic_planning_flags?: Record<string, unknown>;
    staff_notes?: string | null;
  }
): Promise<ActionResult<GraduationPlan>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    const { data, error } = await supabase
      .from("graduation_plans")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", planId)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/students");
    return { success: true, data: data as GraduationPlan };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 4. initializeStudentRequirements ─────────────────────────────────────────
// Copy requirements from a template into student_graduation_requirements.

export async function initializeStudentRequirements(
  planId: string,
  templateId: string
): Promise<ActionResult<StudentGraduationRequirement[]>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    // Verify plan belongs to this org
    const { data: plan } = await supabase
      .from("graduation_plans")
      .select("id")
      .eq("id", planId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!plan) return { success: false, error: "Plan not found" };

    // Don't re-initialize if requirements already exist
    const { data: existing } = await supabase
      .from("student_graduation_requirements")
      .select("id")
      .eq("plan_id", planId)
      .limit(1);
    if (existing && existing.length > 0) {
      return { success: false, error: "Requirements already initialized for this plan" };
    }

    // Fetch template requirements
    const { data: templateReqs, error: tErr } = await supabase
      .from("graduation_requirements")
      .select("*")
      .eq("template_id", templateId)
      .order("sort_order");
    if (tErr) return { success: false, error: tErr.message };

    // Insert per-student copies; store requirement_name as custom_name for display without JOIN
    const toInsert = (templateReqs ?? []).map((r: any) => ({
      organization_id: orgId,
      plan_id: planId,
      requirement_id: r.id,
      custom_name: r.requirement_name,
      credits_required: r.default_credits,
      sort_order: r.sort_order,
      created_by: user.id,
    }));

    const { data: inserted, error: insErr } = await supabase
      .from("student_graduation_requirements")
      .insert(toInsert)
      .select();
    if (insErr) return { success: false, error: insErr.message };

    // Also update plan's template reference
    await supabase
      .from("graduation_plans")
      .update({ requirement_template_id: templateId, updated_at: new Date().toISOString() })
      .eq("id", planId);

    return { success: true, data: (inserted ?? []) as StudentGraduationRequirement[] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 5. addStudentRequirement (custom) ─────────────────────────────────────────

export async function addStudentRequirement(
  planId: string,
  params: {
    requirement_id?: string;
    custom_name?: string;
    credits_required: number;
    is_substitution?: boolean;
    substitution_notes?: string;
    sort_order?: number;
  }
): Promise<ActionResult<StudentGraduationRequirement>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    if (!params.requirement_id && !params.custom_name) {
      return { success: false, error: "Either requirement_id or custom_name is required" };
    }

    const { data, error } = await supabase
      .from("student_graduation_requirements")
      .insert({
        organization_id: orgId,
        plan_id: planId,
        requirement_id: params.requirement_id ?? null,
        custom_name: params.custom_name ?? null,
        credits_required: params.credits_required,
        is_substitution: params.is_substitution ?? false,
        substitution_notes: params.substitution_notes ?? null,
        sort_order: params.sort_order ?? 0,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as StudentGraduationRequirement };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 6. updateStudentRequirement ───────────────────────────────────────────────

export async function updateStudentRequirement(
  requirementId: string,
  updates: {
    credits_required?: number;
    is_substitution?: boolean;
    substitution_notes?: string | null;
    custom_name?: string | null;
  }
): Promise<ActionResult<StudentGraduationRequirement>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    const { data, error } = await supabase
      .from("student_graduation_requirements")
      .update(updates)
      .eq("id", requirementId)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as StudentGraduationRequirement };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 7. addPlanEntry ───────────────────────────────────────────────────────────

export async function addPlanEntry(
  planId: string,
  params: {
    student_requirement_id?: string;
    course_record_id?: string;
    enrollment_id?: string;
    display_name?: string;
    display_credits_planned?: number;
    institution_code?: string;
    institution_name_override?: string;
    college_course_code?: string;
    college_credits?: number;
    source_credit_unit?: string;
    grade_level_slot?: string;
    school_year_label?: string;
    entry_status?: string;
    notes?: string;
    sort_order?: number;
  }
): Promise<ActionResult<GraduationPlanEntry>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    if (params.course_record_id && params.enrollment_id) {
      return { success: false, error: "Cannot link both course_record_id and enrollment_id to one entry" };
    }

    const { data, error } = await supabase
      .from("graduation_plan_entries")
      .insert({
        organization_id: orgId,
        plan_id: planId,
        student_requirement_id: params.student_requirement_id ?? null,
        course_record_id: params.course_record_id ?? null,
        enrollment_id: params.enrollment_id ?? null,
        display_name: params.display_name ?? null,
        display_credits_planned: params.display_credits_planned ?? null,
        institution_code: params.institution_code ?? null,
        institution_name_override: params.institution_name_override ?? null,
        college_course_code: params.college_course_code ?? null,
        college_credits: params.college_credits ?? null,
        source_credit_unit: params.source_credit_unit ?? null,
        grade_level_slot: params.grade_level_slot ?? null,
        school_year_label: params.school_year_label ?? null,
        entry_status: params.entry_status ?? "planned",
        notes: params.notes ?? null,
        sort_order: params.sort_order ?? 0,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as GraduationPlanEntry };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 8. updatePlanEntry ────────────────────────────────────────────────────────

export async function updatePlanEntry(
  planId: string,
  entryId: string,
  updates: {
    student_requirement_id?: string | null;
    display_name?: string | null;
    display_credits_planned?: number | null;
    institution_code?: string | null;
    institution_name_override?: string | null;
    college_course_code?: string | null;
    college_credits?: number | null;
    source_credit_unit?: string | null;
    grade_level_slot?: string | null;
    school_year_label?: string | null;
    entry_status?: string;
    completion_indicator?: boolean;
    notes?: string | null;
    sort_order?: number;
  }
): Promise<ActionResult<GraduationPlanEntry>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);
    await validateEntryOwnership(supabase, entryId, planId);

    const { data, error } = await supabase
      .from("graduation_plan_entries")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", entryId)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as GraduationPlanEntry };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 9. removePlanEntry ────────────────────────────────────────────────────────

export async function removePlanEntry(
  planId: string,
  entryId: string
): Promise<ActionResult<void>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);
    await validateEntryOwnership(supabase, entryId, planId);

    const { error } = await supabase
      .from("graduation_plan_entries")
      .delete()
      .eq("id", entryId)
      .eq("organization_id", orgId);

    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 10. addManualCredit ───────────────────────────────────────────────────────

export async function addManualCredit(
  planId: string,
  entryId: string,
  params: {
    credits_claimed: number;
    source_description?: string;
  }
): Promise<ActionResult<ManualCredit>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);
    await validateEntryOwnership(supabase, entryId, planId);

    const { data, error } = await supabase
      .from("graduation_plan_manual_credits")
      .insert({
        organization_id: orgId,
        plan_entry_id: entryId,
        credits_claimed: params.credits_claimed,
        source_description: params.source_description ?? null,
        verification_status: "unverified",
        duplicate_status: "not_reviewed",
        created_by: user.id,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as ManualCredit };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 11. verifyManualCredit ────────────────────────────────────────────────────

export async function verifyManualCredit(
  creditId: string,
  params: {
    verification_status: "unverified" | "verified";
    verification_notes?: string;
  }
): Promise<ActionResult<ManualCredit>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    const updates: Record<string, unknown> = {
      verification_status: params.verification_status,
      verification_notes: params.verification_notes ?? null,
    };
    if (params.verification_status === "verified") {
      updates.verified_by = user.id;
      updates.verified_at = new Date().toISOString();
    } else {
      updates.verified_by = null;
      updates.verified_at = null;
    }

    const { data, error } = await supabase
      .from("graduation_plan_manual_credits")
      .update(updates)
      .eq("id", creditId)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as ManualCredit };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 12. resolveDuplicateCredit ────────────────────────────────────────────────

export async function resolveDuplicateCredit(
  creditId: string,
  params: {
    duplicate_status: "confirmed_unique" | "confirmed_duplicate";
    duplicate_resolution_notes?: string;
  }
): Promise<ActionResult<ManualCredit>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    const { data, error } = await supabase
      .from("graduation_plan_manual_credits")
      .update({
        duplicate_status: params.duplicate_status,
        duplicate_resolution_notes: params.duplicate_resolution_notes ?? null,
        duplicate_resolved_by: user.id,
        duplicate_resolved_at: new Date().toISOString(),
      })
      .eq("id", creditId)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as ManualCredit };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 13. reconcileManualCredit ─────────────────────────────────────────────────

export async function reconcileManualCredit(
  creditId: string,
  courseRecordId: string
): Promise<ActionResult<ManualCredit>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    const { data, error } = await supabase
      .from("graduation_plan_manual_credits")
      .update({
        reconciled_course_record_id: courseRecordId,
        reconciled_at: new Date().toISOString(),
        reconciled_by: user.id,
      })
      .eq("id", creditId)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as ManualCredit };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 14. addGuidanceReview ─────────────────────────────────────────────────────

export async function addGuidanceReview(
  planId: string,
  params: {
    review_date?: string;
    advisor_name: string;
    advisor_recommendations?: string;
    parent_family_notes?: string;
    academic_concerns?: string;
    student_goals?: string;
    next_steps?: string;
    next_review_date?: string;
    post_graduation_goal?: string;
  }
): Promise<ActionResult<GuidanceReview>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    // Verify plan belongs to this org
    const { data: plan } = await supabase
      .from("graduation_plans")
      .select("id")
      .eq("id", planId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!plan) return { success: false, error: "Plan not found" };

    const { data, error } = await supabase
      .from("graduation_guidance_reviews")
      .insert({
        organization_id: orgId,
        plan_id: planId,
        review_date: params.review_date ?? new Date().toISOString().split("T")[0],
        advisor_id: user.id,
        advisor_name: params.advisor_name,
        advisor_recommendations: params.advisor_recommendations ?? null,
        parent_family_notes: params.parent_family_notes ?? null,
        academic_concerns: params.academic_concerns ?? null,
        student_goals: params.student_goals ?? null,
        next_steps: params.next_steps ?? null,
        next_review_date: params.next_review_date ?? null,
        post_graduation_goal: params.post_graduation_goal ?? null,
      })
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, data: data as GuidanceReview };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 15. getAvailableTemplates ─────────────────────────────────────────────────

export async function getAvailableTemplates(): Promise<ActionResult<GraduationRequirementTemplate[]>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    const { data, error } = await supabase
      .from("graduation_requirement_templates")
      .select(`
        *,
        requirements:graduation_requirements(*)
      `)
      .or(`organization_id.is.null,organization_id.eq.${orgId}`)
      .eq("is_active", true)
      .order("cohort_year", { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as GraduationRequirementTemplate[] };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ── 16. getUnclassifiedCredits ────────────────────────────────────────────────
// Returns verified, completed, eligible course records not yet in any plan entry.

export async function getUnclassifiedCredits(
  studentId: string
): Promise<ActionResult<{
  id: string;
  course_name: string;
  subject_area: string | null;
  credits_earned: number;
  school_year: string | null;
  verification_status: string;
}[]>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    // Get all course_record_ids already in a plan for this student
    const { data: plan } = await supabase
      .from("graduation_plans")
      .select("id")
      .eq("organization_id", orgId)
      .eq("student_id", studentId)
      .maybeSingle();

    let usedIds: string[] = [];
    if (plan) {
      const { data: entries } = await supabase
        .from("graduation_plan_entries")
        .select("course_record_id")
        .eq("plan_id", plan.id)
        .not("course_record_id", "is", null);
      usedIds = (entries ?? []).map((e: any) => e.course_record_id).filter(Boolean);
    }

    // Eligible: verified + completed + counts_toward_high_school_credit + credits_earned > 0
    let query = supabase
      .from("student_course_records")
      .select("id, course_name, subject_area, credits_earned, school_year, verification_status")
      .eq("organization_id", orgId)
      .eq("student_id", studentId)
      .eq("verification_status", "verified")
      .eq("completion_status", "completed")
      .eq("counts_toward_high_school_credit", true)
      .gt("credits_earned", 0);

    if (usedIds.length > 0) {
      query = query.not("id", "in", `(${usedIds.join(",")})`);
    }

    const { data, error } = await query.order("school_year");
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as any };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// computeCreditTotals has been moved to src/lib/graduation/creditCalculator.ts
// to avoid "server actions must be async functions" constraint on "use server" files.
