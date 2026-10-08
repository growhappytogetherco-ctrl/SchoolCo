"use server";

/**
 * Stage D — RLA Course Finalization
 *
 * Authorization: registrar, admin, full_admin, platform_admin only.
 * Teachers may NOT finalize, override, or correct permanent academic records.
 *
 * Entry points:
 *   getFinalizationPreview   — read-only preview; NO DB writes
 *   finalizeCourseEnrollment — commit permanent record (single enrollment)
 *   correctFinalizedRecord   — post-finalization correction with full audit trail
 *   getSectionFinalizationRoster — readiness roster for course UI
 *   updateCourseCreditConfig — configure credit metadata on a course section
 */

import { createClient, getUser, resolveProfileId } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import { lookupLetterGrade } from "@/lib/grading/calculator";
import type { GradeScaleLevel } from "@/lib/grading/types";
import { logAudit } from "@/lib/audit";
import { resolveEffectiveCredit } from "@/lib/enrollmentCredit";
import {
  getStudentYTDGrade,
  getStudentSemesterGrade,
} from "@/app/actions/grading";

// ── Authorization guard ────────────────────────────────────────────────────────
// Finalization is restricted to registrar, admin, full_admin, platform_admin.
// RLS enforces this at the DB layer; this check provides early server-side rejection.

const FINALIZATION_ROLES = ["registrar", "admin", "full_admin", "platform_admin"] as const;

async function assertRegistrar(orgId: string) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");

  const profileId = await resolveProfileId(user.id);
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .single();

  const role = (member as any)?.role ?? "";
  if (!FINALIZATION_ROLES.includes(role as never)) {
    throw new Error("Insufficient permissions: registrar or above required to finalize academic records");
  }
  return { supabase, profileId, role };
}

// ── Grade scale loader ────────────────────────────────────────────────────────

