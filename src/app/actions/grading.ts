"use server";

import { createClient, getUser } from "@/lib/supabase/server";
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
export { ASSIGNMENT_CATEGORY_LABELS, GRADE_STATUS_LABELS } from "./grading-constants";

// ── Auth guard ────────────────────────────────────────────────────────────────

async function assertStaff(orgId: string) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .single();

  const staffRoles = ["teacher","staff","registrar","admin","full_admin","platform_admin"];
  if (!member || !staffRoles.includes(member.role)) {
    throw new Error("Insufficient permissions");
  }
  return { supabase, userId: user.id };
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
        created_by:        userId,
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

      const inputs: GradeInput[] = assignmentList.map(a => {
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

      const quarterGrade = calculatePointsGrade(inputs, scale);
      return { studentId: student_id, studentName: student_name, grades, quarterGrade };
    });

    return {
      success: true,
      data: { courseSectionId, periodId, assignments: assignmentList, studentRows },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
