"use server";

// Stage 5: Progress Reports + Report Cards
// Shared data layer for report generation, preview, and retrieval.
// Staff: full access. Parents: issued reports for their guardian-linked students only.
// teacher_note and all private staff notes are NEVER included in any report.

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
  CategoryWeights,
  AssignmentCategory,
  GradeStatus,
  QuarterGradeResult,
} from "@/lib/grading/types";

// ── Public types ──────────────────────────────────────────────────────────────

export type ReportType   = "progress" | "quarter" | "semester";
export type ReportStatus = "draft" | "issued" | "superseded";

export interface AttendanceSummary {
  present:        number;
  absent:         number;
  tardy:          number;
  excused:        number;
  earlyDismissal: number;
}

export interface QuarterGradeSnapshot {
  periodName:        string;
  gradeState:        string;
  percentage:        number | null;
  displayPercentage: string | null;
  letterGrade:       string | null;
}

export interface ReportCourseData {
  courseSectionId:  string;
  courseName:       string;
  subject:          string;
  teacherName:      string | null;
  gradingMethod:    "points" | "weighted";
  gradeState:       string;
  percentage:       number | null;
  displayPercentage: string | null;
  letterGrade:      string | null;
  missingCount:     number;
  teacherComment:   string | null;
  quarterGrades?:   QuarterGradeSnapshot[]; // semester reports only
}

export interface ReportPreviewData {
  reportId:          string | null;
  status:            ReportStatus | null;
  orgName:           string;
  orgShortName:      string | null;
  orgType:           string;
  studentId:         string;
  studentName:       string;
  gradeLevel:        string | null;
  schoolYearLabel:   string;
  periodName:        string;
  reportType:        ReportType;
  reportTypeLabel:   string;
  generatedDate:     string;
  courses:           ReportCourseData[];
  attendance:        AttendanceSummary | null;
  generalComment:    string | null;
  issuedAt:          string | null;
}

