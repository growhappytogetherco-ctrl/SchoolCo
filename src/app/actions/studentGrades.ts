"use server";

// Shared data layer for student academic grade views.
// Used by: staff student profile Grades tab, parent portal Grades page.
// Authorization: staff-or-above may view any student in org.
//               Parent may view only their guardian-linked children.
// Teacher notes (teacher_note field) are NEVER returned to callers — parent-safe by design.

import { createClient, getUser, getActiveOrgId, resolveProfileId } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
import {
  calculatePointsGrade,
  calculateWeightedGrade,
  calculateSemesterGrade,
} from "@/lib/grading/calculator";
import { isWeightedConfigured } from "@/lib/grading/weightedConfig";
import type {
  GradeInput,
  GradeScaleLevel,
  QuarterGradeResult,
  WeightedGradeResult,
  SemesterGradeResult,
  CategoryWeights,
  AssignmentCategory,
  GradeStatus,
} from "@/lib/grading/types";

// ── Public types ─────────────────────────────────────────────────────────────

export interface GradePeriodInfo {
  id: string;
  name: string;
  period_type: string;
  sequence: number;
  start_date: string;
  end_date: string;
  parent_period_id: string | null;
}

export interface CourseGradeSummary {
  courseSectionId: string;
  courseName: string;
  subject: string;
  teacherName: string | null;
  gradingMethod: "points" | "weighted";
  categoryWeights: CategoryWeights | null;
  currentPeriodGrade: QuarterGradeResult | WeightedGradeResult;
  countMissing: number;
}

export interface StudentGradeProfile {
  studentId: string;
  studentName: string;
  schoolYearId: string;
  schoolYearLabel: string;
  periods: GradePeriodInfo[];   // quarters only (is_assignment_period=true)
  allPeriods: GradePeriodInfo[]; // all periods including semesters
  currentPeriodId: string | null;
  courses: CourseGradeSummary[];
  gradeScaleLevels: GradeScaleLevel[];
  totalMissing: number;
}

export interface AssignmentGradeRow {
  assignmentId: string;
  title: string;
  category: AssignmentCategory;
  dueDate: string | null;
  assignedDate: string;
  pointsPossible: number;
  pointsEarned: number | null;
  gradeStatus: GradeStatus | "blank";
  isGraded: boolean;
}

export interface CourseGradeDetail {
  courseSectionId: string;
  courseName: string;
  subject: string;
  teacherName: string | null;
  gradingMethod: "points" | "weighted";
  categoryWeights: CategoryWeights | null;
  quarterGrade: QuarterGradeResult | WeightedGradeResult;
  assignments: AssignmentGradeRow[];
  semesterGrade: SemesterGradeResult | null;
  semesterName: string | null;
  gradeScaleLevels: GradeScaleLevel[];
}

// ── Auth helper ──────────────────────────────────────────────────────────────
// Returns the supabase client and the caller's relationship to the student.
// Throws if the caller has no authorization.

async function assertCanViewStudent(studentId: string, orgId: string) {
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
  const staffRoles = ["teacher", "staff", "registrar", "admin", "full_admin", "platform_admin"];
  const isStaff = staffRoles.includes(role);

  if (isStaff) return { supabase, isParent: false, role };

  // Parent: verify guardianship
  const { data: guardianship } = await supabase
    .from("guardianships")
    .select("id")
    .eq("profile_id", profileId)
    .eq("student_id", studentId)
    .eq("status", "active")
    .single();

  if (!guardianship) throw new Error("Unauthorized");
  return { supabase, isParent: true, role: "parent" };
}

// ── Grade scale ──────────────────────────────────────────────────────────────

async function getOrgGradeScale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<GradeScaleLevel[]> {
  const { data } = await supabase
    .from("grade_scales")
    .select("levels")
    .eq("organization_id", orgId)
    .eq("is_default", true)
    .single();
  return (data?.levels as GradeScaleLevel[]) ?? [];
}

// ── Build GradeInput array from assignments + grade map ───────────────────────

function buildGradeInputs(
  assignments: Array<{
    id: string;
    points_possible: number;
    is_graded: boolean;
    category: string;
  }>,
  gradeMap: Map<string, { points_earned: number | null; grade_status: string }>
): GradeInput[] {
  return assignments.map((a) => {
    const g = gradeMap.get(a.id);
    return {
      assignment_id: a.id,
      points_possible: a.points_possible,
      points_earned: g?.points_earned ?? null,
      grade_status: ((g?.grade_status ?? "not_graded") as GradeStatus),
      category: a.category as AssignmentCategory,
      is_graded: a.is_graded,
    };
  });
}

