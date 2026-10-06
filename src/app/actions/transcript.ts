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

export type DepartmentCredit = {
  department: string;
  credits: number;
};

export type ServiceYearSummary = {
  schoolYear: string;
  hours: number;
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
  cumulativeGpa: number | null;
  departmentCredits: DepartmentCredit[];
  unclassifiedHsCredits: number;
  serviceHours: ServiceYearSummary[];
  totalServiceHours: number;
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

// ── Error serialization ───────────────────────────────────────────────────────
// Supabase returns PostgrestError objects (not Error instances).
// String(postgrestError) → "[object Object]". Normalize before user display.

function safeErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const obj = e as Record<string, unknown>;
    // PostgrestError shape: { message, code, details, hint }
    if (typeof obj.message === "string") return obj.message;
    try { return JSON.stringify(obj); } catch { /* ignore */ }
  }
  return String(e);
}

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
  return letter ?? null;
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

function safeAddress(raw: unknown): OrgInfo["address"] {
  if (!raw) return null;
  if (typeof raw === "string") {
    // Legacy plain-string address — wrap as street1
    return { street1: raw };
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return {
      street1: typeof obj.street1 === "string" ? obj.street1 : undefined,
      city:    typeof obj.city    === "string" ? obj.city    : undefined,
      state:   typeof obj.state   === "string" ? obj.state   : undefined,
      zip:     typeof obj.zip     === "string" ? obj.zip     : undefined,
    };
  }
  return null;
}