export interface ReportListItem {
  id:              string;
  reportType:      ReportType;
  reportTypeLabel: string;
  periodName:      string;
  schoolYearLabel: string;
  status:          ReportStatus;
  issuedAt:        string | null;
  createdAt:       string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const STAFF_ROLES = ["teacher", "staff", "registrar", "admin", "full_admin", "platform_admin"];
const ADMIN_ROLES = ["admin", "full_admin", "platform_admin", "registrar"];

async function assertStaff(orgId: string) {
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
  if (!STAFF_ROLES.includes(role)) throw new Error("Insufficient permissions");
  return { supabase, profileId, role };
}

async function assertCanViewReport(reportId: string, orgId: string) {
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
  if (STAFF_ROLES.includes(role)) return { supabase, isParent: false, profileId };

  // Parent: verify the report is issued AND belongs to a guardian-linked student
  const { data: report } = await supabase
    .from("student_reports")
    .select("status, student_id")
    .eq("id", reportId)
    .eq("organization_id", orgId)
    .single();
  if (!report || (report as any).status !== "issued") throw new Error("Unauthorized");

  const studentId = (report as any).student_id as string;
  const { data: guardianship } = await supabase
    .from("guardianships")
    .select("id")
    .eq("profile_id", profileId)
    .eq("student_id", studentId)
    .eq("status", "active")
    .single();
  if (!guardianship) throw new Error("Unauthorized");
  return { supabase, isParent: true, profileId };
}

async function getOrgDetails(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  const { data: org } = await supabase
    .from("organizations")
    .select("name, short_name, organization_type")
    .eq("id", orgId)
    .single();
  return {
    orgName:      (org as any)?.name ?? "School",
    orgShortName: (org as any)?.short_name ?? null,
    orgType:      (org as any)?.organization_type ?? "academy",
  };
}

async function getGradeScale(
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

function reportTypeLabel(type: ReportType, periodName: string): string {
  if (type === "progress") return `${periodName} Progress Report`;
  if (type === "quarter")  return `${periodName} Report Card — Current Record`;
  return `${periodName} Report Card — Current Record`;
}

function buildGradeInputs(
  assignments: Array<{ id: string; points_possible: number; is_graded: boolean; category: string }>,
  gradeMap: Map<string, { points_earned: number | null; grade_status: string }>
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

async function computeCoursesForPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  orgId: string,
  periodId: string,
  scale: GradeScaleLevel[],
  existingComments: Map<string, string> = new Map()
): Promise<ReportCourseData[]> {
  const { data: enrollments } = await supabase
    .from("curriculum_enrollments")
    .select("id, course_section_id, course_sections!inner(id, course_name, subject, teacher_name, grading_method, category_weights)")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .not("course_section_id", "is", null);

  const courses: ReportCourseData[] = [];
  for (const enr of (enrollments ?? []) as any[]) {
    const sec = enr.course_sections;
    if (!sec) continue;
    const sectionId = sec.id as string;
    const gradingMethod = (sec.grading_method ?? "points") as "points" | "weighted";
    const categoryWeights = sec.category_weights as CategoryWeights | null;

    const { data: assignments } = await supabase
      .from("assignments")
      .select("id, points_possible, is_graded, category")
      .eq("course_section_id", sectionId)
      .eq("grading_period_id", periodId)
      .eq("status", "active");

    const aList = (assignments ?? []) as Array<{ id: string; points_possible: number; is_graded: boolean; category: string }>;
    const gradeMap = new Map<string, { points_earned: number | null; grade_status: string }>();
    if (aList.length > 0) {
      const { data: grades } = await supabase
        .from("student_assignment_grades")
        .select("assignment_id, points_earned, grade_status")
        .eq("student_id", studentId)
        .in("assignment_id", aList.map((a) => a.id));
      for (const g of grades ?? []) gradeMap.set((g as any).assignment_id, g as any);
    }

    const inputs = buildGradeInputs(aList, gradeMap);
    let gradeResult: QuarterGradeResult;
    if (gradingMethod === "weighted" && isWeightedConfigured(gradingMethod, categoryWeights)) {
      gradeResult = calculateWeightedGrade(inputs, categoryWeights!, scale) as QuarterGradeResult;
    } else if (gradingMethod === "weighted") {
      gradeResult = { state: "setup_required", earned: 0, possible: 0, percentage: null, display_percentage: null, letter_grade: null, count_graded: 0, count_missing: 0, count_excused: 0, count_absent: 0, count_incomplete: 0, count_not_graded: 0 };
    } else {
      gradeResult = calculatePointsGrade(inputs, scale);
    }

    courses.push({
      courseSectionId:  sectionId,
      courseName:       sec.course_name,
      subject:          sec.subject,
      teacherName:      sec.teacher_name,
      gradingMethod,
      gradeState:       gradeResult.state,
      percentage:       gradeResult.percentage,
      displayPercentage: gradeResult.display_percentage,
      letterGrade:      gradeResult.letter_grade,
      missingCount:     gradeResult.count_missing,
      teacherComment:   existingComments.get(sectionId) ?? null,
    });
  }
  courses.sort((a, b) => a.courseName.localeCompare(b.courseName));
  return courses;
}

async function computeCoursesForSemester(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  orgId: string,
  semesterId: string,
  scale: GradeScaleLevel[],
  existingComments: Map<string, string> = new Map()
): Promise<ReportCourseData[]> {
  // Get child quarters of this semester
  const { data: quarters } = await supabase
    .from("grading_periods")
    .select("id, name")
    .eq("parent_period_id", semesterId)
    .eq("is_assignment_period", true)
    .order("sequence");
  const quarterList = (quarters ?? []) as Array<{ id: string; name: string }>;

  const { data: enrollments } = await supabase
    .from("curriculum_enrollments")
    .select("id, course_section_id, course_sections!inner(id, course_name, subject, teacher_name, grading_method, category_weights)")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .not("course_section_id", "is", null);

  const courses: ReportCourseData[] = [];
  for (const enr of (enrollments ?? []) as any[]) {
    const sec = enr.course_sections;
    if (!sec) continue;
    const sectionId = sec.id as string;
    const gradingMethod = (sec.grading_method ?? "points") as "points" | "weighted";
    const categoryWeights = sec.category_weights as CategoryWeights | null;

    const quarterGrades: QuarterGradeSnapshot[] = [];
    const rawQuarterResults: QuarterGradeResult[] = [];

    for (const q of quarterList) {
      const { data: assignments } = await supabase
        .from("assignments")
        .select("id, points_possible, is_graded, category")
        .eq("course_section_id", sectionId)
        .eq("grading_period_id", q.id)
        .eq("status", "active");
      const aList = (assignments ?? []) as Array<{ id: string; points_possible: number; is_graded: boolean; category: string }>;
      const gradeMap = new Map<string, { points_earned: number | null; grade_status: string }>();
      if (aList.length > 0) {
        const { data: grades } = await supabase
          .from("student_assignment_grades")
          .select("assignment_id, points_earned, grade_status")
          .eq("student_id", studentId)
          .in("assignment_id", aList.map((a) => a.id));
        for (const g of grades ?? []) gradeMap.set((g as any).assignment_id, g as any);
      }
      const inputs = buildGradeInputs(aList, gradeMap);
      const qResult = calculatePointsGrade(inputs, scale);
      rawQuarterResults.push(qResult);
      quarterGrades.push({
        periodName:       q.name,
        gradeState:       qResult.state,
        percentage:       qResult.percentage,
        displayPercentage: qResult.display_percentage,
        letterGrade:      qResult.letter_grade,
      });
    }

    // Semester total: raw point aggregation, never averaging percentages
    const semResult = calculateSemesterGrade(rawQuarterResults, quarterList.map((q) => q.name), scale);

    // For weighted: check if configured
    let gradeState = semResult.state;
    if (gradingMethod === "weighted" && !isWeightedConfigured(gradingMethod, categoryWeights)) {
      gradeState = "setup_required";
    }

    courses.push({
      courseSectionId:  sectionId,
      courseName:       sec.course_name,
      subject:          sec.subject,
      teacherName:      sec.teacher_name,
      gradingMethod,
      gradeState,
      percentage:       gradeState === "setup_required" ? null : semResult.percentage,
      displayPercentage: gradeState === "setup_required" ? null : semResult.display_percentage,
      letterGrade:      gradeState === "setup_required" ? null : semResult.letter_grade,
      missingCount:     quarterGrades.reduce((s) => s, 0),
      teacherComment:   existingComments.get(sectionId) ?? null,
      quarterGrades,
    });
  }
  courses.sort((a, b) => a.courseName.localeCompare(b.courseName));
  return courses;
}

async function getAttendanceSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studentId: string,
  startDate: string,
  endDate: string
): Promise<AttendanceSummary> {
  const { data } = await supabase
    .from("attendance_records")
    .select("status, is_late, is_early_pickup")
    .eq("student_id", studentId)
    .gte("date", startDate)
    .lte("date", endDate);

  const records = (data ?? []) as Array<{ status: string; is_late: boolean; is_early_pickup: boolean }>;
  let present = 0, absent = 0, tardy = 0, excused = 0, earlyDismissal = 0;
  for (const r of records) {
    if (r.status === "absent") absent++;
    else if (r.status === "excused") excused++;
    else if (r.status === "tardy" || r.is_late) tardy++;
    else if (r.status === "early_dismissal" || r.is_early_pickup) earlyDismissal++;
    else present++;
  }
  return { present, absent, tardy, excused, earlyDismissal };
}

// ── Main exports ──────────────────────────────────────────────────────────────

// Live preview — no DB write. Used before saving/issuing a report.
export async function previewStudentReport(
  studentId: string,
  periodId: string,
  reportType: ReportType,
): Promise<ActionResult<ReportPreviewData>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);
    const scale = await getGradeScale(supabase, orgId);
    const orgDetails = await getOrgDetails(supabase, orgId);

    const { data: student } = await supabase
      .from("students")
      .select("first_name, last_name, preferred_name, grade_level, school_year_id")
      .eq("id", studentId)
      .single();
    if (!student) return { success: false, error: "Student not found" };
    const s = student as any;
    const studentName = `${s.preferred_name ?? s.first_name} ${s.last_name}`;

    const { data: period } = await supabase
      .from("grading_periods")
      .select("name, period_type, start_date, end_date, parent_period_id, school_year_id, is_assignment_period")
      .eq("id", periodId)
      .single();
    if (!period) return { success: false, error: "Period not found" };
    const p = period as any;

    let schoolYearLabel = "";
    if (s.school_year_id) {
      const { data: sy } = await supabase.from("school_years").select("label").eq("id", s.school_year_id).single();
      schoolYearLabel = (sy as any)?.label ?? "";
    }

    const isSemester = reportType === "semester";
    const courses = isSemester
      ? await computeCoursesForSemester(supabase, studentId, orgId, periodId, scale)
      : await computeCoursesForPeriod(supabase, studentId, orgId, periodId, scale);

    const attendance = await getAttendanceSummary(supabase, studentId, p.start_date, p.end_date);

    return {
      success: true,
      data: {
        reportId:       null,
        status:         null,
        ...orgDetails,
        studentId,
        studentName,
        gradeLevel:     s.grade_level,
        schoolYearLabel,
        periodName:     p.name,
        reportType,
        reportTypeLabel: reportTypeLabel(reportType, p.name),
        generatedDate:  new Date().toISOString().split("T")[0],
        courses,
        attendance,
        generalComment: null,
        issuedAt:       null,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Save or update a draft report. Upserts based on (student, period, reportType).
// Returns the draft reportId.
export async function saveReportDraft(
  studentId: string,
  periodId: string,
  reportType: ReportType,
  generalComment: string | null,
  courseComments: Record<string, string> // { [courseSectionId]: comment }
): Promise<ActionResult<{ reportId: string }>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase, profileId } = await assertStaff(orgId);
    const scale = await getGradeScale(supabase, orgId);

    const { data: student } = await supabase
      .from("students")
      .select("school_year_id")
      .eq("id", studentId)
      .single();
    const schoolYearId = (student as any)?.school_year_id as string | null;
    if (!schoolYearId) return { success: false, error: "Student has no school year" };

    const commentMap = new Map(Object.entries(courseComments));
    const isSemester = reportType === "semester";
    const courses = isSemester
      ? await computeCoursesForSemester(supabase, studentId, orgId, periodId, scale, commentMap)
      : await computeCoursesForPeriod(supabase, studentId, orgId, periodId, scale, commentMap);

    // Find existing draft for same (student, period, reportType)
    const { data: existing } = await supabase
      .from("student_reports")
      .select("id")
      .eq("organization_id", orgId)
      .eq("student_id", studentId)
      .eq("grading_period_id", periodId)
      .eq("report_type", reportType)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let reportId: string;
    if (existing) {
      reportId = (existing as any).id;
      await supabase.from("student_reports").update({ general_comment: generalComment }).eq("id", reportId);
    } else {
      const { data: newReport, error: insertErr } = await supabase
        .from("student_reports")
        .insert({
          organization_id:     orgId,
          student_id:          studentId,
          school_year_id:      schoolYearId,
          grading_period_id:   periodId,
          report_type:         reportType,
          status:              "draft",
          general_comment:     generalComment,
          created_by_profile_id: profileId,
        })
        .select("id")
        .single();
      if (insertErr || !newReport) return { success: false, error: insertErr?.message ?? "Failed to create draft" };
      reportId = (newReport as any).id;
    }

    // Rebuild course rows (delete and re-insert for simplicity)
    await supabase.from("student_report_courses").delete().eq("report_id", reportId);
    const courseRows = courses.map((c, idx) => ({
      report_id:              reportId,
      course_section_id:      c.courseSectionId,
      course_name_snapshot:   c.courseName,
      subject_snapshot:       c.subject,
      teacher_name_snapshot:  c.teacherName,
      grading_method_snapshot: c.gradingMethod,
      percentage_snapshot:    c.percentage,
      letter_grade_snapshot:  c.letterGrade,
      grade_state_snapshot:   c.gradeState,
      missing_count_snapshot: c.missingCount,
      quarter_grades_snapshot: c.quarterGrades ? JSON.stringify(c.quarterGrades) : null,
      teacher_comment:        c.teacherComment,
      sort_order:             idx,
    }));
    if (courseRows.length > 0) {
      await supabase.from("student_report_courses").insert(courseRows);
    }

    return { success: true, data: { reportId } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Update comments on an existing draft without recalculating grades.
export async function updateReportComments(
  reportId: string,
  generalComment: string | null,
  courseComments: Record<string, string>
): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    await assertStaff(orgId);
    const supabase = await createClient();

    const { data: report } = await supabase
      .from("student_reports")
      .select("id, status")
      .eq("id", reportId)
      .eq("organization_id", orgId)
      .single();
    if (!report) return { success: false, error: "Report not found" };
    if ((report as any).status !== "draft") return { success: false, error: "Can only edit draft reports" };

    await supabase.from("student_reports").update({ general_comment: generalComment }).eq("id", reportId);

    for (const [sectionId, comment] of Object.entries(courseComments)) {
      await supabase
        .from("student_report_courses")
        .update({ teacher_comment: comment })
        .eq("report_id", reportId)
        .eq("course_section_id", sectionId);
    }
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Issue a draft report: snapshots student/period data and sets status = 'issued'.
export async function issueStudentReport(reportId: string): Promise<ActionResult<{ reportId: string }>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase, profileId } = await assertStaff(orgId);

    const { data: report } = await supabase
      .from("student_reports")
      .select("*, students(first_name, last_name, preferred_name, grade_level), grading_periods(name, start_date, end_date), school_years(label)")
      .eq("id", reportId)
      .eq("organization_id", orgId)
      .single();
    if (!report) return { success: false, error: "Report not found" };
    const r = report as any;
    if (r.status !== "draft") return { success: false, error: "Only draft reports can be issued" };

    const student = r.students;
    const period  = r.grading_periods;
    const sy      = r.school_years;

    const studentName = `${student?.preferred_name ?? student?.first_name} ${student?.last_name}`;
    const attendance  = period
      ? await getAttendanceSummary(supabase, r.student_id, period.start_date, period.end_date)
      : null;

    await supabase.from("student_reports").update({
      status:                    "issued",
      issued_at:                 new Date().toISOString(),
      issued_by_profile_id:      profileId,
      student_name_snapshot:     studentName,
      grade_level_snapshot:      student?.grade_level ?? null,
      school_year_label_snapshot: sy?.label ?? null,
      period_name_snapshot:      period?.name ?? null,
      attendance_snapshot:       attendance,
    }).eq("id", reportId);

    return { success: true, data: { reportId } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Supersede an issued report (marks it superseded, does NOT delete it).
export async function supersedeStudentReport(reportId: string): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);
    const { error } = await supabase
      .from("student_reports")
      .update({ status: "superseded" })
      .eq("id", reportId)
      .eq("organization_id", orgId)
      .eq("status", "issued");
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// List all reports for a student (staff view — all statuses).
export async function getStudentReportList(studentId: string): Promise<ActionResult<ReportListItem[]>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);

    const { data } = await supabase
      .from("student_reports")
      .select("id, report_type, status, issued_at, created_at, grading_periods(name), school_years(label)")
      .eq("organization_id", orgId)
      .eq("student_id", studentId)
      .order("created_at", { ascending: false });

    const items: ReportListItem[] = ((data ?? []) as any[]).map((r) => ({
      id:              r.id,
      reportType:      r.report_type as ReportType,
      reportTypeLabel: reportTypeLabel(r.report_type, r.grading_periods?.name ?? ""),
      periodName:      r.grading_periods?.name ?? r.period_name_snapshot ?? "",
      schoolYearLabel: r.school_years?.label ?? r.school_year_label_snapshot ?? "",
      status:          r.status as ReportStatus,
      issuedAt:        r.issued_at,
      createdAt:       r.created_at,
    }));

    return { success: true, data: items };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Get full report detail — staff may view any status; parent only issued.