// A sentinel QuarterGradeResult for weighted courses awaiting configuration.
// state='setup_required' signals callers to display a non-grade UI.
function setupRequiredResult(): QuarterGradeResult {
  return {
    state: "setup_required",
    earned: 0, possible: 0,
    percentage: null, display_percentage: null, letter_grade: null,
    count_graded: 0, count_missing: 0, count_excused: 0,
    count_absent: 0, count_incomplete: 0, count_not_graded: 0,
  };
}

// ── Compute quarter grade respecting grading method ───────────────────────────

function computeQuarterGrade(
  inputs: GradeInput[],
  gradingMethod: string,
  categoryWeights: CategoryWeights | null,
  scale: GradeScaleLevel[]
): QuarterGradeResult | WeightedGradeResult {
  if (gradingMethod === "weighted") {
    if (!isWeightedConfigured(gradingMethod, categoryWeights)) {
      return setupRequiredResult();
    }
    return calculateWeightedGrade(inputs, categoryWeights, scale);
  }
  return calculatePointsGrade(inputs, scale);
}

// ── Main: student academic grade profile ─────────────────────────────────────
// Loads all enrolled courses + current quarter grades for one student.
// periodId: if null, defaults to the active period based on today's date.

export async function getStudentGradeProfile(
  studentId: string,
  periodId?: string | null,
  today?: string
): Promise<ActionResult<StudentGradeProfile>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };

    const { supabase } = await assertCanViewStudent(studentId, orgId);
    const scale = await getOrgGradeScale(supabase, orgId);

    // Student info
    const { data: student } = await supabase
      .from("students")
      .select("first_name, last_name, preferred_name")
      .eq("id", studentId)
      .single();
    if (!student) return { success: false, error: "Student not found" };

    // school_year_id was removed from students in migration 00061; derive from active school year
    const { data: currentYear } = await supabase
      .from("school_years")
      .select("id, label")
      .eq("organization_id", orgId)
      .eq("is_current", true)
      .maybeSingle();

    const schoolYearId = (currentYear as any)?.id as string | null ?? null;
    const schoolYearLabel = (currentYear as any)?.label as string ?? "";

    // Load all grading periods for this school year
    const { data: allPeriodsData } = schoolYearId
      ? await supabase
          .from("grading_periods")
          .select("id, name, period_type, sequence, start_date, end_date, parent_period_id, is_assignment_period")
          .eq("organization_id", orgId)
          .eq("school_year_id", schoolYearId)
          .order("sequence")
      : { data: [] };

    const allPeriods: GradePeriodInfo[] = ((allPeriodsData ?? []) as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      period_type: p.period_type,
      sequence: p.sequence,
      start_date: p.start_date,
      end_date: p.end_date,
      parent_period_id: p.parent_period_id,
    }));

    // Quarters only (is_assignment_period = true)
    const quarters = ((allPeriodsData ?? []) as any[]).filter((p) => p.is_assignment_period);

    const todayStr = today ?? new Date().toISOString().split("T")[0];
    let activePeriodId = periodId ?? null;
    if (!activePeriodId) {
      const currentQ = quarters.find(
        (p) => todayStr >= p.start_date && todayStr <= p.end_date
      );
      activePeriodId = currentQ?.id ?? quarters[0]?.id ?? null;
    }

    // Enrolled course sections for this student
    const { data: enrollments } = await supabase
      .from("curriculum_enrollments")
      .select("id, course_section_id, course_sections!inner(id, course_name, subject, teacher_name, grading_method, category_weights)")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .not("course_section_id", "is", null);

    const courses: CourseGradeSummary[] = [];

    for (const enr of (enrollments ?? []) as any[]) {
      const sec = enr.course_sections;
      if (!sec || !activePeriodId) continue;

      const courseSectionId: string = sec.id;
      const gradingMethod = (sec.grading_method ?? "points") as "points" | "weighted";
      const categoryWeights = sec.category_weights as CategoryWeights | null;

      // Load assignments for this section + period
      const { data: assignments } = await supabase
        .from("assignments")
        .select("id, points_possible, is_graded, category")
        .eq("course_section_id", courseSectionId)
        .eq("grading_period_id", activePeriodId)
        .eq("status", "active");

      const assignmentList = (assignments ?? []) as Array<{
        id: string; points_possible: number; is_graded: boolean; category: string;
      }>;
      const assignmentIds = assignmentList.map((a) => a.id);

      // Load grades for this student
      const gradeMap = new Map<string, { points_earned: number | null; grade_status: string }>();
      if (assignmentIds.length > 0) {
        const { data: grades } = await supabase
          .from("student_assignment_grades")
          .select("assignment_id, points_earned, grade_status")
          .eq("student_id", studentId)
          .in("assignment_id", assignmentIds);
        for (const g of grades ?? []) gradeMap.set((g as any).assignment_id, g as any);
      }

      const inputs = buildGradeInputs(assignmentList, gradeMap);
      const quarterGrade = computeQuarterGrade(inputs, gradingMethod, categoryWeights, scale);

      courses.push({
        courseSectionId,
        courseName: sec.course_name,
        subject: sec.subject,
        teacherName: sec.teacher_name,
        gradingMethod,
        categoryWeights,
        currentPeriodGrade: quarterGrade,
        countMissing: quarterGrade.count_missing,
      });
    }

    // Sort alphabetically by course name
    courses.sort((a, b) => a.courseName.localeCompare(b.courseName));

    const totalMissing = courses.reduce((sum, c) => sum + c.countMissing, 0);

    const studentName =
      `${(student as any).preferred_name ?? (student as any).first_name} ${(student as any).last_name}`;

    return {
      success: true,
      data: {
        studentId,
        studentName,
        schoolYearId: schoolYearId ?? "",
        schoolYearLabel,
        periods: quarters.map((p) => ({
          id: p.id,
          name: p.name,
          period_type: p.period_type,
          sequence: p.sequence,
          start_date: p.start_date,
          end_date: p.end_date,
          parent_period_id: p.parent_period_id,
        })),
        allPeriods,
        currentPeriodId: activePeriodId,
        courses,
        gradeScaleLevels: scale,
        totalMissing,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Course grade detail: one course + period ──────────────────────────────────
// Returns assignment list + grades + semester calculation if applicable.

export async function getStudentCourseGradeDetail(
  studentId: string,
  courseSectionId: string,
  periodId: string
): Promise<ActionResult<CourseGradeDetail>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };

    const { supabase } = await assertCanViewStudent(studentId, orgId);
    const scale = await getOrgGradeScale(supabase, orgId);

    // Section info
    const { data: section } = await supabase
      .from("course_sections")
      .select("course_name, subject, teacher_name, grading_method, category_weights")
      .eq("id", courseSectionId)
      .single();
    if (!section) return { success: false, error: "Course not found" };

    const gradingMethod = ((section as any).grading_method ?? "points") as "points" | "weighted";
    const categoryWeights = (section as any).category_weights as CategoryWeights | null;

    // Assignments for this period
    const { data: assignments } = await supabase
      .from("assignments")
      .select("id, title, category, due_date, assigned_date, points_possible, is_graded")
      .eq("course_section_id", courseSectionId)
      .eq("grading_period_id", periodId)
      .eq("status", "active")
      .order("assigned_date", { ascending: true })
      .order("created_at", { ascending: true });

    const assignmentList = (assignments ?? []) as Array<{
      id: string; title: string; category: string;
      due_date: string | null; assigned_date: string;
      points_possible: number; is_graded: boolean;
    }>;
    const assignmentIds = assignmentList.map((a) => a.id);

    // Grades — teacher_note intentionally excluded
    const gradeMap = new Map<string, { points_earned: number | null; grade_status: string }>();
    if (assignmentIds.length > 0) {
      const { data: grades } = await supabase
        .from("student_assignment_grades")
        .select("assignment_id, points_earned, grade_status")
        .eq("student_id", studentId)
        .in("assignment_id", assignmentIds);
      for (const g of grades ?? []) gradeMap.set((g as any).assignment_id, g as any);
    }

    const inputs = buildGradeInputs(
      assignmentList.map((a) => ({
        id: a.id, points_possible: a.points_possible,
        is_graded: a.is_graded, category: a.category,
      })),
      gradeMap
    );
    const quarterGrade = computeQuarterGrade(inputs, gradingMethod, categoryWeights, scale);

    // Build assignment rows (teacher_note never included)
    const assignmentRows: AssignmentGradeRow[] = assignmentList.map((a) => {
      const g = gradeMap.get(a.id);
      return {
        assignmentId: a.id,
        title: a.title,
        category: a.category as AssignmentCategory,
        dueDate: a.due_date,
        assignedDate: a.assigned_date,
        pointsPossible: a.points_possible,
        pointsEarned: g?.points_earned ?? null,
        gradeStatus: ((g?.grade_status ?? "blank") as GradeStatus | "blank"),
        isGraded: a.is_graded,
      };
    });

    // Semester grade: find the semester this quarter belongs to
    const { data: thisPeriod } = await supabase
      .from("grading_periods")
      .select("parent_period_id, school_year_id, organization_id")
      .eq("id", periodId)
      .single();

    let semesterGrade: SemesterGradeResult | null = null;
    let semesterName: string | null = null;

    if ((thisPeriod as any)?.parent_period_id) {
      const semesterId = (thisPeriod as any).parent_period_id as string;
      const { data: semPeriod } = await supabase
        .from("grading_periods")
        .select("name")
        .eq("id", semesterId)
        .single();
      semesterName = (semPeriod as any)?.name ?? null;

      // Get all quarters in this semester
      const { data: siblingQuarters } = await supabase
        .from("grading_periods")
        .select("id, name")
        .eq("parent_period_id", semesterId)
        .eq("is_assignment_period", true)
        .order("sequence");

      const quarterResults: QuarterGradeResult[] = [];
      const quarterNames: string[] = [];

      for (const q of siblingQuarters ?? []) {
        if (q.id === periodId) {
          // Use already-computed result
          quarterResults.push(quarterGrade as QuarterGradeResult);
        } else {
          // Fetch this sibling quarter's data
          const { data: sibAssignments } = await supabase
            .from("assignments")
            .select("id, points_possible, is_graded, category")
            .eq("course_section_id", courseSectionId)
            .eq("grading_period_id", q.id)
            .eq("status", "active");

          const sibIds = (sibAssignments ?? []).map((a: any) => a.id);
          const sibGradeMap = new Map<string, { points_earned: number | null; grade_status: string }>();
          if (sibIds.length > 0) {
            const { data: sibGrades } = await supabase
              .from("student_assignment_grades")
              .select("assignment_id, points_earned, grade_status")
              .eq("student_id", studentId)
              .in("assignment_id", sibIds);
            for (const g of sibGrades ?? []) sibGradeMap.set((g as any).assignment_id, g as any);
          }

          const sibInputs = buildGradeInputs(
            (sibAssignments ?? []).map((a: any) => ({
              id: a.id, points_possible: a.points_possible,
              is_graded: a.is_graded, category: a.category,
            })),
            sibGradeMap
          );
          quarterResults.push(calculatePointsGrade(sibInputs, scale));
        }
        quarterNames.push((q as any).name);
      }

      if (quarterResults.length > 0) {
        semesterGrade = calculateSemesterGrade(quarterResults, quarterNames, scale);
      }
    }

    return {
      success: true,
      data: {
        courseSectionId,
        courseName: (section as any).course_name,
        subject: (section as any).subject,
        teacherName: (section as any).teacher_name,
        gradingMethod,
        categoryWeights,
        quarterGrade,
        assignments: assignmentRows,
        semesterGrade,
        semesterName,
        gradeScaleLevels: scale,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Grading settings update ───────────────────────────────────────────────────
// Staff-or-above only. Updates grading_method + category_weights on course_sections.

export async function updateCourseGradingSettings(
  courseSectionId: string,
  method: "points" | "weighted",
  categoryWeights: CategoryWeights | null
): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };

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

    const staffRoles = ["teacher", "staff", "registrar", "admin", "full_admin", "platform_admin"];
    if (!member || !staffRoles.includes((member as any).role)) {
      return { success: false, error: "Insufficient permissions" };
    }

    if (method === "weighted") {
      if (!isWeightedConfigured(method, categoryWeights)) {
        return { success: false, error: "Category weights must total 100% with at least one category." };
      }
    }

    const { error } = await supabase
      .from("course_sections")
      .update({
        grading_method: method,
        category_weights: method === "weighted" ? categoryWeights : null,
      })
      .eq("id", courseSectionId)
      .eq("organization_id", orgId);

    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
