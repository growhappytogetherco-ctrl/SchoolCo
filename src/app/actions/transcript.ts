"use server";

import { getUser, getActiveOrgId, createClient } from "@/lib/supabase/server";
import { getStudentYTDGrade } from "@/app/actions/grading";
import type { ActionResult } from "@/types/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OrgInfo = {
  name: string;
  logoUrl: string | null;
  address: { street1?: string; city?: string; state?: string; zip?: string } | null;
  phone: string | null;
  email: string | null;
  website: string | null;
};

export type HistoricalRecord = {
  id: string;
  courseName: string;
  courseCode: string | null;
  term: string | null;
  courseLevel: string | null;
  gradeDisplay: string | null;
  creditsEarned: number | null;
  countsTowardHsCredit: boolean;
};

export type HistoricalGroup = {
  schoolYear: string;
  institutions: Array<{
    institutionName: string;
    records: HistoricalRecord[];
  }>;
};

export type CurrentEnrollment = {
  id: string;
  courseName: string;
  courseCode: string | null;
  subject: string | null;
  courseLevel: string | null;
  term: string | null;
  schoolYear: string;
  countsTowardHsCredit: boolean;
  creditsAttempted: number | null;
  currentGradeDisplay: string | null;
  hasGrade: boolean;
};

export type TranscriptData = {
  org: OrgInfo;
  studentName: string;
  gradeLevel: string | null;
  currentSchoolYear: string;
  generatedAt: string;
  historicalGroups: HistoricalGroup[];
  currentEnrollments: CurrentEnrollment[];
  earnedHsCredits: number;
  currentHsCreditsAttempted: number;
  missingOrgFields: string[];
};