async function loadGradeScale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
): Promise<GradeScaleLevel[]> {
  const { data } = await (supabase as any)
    .from("grade_scales")
    .select("levels")
    .eq("organization_id", orgId)
    .eq("is_default", true)
    .single();
  return (data?.levels as GradeScaleLevel[]) ?? [];
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type FinalizationCompletionStatus =
  | "completed"
  | "failed"
  | "incomplete"
  | "withdrawn";

export interface FinalizationPreviewStudent {
  enrollmentId:              string;
  studentId:                 string;
  studentName:               string;
  courseSectionId:           string | null;
  courseName:                string;
  subject:                   string;
  schoolYear:                string;
  schoolYearId:              string;
  term:                      string | null;
  institution:               string;
  calculatedPercentage:      number | null;
  calculatedLetterGrade:     string | null;
  officialPercentage:        number | null;   // null until staff sets an override
  officialLetterGrade:       string | null;
  countsTowardHsCredit:      boolean;
  creditsAttempted:          number | null;
  creditsEarned:             number | null;   // null = requires explicit staff entry
  courseLevel:               string | null;
  suggestedCompletionStatus: FinalizationCompletionStatus;
  warnings:                  string[];
  blockers:                  string[];
  alreadyFinalized:          boolean;
}

export interface FinalizationCommitPayload {
  enrollmentId:         string;
  officialPercentage:   number;
  completionStatus:     FinalizationCompletionStatus;
  creditsEarned:        number | null;   // required when countsTowardHsCredit = true
  // Optional pre-finalization override (if different from calculated)
  overrideReason?:      string;          // required iff officialPercentage !== calculatedPercentage
}

export interface SectionRosterRow {
  enrollmentId:      string;
  studentId:         string;
  studentName:       string;
  finalizationState: "not_started" | "ready" | "needs_attention" | "finalized";
  alreadyFinalized:  boolean;
  finalizedAt:       string | null;
  warnings:          string[];
  blockers:          string[];
}

// ── GET SECTION FINALIZATION ROSTER ─────────────────────────────────────────

export async function getSectionFinalizationRoster(
  courseSectionId: string,
): Promise<ActionResult<SectionRosterRow[]>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    await assertRegistrar(orgId);
    const supabase = await createClient();

    // Fetch all enrollments linked to this section
    const { data: enrollments, error: eErr } = await supabase
      .from("curriculum_enrollments")
      .select(`
        id,
        student_id,
        status,
        finalized_at,
        finalized_record_id,
        students ( first_name, last_name )
      `)
      .eq("course_section_id", courseSectionId)
      .eq("organization_id", orgId)
      .in("status", ["active", "completed"]);

    if (eErr) throw eErr;

    const rows: SectionRosterRow[] = (enrollments ?? []).map((e: any) => {
      const alreadyFinalized = !!e.finalized_at;
      const warnings: string[] = [];
      const blockers: string[] = [];

      if (!alreadyFinalized && e.status === "active") {
        // Still active — may not have all grades entered
        warnings.push("Enrollment still active — confirm all grades are entered before finalizing.");
      }

      let state: SectionRosterRow["finalizationState"];
      if (alreadyFinalized) {
        state = "finalized";
      } else if (blockers.length > 0) {
        state = "needs_attention";
      } else if (warnings.length === 0) {
        state = "ready";
      } else {
        state = "needs_attention";
      }

      return {
        enrollmentId:      e.id,
        studentId:         e.student_id,
        studentName:       `${(e.students as any)?.first_name ?? ""} ${(e.students as any)?.last_name ?? ""}`.trim(),
        finalizationState: state,
        alreadyFinalized,
        finalizedAt:       e.finalized_at ?? null,
        warnings,
        blockers,
      };
    });

    return { success: true, data: rows };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── GET FINALIZATION PREVIEW (single enrollment) ──────────────────────────────
// Pure read — absolutely no DB writes.

export async function getFinalizationPreview(
  enrollmentId: string,
): Promise<ActionResult<FinalizationPreviewStudent>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    await assertRegistrar(orgId);
    const supabase = await createClient();
    const scale = await loadGradeScale(supabase, orgId);

    // Load enrollment + linked section + school year (includes enrollment-level credit overrides)
    const { data: enrollment, error: eErr } = await supabase
      .from("curriculum_enrollments")
      .select(`
        id,
        student_id,
        subject,
        curriculum_name,
        status,
        finalized_at,
        finalized_record_id,
        course_section_id,
        counts_toward_high_school_credit,
        credits_attempted,
        course_level,
        grading_period_id,
        grading_periods ( name ),
        students ( first_name, last_name ),
        course_sections (
          course_name,
          school_year_id,
          counts_toward_high_school_credit,
          credits_attempted,
          course_level,
          grading_period_id,
          grading_periods ( name ),
          school_years ( label )
        )
      `)
      .eq("id", enrollmentId)
      .eq("organization_id", orgId)
      .single();

    if (eErr || !enrollment) {
      return { success: false, error: "Enrollment not found" };
    }

    const e = enrollment as any;
    const section = e.course_sections;
    const student = e.students;

    const warnings: string[] = [];
    const blockers: string[] = [];
    const alreadyFinalized = !!e.finalized_at;

    if (alreadyFinalized) {
      blockers.push("This enrollment has already been finalized.");
    }

    if (!e.course_section_id || !section) {
      blockers.push("This enrollment is not linked to a course section. Link it before finalizing.");
    }

    // Fetch calculated YTD grade if section exists
    let calculatedPercentage: number | null = null;
    let calculatedLetterGrade: string | null = null;

    if (section?.school_year_id && e.course_section_id) {
      const ytdResult = await getStudentYTDGrade(
        e.student_id,
        e.course_section_id,
        section.school_year_id,
        orgId,
      );
      if (ytdResult.success) {
        calculatedPercentage  = ytdResult.data.percentage;
        calculatedLetterGrade = ytdResult.data.letter_grade;
      } else {
        warnings.push("Could not compute gradebook percentage: " + ytdResult.error);
      }
    }

    if (calculatedPercentage === null && e.status !== "withdrawn" && e.status !== "incomplete") {
      warnings.push("No gradebook data found. Percentage will be null unless overridden.");
    }

    // Effective credit values: enrollment override ?? section default
    const effective = resolveEffectiveCredit(
      {
        counts_toward_high_school_credit: e.counts_toward_high_school_credit ?? null,
        credits_attempted:                e.credits_attempted ?? null,
        course_level:                     e.course_level ?? null,
        grading_period_id:                e.grading_period_id ?? null,
        grading_period_name:              (e.grading_periods as any)?.name ?? null,
      },
      {
        counts_toward_high_school_credit: section?.counts_toward_high_school_credit,
        credits_attempted:                section?.credits_attempted,
        course_level:                     section?.course_level,
        grading_period_id:                section?.grading_period_id ?? null,
        grading_period_name:              (section?.grading_periods as any)?.name ?? null,
      },
    );

    if (effective.countsTowardHsCredit && effective.creditsAttempted === null) {
      warnings.push("This enrollment is marked as HS-credit-bearing but credits_attempted is not configured. Set it on the enrollment or course before finalizing.");
    }

    // Suggest completion status
    let suggestedCompletionStatus: FinalizationCompletionStatus = "completed";
    if (e.status === "active") {
      warnings.push("Enrollment is still Active. Consider whether the course is truly complete.");
    }

    const schoolYearLabel = (section?.school_years as any)?.label ?? "";

    return {
      success: true,
      data: {
        enrollmentId:              e.id,
        studentId:                 e.student_id,
        studentName:               `${student?.first_name ?? ""} ${student?.last_name ?? ""}`.trim(),
        courseSectionId:           e.course_section_id ?? null,
        courseName:                section?.course_name ?? e.curriculum_name ?? "",
        subject:                   e.subject ?? "",
        schoolYear:                schoolYearLabel,
        schoolYearId:              section?.school_year_id ?? "",
        // termLabel from enrollment grading_period_id; null = not specified (never "Full Year")
        term:                      effective.termLabel,
        institution:               "Rising Leaders Academy",
        calculatedPercentage,
        calculatedLetterGrade,
        officialPercentage:        calculatedPercentage,
        officialLetterGrade:       calculatedLetterGrade,
        countsTowardHsCredit:      effective.countsTowardHsCredit,
        creditsAttempted:          effective.creditsAttempted,
        creditsEarned:             null,
        courseLevel:               effective.courseLevel,
        suggestedCompletionStatus,
        warnings,
        blockers,
        alreadyFinalized,
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Maps grading_periods.name to student_course_records.term enum value.
// Returns null when grading_period_id is null (never auto-infers "full_year").
function gpNameToTermEnum(name: string | null): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  if (n === "semester 1") return "semester_1";
  if (n === "semester 2") return "semester_2";
  if (n === "quarter 1" || n === "q1") return "quarter_1";
  if (n === "quarter 2" || n === "q2") return "quarter_2";
  if (n === "quarter 3" || n === "q3") return "quarter_3";
  if (n === "quarter 4" || n === "q4") return "quarter_4";
  if (n === "full year") return "full_year";
  if (n === "summer") return "summer";
  return null; // unrecognized period name → no term
}

// ── FINALIZE COURSE ENROLLMENT (commit) ───────────────────────────────────────
// Creates the permanent student_course_records row.
// DB uniqueness constraint (uq_scr_native_per_enrollment) prevents duplicates.

export async function finalizeCourseEnrollment(
  payload: FinalizationCommitPayload,
): Promise<ActionResult<{ recordId: string }>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase, profileId } = await assertRegistrar(orgId);
    const scale = await loadGradeScale(supabase, orgId);

    // --- 1. Load enrollment + section (fresh read, not from client state) -------
    const { data: enrollment, error: eErr } = await supabase
      .from("curriculum_enrollments")
      .select(`
        id,
        student_id,
        organization_id,
        subject,
        curriculum_name,
        status,
        finalized_at,
        course_section_id,
        counts_toward_high_school_credit,
        credits_attempted,
        course_level,
        grading_period_id,
        grading_periods ( name ),
        course_sections (
          id,
          course_name,
          school_year_id,
          counts_toward_high_school_credit,
          credits_attempted,
          course_level,
          grading_period_id,
          grading_periods ( name ),
          school_years ( label )
        )
      `)
      .eq("id", payload.enrollmentId)
      .eq("organization_id", orgId)
      .single();

    if (eErr || !enrollment) return { success: false, error: "Enrollment not found" };

    const e = enrollment as any;

    // --- 2. Idempotency guard (app layer; DB constraint is the hard guarantee) ---
    if (e.finalized_at) {
      return { success: false, error: "This enrollment has already been finalized." };
    }

    if (!e.course_section_id) {
      return { success: false, error: "Enrollment must be linked to a course section before finalizing." };
    }

    const section = e.course_sections;

    // --- 3. Validate completion status ---
    const validStatuses: FinalizationCompletionStatus[] = ["completed", "failed", "incomplete", "withdrawn"];
    if (!validStatuses.includes(payload.completionStatus)) {
      return { success: false, error: "Invalid completion status." };
    }

    // --- 4. Credits validation (use effective values: enrollment override ?? section default) ---
    const effectiveFinal = resolveEffectiveCredit(
      {
        counts_toward_high_school_credit: e.counts_toward_high_school_credit ?? null,
        credits_attempted:                e.credits_attempted ?? null,
        course_level:                     e.course_level ?? null,
        grading_period_id:                e.grading_period_id ?? null,
        grading_period_name:              (e.grading_periods as any)?.name ?? null,
      },
      {
        counts_toward_high_school_credit: section?.counts_toward_high_school_credit,
        credits_attempted:                section?.credits_attempted,
        course_level:                     section?.course_level,
        grading_period_id:                section?.grading_period_id ?? null,
        grading_period_name:              (section?.grading_periods as any)?.name ?? null,
      },
    );
    const countsTowardHsCredit = effectiveFinal.countsTowardHsCredit;
    if (countsTowardHsCredit && payload.creditsEarned === undefined) {
      return {
        success: false,
        error: "Credits earned must be explicitly provided for HS-credit-bearing courses.",
      };
    }
    // Incomplete/withdrawn may not earn credit
    if (["incomplete", "withdrawn"].includes(payload.completionStatus) && (payload.creditsEarned ?? 0) > 0) {
      return {
        success: false,
        error: "Incomplete or withdrawn enrollments cannot have credits_earned > 0.",
      };
    }

    // --- 5. Compute official letter grade from the official percentage ----------
    // The official letter is ALWAYS derived from the official percentage,
    // not from the calculated percentage.
    const officialLetterGrade = lookupLetterGrade(payload.officialPercentage, scale);

    // --- 6. Detect if an override is being applied ------------------------------
    // Fetch current calculated percentage to compare
    let calculatedPercentage: number | null = null;
    const ytdResult = await getStudentYTDGrade(
      e.student_id,
      e.course_section_id,
      section.school_year_id,
      orgId,
    );
    if (ytdResult.success) {
      calculatedPercentage = ytdResult.data.percentage;
    }

    const isOverride =
      calculatedPercentage !== null &&
      Math.abs(payload.officialPercentage - calculatedPercentage) >= 0.005;

    if (isOverride && !payload.overrideReason?.trim()) {
      return {
        success: false,
        error: "An override reason is required when the official percentage differs from the calculated grade.",
      };
    }

    // --- 7. Insert permanent student_course_records row -------------------------
    const { data: record, error: rErr } = await (supabase as any)
      .from("student_course_records")
      .insert({
        organization_id:              orgId,
        student_id:                   e.student_id,
        source_type:                  "schoolco_native",
        verification_status:          "verified",
        completion_status:            payload.completionStatus,
        institution_name:             "Rising Leaders Academy",
        subject_area:                 e.subject ?? null,
        course_name:                  section?.course_name ?? e.curriculum_name ?? null,
        school_year:                  (section?.school_years as any)?.label ?? null,
        percentage:                   payload.officialPercentage,
        final_grade:                  officialLetterGrade,
        counts_toward_high_school_credit: countsTowardHsCredit,
        credits_attempted:            countsTowardHsCredit ? (effectiveFinal.creditsAttempted ?? null) : null,
        credits_earned:               countsTowardHsCredit ? (payload.creditsEarned ?? null) : null,
        course_level:                 effectiveFinal.courseLevel,
        // term: map grading_period name to student_course_records.term enum
        // null grading_period_id → term left null (never auto-infer "full_year")
        term:                         gpNameToTermEnum(effectiveFinal.termLabel),
        course_section_id:            e.course_section_id,
        curriculum_enrollment_id:     e.id,
        created_by:                   profileId,
        updated_by:                   profileId,
        verified_by:                  profileId,
        verified_at:                  new Date().toISOString(),
      })
      .select("id")
      .single();

    if (rErr || !record) {
      const msg = (rErr as any)?.message ?? "";
      // DB uniqueness constraint fires → duplicate finalization attempt
      if (msg.includes("uq_scr_native_per_enrollment") || msg.includes("unique")) {
        return { success: false, error: "This enrollment has already been finalized (duplicate detected)." };
      }
      console.error("[finalizeCourseEnrollment] insert error:", msg);
      return { success: false, error: "Finalization failed. Please try again." };
    }

    const recordId = (record as any).id as string;

    // --- 8. Record finalization override if applicable --------------------------
    if (isOverride && calculatedPercentage !== null) {
      const calculatedLetter = lookupLetterGrade(calculatedPercentage, scale);
      await (supabase as any).from("course_finalization_overrides").insert({
        organization_id:          orgId,
        student_id:               e.student_id,
        curriculum_enrollment_id: e.id,
        course_section_id:        e.course_section_id,
        calculated_percentage:    calculatedPercentage,
        calculated_letter_grade:  calculatedLetter,
        override_percentage:      payload.officialPercentage,
        override_letter_grade:    officialLetterGrade,
        reason:                   payload.overrideReason!,
        overridden_by:            profileId,
        student_course_record_id: recordId,
      });
    }

    // --- 9. Update enrollment finalization state --------------------------------
    await (supabase as any)
      .from("curriculum_enrollments")
      .update({
        finalized_at:        new Date().toISOString(),
        finalized_by:        profileId,
        finalized_record_id: recordId,
        status:              "completed",
      })
      .eq("id", e.id)
      .eq("organization_id", orgId);

    // --- 10. Audit log ----------------------------------------------------------
    await logAudit({
      organization_id: orgId,
      actor_id:        profileId,
      action:          "academic_record.finalized",
      resource_type:   "student_course_records",
      resource_id:     recordId,
      new_values: {
        enrollment_id:        e.id,
        student_id:           e.student_id,
        course_name:          section?.course_name ?? e.curriculum_name,
        completion_status:    payload.completionStatus,
        official_percentage:  payload.officialPercentage,
        official_letter:      officialLetterGrade,
        credits_earned:       payload.creditsEarned ?? null,
        is_override:          isOverride,
      },
    });

    revalidatePath(`/dashboard/students/${e.student_id}`);
    revalidatePath(`/dashboard/courses/${e.course_section_id}`);

    return { success: true, data: { recordId } };
  } catch (err) {
    console.error("[finalizeCourseEnrollment] unexpected error:", String(err));
    return { success: false, error: "Finalization failed. Please try again." };
  }
}

