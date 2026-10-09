"use server";

import { getActiveOrgId, createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import { logAudit } from "@/lib/audit";

export type EnrollmentCreditPayload = {
  enrollmentId: string;
  /** null = clear override (inherit from section) */
  countsTowardHighSchoolCredit: boolean | null;
  /** null = clear override (inherit from section) */
  creditsAttempted:             number | null;
  /** null = clear override (inherit from section) */
  courseLevel:                  string | null;
  /** null = not configured (never treated as "full year") */
  gradingPeriodId:              string | null;
};

const VALID_LEVELS = new Set(["standard", "honors", "ap", "dual_enrollment"]);

export async function updateEnrollmentCredit(
  payload: EnrollmentCreditPayload,
): Promise<ActionResult<void>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Unauthenticated" };

    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization" };

    const supabase = await createClient();

    // Role check — staff or above required (mirrors curriculum_enrollments UPDATE RLS)
    const { data: member, error: memberErr } = await (supabase as any)
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .single();

    if (memberErr || !member) return { success: false, error: "Not a member of this organization" };

    const registrarRoles = ["registrar", "admin", "full_admin", "platform_admin"];
    if (!registrarRoles.includes((member as any).role)) {
      return { success: false, error: "Registrar or above required to configure enrollment credit" };
    }

    // Validate course_level if provided
    if (payload.courseLevel !== null && !VALID_LEVELS.has(payload.courseLevel)) {
      return { success: false, error: `Invalid course level: ${payload.courseLevel}` };
    }

    // Validate credits_attempted if provided
    if (payload.creditsAttempted !== null) {
      const n = Number(payload.creditsAttempted);
      if (isNaN(n) || n < 0) {
        return { success: false, error: "Credits attempted must be a non-negative number" };
      }
    }

    // Validate grading_period_id belongs to this org and is a semester row (not quarter)
    if (payload.gradingPeriodId !== null) {
      const { data: gp, error: gpErr } = await (supabase as any)
        .from("grading_periods")
        .select("id, period_type, organization_id")
        .eq("id", payload.gradingPeriodId)
        .single();

      if (gpErr || !gp) return { success: false, error: "Grading period not found" };
      if (gp.organization_id !== orgId) return { success: false, error: "Grading period does not belong to this organization" };
      if (gp.period_type !== "semester" && gp.period_type !== "full_year") {
        return { success: false, error: "grading_period_id must point to a semester or full-year grading period" };
      }
    }

    // Verify enrollment belongs to this org (row-level guard before update)
    const { data: enr, error: enrErr } = await (supabase as any)
      .from("curriculum_enrollments")
      .select("id, student_id, course_section_id, finalized_at")
      .eq("id", payload.enrollmentId)
      .eq("organization_id", orgId)
      .single();

    if (enrErr || !enr) return { success: false, error: "Enrollment not found" };
    if (enr.finalized_at) {
      return { success: false, error: "Cannot modify credit configuration of a finalized enrollment" };
    }

    const { error: updateErr } = await (supabase as any)
      .from("curriculum_enrollments")
      .update({
        counts_toward_high_school_credit: payload.countsTowardHighSchoolCredit,
        credits_attempted:                payload.creditsAttempted,
        course_level:                     payload.courseLevel,
        grading_period_id:                payload.gradingPeriodId,
        updated_by:                       user.id,
      })
      .eq("id", payload.enrollmentId)
      .eq("organization_id", orgId);

    if (updateErr) {
      console.error("[enrollmentCredit] update error:", updateErr.message);
      return { success: false, error: "Failed to save enrollment credit configuration" };
    }

    await logAudit({
      organization_id: orgId,
      actor_id:        user.id,
      action:          "enrollment_credit_updated",
      resource_type:   "curriculum_enrollment",
      resource_id:     payload.enrollmentId,
      new_values: {
        counts_toward_high_school_credit: payload.countsTowardHighSchoolCredit,
        credits_attempted:                payload.creditsAttempted,
        course_level:                     payload.courseLevel,
        grading_period_id:                payload.gradingPeriodId,
      },
    });

    revalidatePath(`/dashboard/students/${enr.student_id}`);
    revalidatePath(`/dashboard/courses/${enr.course_section_id}`);

    return { success: true, data: undefined };
  } catch (e) {
    console.error("[enrollmentCredit] unexpected error:", e instanceof Error ? e.message : String(e));
    return { success: false, error: "Unexpected error saving enrollment credit configuration" };
  }
}

export async function getSectionGradingPeriods(
  courseSectionId: string,
): Promise<ActionResult<Array<{ id: string; name: string; period_type: string; semester_number: number | null }>>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const supabase = await createClient();

    // Get school_year_id from course section
    const { data: section } = await (supabase as any)
      .from("course_sections")
      .select("school_year_id")
      .eq("id", courseSectionId)
      .eq("organization_id", orgId)
      .single();

    if (!section?.school_year_id) return { success: true, data: [] };

    // Return semester AND full_year periods — both are valid for course term config
    const { data: periods, error } = await (supabase as any)
      .from("grading_periods")
      .select("id, name, period_type, semester_number")
      .eq("organization_id", orgId)
      .eq("school_year_id", section.school_year_id)
      .in("period_type", ["semester", "full_year"])
      .order("semester_number", { ascending: true, nullsFirst: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: periods ?? [] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