// For issued reports, returns snapshotted data. For drafts, returns live data.
export async function getStudentReport(
  reportId: string
): Promise<ActionResult<ReportPreviewData>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase, isParent } = await assertCanViewReport(reportId, orgId);
    const orgDetails = await getOrgDetails(supabase, orgId);

    const { data: report } = await supabase
      .from("student_reports")
      .select("*, students(first_name, last_name, preferred_name, grade_level), grading_periods(name, start_date, end_date), school_years(label)")
      .eq("id", reportId)
      .single();
    if (!report) return { success: false, error: "Report not found" };
    const r = report as any;

    const { data: courseRows } = await supabase
      .from("student_report_courses")
      .select("*")
      .eq("report_id", reportId)
      .order("sort_order");

    const isIssued = r.status === "issued";
    const student  = r.students;
    const period   = r.grading_periods;

    const studentName = isIssued
      ? (r.student_name_snapshot ?? `${student?.preferred_name ?? student?.first_name} ${student?.last_name}`)
      : `${student?.preferred_name ?? student?.first_name} ${student?.last_name}`;
    const gradeLevel  = isIssued ? r.grade_level_snapshot  : student?.grade_level;
    const syLabel     = isIssued ? r.school_year_label_snapshot : (r.school_years?.label ?? "");
    const periodName  = isIssued ? (r.period_name_snapshot ?? period?.name ?? "") : (period?.name ?? "");

    const attendance: AttendanceSummary | null = isIssued
      ? (r.attendance_snapshot as AttendanceSummary | null)
      : (period ? await getAttendanceSummary(supabase, r.student_id, period.start_date, period.end_date) : null);

    const courses: ReportCourseData[] = ((courseRows ?? []) as any[]).map((c) => ({
      courseSectionId:  c.course_section_id ?? "",
      courseName:       c.course_name_snapshot,
      subject:          c.subject_snapshot ?? "",
      teacherName:      c.teacher_name_snapshot,
      gradingMethod:    c.grading_method_snapshot as "points" | "weighted",
      gradeState:       c.grade_state_snapshot,
      percentage:       c.percentage_snapshot !== null ? Number(c.percentage_snapshot) : null,
      displayPercentage: c.percentage_snapshot !== null ? Number(c.percentage_snapshot).toFixed(2) + "%" : null,
      letterGrade:      c.letter_grade_snapshot,
      missingCount:     c.missing_count_snapshot,
      teacherComment:   c.teacher_comment,
      quarterGrades:    c.quarter_grades_snapshot ?? undefined,
    }));

    return {
      success: true,
      data: {
        reportId:       r.id,
        status:         r.status as ReportStatus,
        ...orgDetails,
        studentId:      r.student_id,
        studentName,
        gradeLevel,
        schoolYearLabel: syLabel,
        periodName,
        reportType:     r.report_type as ReportType,
        reportTypeLabel: reportTypeLabel(r.report_type, periodName),
        generatedDate:  r.issued_at ? r.issued_at.split("T")[0] : r.created_at.split("T")[0],
        courses,
        attendance,
        generalComment: r.general_comment,
        issuedAt:       r.issued_at,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Parent: list issued reports for a guardian-linked student.
export async function getMyChildReportList(
  studentId: string
): Promise<ActionResult<ReportListItem[]>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const supabase = await createClient();
    const user = await getUser();
    if (!user) return { success: false, error: "Unauthenticated" };
    const profileId = await resolveProfileId(user.id);

    // Verify guardianship
    const { data: guardianship } = await supabase
      .from("guardianships")
      .select("id")
      .eq("profile_id", profileId)
      .eq("student_id", studentId)
      .eq("status", "active")
      .single();
    if (!guardianship) return { success: false, error: "Unauthorized" };

    const { data } = await supabase
      .from("student_reports")
      .select("id, report_type, issued_at, created_at, grading_periods(name), school_years(label), period_name_snapshot, school_year_label_snapshot")
      .eq("organization_id", orgId)
      .eq("student_id", studentId)
      .eq("status", "issued")
      .order("issued_at", { ascending: false });

    const items: ReportListItem[] = ((data ?? []) as any[]).map((r) => ({
      id:              r.id,
      reportType:      r.report_type as ReportType,
      reportTypeLabel: reportTypeLabel(r.report_type, r.grading_periods?.name ?? r.period_name_snapshot ?? ""),
      periodName:      r.grading_periods?.name ?? r.period_name_snapshot ?? "",
      schoolYearLabel: r.school_years?.label ?? r.school_year_label_snapshot ?? "",
      status:          "issued" as ReportStatus,
      issuedAt:        r.issued_at,
      createdAt:       r.created_at,
    }));

    return { success: true, data: items };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
