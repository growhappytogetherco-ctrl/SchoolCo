"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { isStaffRole, getRoleLevel } from "@/lib/constants";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";
import {
  findDuplicates, findConflictsWithVerified,
  type MatchableRecord, type DuplicateMatch, type ConflictMatch,
} from "@/lib/courseRecordMatching";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CourseCompletionStatus =
  | "completed" | "withdrawn" | "failed" | "incomplete" | "unknown";

export type CourseVerificationStatus =
  | "needs_review" | "verified" | "rejected";

export type CourseTerm =
  | "full_year" | "semester_1" | "semester_2"
  | "quarter_1" | "quarter_2" | "quarter_3" | "quarter_4"
  | "summer" | "other";

export type CourseLevel =
  | "standard" | "honors" | "ap" | "dual_enrollment";

export type SourceCreditUnit =
  | "high_school_credit" | "college_semester_hours" | "college_quarter_hours" | "other";

export type InstitutionType =
  | "public" | "private" | "homeschool" | "umbrella" | "virtual" | "college" | "rla" | "other";

export interface CourseRecord {
  id: string;
  organization_id: string;
  student_id: string;
  school_year: string;
  grade_level: string | null;
  term: CourseTerm | null;
  institution_name: string | null;
  institution_type: InstitutionType | null;
  course_name: string;
  course_code: string | null;
  subject_area: string | null;
  course_level: CourseLevel | null;
  semester_1_grade: string | null;
  semester_2_grade: string | null;
  final_grade: string | null;
  percentage: number | null;
  credits_attempted: number | null;
  credits_earned: number | null;
  counts_toward_high_school_credit: boolean;
  source_credits_attempted: number | null;
  source_credits_earned: number | null;
  source_credit_unit: SourceCreditUnit | null;
  completion_status: CourseCompletionStatus;
  source_type: "manual_historical" | "ai_proposed" | "schoolco_native";
  source_document_id: string | null;
  import_id: string | null;
  source_notes: string | null;
  verification_status: CourseVerificationStatus;
  verification_notes: string | null;
  verified_by: string | null;
  verified_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddCourseRecordPayload {
  studentId: string;
  schoolYear: string;
  gradeLevel?: string;
  term?: CourseTerm;
  institutionName?: string;
  institutionType?: InstitutionType;
  courseName: string;
  courseCode?: string;
  subjectArea?: string;
  courseLevel?: CourseLevel;
  semester1Grade?: string;
  semester2Grade?: string;
  finalGrade?: string;
  percentage?: number;
  creditsAttempted?: number;
  creditsEarned?: number;
  countsTowardHighSchoolCredit: boolean;
  sourceCreditsAttempted?: number;
  sourceCreditsEarned?: number;
  sourceCreditUnit?: SourceCreditUnit;
  completionStatus: CourseCompletionStatus;
  sourceDocumentId?: string;
  sourceNotes?: string;
}

export interface UpdateCourseRecordPayload {
  schoolYear?: string;
  gradeLevel?: string | null;
  term?: CourseTerm | null;
  institutionName?: string | null;
  institutionType?: InstitutionType | null;
  courseName?: string;
  courseCode?: string | null;
  subjectArea?: string | null;
  courseLevel?: CourseLevel | null;
  semester1Grade?: string | null;
  semester2Grade?: string | null;
  finalGrade?: string | null;
  percentage?: number | null;
  creditsAttempted?: number | null;
  creditsEarned?: number | null;
  countsTowardHighSchoolCredit?: boolean;
  sourceCreditsAttempted?: number | null;
  sourceCreditsEarned?: number | null;
  sourceCreditUnit?: SourceCreditUnit | null;
  completionStatus?: CourseCompletionStatus;
  sourceDocumentId?: string | null;
  sourceNotes?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertStaff() {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");

  const orgId = await getActiveOrgId();
  if (!orgId) throw new Error("No active org");

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const role = (member as unknown as { role: string } | null)?.role ?? "";
  if (!isStaffRole(role)) throw new Error("Unauthorized");

  return { user, orgId, supabase, role };
}

// ── Source document types ─────────────────────────────────────────────────────

export interface SourceDocumentOption {
  id: string;
  label: string;          // e.g. "2024–2025 Academic Achievement Record — Transcript"
  schoolYear: string;
  recordType: string;
  googleDriveUrl: string | null;
  externalUrl: string | null;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getCourseRecords(
  studentId: string
): Promise<ActionResult<CourseRecord[]>> {
  try {
    const { orgId, supabase } = await assertStaff();

    const { data, error } = await (supabase as any)
      .from("student_course_records")
      .select("*")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .order("school_year", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) throw error;
    return { success: true, data: (data ?? []) as CourseRecord[] };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function addCourseRecord(
  payload: AddCourseRecordPayload
): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, orgId, supabase } = await assertStaff();

    const { data, error } = await (supabase as any)
      .from("student_course_records")
      .insert({
        organization_id:                  orgId,
        student_id:                       payload.studentId,
        school_year:                      payload.schoolYear,
        grade_level:                      payload.gradeLevel ?? null,
        term:                             payload.term ?? null,
        institution_name:                 payload.institutionName ?? null,
        institution_type:                 payload.institutionType ?? null,
        course_name:                      payload.courseName,
        course_code:                      payload.courseCode ?? null,
        subject_area:                     payload.subjectArea ?? null,
        course_level:                     payload.courseLevel ?? null,
        semester_1_grade:                 payload.semester1Grade ?? null,
        semester_2_grade:                 payload.semester2Grade ?? null,
        final_grade:                      payload.finalGrade ?? null,
        percentage:                       payload.percentage ?? null,
        credits_attempted:                payload.creditsAttempted ?? null,
        credits_earned:                   payload.creditsEarned ?? null,
        counts_toward_high_school_credit: payload.countsTowardHighSchoolCredit,
        source_credits_attempted:         payload.sourceCreditsAttempted ?? null,
        source_credits_earned:            payload.sourceCreditsEarned ?? null,
        source_credit_unit:               payload.sourceCreditUnit ?? null,
        completion_status:                payload.completionStatus,
        source_type:                      "manual_historical",
        source_document_id:               payload.sourceDocumentId ?? null,
        source_notes:                     payload.sourceNotes ?? null,
        verification_status:              "needs_review",
        created_by:                       user.id,
        updated_by:                       user.id,
      })
      .select("id")
      .single();

    if (error) throw error;
    const row = data as unknown as { id: string };
    revalidatePath(`/dashboard/students/${payload.studentId}`);
    return { success: true, data: { id: row.id } };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateCourseRecord(
  recordId: string,
  payload: UpdateCourseRecordPayload
): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertStaff();

    const updateData: Record<string, unknown> = { updated_by: user.id };
    if (payload.schoolYear       !== undefined) updateData.school_year         = payload.schoolYear;
    if (payload.gradeLevel       !== undefined) updateData.grade_level         = payload.gradeLevel;
    if (payload.term             !== undefined) updateData.term                = payload.term;
    if (payload.institutionName  !== undefined) updateData.institution_name    = payload.institutionName;
    if (payload.institutionType  !== undefined) updateData.institution_type    = payload.institutionType;
    if (payload.courseName       !== undefined) updateData.course_name         = payload.courseName;
    if (payload.courseCode       !== undefined) updateData.course_code         = payload.courseCode;
    if (payload.subjectArea      !== undefined) updateData.subject_area        = payload.subjectArea;
    if (payload.courseLevel      !== undefined) updateData.course_level        = payload.courseLevel;
    if (payload.semester1Grade   !== undefined) updateData.semester_1_grade    = payload.semester1Grade;
    if (payload.semester2Grade   !== undefined) updateData.semester_2_grade    = payload.semester2Grade;
    if (payload.finalGrade       !== undefined) updateData.final_grade         = payload.finalGrade;
    if (payload.percentage       !== undefined) updateData.percentage          = payload.percentage;
    if (payload.creditsAttempted !== undefined) updateData.credits_attempted   = payload.creditsAttempted;
    if (payload.creditsEarned    !== undefined) updateData.credits_earned      = payload.creditsEarned;
    if (payload.countsTowardHighSchoolCredit !== undefined) {
      updateData.counts_toward_high_school_credit = payload.countsTowardHighSchoolCredit;
    }
    if (payload.sourceCreditsAttempted !== undefined) updateData.source_credits_attempted = payload.sourceCreditsAttempted;
    if (payload.sourceCreditsEarned    !== undefined) updateData.source_credits_earned    = payload.sourceCreditsEarned;
    if (payload.sourceCreditUnit       !== undefined) updateData.source_credit_unit       = payload.sourceCreditUnit;
    if (payload.completionStatus !== undefined) updateData.completion_status   = payload.completionStatus;
    if (payload.sourceDocumentId !== undefined) updateData.source_document_id  = payload.sourceDocumentId;
    if (payload.sourceNotes      !== undefined) updateData.source_notes        = payload.sourceNotes;

    const { error } = await (supabase as any)
      .from("student_course_records")
      .update(updateData)
      .eq("id", recordId)
      .eq("organization_id", orgId);

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Verify / Review workflow ──────────────────────────────────────────────────

export async function verifyCourseRecord(
  recordId: string,
  studentId: string,
  notes?: string
): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertStaff();

    const { error } = await (supabase as any)
      .from("student_course_records")
      .update({
        verification_status: "verified",
        verification_notes:  notes ?? null,
        verified_by:         user.id,
        verified_at:         new Date().toISOString(),
        updated_by:          user.id,
      })
      .eq("id", recordId)
      .eq("organization_id", orgId);

    if (error) throw error;
    revalidatePath(`/dashboard/students/${studentId}`);
    return { success: true, data: undefined };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

export async function markCourseRecordNeedsReview(
  recordId: string,
  studentId: string,
  notes?: string
): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertStaff();

    const { error } = await (supabase as any)
      .from("student_course_records")
      .update({
        verification_status: "needs_review",
        verification_notes:  notes ?? null,
        verified_by:         null,
        verified_at:         null,
        updated_by:          user.id,
      })
      .eq("id", recordId)
      .eq("organization_id", orgId);

    if (error) throw error;
    revalidatePath(`/dashboard/students/${studentId}`);
    return { success: true, data: undefined };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

export async function rejectCourseRecord(
  recordId: string,
  studentId: string,
  notes?: string
): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertStaff();

    const { error } = await (supabase as any)
      .from("student_course_records")
      .update({
        verification_status: "rejected",
        verification_notes:  notes ?? null,
        verified_by:         user.id,
        verified_at:         new Date().toISOString(),
        updated_by:          user.id,
      })
      .eq("id", recordId)
      .eq("organization_id", orgId);

    if (error) throw error;
    revalidatePath(`/dashboard/students/${studentId}`);
    return { success: true, data: undefined };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteCourseRecord(
  recordId: string,
  studentId: string
): Promise<ActionResult<void>> {
  try {
    const { orgId, supabase } = await assertStaff();

    const { error } = await (supabase as any)
      .from("student_course_records")
      .delete()
      .eq("id", recordId)
      .eq("organization_id", orgId);

    if (error) throw error;
    revalidatePath(`/dashboard/students/${studentId}`);
    return { success: true, data: undefined };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Source document picker ────────────────────────────────────────────────────

const RECORD_TYPE_LABELS: Record<string, string> = {
  progress_report:            "Progress Report",
  report_card:                "Report Card",
  transcript:                 "Transcript",
  academic_summary:           "Academic Summary",
  assessment_report:          "Assessment Report",
  academic_achievement_record:"Academic Achievement Record",
  other_academic:             "Other Academic",
};

export async function getSourceDocumentsForStudent(
  studentId: string
): Promise<ActionResult<SourceDocumentOption[]>> {
  try {
    const { orgId, supabase } = await assertStaff();

    const { data, error } = await (supabase as any)
      .from("student_documents")
      .select("id, title, academic_record_type, academic_school_year, academic_reporting_period, google_drive_url, external_url")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("document_type", "academic_record")
      .order("academic_school_year", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    const options: SourceDocumentOption[] = (data ?? []).map((d: any) => {
      const typeLabel = RECORD_TYPE_LABELS[d.academic_record_type] ?? d.academic_record_type ?? "Document";
      const period    = d.academic_reporting_period ? ` (${d.academic_reporting_period})` : "";
      const yearPart  = d.academic_school_year ? `${d.academic_school_year} ` : "";
      const label     = d.title
        ? `${d.title}${period}`
        : `${yearPart}${typeLabel}${period}`;
      return {
        id:             d.id,
        label,
        schoolYear:     d.academic_school_year ?? "",
        recordType:     d.academic_record_type ?? "",
        googleDriveUrl: d.google_drive_url ?? null,
        externalUrl:    d.external_url ?? null,
      };
    });

    return { success: true, data: options };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

export async function getSourceDocumentUrl(
  documentId: string
): Promise<ActionResult<string>> {
  try {
    const { orgId, supabase } = await assertStaff();

    const { data, error } = await (supabase as any)
      .from("student_documents")
      .select("google_drive_url, external_url")
      .eq("id", documentId)
      .eq("organization_id", orgId)
      .single();

    if (error) throw error;
    const url = data?.google_drive_url ?? data?.external_url ?? null;
    if (!url) return { success: false, error: "No URL available for this document." };
    return { success: true, data: url };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Duplicate / conflict detection ───────────────────────────────────────────

export interface DuplicateCheckResult {
  duplicates: DuplicateMatch[];
  conflicts: ConflictMatch[];
}

export async function checkCourseRecordDuplicates(
  studentId: string,
  proposed: Omit<MatchableRecord, "id" | "student_id">,
  excludeRecordId?: string
): Promise<ActionResult<DuplicateCheckResult>> {
  try {
    const { orgId, supabase } = await assertStaff();

    const { data, error } = await (supabase as any)
      .from("student_course_records")
      .select("id, student_id, school_year, institution_name, course_name, course_code, term, grade_level, course_level, final_grade, semester_1_grade, semester_2_grade, credits_earned, credits_attempted, completion_status, counts_toward_high_school_credit, verification_status")
      .eq("student_id", studentId)
      .eq("organization_id", orgId);

    if (error) throw error;

    const existing: MatchableRecord[] = (data ?? []) as MatchableRecord[];
    const proposedRecord: MatchableRecord = {
      id: excludeRecordId ?? "__proposed__",
      student_id: studentId,
      ...proposed,
    };

    const duplicates = findDuplicates(proposedRecord, existing);
    const conflicts  = findConflictsWithVerified(proposedRecord, existing);

    return { success: true, data: { duplicates, conflicts } };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Verified-record update (registrar+ only, with audit) ─────────────────────

export async function updateVerifiedCourseRecord(
  recordId: string,
  studentId: string,
  payload: UpdateCourseRecordPayload
): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase, role } = await assertStaff();

    // Registrar or above required for verified records
    if (getRoleLevel(role) < getRoleLevel("registrar")) {
      return { success: false, error: "Editing verified records requires Registrar role or above." };
    }

    // Fetch existing for audit trail
    const { data: existing, error: fetchErr } = await (supabase as any)
      .from("student_course_records")
      .select("*")
      .eq("id", recordId)
      .eq("organization_id", orgId)
      .single();

    if (fetchErr) throw fetchErr;
    if (!existing) return { success: false, error: "Record not found." };

    const updateData: Record<string, unknown> = { updated_by: user.id };
    if (payload.schoolYear       !== undefined) updateData.school_year         = payload.schoolYear;
    if (payload.gradeLevel       !== undefined) updateData.grade_level         = payload.gradeLevel;
    if (payload.term             !== undefined) updateData.term                = payload.term;
    if (payload.institutionName  !== undefined) updateData.institution_name    = payload.institutionName;
    if (payload.institutionType  !== undefined) updateData.institution_type    = payload.institutionType;
    if (payload.courseName       !== undefined) updateData.course_name         = payload.courseName;
    if (payload.courseCode       !== undefined) updateData.course_code         = payload.courseCode;
    if (payload.subjectArea      !== undefined) updateData.subject_area        = payload.subjectArea;
    if (payload.courseLevel      !== undefined) updateData.course_level        = payload.courseLevel;
    if (payload.semester1Grade   !== undefined) updateData.semester_1_grade    = payload.semester1Grade;
    if (payload.semester2Grade   !== undefined) updateData.semester_2_grade    = payload.semester2Grade;
    if (payload.finalGrade       !== undefined) updateData.final_grade         = payload.finalGrade;
    if (payload.percentage       !== undefined) updateData.percentage          = payload.percentage;
    if (payload.creditsAttempted !== undefined) updateData.credits_attempted   = payload.creditsAttempted;
    if (payload.creditsEarned    !== undefined) updateData.credits_earned      = payload.creditsEarned;
    if (payload.countsTowardHighSchoolCredit !== undefined) {
      updateData.counts_toward_high_school_credit = payload.countsTowardHighSchoolCredit;
    }
    if (payload.sourceCreditsAttempted !== undefined) updateData.source_credits_attempted = payload.sourceCreditsAttempted;
    if (payload.sourceCreditsEarned    !== undefined) updateData.source_credits_earned    = payload.sourceCreditsEarned;
    if (payload.sourceCreditUnit       !== undefined) updateData.source_credit_unit       = payload.sourceCreditUnit;
    if (payload.completionStatus !== undefined) updateData.completion_status   = payload.completionStatus;
    if (payload.sourceDocumentId !== undefined) updateData.source_document_id  = payload.sourceDocumentId;
    if (payload.sourceNotes      !== undefined) updateData.source_notes        = payload.sourceNotes;

    const { error } = await (supabase as any)
      .from("student_course_records")
      .update(updateData)
      .eq("id", recordId)
      .eq("organization_id", orgId);

    if (error) throw error;

    // Audit trail for verified-record edits
    await logAudit({
      organization_id: orgId,
      actor_id:        user.id,
      action:          "course_record.verified_edited",
      resource_type:   "student_course_record",
      resource_id:     recordId,
      previous_values: {
        course_name:     existing.course_name,
        final_grade:     existing.final_grade,
        credits_earned:  existing.credits_earned,
        completion_status: existing.completion_status,
        verification_status: existing.verification_status,
      },
      new_values:      {
        ...Object.fromEntries(
          Object.entries(updateData).filter(([k]) => k !== "updated_by")
        ),
      },
    });

    revalidatePath(`/dashboard/students/${studentId}`);
    return { success: true, data: undefined };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}
