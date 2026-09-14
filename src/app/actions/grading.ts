"use server";

import { createClient, getUser, resolveProfileId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import {
  calculatePointsGrade,
  calculateWeightedGrade,
  calculateSemesterGrade,
  calculateYTDGrade,
} from "@/lib/grading/calculator";
import type { GradeInput, GradeScaleLevel, QuarterGradeResult } from "@/lib/grading/types";
export type {
  CourseSection, Assignment, StudentGrade, CreateAssignmentPayload,
  UpsertGradePayload, GradebookData, GradebookStudentRow,
} from "./grading-constants";

// ── Auth guard ────────────────────────────────────────────────────────────────

async function assertStaff(orgId: string) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");

  // Resolve canonical profiles.id — stub accounts have profiles.id ≠ auth.uid()
  const profileId = await resolveProfileId(user.id);
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .single();

  const staffRoles = ["teacher","staff","registrar","admin","full_admin","platform_admin"];
  if (!member || !staffRoles.includes((member as any).role)) {
    throw new Error("Insufficient permissions");
  }
  // Return profileId (profiles.id) — required for FK columns like created_by/updated_by
  return { supabase, userId: profileId };
}

// ── Grade scale loader ────────────────────────────────────────────────────────

async function getOrgGradeScale(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string): Promise<GradeScaleLevel[]> {
  const { data } = await supabase
    .from("grade_scales")
    .select("levels")
    .eq("organization_id", orgId)
    .eq("is_default", true)
    .single();
  return (data?.levels as GradeScaleLevel[]) ?? [];
}

// ── Course sections ───────────────────────────────────────────────────────────