// ── CORRECT FINALIZED RECORD (post-finalization) ──────────────────────────────
// For corrections AFTER finalization. Uses audit_logs as the immutable trail.
// Strictly limited to fields that require administrative correction.

export interface CorrectionPayload {
  recordId:          string;
  reason:            string;
  // All fields optional — only supply what is being corrected
  percentage?:       number;
  completionStatus?: FinalizationCompletionStatus;
  creditsEarned?:    number | null;
  creditsAttempted?: number | null;
  courseLevel?:      string;
}

export async function correctFinalizedRecord(
  payload: CorrectionPayload,
): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase, profileId } = await assertRegistrar(orgId);
    const scale = await loadGradeScale(supabase, orgId);

    if (!payload.reason?.trim()) {
      return { success: false, error: "A reason is required for post-finalization corrections." };
    }

    // Load existing record — must be schoolco_native and verified
    const { data: existing, error: rErr } = await (supabase as any)
      .from("student_course_records")
      .select("*")
      .eq("id", payload.recordId)
      .eq("organization_id", orgId)
      .eq("source_type", "schoolco_native")
      .single();

    if (rErr || !existing) {
      return { success: false, error: "Record not found or not eligible for correction." };
    }

    const prev = existing as any;

    // Build the update patch
    const patch: Record<string, unknown> = {
      updated_by: profileId,
      updated_at: new Date().toISOString(),
    };

    if (payload.percentage !== undefined) {
      patch.percentage  = payload.percentage;
      patch.final_grade = lookupLetterGrade(payload.percentage, scale);
    }
    if (payload.completionStatus !== undefined) {
      patch.completion_status = payload.completionStatus;
    }
    if (payload.creditsEarned !== undefined) {
      patch.credits_earned = payload.creditsEarned;
    }
    if (payload.creditsAttempted !== undefined) {
      patch.credits_attempted = payload.creditsAttempted;
    }
    if (payload.courseLevel !== undefined) {
      patch.course_level = payload.courseLevel;
    }

    if (Object.keys(patch).length <= 2) {
      return { success: false, error: "No fields to correct were provided." };
    }

    const { error: uErr } = await (supabase as any)
      .from("student_course_records")
      .update(patch)
      .eq("id", payload.recordId)
      .eq("organization_id", orgId);

    if (uErr) {
      console.error("[correctFinalizedRecord] update error:", uErr.message);
      return { success: false, error: "Correction failed. Please try again." };
    }

    // Immutable audit trail via audit_logs
    await logAudit({
      organization_id: orgId,
      actor_id:        profileId,
      action:          "academic_record.corrected",
      resource_type:   "student_course_records",
      resource_id:     payload.recordId,
      previous_values: {
        percentage:        prev.percentage,
        final_grade:       prev.final_grade,
        completion_status: prev.completion_status,
        credits_earned:    prev.credits_earned,
        credits_attempted: prev.credits_attempted,
        course_level:      prev.course_level,
      },
      new_values: patch,
      metadata: {
        correction_reason: payload.reason,
        corrected_by:      profileId,
      },
    });

    revalidatePath(`/dashboard/students/${prev.student_id}`);

    return { success: true, data: undefined };
  } catch (err) {
    console.error("[correctFinalizedRecord] unexpected error:", String(err));
    return { success: false, error: "Correction failed. Please try again." };
  }
}

