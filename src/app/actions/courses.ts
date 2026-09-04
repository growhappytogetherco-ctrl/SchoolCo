"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";

// ── Types ────────────────────────────────────────────────────────────────────

export interface StaffOption {
  id: string;          // staff_roster.id
  name: string;
  primary_role: string;
}

export interface CourseSectionWithCount {
  id: string;
  subject: string;
  course_name: string;
  teacher_name: string | null;
  teacher_id: string | null;
  status: string;
  student_count: number;
  school_year_id: string;
  created_at: string;
}

export interface CourseSectionDetail {
  id: string;
  organization_id: string;
  school_year_id: string;
  subject: string;
  course_name: string;
  teacher_id: string | null;
  teacher_name: string | null;
  status: string;
  created_at: string;
}

export interface CourseStudent {
  enrollment_id: string;    // curriculum_enrollments.id
  student_id: string;
  student_name: string;
  grade_level: string | null;
  curriculum_name: string | null;
}

// Students available to add to a course (by subject)
export interface StudentForSetup {
  student_id: string;
  student_name: string;
  grade_level: string | null;
  enrollment_id: string | null;        // curriculum_enrollments.id if match found
  curriculum_name: string | null;
  already_in_another_section: boolean; // true if linked to a DIFFERENT section
  current_section_id: string | null;
}

export interface CourseGradeSettingsData {
  grading_method: string;
  grade_scale_id: string | null;
  weight_config: Record<string, number> | null;
}

// ── Auth helper ──────────────────────────────────────────────────────────────

