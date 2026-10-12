"use server";

/**
 * Stage Q1 — Quarter Workflow Server Actions
 *
 * Authorization: registrar, admin, full_admin, platform_admin only.
 * (Same authorization level as course finalization.)
 *
 * Entry points:
 *   getQuarterDashboard       — read-only summary for all quarters
 *   getQuarterCourseDetail    — detailed per-student breakdown for one course+quarter
 *   startQuarterReview        — transition a course to REVIEW status
 *   finalizeQuarterCourse     — snapshot grades and set FINALIZED (single course)
 *   batchFinalizeQuarterCourses — finalize multiple courses, reports all results
 *   reopenQuarterCourse       — delete snapshots and return to REVIEW
 */

import { createClient, getUser, getActiveOrgId, resolveProfileId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import {
  calculatePointsGrade,
  calculateWeightedGrade,
  lookupLetterGrade,
} from "@/lib/grading/calculator";
import { isWeightedConfigured } from "@/lib/grading/weightedConfig";
import type {
  GradeInput,
  GradeScaleLevel,
  CategoryWeights,
  GradeStatus,
  AssignmentCategory,
  QuarterGradeResult,
} from "@/lib/grading/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const REGISTRAR_ROLES = ["registrar", "admin", "full_admin", "platform_admin"] as const;

// ── Authorization guard ───────────────────────────────────────────────────────

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
  if (!REGISTRAR_ROLES.includes(role as never)) {
    throw new Error("Insufficient permissions: registrar or above required");
  }
  return { supabase, profileId, role };
}

// ── Grade scale ───────────────────────────────────────────────────────────────

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

// ── Grade computation helper ──────────────────────────────────────────────────
// Replicates the same logic used in studentGrades.ts for consistency.

function buildGradeInputs(
  assignments: Array<{ id: string; points_possible: number; is_graded: boolean; category: string }>,
  gradeMap: Map<string, { points_earned: number | null; grade_status: string }>,
): GradeInput[] {
  return assignments.map((a) => {
    const g = gradeMap.get(a.id);
    return {
      assignment_id:   a.id,
      points_possible: a.points_possible,
      points_earned:   g?.points_earned ?? null,
      grade_status:    ((g?.grade_status ?? "not_graded") as GradeStatus),
      category:        a.category as AssignmentCategory,
      is_graded:       a.is_graded,
    };
  });
}

function computeQuarterGrade(
  inputs: GradeInput[],
  gradingMethod: string,
  categoryWeights: CategoryWeights | null,
  scale: GradeScaleLevel[],
): QuarterGradeResult {
  if (gradingMethod === "weighted" && isWeightedConfigured(gradingMethod, categoryWeights)) {
    return calculateWeightedGrade(inputs, categoryWeights!, scale) as QuarterGradeResult;
  }
  return calculatePointsGrade(inputs, scale);
}

