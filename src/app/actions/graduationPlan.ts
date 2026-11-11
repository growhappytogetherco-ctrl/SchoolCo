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
  slot_label: string | null;
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

// Default course slots per requirement category.
// slot_label = standard slot name; display_credits_planned = credits allocated to that slot.
const DEFAULT_SLOTS: Record<string, Array<{ slot_label: string; display_credits_planned: number; sort_order: number }>> = {
  ela: [
    { slot_label: "English 1", display_credits_planned: 1.0, sort_order: 10 },
    { slot_label: "English 2", display_credits_planned: 1.0, sort_order: 20 },
    { slot_label: "English 3", display_credits_planned: 1.0, sort_order: 30 },
    { slot_label: "English 4", display_credits_planned: 1.0, sort_order: 40 },
  ],
  math: [
    { slot_label: "Algebra 1", display_credits_planned: 1.0, sort_order: 10 },
    { slot_label: "Geometry", display_credits_planned: 1.0, sort_order: 20 },
    { slot_label: "Math 3", display_credits_planned: 1.0, sort_order: 30 },
    { slot_label: "Math 4", display_credits_planned: 1.0, sort_order: 40 },
  ],
  science: [
    { slot_label: "Biology 1", display_credits_planned: 1.0, sort_order: 10 },
    { slot_label: "Science 2", display_credits_planned: 1.0, sort_order: 20 },
    { slot_label: "Science 3", display_credits_planned: 1.0, sort_order: 30 },
  ],
  social_studies: [
    { slot_label: "World History", display_credits_planned: 1.0, sort_order: 10 },
    { slot_label: "U.S. History", display_credits_planned: 1.0, sort_order: 20 },
    { slot_label: "U.S. Government", display_credits_planned: 0.5, sort_order: 30 },
    { slot_label: "Economics", display_credits_planned: 0.5, sort_order: 40 },
  ],
  personal_finance: [
    { slot_label: "Personal Financial Literacy", display_credits_planned: 0.5, sort_order: 10 },
  ],
  fine_arts: [
    { slot_label: "Fine Arts / Speech / CTE", display_credits_planned: 1.0, sort_order: 10 },
  ],
  pe_health: [
    { slot_label: "PE with Health", display_credits_planned: 1.0, sort_order: 10 },
  ],
  elective: [], // No pre-populated slots; added manually
};

// ── 4. initializeStudentRequirements ─────────────────────────────────────────
// Copy requirements from a template into student_graduation_requirements,
// then pre-populate default course slot entries for each requirement.

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

    // Pre-populate default course slot entries for each requirement
    const reqIdByTemplateReqId = new Map(
      (inserted ?? []).map((r: any) => [r.requirement_id, r.id])
    );
    const slotEntries: object[] = [];
    for (const tmplReq of templateReqs ?? []) {
      const studentReqId = reqIdByTemplateReqId.get(tmplReq.id);
      if (!studentReqId) continue;
      const slots = DEFAULT_SLOTS[(tmplReq as any).category] ?? [];
      for (const slot of slots) {
        slotEntries.push({
          organization_id: orgId,
          plan_id: planId,
          student_requirement_id: studentReqId,
          slot_label: slot.slot_label,
          display_credits_planned: slot.display_credits_planned,
          entry_status: "planned",
          sort_order: slot.sort_order,
          created_by: user.id,
        });
      }
    }
    if (slotEntries.length > 0) {
      await supabase.from("graduation_plan_entries").insert(slotEntries);
    }

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
    slot_label?: string | null;
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

// ── Course-to-slot name matching helpers ─────────────────────────────────────