export type EnrollmentSummaryData = {
  org: OrgInfo;
  studentName: string;
  gradeLevel: string | null;
  currentSchoolYear: string;
  generatedAt: string;
  enrollments: Array<{
    id: string;
    courseName: string;
    courseCode: string | null;
    subject: string | null;
    term: string | null;
    courseLevel: string | null;
    teacherName: string | null;
    countsTowardHsCredit: boolean;
    creditsAttempted: number | null;
  }>;
  hasHsCredit: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatHistoricalGrade(record: {
  percentage: number | null;
  final_grade: string | null;
  semester_1_grade: string | null;
  semester_2_grade: string | null;
}): string | null {
  const pct = record.percentage;
  const letter = record.final_grade ?? record.semester_2_grade ?? record.semester_1_grade ?? null;
  if (pct !== null && pct !== undefined) {
    const pctStr = Number.isInteger(pct) ? `${pct}%` : `${parseFloat(String(pct))}%`;
    return letter ? `${pctStr} (${letter})` : pctStr;
  }
  return letter;
}

function formatCurrentGrade(
  percentage: number | null,
  letterGrade: string | null,
): { display: string | null; hasGrade: boolean } {
  if (percentage === null || percentage === undefined) {
    return { display: null, hasGrade: false };
  }
  const rounded = Math.round(percentage * 100) / 100;
  const pctStr = Number.isInteger(rounded)
    ? `${rounded}%`
    : `${parseFloat(rounded.toFixed(2)).toString()}%`;
  const display = letterGrade ? `${pctStr} (${letterGrade})` : pctStr;
  return { display, hasGrade: true };
}

function buildMissingOrgFields(org: {
  name: string;
  address: unknown;
  phone: string | null;
  email: string | null;
}): string[] {
  const missing: string[] = [];
  if (!org.address) missing.push("address");
  if (!org.phone) missing.push("phone");
  if (!org.email) missing.push("email");
  return missing;
}

// ── Auth guard ────────────────────────────────────────────────────────────────

async function assertStaffAndStudent(studentId: string) {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");

  const orgId = await getActiveOrgId();
  if (!orgId) throw new Error("No active organization");

  const supabase = await createClient();

  // Verify staff membership
  const { data: member } = await (supabase as any)
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  if (!member) throw new Error("Not a member of this organization");

  const staffRoles = ["teacher","staff","registrar","admin","full_admin","platform_admin"];
  if (!staffRoles.includes((member as any).role)) throw new Error("Staff access required");

  // Cross-org security: verify student belongs to this org
  const { data: student } = await (supabase as any)
    .from("students")
    .select("id, first_name, last_name, preferred_name, grade_level, enrollment_status")
    .eq("id", studentId)
    .eq("organization_id", orgId)
    .single();

  if (!student) throw new Error("Student not found in your organization");

  return { supabase, orgId, user, student: student as any };
}

// ── getTranscriptData ─────────────────────────────────────────────────────────

export async function getTranscriptData(
  studentId: string,
): Promise<ActionResult<TranscriptData>> {
  try {
    const { supabase, orgId, student } = await assertStaffAndStudent(studentId);

    // Org branding
    const { data: org } = await (supabase as any)
      .from("organizations")
      .select("name, short_name, logo_url, phone, email, website, address")
      .eq("id", orgId)
      .single();
    if (!org) throw new Error("Organization not found");
    const orgData = org as any;

    // Current school year
    let schoolYearLabel = "";
    const { data: currentYear } = await (supabase as any)
      .from("school_years")
      .select("id, label")
      .eq("organization_id", orgId)
      .eq("is_current", true)
      .maybeSingle();
    if (currentYear) {
      schoolYearLabel = (currentYear as any).label;
    } else {
      const { data: latestYear } = await (supabase as any)
        .from("school_years")
        .select("id, label")
        .eq("organization_id", orgId)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      schoolYearLabel = (latestYear as any)?.label ?? "";
    }

    // Verified historical course records
    const { data: records, error: recErr } = await (supabase as any)
      .from("student_course_records")
      .select(`
        id, course_name, course_code, institution_name, school_year, term,
        course_level, percentage, final_grade, semester_1_grade, semester_2_grade,
        credits_earned, counts_toward_high_school_credit, completion_status,
        source_type, verification_status
      `)
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("verification_status", "verified")
      .order("school_year", { ascending: false });
    if (recErr) throw recErr;

    // Group records by school_year → institution_name
    const yearMap = new Map<string, Map<string, HistoricalRecord[]>>();
    for (const r of (records ?? []) as any[]) {
      const yr: string = r.school_year ?? "Unknown Year";
      const inst: string = r.institution_name ?? orgData.name;
      if (!yearMap.has(yr)) yearMap.set(yr, new Map());
      const instMap = yearMap.get(yr)!;
      if (!instMap.has(inst)) instMap.set(inst, []);
      instMap.get(inst)!.push({
        id: r.id,
        courseName: r.course_name,
        courseCode: r.course_code,
        term: r.term,
        courseLevel: r.course_level,
        gradeDisplay: formatHistoricalGrade(r),
        creditsEarned: r.credits_earned,
        countsTowardHsCredit: r.counts_toward_high_school_credit ?? false,
      });
    }

    const historicalGroups: HistoricalGroup[] = [];
    for (const [schoolYear, instMap] of Array.from(yearMap.entries())) {
      const institutions: HistoricalGroup["institutions"] = [];
      for (const [institutionName, recs] of Array.from(instMap.entries())) {
        institutions.push({ institutionName, records: recs });
      }
      historicalGroups.push({ schoolYear, institutions });
    }
    // Ensure descending year order
    historicalGroups.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear));

    // Active enrollments
    const { data: enrollments, error: enrErr } = await (supabase as any)
      .from("curriculum_enrollments")
      .select(`
        id, curriculum_name, subject, status, finalized_at,
        course_sections (
          id, course_name, course_code, subject_area, course_level,
          credits_attempted, counts_toward_high_school_credit, school_year_id,
          school_years ( id, label )
        )
      `)
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (enrErr) throw enrErr;

    // Calculate current grade for each enrollment
    const currentEnrollments: CurrentEnrollment[] = [];
    for (const enr of enrollments ?? []) {
      const cs = enr.course_sections;
      const sy = cs?.school_years;
      const courseSectionId = cs?.id ?? null;
      const schoolYearId = sy?.id ?? null;

      let currentGradeDisplay: string | null = null;
      let hasGrade = false;

      if (courseSectionId && schoolYearId) {
        const ytdResult = await getStudentYTDGrade(
          studentId,
          courseSectionId,
          schoolYearId,
          orgId,
        );
        if (ytdResult.success && ytdResult.data.state !== "no_grade") {
          const formatted = formatCurrentGrade(
            ytdResult.data.percentage,
            ytdResult.data.letter_grade,
          );
          currentGradeDisplay = formatted.display;
          hasGrade = formatted.hasGrade;
        }
      }

      currentEnrollments.push({
        id: enr.id,
        courseName: cs?.course_name ?? enr.curriculum_name ?? "Unnamed Course",
        courseCode: cs?.course_code ?? null,
        subject: cs?.subject_area ?? enr.subject ?? null,
        courseLevel: cs?.course_level ?? null,
        term: null,
        schoolYear: sy?.label ?? schoolYearLabel,
        countsTowardHsCredit: cs?.counts_toward_high_school_credit ?? false,
        creditsAttempted: cs?.credits_attempted ?? null,
        currentGradeDisplay,
        hasGrade,
      });
    }

    // Credit summary
    const earnedHsCredits = ((records ?? []) as any[])
      .filter(
        (r: any) =>
          r.counts_toward_high_school_credit &&
          (r.credits_earned ?? 0) > 0 &&
          r.completion_status === "completed",
      )
      .reduce((sum: number, r: any) => sum + (r.credits_earned ?? 0), 0);

    const currentHsCreditsAttempted = currentEnrollments
      .filter((e) => e.countsTowardHsCredit && (e.creditsAttempted ?? 0) > 0)
      .reduce((sum, e) => sum + (e.creditsAttempted ?? 0), 0);

    return {
      success: true,
      data: {
        org: {
          name: orgData.name,
          logoUrl: orgData.logo_url,
          address: orgData.address ?? null,
          phone: orgData.phone,
          email: orgData.email,
          website: orgData.website,
        },
        studentName: `${student.first_name} ${student.last_name}`,
        gradeLevel: student.grade_level,
        currentSchoolYear: schoolYearLabel,
        generatedAt: new Date().toISOString(),
        historicalGroups,
        currentEnrollments,
        earnedHsCredits: Math.round(earnedHsCredits * 100) / 100,
        currentHsCreditsAttempted: Math.round(currentHsCreditsAttempted * 100) / 100,
        missingOrgFields: buildMissingOrgFields(orgData),
      },
    };
  } catch (e) {
    return { success: false, error: "Unable to generate transcript. " + (e instanceof Error ? e.message : String(e)) };
  }
}