// Map grade calculator state to snapshot grade_state enum
function mapGradeState(state: string, missingCount: number): string {
  switch (state) {
    case "graded":         return "graded";
    case "no_grade":       return "no_grade";
    case "partial":        return missingCount > 0 ? "missing_work" : "graded";
    case "setup_required": return "incomplete";
    default:               return "no_grade";
  }
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface QuarterWorkflowStatus {
  workflowId:      string | null;
  status:          "open" | "review" | "finalized";
  reviewStartedAt: string | null;
  finalizedAt:     string | null;
  reopenCount:     number;
}

export interface QuarterCourseRow {
  courseSectionId:   string;
  courseName:        string;
  subject:           string;
  teacherName:       string | null;
  gradingMethod:     string;
  workflow:          QuarterWorkflowStatus;
  enrolledCount:     number;
  assignmentCount:   number;
  ungradedCount:     number;
  missingCount:      number;
  averagePercentage: number | null;
  averageLetterGrade: string | null;
  readyToFinalize:   boolean;   // all students have grades
  snapshotCount:     number;    // number of frozen snapshots (if finalized)
}

export interface QuarterPeriodSummary {
  periodId:        string;
  periodName:      string;
  startDate:       string;
  endDate:         string;
  totalCourses:    number;
  finalizedCount:  number;
  reviewCount:     number;
  openCount:       number;
  courses:         QuarterCourseRow[];
}

export interface QuarterDashboardData {
  periods: QuarterPeriodSummary[];
  schoolYearId:    string;
  schoolYearLabel: string;
}

export interface QuarterStudentGradeRow {
  enrollmentId:   string;
  studentId:      string;
  studentName:    string;
  percentage:     number | null;
  letterGrade:    string | null;
  gradeState:     string;
  missingCount:   number;
  assignmentCount: number;
  isFinalized:    boolean;
  snapshotPercentage:  number | null;
  snapshotLetterGrade: string | null;
}

export interface QuarterCourseDetail {
  courseSectionId: string;
  courseName:      string;
  subject:         string;
  teacherName:     string | null;
  gradingMethod:   string;
  periodId:        string;
  periodName:      string;
  workflow:        QuarterWorkflowStatus;
  students:        QuarterStudentGradeRow[];
  assignmentCount: number;
  ungradedCount:   number;
}

// ── GET QUARTER DASHBOARD ────────────────────────────────────────────────────

export async function getQuarterDashboard(
  orgId: string,
): Promise<ActionResult<QuarterDashboardData>> {
  try {
    const supabase = await createClient();
    const user = await getUser();
    if (!user) return { success: false, error: "Unauthenticated" };

    // Staff-level check (read-only dashboard — all staff can view)
    const profileId = await resolveProfileId(user.id);
    const { data: member } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("profile_id", profileId)
      .eq("status", "active")
      .single();
    const staffRoles = ["teacher","staff","registrar","admin","full_admin","platform_admin"];
    if (!staffRoles.includes((member as any)?.role ?? "")) {
      return { success: false, error: "Insufficient permissions" };
    }

    // Current school year
    const { data: currentYear } = await supabase
      .from("school_years")
      .select("id, label")
      .eq("organization_id", orgId)
      .eq("is_current", true)
      .maybeSingle();
    const schoolYearId    = (currentYear as any)?.id as string | null ?? "";
    const schoolYearLabel = (currentYear as any)?.label as string ?? "";
    if (!schoolYearId) return { success: false, error: "No active school year" };

    // All assignment-entry quarters for this school year
    const { data: periodsData } = await supabase
      .from("grading_periods")
      .select("id, name, period_type, sequence, start_date, end_date")
      .eq("organization_id", orgId)
      .eq("school_year_id", schoolYearId)
      .eq("is_assignment_period", true)
      .eq("period_type", "quarter")
      .order("sequence");
    const periods = (periodsData ?? []) as Array<{
      id: string; name: string; period_type: string;
      sequence: number; start_date: string; end_date: string;
    }>;

    // Active course sections
    const { data: sections } = await supabase
      .from("course_sections")
      .select("id, course_name, subject, teacher_name, grading_method, category_weights")
      .eq("organization_id", orgId)
      .eq("school_year_id", schoolYearId)
      .eq("status", "active");
    const sectionList = (sections ?? []) as Array<{
      id: string; course_name: string; subject: string;
      teacher_name: string | null; grading_method: string;
      category_weights: CategoryWeights | null;
    }>;

    const scale = await loadGradeScale(supabase, orgId);

    // Workflow rows for all sections across all quarters
    const sectionIds = sectionList.map((s) => s.id);
    const periodIds  = periods.map((p) => p.id);

    let workflowMap = new Map<string, any>(); // key: `${sectionId}:${periodId}`
    if (sectionIds.length > 0 && periodIds.length > 0) {
      const { data: workflows } = await (supabase as any)
        .from("grading_period_workflow")
        .select("id, course_section_id, grading_period_id, status, review_started_at, finalized_at, reopen_count")
        .eq("organization_id", orgId)
        .in("course_section_id", sectionIds)
        .in("grading_period_id", periodIds);
      for (const w of workflows ?? []) {
        workflowMap.set(`${w.course_section_id}:${w.grading_period_id}`, w);
      }
    }

    // Enrollment student IDs per section (needed for targeting-aware readiness)
    const enrolledStudentsBySectionMap = new Map<string, Set<string>>();
    if (sectionIds.length > 0) {
      const { data: enrollments } = await supabase
        .from("curriculum_enrollments")
        .select("course_section_id, student_id")
        .eq("organization_id", orgId)
        .in("course_section_id", sectionIds)
        .eq("status", "active");
      for (const e of (enrollments ?? []) as any[]) {
        if (!enrolledStudentsBySectionMap.has(e.course_section_id)) {
          enrolledStudentsBySectionMap.set(e.course_section_id, new Set());
        }
        enrolledStudentsBySectionMap.get(e.course_section_id)!.add(e.student_id);
      }
    }

    // Build period summaries
    const periodSummaries: QuarterPeriodSummary[] = [];

    for (const period of periods) {
      // Assignments for this period across all sections
      let assignments: any[] = [];
      if (sectionIds.length > 0) {
        const { data: assignmentData } = await supabase
          .from("assignments")
          .select("id, course_section_id, target_mode")
          .eq("organization_id", orgId)
          .eq("grading_period_id", period.id)
          .eq("status", "active")
          .in("course_section_id", sectionIds);
        assignments = (assignmentData ?? []) as any[];
      }

      // Build assignment ID map for grade-status queries
      const assignmentsBySectionMap = new Map<string, string[]>(); // sectionId → assignmentIds
      for (const a of (assignments ?? []) as any[]) {
        if (!assignmentsBySectionMap.has(a.course_section_id)) {
          assignmentsBySectionMap.set(a.course_section_id, []);
        }
        assignmentsBySectionMap.get(a.course_section_id)!.push(a.id);
      }

      // Build reverse map and collect all period assignment IDs
      const assignmentToSection = new Map<string, string>();
      const allPeriodAssignmentIds: string[] = [];
      Array.from(assignmentsBySectionMap.entries()).forEach(([sectionId, ids]) => {
        for (const id of ids) {
          assignmentToSection.set(id, sectionId);
          allPeriodAssignmentIds.push(id);
        }
      });

      // Fetch assignment targets for targeting-aware readiness computation.
      // A dash (—) in the gradebook means NOT assigned; only targeted pairs count.
      const assignmentTargetSet = new Set<string>(); // "assignmentId:studentId"
      if (allPeriodAssignmentIds.length > 0) {
        const { data: targets } = await supabase
          .from("assignment_student_targets")
          .select("assignment_id, student_id")
          .in("assignment_id", allPeriodAssignmentIds);
        for (const t of (targets ?? []) as any[]) {
          assignmentTargetSet.add(`${t.assignment_id}:${t.student_id}`);
        }
      }

      // Count targeted (student, assignment) pairs per section.
      // target_mode=null → legacy, all enrolled students are targeted (no rows in targets table).
      // target_mode='all'|'selected' → only students with an explicit target row are assigned.
      const targetedPairsBySectionMap = new Map<string, number>();
      for (const a of assignments) {
        const enrolled = enrolledStudentsBySectionMap.get(a.course_section_id);
        if (!enrolled || enrolled.size === 0) continue;
        if (a.target_mode === null) {
          targetedPairsBySectionMap.set(
            a.course_section_id,
            (targetedPairsBySectionMap.get(a.course_section_id) ?? 0) + enrolled.size,
          );
        } else {
          let count = 0;
          enrolled.forEach((studentId) => {
            if (assignmentTargetSet.has(`${a.id}:${studentId}`)) count++;
          });
          targetedPairsBySectionMap.set(
            a.course_section_id,
            (targetedPairsBySectionMap.get(a.course_section_id) ?? 0) + count,
          );
        }
      }

      // Bulk-query grade statuses for readiness computation.
      // Also count total grade entries per section to detect "no row" (unsubmitted).
      const missingBySectionMap      = new Map<string, number>();
      const ungradedBySectionMap     = new Map<string, number>(); // explicit not_graded status
      const gradeEntriesBySectionMap = new Map<string, number>(); // any grade row at all
      if (allPeriodAssignmentIds.length > 0) {
        const { data: grades } = await supabase
          .from("student_assignment_grades")
          .select("assignment_id, grade_status")
          .in("assignment_id", allPeriodAssignmentIds);
        for (const g of (grades ?? []) as any[]) {
          const sid = assignmentToSection.get(g.assignment_id);
          if (!sid) continue;
          gradeEntriesBySectionMap.set(sid, (gradeEntriesBySectionMap.get(sid) ?? 0) + 1);
          if (g.grade_status === "missing") {
            missingBySectionMap.set(sid, (missingBySectionMap.get(sid) ?? 0) + 1);
          } else if (g.grade_status === "not_graded") {
            ungradedBySectionMap.set(sid, (ungradedBySectionMap.get(sid) ?? 0) + 1);
          }
        }
      }

      const courses: QuarterCourseRow[] = sectionList
        .filter((s) => (assignmentsBySectionMap.get(s.id)?.length ?? 0) > 0)
        .map((sec) => {
          const wf = workflowMap.get(`${sec.id}:${period.id}`);
          const workflow: QuarterWorkflowStatus = wf
            ? {
                workflowId:      wf.id,
                status:          wf.status as "open" | "review" | "finalized",
                reviewStartedAt: wf.review_started_at,
                finalizedAt:     wf.finalized_at,
                reopenCount:     wf.reopen_count ?? 0,
              }
            : { workflowId: null, status: "open", reviewStartedAt: null, finalizedAt: null, reopenCount: 0 };

          const enrolledCount   = enrolledStudentsBySectionMap.get(sec.id)?.size ?? 0;
          const assignmentCount = assignmentsBySectionMap.get(sec.id)?.length ?? 0;
          const missingCount    = missingBySectionMap.get(sec.id) ?? 0;
          // ungradedCount = explicit not_graded rows + unsubmitted targeted pairs.
          // Unsubmitted = targeted pairs that have no grade row at all.
          // Dash cells (not-assigned) are excluded because they're not in targetedPairs.
          const gradeEntries    = gradeEntriesBySectionMap.get(sec.id) ?? 0;
          const targetedPairs   = targetedPairsBySectionMap.get(sec.id) ?? 0;
          const unsubmitted     = Math.max(0, targetedPairs - gradeEntries);
          const ungradedCount   = (ungradedBySectionMap.get(sec.id) ?? 0) + unsubmitted;
          const readyToFinalize = workflow.status !== "finalized"
            && assignmentCount > 0
            && missingCount === 0
            && ungradedCount === 0;

          return {
            courseSectionId:    sec.id,
            courseName:         sec.course_name,
            subject:            sec.subject,
            teacherName:        sec.teacher_name,
            gradingMethod:      sec.grading_method ?? "points",
            workflow,
            enrolledCount,
            assignmentCount,
            ungradedCount,
            missingCount,
            averagePercentage:  null,
            averageLetterGrade: null,
            readyToFinalize,
            snapshotCount:      0,
          };
        });

      periodSummaries.push({
        periodId:       period.id,
        periodName:     period.name,
        startDate:      period.start_date,
        endDate:        period.end_date,
        totalCourses:   courses.length,
        finalizedCount: courses.filter((c) => c.workflow.status === "finalized").length,
        reviewCount:    courses.filter((c) => c.workflow.status === "review").length,
        openCount:      courses.filter((c) => c.workflow.status === "open").length,
        courses,
      });
    }

    return {
      success: true,
      data: {
        periods: periodSummaries,
        schoolYearId,
        schoolYearLabel,
      },
    };
  } catch (err) {
    console.error("[getQuarterDashboard]", String(err));
    return { success: false, error: String(err) };
  }
}

// ── GET QUARTER COURSE DETAIL ─────────────────────────────────────────────────
// Detailed per-student grade breakdown for one course+quarter.

export async function getQuarterCourseDetail(
  orgId: string,
  periodId: string,
  courseSectionId: string,
): Promise<ActionResult<QuarterCourseDetail>> {
  try {
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
    const staffRoles = ["teacher","staff","registrar","admin","full_admin","platform_admin"];
    if (!staffRoles.includes((member as any)?.role ?? "")) {
      return { success: false, error: "Insufficient permissions" };
    }

    const scale = await loadGradeScale(supabase, orgId);

    // Section info
    const { data: section } = await supabase
      .from("course_sections")
      .select("course_name, subject, teacher_name, grading_method, category_weights")
      .eq("id", courseSectionId)
      .eq("organization_id", orgId)
      .single();
    if (!section) return { success: false, error: "Course not found" };

    // Period info
    const { data: period } = await supabase
      .from("grading_periods")
      .select("name")
      .eq("id", periodId)
      .single();

    const gradingMethod   = ((section as any).grading_method ?? "points") as string;
    const categoryWeights = (section as any).category_weights as CategoryWeights | null;

    // Workflow
    const { data: wf } = await (supabase as any)
      .from("grading_period_workflow")
      .select("id, status, review_started_at, finalized_at, reopen_count")
      .eq("organization_id", orgId)
      .eq("grading_period_id", periodId)
      .eq("course_section_id", courseSectionId)
      .maybeSingle();

    const workflow: QuarterWorkflowStatus = wf
      ? {
          workflowId:      wf.id,
          status:          wf.status as "open" | "review" | "finalized",
          reviewStartedAt: wf.review_started_at,
          finalizedAt:     wf.finalized_at,
          reopenCount:     wf.reopen_count ?? 0,
        }
      : { workflowId: null, status: "open", reviewStartedAt: null, finalizedAt: null, reopenCount: 0 };

    // Frozen snapshots (if finalized)
    const snapshotMap = new Map<string, any>(); // enrollmentId → snapshot
    if (wf?.status === "finalized" && wf?.id) {
      const { data: snaps } = await (supabase as any)
        .from("quarter_grade_snapshots")
        .select("enrollment_id, percentage, letter_grade, grade_state, missing_count, assignment_count")
        .eq("workflow_id", wf.id);
      for (const s of snaps ?? []) {
        snapshotMap.set(s.enrollment_id, s);
      }
    }

    // Enrollments + students
    const { data: enrollments } = await supabase
      .from("curriculum_enrollments")
      .select("id, student_id, students(first_name, last_name, preferred_name)")
      .eq("course_section_id", courseSectionId)
      .eq("organization_id", orgId)
      .eq("status", "active");

    // Assignments for this period
    const { data: allAssignments } = await supabase
      .from("assignments")
      .select("id, points_possible, is_graded, category, target_mode")
      .eq("course_section_id", courseSectionId)
      .eq("grading_period_id", periodId)
      .eq("status", "active");
    const allAList = (allAssignments ?? []) as Array<{
      id: string; points_possible: number; is_graded: boolean;
      category: string; target_mode: string | null;
    }>;
    const allAIds = allAList.map((a) => a.id);

    const studentRows: QuarterStudentGradeRow[] = [];
    let totalUngraded = 0;

    for (const enr of (enrollments ?? []) as any[]) {
      const student = enr.students;
      const studentId = enr.student_id as string;
      const enrollmentId = enr.id as string;
      const studentName =
        `${(student as any)?.preferred_name ?? (student as any)?.first_name ?? ""} ${(student as any)?.last_name ?? ""}`.trim();

      // Filter assignments for this student
      const targetedIds = new Set<string>();
      if (allAIds.length > 0) {
        const { data: targets } = await supabase
          .from("assignment_student_targets")
          .select("assignment_id")
          .eq("student_id", studentId)
          .in("assignment_id", allAIds);
        for (const t of targets ?? []) targetedIds.add((t as any).assignment_id);
      }
      const assignmentList = allAList.filter((a) => targetedIds.has(a.id) || a.target_mode == null);
      const assignmentIds  = assignmentList.map((a) => a.id);

      // Grades
      const gradeMap = new Map<string, { points_earned: number | null; grade_status: string }>();
      if (assignmentIds.length > 0) {
        const { data: grades } = await supabase
          .from("student_assignment_grades")
          .select("assignment_id, points_earned, grade_status")
          .eq("student_id", studentId)
          .in("assignment_id", assignmentIds);
        for (const g of grades ?? []) gradeMap.set((g as any).assignment_id, g as any);
      }

      const inputs       = buildGradeInputs(assignmentList, gradeMap);
      const result       = computeQuarterGrade(inputs, gradingMethod, categoryWeights, scale);
      const gradeState   = mapGradeState(result.state, result.count_missing);
      const ungradedHere = result.count_not_graded;
      totalUngraded     += ungradedHere;

      const snap = snapshotMap.get(enrollmentId);

      studentRows.push({
        enrollmentId,
        studentId,
        studentName,
        percentage:          result.percentage,
        letterGrade:         result.letter_grade,
        gradeState,
        missingCount:        result.count_missing,
        assignmentCount:     assignmentList.length,
        isFinalized:         !!snap,
        snapshotPercentage:  snap ? Number(snap.percentage) : null,
        snapshotLetterGrade: snap?.letter_grade ?? null,
      });
    }

    studentRows.sort((a, b) => a.studentName.localeCompare(b.studentName));

    return {
      success: true,
      data: {
        courseSectionId,
        courseName:     (section as any).course_name,
        subject:        (section as any).subject,
        teacherName:    (section as any).teacher_name,
        gradingMethod,
        periodId,
        periodName:     (period as any)?.name ?? "",
        workflow,
        students:       studentRows,
        assignmentCount: allAList.length,
        ungradedCount:  totalUngraded,
      },
    };
  } catch (err) {
    console.error("[getQuarterCourseDetail]", String(err));
    return { success: false, error: String(err) };
  }
}

// ── START QUARTER REVIEW ──────────────────────────────────────────────────────

export async function startQuarterReview(
  orgId: string,
  periodId: string,
  courseSectionId: string,
): Promise<ActionResult<void>> {
  try {
    const { supabase, profileId } = await assertRegistrar(orgId);

    // Upsert workflow row to review status
    const { data: existing } = await (supabase as any)
      .from("grading_period_workflow")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("grading_period_id", periodId)
      .eq("course_section_id", courseSectionId)
      .maybeSingle();

    let workflowId: string;

    if (existing) {
      if (existing.status === "finalized") {
        return { success: false, error: "Course is finalized — use Reopen to make changes." };
      }
      if (existing.status === "review") {
        return { success: true, data: undefined }; // Already in review
      }
      // Open → Review
      const { error } = await (supabase as any)
        .from("grading_period_workflow")
        .update({
          status:             "review",
          review_started_at:  new Date().toISOString(),
          review_started_by:  profileId,
          updated_at:         new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) return { success: false, error: error.message };
      workflowId = existing.id;
    } else {
      // Create new workflow row
      const { data: newWf, error } = await (supabase as any)
        .from("grading_period_workflow")
        .insert({
          organization_id:    orgId,
          grading_period_id:  periodId,
          course_section_id:  courseSectionId,
          status:             "review",
          review_started_at:  new Date().toISOString(),
          review_started_by:  profileId,
        })
        .select("id")
        .single();
      if (error || !newWf) return { success: false, error: error?.message ?? "Failed to create workflow" };
      workflowId = (newWf as any).id;
    }

    // Insert event
    await (supabase as any).from("grading_period_workflow_events").insert({
      workflow_id:     workflowId,
      organization_id: orgId,
      event_type:      "review_started",
      actor_id:        profileId,
    });

    // Audit log
    const { logAudit } = await import("@/lib/audit");
    await logAudit({
      organization_id: orgId,
      actor_id:        profileId,
      action:          "quarter_review_started",
      resource_type:   "grading_period_workflow",
      resource_id:     workflowId,
      new_values:      { period_id: periodId, course_section_id: courseSectionId },
    });

    revalidatePath("/dashboard/academics/quarters");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("[startQuarterReview]", String(err));
    return { success: false, error: String(err) };
  }
}

// ── FINALIZE QUARTER COURSE ───────────────────────────────────────────────────
// Computes grades for all active enrollments → calls atomic RPC to snapshot + finalize.

export async function finalizeQuarterCourse(
  orgId: string,
  periodId: string,
  courseSectionId: string,
): Promise<ActionResult<{ snapshotCount: number }>> {
  try {
    const { supabase, profileId } = await assertRegistrar(orgId);
    const scale = await loadGradeScale(supabase, orgId);

    // Load workflow — must be in review status
    const { data: wf } = await (supabase as any)
      .from("grading_period_workflow")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("grading_period_id", periodId)
      .eq("course_section_id", courseSectionId)
      .maybeSingle();

    if (!wf) {
      return { success: false, error: "No workflow row found. Move to Review before finalizing." };
    }
    if (wf.status === "finalized") {
      return { success: false, error: "This course quarter is already finalized." };
    }
    if (wf.status !== "review") {
      return { success: false, error: "Course must be in REVIEW status before finalizing." };
    }

    // Course section info
    const { data: section } = await supabase
      .from("course_sections")
      .select("course_name, grading_method, category_weights")
      .eq("id", courseSectionId)
      .eq("organization_id", orgId)
      .single();
    if (!section) return { success: false, error: "Course section not found" };

    const gradingMethod   = ((section as any).grading_method ?? "points") as string;
    const categoryWeights = (section as any).category_weights as CategoryWeights | null;

    // Active enrollments
    const { data: enrollments } = await supabase
      .from("curriculum_enrollments")
      .select("id, student_id")
      .eq("course_section_id", courseSectionId)
      .eq("organization_id", orgId)
      .eq("status", "active");

    if (!enrollments || enrollments.length === 0) {
      return { success: false, error: "No active enrollments found for this course." };
    }

    // All assignments for this course+period
    const { data: allAssignments } = await supabase
      .from("assignments")
      .select("id, points_possible, is_graded, category, target_mode")
      .eq("course_section_id", courseSectionId)
      .eq("grading_period_id", periodId)
      .eq("status", "active");
    const allAList = (allAssignments ?? []) as Array<{
      id: string; points_possible: number; is_graded: boolean;
      category: string; target_mode: string | null;
    }>;
    const allAIds = allAList.map((a) => a.id);

    // Compute grade for each enrollment
    const snapshots: object[] = [];

    for (const enr of enrollments as Array<{ id: string; student_id: string }>) {
      const studentId    = enr.student_id;
      const enrollmentId = enr.id;

      // Filter assignments for this student
      const targetedIds = new Set<string>();
      if (allAIds.length > 0) {
        const { data: targets } = await supabase
          .from("assignment_student_targets")
          .select("assignment_id")
          .eq("student_id", studentId)
          .in("assignment_id", allAIds);
        for (const t of targets ?? []) targetedIds.add((t as any).assignment_id);
      }
      const assignmentList = allAList.filter((a) => targetedIds.has(a.id) || a.target_mode == null);
      const assignmentIds  = assignmentList.map((a) => a.id);

      // Grades
      const gradeMap = new Map<string, { points_earned: number | null; grade_status: string }>();
      if (assignmentIds.length > 0) {
        const { data: grades } = await supabase
          .from("student_assignment_grades")
          .select("assignment_id, points_earned, grade_status")
          .eq("student_id", studentId)
          .in("assignment_id", assignmentIds);
        for (const g of grades ?? []) gradeMap.set((g as any).assignment_id, g as any);
      }

      const inputs     = buildGradeInputs(assignmentList, gradeMap);
      const result     = computeQuarterGrade(inputs, gradingMethod, categoryWeights, scale);
      const gradeState = mapGradeState(result.state, result.count_missing);

      snapshots.push({
        enrollment_id:    enrollmentId,
        student_id:       studentId,
        course_section_id: courseSectionId,
        percentage:       result.percentage,
        letter_grade:     result.letter_grade,
        grade_state:      gradeState,
        missing_count:    result.count_missing,
        assignment_count: assignmentList.length,
        grading_method:   gradingMethod,
        category_weights: categoryWeights,
      });
    }

    // Call atomic RPC — pass objects directly, not JSON.stringify.
    // supabase.rpc() serializes the param object to JSON; pre-stringifying
    // would double-encode and arrive as a JSONB scalar, breaking jsonb_array_elements.
    const { error: rpcError } = await (supabase as any).rpc(
      "insert_quarter_snapshots_and_finalize",
      {
        p_workflow_id:    wf.id,
        p_org_id:         orgId,
        p_period_id:      periodId,
        p_snapshots:      snapshots,
        p_finalized_by:   profileId,
        p_event_metadata: {
          course_section_id: courseSectionId,
          snapshot_count:    snapshots.length,
        },
      },
    );

    if (rpcError) {
      console.error("[finalizeQuarterCourse] RPC error:", rpcError.message);
      return { success: false, error: "Finalization failed: " + rpcError.message };
    }

    revalidatePath("/dashboard/academics/quarters");
    return { success: true, data: { snapshotCount: snapshots.length } };
  } catch (err) {
    console.error("[finalizeQuarterCourse]", String(err));
    return { success: false, error: String(err) };
  }
}

// ── BATCH FINALIZE QUARTER COURSES ────────────────────────────────────────────

export interface BatchFinalizeResult {
  courseSectionId: string;
  success:         boolean;
  error?:          string;
  snapshotCount?:  number;
}

export async function batchFinalizeQuarterCourses(
  orgId: string,
  periodId: string,
  sectionIds: string[],
): Promise<ActionResult<BatchFinalizeResult[]>> {
  try {
    await assertRegistrar(orgId); // Auth check before loop

    const results: BatchFinalizeResult[] = [];
    for (const sectionId of sectionIds) {
      const res = await finalizeQuarterCourse(orgId, periodId, sectionId);
      results.push({
        courseSectionId: sectionId,
        success:         res.success,
        error:           res.success ? undefined : (res as any).error,
        snapshotCount:   res.success ? res.data?.snapshotCount : undefined,
      });
    }

    revalidatePath("/dashboard/academics/quarters");
    return { success: true, data: results };
  } catch (err) {
    console.error("[batchFinalizeQuarterCourses]", String(err));
    return { success: false, error: String(err) };
  }
}

// ── REOPEN QUARTER COURSE ─────────────────────────────────────────────────────

export async function reopenQuarterCourse(
  orgId: string,
  periodId: string,
  courseSectionId: string,
  reason: string,
): Promise<ActionResult<void>> {
  try {
    if (!reason?.trim()) {
      return { success: false, error: "A reason is required to reopen a finalized quarter course." };
    }

    const { supabase, profileId } = await assertRegistrar(orgId);

    // Must be currently finalized
    const { data: wf } = await (supabase as any)
      .from("grading_period_workflow")
      .select("id, status, reopen_count")
      .eq("organization_id", orgId)
      .eq("grading_period_id", periodId)
      .eq("course_section_id", courseSectionId)
      .maybeSingle();

    if (!wf) {
      return { success: false, error: "No workflow row found for this course and quarter." };
    }
    if (wf.status !== "finalized") {
      return { success: false, error: "Can only reopen a finalized course." };
    }

    // Delete frozen snapshots for this course+period
    const { error: deleteErr } = await (supabase as any)
      .from("quarter_grade_snapshots")
      .delete()
      .eq("workflow_id", wf.id);
    if (deleteErr) {
      console.error("[reopenQuarterCourse] delete snapshots error:", deleteErr.message);
      return { success: false, error: "Failed to delete grade snapshots: " + deleteErr.message };
    }

    // Update workflow back to review
    const { error: updateErr } = await (supabase as any)
      .from("grading_period_workflow")
      .update({
        status:              "review",
        finalized_at:        null,
        finalized_by:        null,
        reopen_count:        (wf.reopen_count ?? 0) + 1,
        last_reopened_at:    new Date().toISOString(),
        last_reopened_by:    profileId,
        last_reopen_reason:  reason.trim(),
        updated_at:          new Date().toISOString(),
      })
      .eq("id", wf.id);
    if (updateErr) {
      return { success: false, error: "Failed to update workflow: " + updateErr.message };
    }

    // Insert reopened event
    await (supabase as any).from("grading_period_workflow_events").insert({
      workflow_id:     wf.id,
      organization_id: orgId,
      event_type:      "reopened",
      actor_id:        profileId,
      reason:          reason.trim(),
      metadata:        JSON.stringify({
        previous_reopen_count: wf.reopen_count ?? 0,
      }),
    });

    // Audit log
    const { logAudit } = await import("@/lib/audit");
    await logAudit({
      organization_id: orgId,
      actor_id:        profileId,
      action:          "quarter_course_reopened",
      resource_type:   "grading_period_workflow",
      resource_id:     wf.id,
      new_values: {
        period_id:        periodId,
        course_section_id: courseSectionId,
        reason,
        reopen_count:     (wf.reopen_count ?? 0) + 1,
      },
    });

    revalidatePath("/dashboard/academics/quarters");
    return { success: true, data: undefined };
  } catch (err) {
    console.error("[reopenQuarterCourse]", String(err));
    return { success: false, error: String(err) };
  }
}