function buildMissingOrgFields(org: {
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

// ── GPA ──────────────────────────────────────────────────────────────────────
// Canonical unweighted GPA scale from grade_scales (migration 00060).
// P / W / other non-standard letters → excluded from GPA (null returned).

const GPA_SCALE: Record<string, number> = {
  "A+": 4.0, "A": 4.0, "A-": 3.7,
  "B+": 3.3, "B": 3.0, "B-": 2.7,
  "C+": 2.3, "C": 2.0, "C-": 1.7,
  "D+": 1.3, "D": 1.0, "D-": 0.7,
  "F": 0.0,
};

function getGpaPoints(letter: string | null): number | null {
  if (!letter) return null;
  const n = letter.trim().toUpperCase();
  return n in GPA_SCALE ? GPA_SCALE[n] : null;
}

function calculateGpa(records: any[]): number | null {
  let weightedSum = 0;
  let totalAttempted = 0;
  for (const r of records) {
    if (!r.counts_toward_high_school_credit) continue;
    if (!["completed", "failed"].includes(r.completion_status ?? "")) continue;
    // Use stored letter grade only — never derive from percentage
    const letter = r.final_grade ?? r.semester_2_grade ?? r.semester_1_grade ?? null;
    const pts = getGpaPoints(letter);
    if (pts === null) continue; // no usable grade or pass/fail
    const attempted = r.credits_attempted;
    if (!attempted || attempted <= 0) continue;
    weightedSum += pts * attempted;
    totalAttempted += attempted;
  }
  if (totalAttempted === 0) return null;
  return Math.round((weightedSum / totalAttempted) * 100) / 100;
}

// ── Department credits ─────────────────────────────────────────────────────────
// Maps subject_area enum values → display department label for transcript summary.
// These match the values documented in migration 00071 comments.

const DEPT_LABEL: Record<string, string> = {
  english_ela:       "English / ELA",
  mathematics:       "Mathematics",
  science:           "Science",
  social_studies:    "History / Social Studies",
  world_language:    "Foreign Language",
  fine_arts:         "Fine Arts",
  pe_health:         "Physical Education / Health",
  career_technical:  "Career & Technical Education",
  leadership:        "Leadership",
  entrepreneurship:  "Entrepreneurship",
  stem:              "STEM",
  bible:             "Bible",
  elective:          "Elective / Other",
  other:             "Elective / Other",
};

function buildDepartmentCredits(
  records: any[],
): { departments: DepartmentCredit[]; unclassified: number } {
  const map = new Map<string, number>();
  let unclassified = 0;

  for (const r of records) {
    if (!r.counts_toward_high_school_credit) continue;
    if (r.completion_status !== "completed") continue;
    const earned = r.credits_earned ?? 0;
    if (earned <= 0) continue;

    const area = (r.subject_area ?? "").trim().toLowerCase();
    const label = DEPT_LABEL[area];
    if (!label) {
      unclassified = Math.round((unclassified + earned) * 100) / 100;
      continue;
    }
    map.set(label, Math.round(((map.get(label) ?? 0) + earned) * 100) / 100);
  }

  const departments: DepartmentCredit[] = [];
  for (const [dept, credits] of Array.from(map.entries())) {
    departments.push({ department: dept, credits });
  }
  // Sort by dept name alphabetically for consistent display
  departments.sort((a, b) => a.department.localeCompare(b.department));
  return { departments, unclassified };
}

// ── Service hours ─────────────────────────────────────────────────────────────
// service_hours table has no school_year field; derive from service_date (Aug–Jul).

function deriveAcademicYear(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1; // 1–12
  const year = d.getFullYear();
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}–${startYear + 1}`;
}

async function resolveCurrentSchoolYear(supabase: any, orgId: string): Promise<string> {
  try {
    const { data: currentYear } = await supabase
      .from("school_years")
      .select("label")
      .eq("organization_id", orgId)
      .eq("is_current", true)
      .maybeSingle();
    if (currentYear?.label) return currentYear.label;

    const { data: latestYear } = await supabase
      .from("school_years")
      .select("label")
      .eq("organization_id", orgId)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return latestYear?.label ?? "";
  } catch {
    return "";
  }
}

// ── Auth guard ────────────────────────────────────────────────────────────────

async function assertStaffAndStudent(studentId: string) {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");

  const orgId = await getActiveOrgId();
  if (!orgId) throw new Error("No active organization");

  const supabase = await createClient();

  // Verify staff membership
  const { data: member, error: memberErr } = await (supabase as any)
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  if (memberErr || !member) throw new Error("Not a member of this organization");

  const staffRoles = ["teacher","staff","registrar","admin","full_admin","platform_admin"];
  if (!staffRoles.includes((member as any).role)) throw new Error("Staff access required");

  // Cross-org security: verify student belongs to this org
  const { data: student, error: studentErr } = await (supabase as any)
    .from("students")
    .select("id, first_name, last_name, preferred_name, grade_level, enrollment_status")
    .eq("id", studentId)
    .eq("organization_id", orgId)
    .single();

  if (studentErr || !student) throw new Error("Student not found in your organization");

  return { supabase: supabase as any, orgId, user, student: student as any };
}

// ── getTranscriptData ─────────────────────────────────────────────────────────

export async function getTranscriptData(
  studentId: string,
): Promise<ActionResult<TranscriptData>> {
  try {
    const { supabase, orgId, student } = await assertStaffAndStudent(studentId);

    // Org branding
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("name, logo_url, phone, email, website, address")
      .eq("id", orgId)
      .single();
    if (orgErr || !org) throw new Error("Organization not found");

    const schoolYearLabel = await resolveCurrentSchoolYear(supabase, orgId);

    // Verified historical course records
    // course_sections has no course_code — code comes from student_course_records directly
    const { data: records, error: recErr } = await supabase
      .from("student_course_records")
      .select(`
        id, course_name, course_code, institution_name, school_year, term,
        course_level, percentage, final_grade, semester_1_grade, semester_2_grade,
        credits_earned, credits_attempted, counts_toward_high_school_credit,
        completion_status, subject_area
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
      const inst: string = r.institution_name ?? org.name;
      if (!yearMap.has(yr)) yearMap.set(yr, new Map());
      const instMap = yearMap.get(yr)!;
      if (!instMap.has(inst)) instMap.set(inst, []);
      instMap.get(inst)!.push({
        id: r.id,
        courseName: r.course_name ?? "Unnamed Course",
        courseCode: r.course_code ?? null,
        term: r.term ?? null,
        courseLevel: r.course_level ?? null,
        gradeDisplay: formatHistoricalGrade(r),
        creditsEarned: r.credits_earned ?? null,
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
    historicalGroups.sort((a, b) => b.schoolYear.localeCompare(a.schoolYear));

    // Active enrollments
    // course_sections columns: id, subject, course_name, teacher_name,
    //   school_year_id, counts_toward_high_school_credit, credits_attempted, course_level
    // NOTE: course_sections has NO course_code or subject_area columns
    const { data: enrollments, error: enrErr } = await supabase
      .from("curriculum_enrollments")
      .select(`
        id, curriculum_name, subject, status,
        course_section_id,
        course_sections (
          id, course_name, subject, course_level,
          credits_attempted, counts_toward_high_school_credit, school_year_id,
          school_years ( id, label )
        )
      `)
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (enrErr) throw enrErr;

    // Calculate current grade per enrollment — resilient: one failure → In Progress, not transcript crash
    const currentEnrollments: CurrentEnrollment[] = [];
    for (const enr of (enrollments ?? []) as any[]) {
      const cs = enr.course_sections ?? null;
      const sy = cs?.school_years ?? null;
      const courseSectionId: string | null = cs?.id ?? null;
      const schoolYearId: string | null = sy?.id ?? null;

      let currentGradeDisplay: string | null = null;
      let hasGrade = false;

      if (courseSectionId && schoolYearId) {
        try {
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
          // no_grade → hasGrade stays false → UI renders "In Progress"
        } catch {
          // Grade calculation unavailable for this course — degrade to "In Progress"
          // Real infrastructure errors are already logged inside getStudentYTDGrade
        }
      }

      currentEnrollments.push({
        id: enr.id,
        // course_name from course_section; fall back to curriculum_name on enrollment
        courseName: cs?.course_name ?? enr.curriculum_name ?? "Unnamed Course",
        courseCode: null, // course_sections has no course_code column
        subject: cs?.subject ?? enr.subject ?? null,
        courseLevel: cs?.course_level ?? null,
        term: null,
        schoolYear: sy?.label ?? schoolYearLabel,
        countsTowardHsCredit: cs?.counts_toward_high_school_credit ?? false,
        creditsAttempted: cs?.credits_attempted ?? null,
        currentGradeDisplay,
        hasGrade,
      });
    }

    // Credit summary — earned: verified permanent records only
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

    // Cumulative GPA — verified completed/failed HS courses with letter grade + credits_attempted
    const cumulativeGpa = calculateGpa(records ?? []);

    // Department totals — verified completed HS courses with credits_earned > 0
    const { departments: departmentCredits, unclassified: unclassifiedHsCredits } =
      buildDepartmentCredits(records ?? []);

    // Service hours — grouped by derived academic year
    const { data: serviceRows } = await (supabase as any)
      .from("service_hours")
      .select("hours, service_date")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .order("service_date", { ascending: true });

    const serviceYearMap = new Map<string, number>();
    let totalServiceHours = 0;
    for (const row of (serviceRows ?? []) as any[]) {
      const yr = deriveAcademicYear(row.service_date);
      serviceYearMap.set(yr, Math.round(((serviceYearMap.get(yr) ?? 0) + (row.hours ?? 0)) * 100) / 100);
      totalServiceHours = Math.round((totalServiceHours + (row.hours ?? 0)) * 100) / 100;
    }
    const serviceHours: ServiceYearSummary[] = Array.from(serviceYearMap.entries())
      .map(([schoolYear, hours]) => ({ schoolYear, hours }))
      .sort((a, b) => a.schoolYear.localeCompare(b.schoolYear));

    return {
      success: true,
      data: {
        org: {
          name: org.name,
          logoUrl: org.logo_url ?? null,
          address: safeAddress(org.address),
          phone: org.phone ?? null,
          email: org.email ?? null,
          website: org.website ?? null,
        },
        studentName: `${student.first_name} ${student.last_name}`,
        gradeLevel: student.grade_level ?? null,
        currentSchoolYear: schoolYearLabel,
        generatedAt: new Date().toISOString(),
        historicalGroups,
        currentEnrollments,
        earnedHsCredits: Math.round(earnedHsCredits * 100) / 100,
        currentHsCreditsAttempted: Math.round(currentHsCreditsAttempted * 100) / 100,
        cumulativeGpa,
        departmentCredits,
        unclassifiedHsCredits,
        serviceHours,
        totalServiceHours,
        missingOrgFields: buildMissingOrgFields(org),
      },
    };
  } catch (e) {
    const msg = safeErrorMessage(e);
    // Don't expose internal DB details — log server-side, return safe message
    console.error("[transcript] getTranscriptData error:", msg);
    return {
      success: false,
      error: "Unable to generate transcript. Please try again or contact your administrator.",
    };
  }
}

// ── getEnrollmentSummaryData ──────────────────────────────────────────────────

export async function getEnrollmentSummaryData(
  studentId: string,
): Promise<ActionResult<EnrollmentSummaryData>> {
  try {
    const { supabase, orgId, student } = await assertStaffAndStudent(studentId);

    // Org branding
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .select("name, logo_url, phone, email, website, address")
      .eq("id", orgId)
      .single();
    if (orgErr || !org) throw new Error("Organization not found");

    const schoolYearLabel = await resolveCurrentSchoolYear(supabase, orgId);

    // Active enrollments
    // course_sections: subject (not subject_area), no course_code
    const { data: enrollments, error: enrErr } = await supabase
      .from("curriculum_enrollments")
      .select(`
        id, curriculum_name, subject, status,
        course_sections (
          id, course_name, subject, course_level,
          credits_attempted, counts_toward_high_school_credit,
          teacher_name
        )
      `)
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (enrErr) throw enrErr;

    let hasHsCredit = false;
    const enrollmentRows = ((enrollments ?? []) as any[]).map((enr: any) => {
      const cs = enr.course_sections ?? null;
      const hs = cs?.counts_toward_high_school_credit ?? false;
      if (hs) hasHsCredit = true;
      return {
        id: enr.id,
        courseName: cs?.course_name ?? enr.curriculum_name ?? "Unnamed Course",
        courseCode: null, // course_sections has no course_code column
        subject: cs?.subject ?? enr.subject ?? null,
        term: null,
        courseLevel: cs?.course_level ?? null,
        teacherName: cs?.teacher_name ?? null,
        countsTowardHsCredit: hs,
        creditsAttempted: cs?.credits_attempted ?? null,
      };
    });

    return {
      success: true,
      data: {
        org: {
          name: org.name,
          logoUrl: org.logo_url ?? null,
          address: safeAddress(org.address),
          phone: org.phone ?? null,
          email: org.email ?? null,
          website: org.website ?? null,
        },
        studentName: `${student.first_name} ${student.last_name}`,
        gradeLevel: student.grade_level ?? null,
        currentSchoolYear: schoolYearLabel,
        generatedAt: new Date().toISOString(),
        enrollments: enrollmentRows,
        hasHsCredit,
      },
    };
  } catch (e) {
    const msg = safeErrorMessage(e);
    console.error("[transcript] getEnrollmentSummaryData error:", msg);
    return {
      success: false,
      error: "Unable to generate enrollment summary. Please try again or contact your administrator.",
    };
  }
}