// ── UPDATE COURSE CREDIT CONFIG ───────────────────────────────────────────────
// Allows registrar/admin to configure HS-credit metadata on a course section
// BEFORE finalization. Not restricted to registrar — staff can configure.

export async function updateCourseCreditConfig(
  courseSectionId: string,
  payload: {
    countsTowardHighSchoolCredit: boolean;
    creditsAttempted:             number | null;
    courseLevel:                  string | null;
    /** null = term not specified at section level */
    gradingPeriodId:              string | null;
  },
): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    // Staff can configure credit metadata; finalization itself requires registrar+
    const supabase = await createClient();
    const user = await getUser();
    if (!user) return { success: false, error: "Unauthenticated" };

    const profileId = await resolveProfileId(user.id);
    const { data: member } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("profile_id", profileId)
      .eq("status", "active")
      .single();

    const registrarRoles = ["registrar","admin","full_admin","platform_admin"];
    if (!registrarRoles.includes((member as any)?.role)) {
      return { success: false, error: "Insufficient permissions — registrar or above required" };
    }

    if (payload.countsTowardHighSchoolCredit && !payload.creditsAttempted) {
      return { success: false, error: "Credits must be set when high school credit is enabled." };
    }

    const validLevels = ["standard","honors","ap","dual_enrollment",null];
    if (!validLevels.includes(payload.courseLevel)) {
      return { success: false, error: "Invalid course level." };
    }

    // Validate grading_period_id belongs to this org and is semester or full_year
    if (payload.gradingPeriodId !== null) {
      const { data: gp, error: gpErr } = await (supabase as any)
        .from("grading_periods")
        .select("id, period_type, organization_id")
        .eq("id", payload.gradingPeriodId)
        .single();

      if (gpErr || !gp) return { success: false, error: "Grading period not found." };
      if (gp.organization_id !== orgId) return { success: false, error: "Grading period does not belong to this organization." };
      if (gp.period_type !== "semester" && gp.period_type !== "full_year") {
        return { success: false, error: "Course term must be a semester or full-year grading period." };
      }
    }

    const { error } = await (supabase as any)
      .from("course_sections")
      .update({
        counts_toward_high_school_credit: payload.countsTowardHighSchoolCredit,
        credits_attempted:                payload.creditsAttempted,
        course_level:                     payload.courseLevel,
        grading_period_id:                payload.gradingPeriodId,
      })
      .eq("id", courseSectionId)
      .eq("organization_id", orgId);

    if (error) {
      console.error("[updateCourseCreditConfig] error:", error.message);
      return { success: false, error: "Failed to update course configuration." };
    }

    revalidatePath(`/dashboard/courses/${courseSectionId}`);
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