async function assertStaff(orgId: string) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const staffRoles = ["teacher","staff","registrar","admin","full_admin","platform_admin"];
  if (!data || !staffRoles.includes(data.role)) {
    throw new Error("Insufficient permissions");
  }
  return { supabase, user };
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function getCourseSectionsWithEnrollmentCounts(): Promise<ActionResult<CourseSectionWithCount[]>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);

    const { data: sections, error } = await supabase
      .from("course_sections")
      .select("id, subject, course_name, teacher_name, teacher_id, status, school_year_id, created_at")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .order("subject")
      .order("course_name");

    if (error) return { success: false, error: error.message };

    // Count enrolled students per section
    const ids = (sections ?? []).map(s => s.id);
    let counts: Record<string, number> = {};
    if (ids.length > 0) {
      const { data: enrollments } = await supabase
        .from("curriculum_enrollments")
        .select("course_section_id")
        .in("course_section_id", ids)
        .eq("status", "active");

      for (const e of enrollments ?? []) {
        if (e.course_section_id) {
          counts[e.course_section_id] = (counts[e.course_section_id] ?? 0) + 1;
        }
      }
    }

    const result: CourseSectionWithCount[] = (sections ?? []).map(s => ({
      ...s,
      student_count: counts[s.id] ?? 0,
    }));

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getCourseDetail(sectionId: string): Promise<ActionResult<{
  section: CourseSectionDetail;
  roster: CourseStudent[];
  gradeSettings: CourseGradeSettingsData | null;
}>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);

    const { data: section, error: sErr } = await supabase
      .from("course_sections")
      .select("*")
      .eq("id", sectionId)
      .eq("organization_id", orgId)
      .single();
    if (sErr || !section) return { success: false, error: "Course not found" };

    const { data: enrollments } = await supabase
      .from("curriculum_enrollments")
      .select("id, student_id, curriculum_name")
      .eq("course_section_id", sectionId)
      .eq("status", "active");

    const studentIds = (enrollments ?? []).map(e => e.student_id);
    let studentMap: Record<string, { first_name: string; last_name: string; grade_level: string | null }> = {};
    if (studentIds.length > 0) {
      const { data: students } = await supabase
        .from("students")
        .select("id, first_name, last_name, grade_level")
        .in("id", studentIds);
      for (const s of students ?? []) {
        studentMap[s.id] = s;
      }
    }

    const roster: CourseStudent[] = (enrollments ?? []).map(e => ({
      enrollment_id: e.id,
      student_id: e.student_id,
      student_name: studentMap[e.student_id]
        ? `${studentMap[e.student_id].first_name} ${studentMap[e.student_id].last_name}`
        : e.student_id,
      grade_level: studentMap[e.student_id]?.grade_level ?? null,
      curriculum_name: e.curriculum_name,
    }));

    roster.sort((a, b) => a.student_name.localeCompare(b.student_name));

    const { data: gs } = await supabase
      .from("course_grade_settings")
      .select("grading_method, grade_scale_id, weight_config")
      .eq("course_section_id", sectionId)
      .single();

    return {
      success: true,
      data: {
        section,
        roster,
        gradeSettings: gs ?? null,
      },
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getStaffForTeacherSelect(): Promise<ActionResult<StaffOption[]>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);

    const { data, error } = await supabase
      .from("staff_roster")
      .select("id, first_name, last_name, primary_role")
      .eq("organization_id", orgId)
      .eq("status", "active")
      .order("last_name");

    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map(s => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name}`,
        primary_role: s.primary_role,
      })),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Returns all active students with their curriculum enrollment for a given subject.
// Used for the student picker when creating/editing a course.
export async function getStudentsForCourseSetup(subject: string): Promise<ActionResult<StudentForSetup[]>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);

    const { data: students, error: sErr } = await supabase
      .from("students")
      .select("id, first_name, last_name, grade_level")
      .eq("organization_id", orgId)
      .eq("enrollment_status", "enrolled")
      .order("last_name");
    if (sErr) return { success: false, error: sErr.message };

    // Fetch curriculum enrollments for this subject
    const { data: enrollments } = await supabase
      .from("curriculum_enrollments")
      .select("id, student_id, curriculum_name, course_section_id")
      .eq("organization_id", orgId)
      .eq("subject", subject)
      .eq("status", "active");

    // Map student_id → enrollment (use first match if multiple)
    const enrollmentByStudent: Record<string, {
      id: string;
      curriculum_name: string | null;
      course_section_id: string | null;
    }> = {};
    for (const e of enrollments ?? []) {
      if (!enrollmentByStudent[e.student_id]) {
        enrollmentByStudent[e.student_id] = {
          id: e.id,
          curriculum_name: e.curriculum_name,
          course_section_id: e.course_section_id,
        };
      }
    }

    const result: StudentForSetup[] = (students ?? []).map(s => {
      const enr = enrollmentByStudent[(s as any).id];
      return {
        student_id: (s as any).id,
        student_name: `${s.first_name} ${s.last_name}`,
        grade_level: (s as any).grade_level ?? null,
        enrollment_id: enr?.id ?? null,
        curriculum_name: enr?.curriculum_name ?? null,
        already_in_another_section: !!(enr?.course_section_id),
        current_section_id: enr?.course_section_id ?? null,
      };
    });

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function getActiveSchoolYear(): Promise<ActionResult<{ id: string; label: string }>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);

    const { data, error } = await supabase
      .from("school_years")
      .select("id, label")
      .eq("organization_id", orgId)
      .eq("is_current", true)
      .single();

    if (error || !data) {
      // Fallback: most recent year
      const { data: fallback } = await supabase
        .from("school_years")
        .select("id, label")
        .eq("organization_id", orgId)
        .order("start_date", { ascending: false })
        .limit(1)
        .single();
      if (!fallback) return { success: false, error: "No school year found" };
      return { success: true, data: fallback };
    }

    return { success: true, data };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Mutations ────────────────────────────────────────────────────────────────

export async function createCourseSection(payload: {
  subject: string;
  courseName: string;
  teacherId: string | null;
  teacherName: string | null;
  schoolYearId: string;
  enrollmentIds: string[];   // curriculum_enrollment ids to link
}): Promise<ActionResult<{ sectionId: string }>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);

    const { data: section, error: cErr } = await supabase
      .from("course_sections")
      .insert({
        organization_id: orgId,
        school_year_id: payload.schoolYearId,
        subject: payload.subject.trim().toLowerCase(),
        course_name: payload.courseName.trim(),
        teacher_id: payload.teacherId,
        teacher_name: payload.teacherName,
        status: "active",
      })
      .select("id")
      .single();

    if (cErr || !section) return { success: false, error: cErr?.message ?? "Failed to create course" };

    if (payload.enrollmentIds.length > 0) {
      await supabase
        .from("curriculum_enrollments")
        .update({ course_section_id: section.id })
        .in("id", payload.enrollmentIds)
        .eq("organization_id", orgId);
    }

    revalidatePath("/dashboard/courses");
    return { success: true, data: { sectionId: section.id } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function updateCourseSection(
  sectionId: string,
  payload: {
    courseName?: string;
    teacherId?: string | null;
    teacherName?: string | null;
  }
): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);

    const updates: Record<string, unknown> = {};
    if (payload.courseName !== undefined) updates.course_name = payload.courseName.trim();
    if (payload.teacherId !== undefined) updates.teacher_id = payload.teacherId;
    if (payload.teacherName !== undefined) updates.teacher_name = payload.teacherName;

    const { error } = await supabase
      .from("course_sections")
      .update(updates)
      .eq("id", sectionId)
      .eq("organization_id", orgId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/courses");
    revalidatePath(`/dashboard/courses/${sectionId}`);
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Links an existing curriculum_enrollment to this course section.
// If the student has no curriculum_enrollment for this subject, creates a minimal one.
export async function addStudentToCourse(payload: {
  sectionId: string;
  studentId: string;
  enrollmentId: string | null;   // existing curriculum_enrollment id, or null to create
  subject: string;
  courseName: string;
}): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);

    let enrollmentId = payload.enrollmentId;

    if (!enrollmentId) {
      // Create a minimal curriculum_enrollment for this student/subject
      const { data: newE, error: eErr } = await supabase
        .from("curriculum_enrollments")
        .insert({
          organization_id: orgId,
          student_id: payload.studentId,
          subject: payload.subject,
          curriculum_name: payload.courseName,
          course_section_id: payload.sectionId,
          status: "active",
        })
        .select("id")
        .single();
      if (eErr || !newE) return { success: false, error: eErr?.message ?? "Failed to create enrollment" };
      enrollmentId = newE.id;
    } else {
      const { error } = await supabase
        .from("curriculum_enrollments")
        .update({ course_section_id: payload.sectionId })
        .eq("id", enrollmentId)
        .eq("organization_id", orgId);
      if (error) return { success: false, error: error.message };
    }

    revalidatePath(`/dashboard/courses/${payload.sectionId}`);
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Safe removal: nulls out course_section_id only — does NOT delete the curriculum_enrollment.
export async function removeStudentFromCourse(
  enrollmentId: string,
  sectionId: string
): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);

    const { error } = await supabase
      .from("curriculum_enrollments")
      .update({ course_section_id: null })
      .eq("id", enrollmentId)
      .eq("course_section_id", sectionId)
      .eq("organization_id", orgId);

    if (error) return { success: false, error: error.message };

    revalidatePath(`/dashboard/courses/${sectionId}`);
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function upsertCourseGradeSettings(
  sectionId: string,
  payload: {
    gradingMethod: string;
    gradeScaleId?: string | null;
    weightConfig?: Record<string, number> | null;
  }
): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { supabase } = await assertStaff(orgId);

    const { error } = await supabase
      .from("course_grade_settings")
      .upsert({
        course_section_id: sectionId,
        organization_id: orgId,
        grading_method: payload.gradingMethod,
        grade_scale_id: payload.gradeScaleId ?? null,
        weight_config: payload.weightConfig ?? null,
      }, { onConflict: "course_section_id" });

    if (error) return { success: false, error: error.message };

    revalidatePath(`/dashboard/courses/${sectionId}`);
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