export async function getCourseSections(orgId: string, schoolYearId?: string): Promise<ActionResult<import("./grading-constants").CourseSection[]>> {
  try {
    const { supabase } = await assertStaff(orgId);
    let q = supabase
      .from("course_sections")
      .select("*")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .order("subject")
      .order("course_name");

    if (schoolYearId) q = q.eq("school_year_id", schoolYearId);

    const { data, error } = await q;
    if (error) throw error;
    return { success: true, data: data ?? [] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createCourseSection(payload: {
  orgId: string;
  schoolYearId: string;
  subject: string;
  courseName: string;
  teacherId?: string;
  teacherName?: string;
}): Promise<ActionResult<import("./grading-constants").CourseSection>> {
  try {
    const { supabase } = await assertStaff(payload.orgId);
    const { data, error } = await supabase
      .from("course_sections")
      .insert({
        organization_id: payload.orgId,
        school_year_id:  payload.schoolYearId,
        subject:         payload.subject,
        course_name:     payload.courseName,
        teacher_id:      payload.teacherId ?? null,
        teacher_name:    payload.teacherName ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    revalidatePath("/dashboard/gradebook");
    return { success: true, data };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Link an existing curriculum_enrollment to a course section
export async function linkEnrollmentToSection(
  enrollmentId: string,
  courseSectionId: string,
  orgId: string
): Promise<ActionResult<void>> {
  try {
    const { supabase } = await assertStaff(orgId);
    const { error } = await supabase
      .from("curriculum_enrollments")
      .update({ course_section_id: courseSectionId })
      .eq("id", enrollmentId)
      .eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/dashboard/gradebook");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Assignments ───────────────────────────────────────────────────────────────

export async function createAssignment(
  payload: import("./grading-constants").CreateAssignmentPayload
): Promise<ActionResult<import("./grading-constants").Assignment>> {
  try {
    const { supabase, userId } = await assertStaff(payload.orgId);

    // Resolve grading period from assigned date if not explicitly provided
    let periodId = payload.gradingPeriodId ?? null;
    if (!periodId) {
      const { data: resolved } = await supabase
        .rpc("resolve_assignment_period", {
          p_organization_id:   payload.orgId,
          p_course_section_id: payload.courseSectionId,
          p_date:              payload.assignedDate,
        });
      if (!resolved) {
        return {
          success: false,
          error: `No active grading period found for ${payload.assignedDate}. Check that the date falls within a quarter's date range.`,
        };
      }
      periodId = resolved as string;
    }

    const targetMode = payload.targetMode ?? "all";

    const { data, error } = await supabase
      .from("assignments")
      .insert({
        organization_id:   payload.orgId,
        course_section_id: payload.courseSectionId,
        grading_period_id: periodId,
        title:             payload.title,
        description:       payload.description ?? null,
        category:          payload.category,
        assigned_date:     payload.assignedDate,
        due_date:          payload.dueDate ?? null,
        points_possible:   payload.pointsPossible,
        is_graded:         payload.isGraded ?? true,
        target_mode:       targetMode,
        created_by:        userId,
      })
      .select()
      .single();

    if (error) throw error;

    // Snapshot targets
    const targetIds: string[] =
      targetMode === "selected"
        ? (payload.targetStudentIds ?? [])
        : (payload.enrolledStudentIds ?? []);

    if (targetIds.length > 0) {
      const targetRows = targetIds.map(sid => ({
        organization_id: payload.orgId,
        assignment_id:   (data as any).id,
        student_id:      sid,
      }));
      const { error: tErr } = await supabase
        .from("assignment_student_targets")
        .insert(targetRows);
      if (tErr) {
        // Roll back the assignment to avoid orphaned record
        await supabase.from("assignments").delete().eq("id", (data as any).id);
        throw new Error("Failed to save assignment targets: " + tErr.message);
      }
    }

    revalidatePath("/dashboard/courses");
    return { success: true, data };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function updateAssignment(
  assignmentId: string,
  payload: Partial<Pick<import("./grading-constants").Assignment,
    "title" | "description" | "category" | "due_date" | "points_possible" | "is_graded">>,
  orgId: string
): Promise<ActionResult<import("./grading-constants").Assignment>> {
  try {
    const { supabase, userId } = await assertStaff(orgId);
    const { data, error } = await supabase
      .from("assignments")
      .update({ ...payload, updated_by: userId })
      .eq("id", assignmentId)
      .eq("organization_id", orgId)
      .select()
      .single();
    if (error) throw error;
    revalidatePath("/dashboard/gradebook");
    return { success: true, data };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function archiveAssignment(
  assignmentId: string,
  orgId: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, userId } = await assertStaff(orgId);
    const { error } = await supabase
      .from("assignments")
      .update({ status: "archived", updated_by: userId })
      .eq("id", assignmentId)
      .eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/dashboard/gradebook");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getAssignmentsForPeriod(
  courseSectionId: string,
  periodId: string,
  orgId: string
): Promise<ActionResult<import("./grading-constants").Assignment[]>> {
  try {
    const { supabase } = await assertStaff(orgId);
    const { data, error } = await supabase
      .from("assignments")
      .select("*")
      .eq("course_section_id", courseSectionId)
      .eq("grading_period_id", periodId)
      .eq("status", "active")
      .order("assigned_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { success: true, data: data ?? [] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Student grades ────────────────────────────────────────────────────────────

export async function upsertStudentGrade(
  payload: import("./grading-constants").UpsertGradePayload
): Promise<ActionResult<import("./grading-constants").StudentGrade>> {
  try {
    const { supabase, userId } = await assertStaff(payload.orgId);

    const record = {
      organization_id: payload.orgId,
      assignment_id:   payload.assignmentId,
      student_id:      payload.studentId,
      points_earned:   payload.gradeStatus === "graded" ? payload.pointsEarned : null,
      grade_status:    payload.gradeStatus,
      teacher_note:    payload.teacherNote ?? null,
      entered_by:      userId,
      updated_by:      userId,
    };

    const { data, error } = await supabase
      .from("student_assignment_grades")
      .upsert(record, { onConflict: "assignment_id,student_id" })
      .select()
      .single();

    if (error) throw error;
    revalidatePath("/dashboard/gradebook");
    return { success: true, data };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getStudentGradesForSection(
  studentId: string,
  courseSectionId: string,
  orgId: string
): Promise<ActionResult<import("./grading-constants").StudentGrade[]>> {
  try {
    const { supabase } = await assertStaff(orgId);
    const { data, error } = await supabase
      .from("student_assignment_grades")
      .select("*, assignments!inner(course_section_id)")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("assignments.course_section_id", courseSectionId);
    if (error) throw error;
    return { success: true, data: (data ?? []) as import("./grading-constants").StudentGrade[] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Grade calculation server actions ─────────────────────────────────────────

export async function getStudentQuarterGrade(
  studentId:       string,
  courseSectionId: string,
  periodId:        string,
  orgId:           string
): Promise<ActionResult<QuarterGradeResult>> {
  try {
    const { supabase } = await assertStaff(orgId);

    // Fetch assignments for this section + period
    const { data: assignments, error: aErr } = await supabase
      .from("assignments")
      .select("id, points_possible, is_graded, category")
      .eq("course_section_id", courseSectionId)
      .eq("grading_period_id", periodId)
      .eq("status", "active");
    if (aErr) throw aErr;

    // Fetch student grades for those assignments
    const assignmentIds = (assignments ?? []).map(a => a.id);
    const gradeMap = new Map<string, { points_earned: number | null; grade_status: string }>();

    if (assignmentIds.length > 0) {
      const { data: grades, error: gErr } = await supabase
        .from("student_assignment_grades")
        .select("assignment_id, points_earned, grade_status")
        .eq("student_id", studentId)
        .in("assignment_id", assignmentIds);
      if (gErr) throw gErr;
      for (const g of grades ?? []) gradeMap.set(g.assignment_id, g);
    }

    // Build GradeInput array — assignments without a grade row are treated as not_graded
    const inputs: GradeInput[] = (assignments ?? []).map(a => {
      const g = gradeMap.get(a.id);
      return {
        assignment_id:   a.id,
        points_possible: a.points_possible,
        points_earned:   g?.points_earned ?? null,
        grade_status:    (g?.grade_status ?? "not_graded") as import("@/lib/grading/types").GradeStatus,
        category:        a.category as import("@/lib/grading/types").AssignmentCategory,
        is_graded:       a.is_graded,
      };
    });

    const scale = await getOrgGradeScale(supabase, orgId);
    const result = calculatePointsGrade(inputs, scale);
    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getStudentSemesterGrade(
  studentId:        string,
  courseSectionId:  string,
  semesterPeriodId: string,
  orgId:            string
): Promise<ActionResult<import("@/lib/grading/types").SemesterGradeResult>> {
  try {
    const { supabase } = await assertStaff(orgId);
    const scale = await getOrgGradeScale(supabase, orgId);

    // Fetch the child quarters of this semester
    const { data: quarters, error: qErr } = await supabase
      .from("grading_periods")
      .select("id, name")
      .eq("parent_period_id", semesterPeriodId)
      .eq("is_assignment_period", true)
      .order("sequence");
    if (qErr) throw qErr;

    const quarterResults: QuarterGradeResult[] = [];
    const quarterNames: string[] = [];

    for (const q of quarters ?? []) {
      const result = await getStudentQuarterGrade(studentId, courseSectionId, q.id, orgId);
      if (!result.success) throw new Error(result.error);
      quarterResults.push(result.data);
      quarterNames.push(q.name);
    }

    const semester = calculateSemesterGrade(quarterResults, quarterNames, scale);
    return { success: true, data: semester };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getStudentYTDGrade(
  studentId:       string,
  courseSectionId: string,
  schoolYearId:    string,
  orgId:           string
): Promise<ActionResult<import("@/lib/grading/types").YTDGradeResult>> {
  try {
    const { supabase } = await assertStaff(orgId);
    const scale = await getOrgGradeScale(supabase, orgId);

    // Fetch all quarters for this school year (assignment-entry periods only)
    const { data: quarters, error: qErr } = await supabase
      .from("grading_periods")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("school_year_id", schoolYearId)
      .eq("is_assignment_period", true)
      .order("sequence");
    if (qErr) throw qErr;

    const quarterData: Array<{ result: QuarterGradeResult; name: string }> = [];

    for (const q of quarters ?? []) {
      const result = await getStudentQuarterGrade(studentId, courseSectionId, q.id, orgId);
      if (!result.success) throw new Error(result.error);
      quarterData.push({ result: result.data, name: q.name });
    }

    const ytd = calculateYTDGrade(quarterData, scale);
    return { success: true, data: ytd };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Batch gradebook fetch (Stage 3 preparation) ───────────────────────────────
// Returns all assignments + all student grades for one section + period in one call.
// Designed for efficient gradebook grid rendering.

export async function getGradebookData(
  courseSectionId: string,
  periodId:        string,
  orgId:           string
): Promise<ActionResult<import("./grading-constants").GradebookData>> {
  try {
    const { supabase } = await assertStaff(orgId);
    const scale = await getOrgGradeScale(supabase, orgId);

    // Fetch active assignments for this period
    const { data: assignments, error: aErr } = await supabase
      .from("assignments")
      .select("*")
      .eq("course_section_id", courseSectionId)
      .eq("grading_period_id", periodId)
      .eq("status", "active")
      .order("assigned_date")
      .order("created_at");
    if (aErr) throw aErr;

    const assignmentList = (assignments ?? []) as import("./grading-constants").Assignment[];
    const assignmentIds = assignmentList.map(a => a.id);

    // Fetch students enrolled in this section
    const { data: enrolledStudents, error: sErr } = await supabase
      .rpc("get_section_students", { p_course_section_id: courseSectionId });
    if (sErr) throw sErr;

    const studentList = (enrolledStudents ?? []) as Array<{ student_id: string; student_name: string }>;

    // Fetch ALL grades for this section + period in one query
    const { data: allGrades, error: gErr } = assignmentIds.length > 0
      ? await supabase
          .from("student_assignment_grades")
          .select("*")
          .in("assignment_id", assignmentIds)
      : { data: [], error: null };
    if (gErr) throw gErr;

    // Fetch assignment_student_targets for these assignments
    const { data: allTargets, error: tErr } = assignmentIds.length > 0
      ? await supabase
          .from("assignment_student_targets")
          .select("assignment_id, student_id")
          .in("assignment_id", assignmentIds)
      : { data: [], error: null };
    if (tErr) throw tErr;

    // Index targets: assignment_id → Set of student_ids
    const targetIndex = new Map<string, Set<string>>();
    for (const t of allTargets ?? []) {
      if (!targetIndex.has(t.assignment_id)) targetIndex.set(t.assignment_id, new Set());
      targetIndex.get(t.assignment_id)!.add(t.student_id);
    }

    // Index grades: student_id → assignment_id → grade row
    const gradeIndex = new Map<string, Map<string, import("./grading-constants").StudentGrade>>();
    for (const g of allGrades ?? []) {
      if (!gradeIndex.has(g.student_id)) gradeIndex.set(g.student_id, new Map());
      gradeIndex.get(g.student_id)!.set(g.assignment_id, g);
    }

    // Build student rows with calculated quarter grade
    const studentRows: import("./grading-constants").GradebookStudentRow[] = studentList.map(({ student_id, student_name }) => {
      const studentGradeMap = gradeIndex.get(student_id) ?? new Map();
      const grades: Record<string, import("./grading-constants").StudentGrade | null> = {};
      const assigned: Record<string, boolean> = {};

      // Only include assignments that target this student in grade calculation.
      // Legacy discrimination: if target_mode is NULL the assignment predates
      // targeting (migration 00074). In that case zero target rows → whole-course.
      // Post-migration assignments always have target_mode set; zero target rows
      // (e.g. created against empty roster) means nobody is targeted — not all.
      const inputs: GradeInput[] = assignmentList
        .filter(a => {
          const targets = targetIndex.get(a.id);
          const isLegacy = (a as any).target_mode == null;
          const noTargets = !targets || targets.size === 0;
          const isAssigned = noTargets ? isLegacy : targets!.has(student_id);
          assigned[a.id] = isAssigned;
          return isAssigned;
        })
        .map(a => {
          const g = studentGradeMap.get(a.id) ?? null;
          grades[a.id] = g;
          return {
            assignment_id:   a.id,
            points_possible: a.points_possible,
            points_earned:   g?.points_earned ?? null,
            grade_status:    (g?.grade_status ?? "not_graded") as import("@/lib/grading/types").GradeStatus,
            category:        a.category as import("@/lib/grading/types").AssignmentCategory,
            is_graded:       a.is_graded,
          };
        });

      // Mark non-assigned assignments explicitly
      for (const a of assignmentList) {
        if (!(a.id in assigned)) assigned[a.id] = false;
      }

      const quarterGrade = calculatePointsGrade(inputs, scale);
      return { studentId: student_id, studentName: student_name, grades, assigned, quarterGrade };
    });

    return {
      success: true,
      data: { courseSectionId, periodId, assignments: assignmentList, studentRows },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Stage 3B additions ────────────────────────────────────────────────────────

export interface GradingPeriodInfo {
  id: string;
  name: string;
  period_type: string;
  is_assignment_period: boolean;
  sequence: number;
  start_date: string;
  end_date: string;
}

export interface SectionGradingContext {
  periods: GradingPeriodInfo[];
  currentPeriodId: string | null;
  schoolYearLabel: string;
  gradeScaleLevels: GradeScaleLevel[];
  canEdit: boolean;
}

export async function getSectionGradingContext(
  courseSectionId: string,
  orgId: string,
  today?: string
): Promise<ActionResult<SectionGradingContext>> {
  try {
    const { supabase } = await assertStaff(orgId);
    const user = await getUser();
    if (!user) throw new Error("Unauthenticated");
    const profileId = await resolveProfileId(user.id);

    // Get section's school_year_id + teacher_id for canEdit check
    const { data: section, error: sErr } = await supabase
      .from("course_sections")
      .select("school_year_id, teacher_id")
      .eq("id", courseSectionId)
      .eq("organization_id", orgId)
      .single();
    if (sErr || !section) throw new Error("Section not found");

    // Get school year label
    const { data: sy } = await supabase
      .from("school_years")
      .select("label")
      .eq("id", (section as any).school_year_id)
      .single();

    // Get quarters for this school year
    const { data: periods, error: pErr } = await supabase
      .from("grading_periods")
      .select("id, name, period_type, is_assignment_period, sequence, start_date, end_date")
      .eq("organization_id", orgId)
      .eq("school_year_id", (section as any).school_year_id)
      .eq("is_assignment_period", true)
      .order("sequence");
    if (pErr) throw pErr;

    const todayStr = today ?? new Date().toISOString().split("T")[0];
    const current = (periods ?? []).find(
      p => todayStr >= p.start_date && todayStr <= p.end_date
    );

    // Grade scale
    const scale = await getOrgGradeScale(supabase, orgId);

    // canEdit: admin always; otherwise teacher must have teacher_id = profileId
    const { data: member } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", orgId)
      .eq("profile_id", profileId)
      .eq("status", "active")
      .single();
    const role = (member as any)?.role ?? "";
    const adminRoles = ["admin", "full_admin", "platform_admin"];
    const isAdmin = adminRoles.includes(role);
    const isTeacher = (section as any).teacher_id === profileId;
    const canEdit = isAdmin || isTeacher || ["teacher", "staff", "registrar"].includes(role);

    return {
      success: true,
      data: {
        periods: (periods ?? []) as GradingPeriodInfo[],
        currentPeriodId: current?.id ?? (periods?.[0]?.id ?? null),
        schoolYearLabel: (sy as any)?.label ?? "",
        gradeScaleLevels: scale,
        canEdit,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function bulkSetGradeStatus(
  assignmentId: string,
  studentIds: string[],
  status: string,
  orgId: string
): Promise<ActionResult<{ count: number }>> {
  try {
    const { supabase, userId } = await assertStaff(orgId);

    // Get assignment for org validation + points_possible
    const { data: assignment, error: aErr } = await supabase
      .from("assignments")
      .select("id, organization_id, points_possible")
      .eq("id", assignmentId)
      .eq("organization_id", orgId)
      .single();
    if (aErr || !assignment) return { success: false, error: "Assignment not found" };

    const records = studentIds.map(sid => ({
      organization_id: orgId,
      assignment_id:   assignmentId,
      student_id:      sid,
      points_earned:   null,
      grade_status:    status,
      entered_by:      userId,
      updated_by:      userId,
    }));

    const { error } = await supabase
      .from("student_assignment_grades")
      .upsert(records, { onConflict: "assignment_id,student_id" });

    if (error) throw error;
    revalidatePath("/dashboard/courses");
    return { success: true, data: { count: records.length } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function deleteStudentGrade(
  assignmentId: string,
  studentId: string,
  orgId: string
): Promise<ActionResult<void>> {
  try {
    const { supabase } = await assertStaff(orgId);
    const { error } = await supabase
      .from("student_assignment_grades")
      .delete()
      .eq("assignment_id", assignmentId)
      .eq("student_id", studentId)
      .eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/dashboard/courses");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Assignment targeting ──────────────────────────────────────────────────────

export async function getAssignmentTargets(
  assignmentId: string,
  orgId: string
): Promise<ActionResult<string[]>> {
  try {
    const { supabase } = await assertStaff(orgId);
    const { data, error } = await supabase
      .from("assignment_student_targets")
      .select("student_id")
      .eq("assignment_id", assignmentId)
      .eq("organization_id", orgId);
    if (error) throw error;
    return { success: true, data: (data ?? []).map(r => r.student_id) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Update which students an assignment targets.
// studentIds must be from the course roster.
// If a student being removed already has a grade, the caller is responsible for
// confirming with the user before calling this function (UI-level guard).
// This function removes both the target row AND the grade row for removed students.
export async function updateAssignmentTargets(payload: {
  assignmentId: string;
  orgId: string;
  targetMode: "all" | "selected";
  studentIds: string[];  // the complete desired target list
  removeGradesForRemovedStudents: boolean;
}): Promise<ActionResult<void>> {
  try {
    const { supabase } = await assertStaff(payload.orgId);

    // Get existing targets
    const { data: existing } = await supabase
      .from("assignment_student_targets")
      .select("student_id")
      .eq("assignment_id", payload.assignmentId)
      .eq("organization_id", payload.orgId);

    const existingSet = new Set((existing ?? []).map(r => r.student_id));
    const desiredSet  = new Set(payload.studentIds);

    const toAdd    = payload.studentIds.filter(id => !existingSet.has(id));
    const toRemove = [...existingSet].filter(id => !desiredSet.has(id));

    // Add new targets
    if (toAdd.length > 0) {
      const rows = toAdd.map(sid => ({
        organization_id: payload.orgId,
        assignment_id:   payload.assignmentId,
        student_id:      sid,
      }));
      const { error } = await supabase
        .from("assignment_student_targets")
        .insert(rows);
      if (error) throw error;
    }

    // Remove dropped targets (and optionally their grades)
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("assignment_student_targets")
        .delete()
        .eq("assignment_id", payload.assignmentId)
        .eq("organization_id", payload.orgId)
        .in("student_id", toRemove);
      if (error) throw error;

      if (payload.removeGradesForRemovedStudents) {
        await supabase
          .from("student_assignment_grades")
          .delete()
          .eq("assignment_id", payload.assignmentId)
          .eq("organization_id", payload.orgId)
          .in("student_id", toRemove);
      }
    }

    // Update target_mode on the assignment
    await supabase
      .from("assignments")
      .update({ target_mode: payload.targetMode })
      .eq("id", payload.assignmentId)
      .eq("organization_id", payload.orgId);

    revalidatePath("/dashboard/courses");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Check which students in a list already have grades for a given assignment
export async function getStudentsWithGrades(
  assignmentId: string,
  studentIds: string[],
  orgId: string
): Promise<ActionResult<string[]>> {
  try {
    const { supabase } = await assertStaff(orgId);
    if (studentIds.length === 0) return { success: true, data: [] };
    const { data, error } = await supabase
      .from("student_assignment_grades")
      .select("student_id")
      .eq("assignment_id", assignmentId)
      .eq("organization_id", orgId)
      .in("student_id", studentIds)
      .eq("grade_status", "graded");
    if (error) throw error;
    return { success: true, data: (data ?? []).map(r => r.student_id) };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