// ── getEnrollmentSummaryData ──────────────────────────────────────────────────

export async function getEnrollmentSummaryData(
  studentId: string,
): Promise<ActionResult<EnrollmentSummaryData>> {
  try {
    const { supabase, orgId, student } = await assertStaffAndStudent(studentId);

    // Org branding
    const { data: org2 } = await (supabase as any)
      .from("organizations")
      .select("name, short_name, logo_url, phone, email, website, address")
      .eq("id", orgId)
      .single();
    if (!org2) throw new Error("Organization not found");
    const orgData2 = org2 as any;

    // Current school year
    let schoolYearLabel = "";
    const { data: currentYear2 } = await (supabase as any)
      .from("school_years")
      .select("id, label")
      .eq("organization_id", orgId)
      .eq("is_current", true)
      .maybeSingle();
    if (currentYear2) {
      schoolYearLabel = (currentYear2 as any).label;
    } else {
      const { data: latestYear2 } = await (supabase as any)
        .from("school_years")
        .select("id, label")
        .eq("organization_id", orgId)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      schoolYearLabel = (latestYear2 as any)?.label ?? "";
    }

    // Active enrollments with teacher (via staff_roster if available)
    const { data: enrollments, error: enrErr } = await (supabase as any)
      .from("curriculum_enrollments")
      .select(`
        id, curriculum_name, subject, status,
        course_sections (
          id, course_name, course_code, subject_area, course_level,
          credits_attempted, counts_toward_high_school_credit,
          school_years ( label )
        )
      `)
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (enrErr) throw enrErr;

    let hasHsCredit = false;
    const enrollmentRows = (enrollments ?? []).map((enr: any) => {
      const cs = enr.course_sections;
      const hs = cs?.counts_toward_high_school_credit ?? false;
      if (hs) hasHsCredit = true;
      return {
        id: enr.id,
        courseName: cs?.course_name ?? enr.curriculum_name ?? "Unnamed Course",
        courseCode: cs?.course_code ?? null,
        subject: cs?.subject_area ?? enr.subject ?? null,
        term: null,
        courseLevel: cs?.course_level ?? null,
        teacherName: null, // teacher join not reliable without staff_roster join; omit
        countsTowardHsCredit: hs,
        creditsAttempted: cs?.credits_attempted ?? null,
      };
    });

    return {
      success: true,
      data: {
        org: {
          name: orgData2.name,
          logoUrl: orgData2.logo_url,
          address: orgData2.address ?? null,
          phone: orgData2.phone,
          email: orgData2.email,
          website: orgData2.website,
        },
        studentName: `${student.first_name} ${student.last_name}`,
        gradeLevel: student.grade_level,
        currentSchoolYear: schoolYearLabel,
        generatedAt: new Date().toISOString(),
        enrollments: enrollmentRows,
        hasHsCredit,
      },
    };
  } catch (e) {
    return { success: false, error: "Unable to generate enrollment summary. " + (e instanceof Error ? e.message : String(e)) };
  }
}