/** Strip parenthetical qualifiers: (Term 1), (Sem 2), (Part A), (Honors), etc. */
function stripQualifiers(name: string): string {
  return name.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

function normalizeLabel(name: string): string {
  return stripQualifiers(name).toLowerCase().replace(/[-–]/g, " ");
}

/**
 * Returns true when the slot label is a generic positional placeholder, not a
 * specific named course. Generic slots accept any course from the right subject area.
 * Examples: "Math 3", "Science 2", "Fine Arts / Speech / CTE", "Elective"
 */
function isGenericSlot(slotLabel: string): boolean {
  const n = slotLabel.trim().toLowerCase();
  if (/^math \d+$/.test(n)) return true;
  if (/^science \d+$/.test(n)) return true;
  if (/^elective/i.test(n)) return true;
  if (n.includes("/")) return true; // composite labels like "Fine Arts / Speech / CTE"
  return false;
}

type SlotMatchResult = "named_match" | "generic_slot" | "conflict" | "uncertain";

/**
 * Determines whether a course name is compatible with a specific slot label.
 * - "named_match"  — the course clearly belongs in this named slot
 * - "generic_slot" — the slot is a category placeholder; any subject-area course may fill it
 * - "conflict"     — the course has a sequence number that contradicts the slot's number
 *                    (e.g. "English 1" vs "English 2" slot)
 * - "uncertain"    — no clear match or conflict; leave for Needs Classification
 */
function matchCourseToSlot(courseName: string, slotLabel: string): SlotMatchResult {
  if (isGenericSlot(slotLabel)) return "generic_slot";

  const cn = normalizeLabel(courseName);
  const sl = normalizeLabel(slotLabel);

  // Exact match or course name starts with the slot label
  if (cn === sl || cn.startsWith(sl + " ") || cn.startsWith(sl)) return "named_match";

  // Check trailing sequence numbers: "English 1 (Term 2)" → cn="english 1", sl="english 2"
  const cnNum = cn.match(/^(.*?)\s+(\d+)$/);
  const slNum = sl.match(/^(.*?)\s+(\d+)$/);
  if (cnNum && slNum) {
    const cnSubject = cnNum[1].trim();
    const slSubject = slNum[1].trim();
    if (cnSubject === slSubject) {
      return parseInt(cnNum[2]) === parseInt(slNum[2]) ? "named_match" : "conflict";
    }
  }

  return "uncertain";
}

/**
 * Finds the best empty slot for a course from an ordered list of candidates.
 * Priority: named_match > generic_slot > null (send to Needs Classification).
 * Conflicts and uncertain matches against named slots are skipped.
 */
function findBestSlot(
  courseName: string,
  slots: Array<{ id: string; sort_order: number; slot_label: string | null }>
): { id: string; sort_order: number; slot_label: string | null } | null {
  let namedMatch: (typeof slots)[0] | null = null;
  let genericSlot: (typeof slots)[0] | null = null;

  for (const slot of slots) {
    if (!slot.slot_label) {
      if (!genericSlot) genericSlot = slot;
      continue;
    }
    const result = matchCourseToSlot(courseName, slot.slot_label);
    if (result === "named_match" && !namedMatch) namedMatch = slot;
    if (result === "generic_slot" && !genericSlot) genericSlot = slot;
    // "conflict" and "uncertain" on named slots → skip
  }

  return namedMatch ?? genericSlot ?? null;
}

// ── 17. syncAcademicHistoryToPlan ─────────────────────────────────────────────
// Read-time reconciliation: links verified, eligible Academic History records to
// plan entries automatically. Safe to call on every planner load — idempotent.
//
// Strategy:
//  1. For each unlinked eligible course record, map subject_area → requirement category.
//  2. If the category maps to a known SGR, find the best-matching empty planned slot
//     using course-name matching (findBestSlot). Fill it in place. If no compatible
//     slot exists, insert a new entry for that SGR.
//  3. If the category is unmapped or no slot matches, insert an unclassified entry
//     (student_requirement_id = null) so it appears in Needs Classification.
//  4. Already-linked records are skipped entirely.

const SUBJECT_AREA_TO_CATEGORY: Record<string, string> = {
  english_ela: "ela",
  english: "ela",
  ela: "ela",
  mathematics: "math",
  math: "math",
  science: "science",
  social_studies: "social_studies",
  history: "social_studies",
  personal_finance: "personal_finance",
  pfl: "personal_finance",
  fine_arts: "fine_arts",
  art: "fine_arts",
  music: "fine_arts",
  cte: "fine_arts",
  vocational: "fine_arts",
  pe: "pe_health",
  pe_health: "pe_health",
  physical_education: "pe_health",
  health: "pe_health",
};

export async function syncAcademicHistoryToPlan(
  studentId: string
): Promise<ActionResult<{ linked: number; unclassified: number }>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated" };
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();
    await assertFullAdmin(supabase, orgId);

    // Get plan — no-op if none exists
    const { data: plan } = await supabase
      .from("graduation_plans")
      .select("id")
      .eq("organization_id", orgId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (!plan) return { success: true, data: { linked: 0, unclassified: 0 } };

    // Get all current plan entries in one shot
    const { data: allEntries } = await supabase
      .from("graduation_plan_entries")
      .select("id, student_requirement_id, course_record_id, sort_order, entry_status, slot_label")
      .eq("plan_id", plan.id)
      .order("sort_order");

    const usedCourseRecordIds = new Set(
      (allEntries ?? []).map((e: any) => e.course_record_id).filter(Boolean)
    );

    // Empty slots: only fill 'planned' slots — skip in_progress/completed (advisor may have tagged them).
    // Store slot_label so the name-matching logic can compare course names to slot names.
    const emptySlotsByReq = new Map<string, Array<{ id: string; sort_order: number; slot_label: string | null }>>();
    for (const e of allEntries ?? []) {
      if (e.student_requirement_id && !e.course_record_id && e.entry_status === "planned") {
        const list = emptySlotsByReq.get(e.student_requirement_id) ?? [];
        list.push({ id: e.id, sort_order: e.sort_order, slot_label: (e as any).slot_label ?? null });
        emptySlotsByReq.set(e.student_requirement_id, list);
      }
    }

    // SGRs for this plan: category → SGR id (via graduation_requirements join)
    const { data: sgrs } = await supabase
      .from("student_graduation_requirements")
      .select("id, requirement_id")
      .eq("plan_id", plan.id);

    const reqIds = (sgrs ?? []).map((r: any) => r.requirement_id).filter(Boolean);
    let categoryToSgrId = new Map<string, string>();
    if (reqIds.length > 0) {
      const { data: templateReqs } = await supabase
        .from("graduation_requirements")
        .select("id, category")
        .in("id", reqIds);
      for (const tr of templateReqs ?? []) {
        const sgr = (sgrs ?? []).find((s: any) => s.requirement_id === tr.id);
        if (sgr) categoryToSgrId.set((tr as any).category, sgr.id);
      }
    }

    // Eligible Academic History records not yet in the plan
    const { data: courses, error: cErr } = await supabase
      .from("student_course_records")
      .select("id, course_name, subject_area, credits_earned, school_year, grade_level, verification_status")
      .eq("organization_id", orgId)
      .eq("student_id", studentId)
      .eq("verification_status", "verified")
      .eq("completion_status", "completed")
      .eq("counts_toward_high_school_credit", true)
      .gt("credits_earned", 0)
      .order("school_year");
    if (cErr) return { success: false, error: cErr.message };

    const unlinked = (courses ?? []).filter((c: any) => !usedCourseRecordIds.has(c.id));
    if (unlinked.length === 0) return { success: true, data: { linked: 0, unclassified: 0 } };

    let linked = 0;
    let unclassified = 0;
    const slotUpdates: Array<{ entryId: string; courseRecordId: string; creditsEarned: number }> = [];
    const newEntries: object[] = [];

    for (const course of unlinked) {
      const category = course.subject_area
        ? SUBJECT_AREA_TO_CATEGORY[course.subject_area.toLowerCase()] ?? null
        : null;
      const sgrId = category ? categoryToSgrId.get(category) ?? null : null;

      if (sgrId) {
        // Find the best-matching empty slot by course name, not just the first by sort_order.
        // A named slot (English 2, Algebra 1) only accepts a course that matches its name.
        // A generic slot (Math 3, Science 2, Fine Arts / ...) accepts any subject-area course.
        // If no compatible slot is found, the course goes to Needs Classification.
        const slots = emptySlotsByReq.get(sgrId);
        const bestSlot = slots ? findBestSlot(course.course_name, slots) : null;

        if (bestSlot) {
          // Consume the chosen slot so it won't be reused by a later course
          const idx = slots!.findIndex(s => s.id === bestSlot.id);
          if (idx !== -1) slots!.splice(idx, 1);
          slotUpdates.push({ entryId: bestSlot.id, courseRecordId: course.id, creditsEarned: course.credits_earned });
          linked++;
        } else if (slots !== undefined) {
          // Compatible slot exists in the right requirement but no slot name matches —
          // send to Needs Classification instead of forcing a wrong slot.
          newEntries.push({
            organization_id: orgId,
            plan_id: plan.id,
            student_requirement_id: null,
            course_record_id: course.id,
            display_credits_planned: course.credits_earned,
            entry_status: "completed",
            sort_order: 999,
            created_by: user.id,
          });
          unclassified++;
        } else {
          // No slots at all for this requirement — add a new linked entry
          newEntries.push({
            organization_id: orgId,
            plan_id: plan.id,
            student_requirement_id: sgrId,
            course_record_id: course.id,
            display_credits_planned: course.credits_earned,
            entry_status: "completed",
            sort_order: 999,
            created_by: user.id,
          });
          linked++;
        }
      } else {
        // Unmapped — goes to Needs Classification
        newEntries.push({
          organization_id: orgId,
          plan_id: plan.id,
          student_requirement_id: null,
          course_record_id: course.id,
          display_credits_planned: course.credits_earned,
          entry_status: "completed",
          sort_order: 999,
          created_by: user.id,
        });
        unclassified++;
      }
    }

    // Apply slot fills: update existing empty entries in place
    for (const { entryId, courseRecordId, creditsEarned } of slotUpdates) {
      await supabase
        .from("graduation_plan_entries")
        .update({
          course_record_id: courseRecordId,
          display_credits_planned: creditsEarned,
          entry_status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", entryId)
        .eq("plan_id", plan.id);
    }

    // Insert new entries
    if (newEntries.length > 0) {
      await supabase.from("graduation_plan_entries").insert(newEntries);
    }

    if (slotUpdates.length + newEntries.length > 0) {
      revalidatePath("/dashboard/students");
    }

    return { success: true, data: { linked, unclassified } };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// (Bright Futures tracking removed — use separate printable BF Guide instead)

// computeCreditTotals has been moved to src/lib/graduation/creditCalculator.ts
// to avoid "server actions must be async functions" constraint on "use server" files.
