"use server";

/**
 * Academic Record AI Import — Server Actions
 *
 * Architecture: Option B
 *   AI immediately creates student_course_records with source_type='ai_proposed'
 *   and verification_status='needs_review'. They are unofficial until staff verifies.
 *   The import_id FK links every proposed row back to the import job.
 *
 * Security:
 *   - All actions require staff authentication
 *   - org scope enforced on every query
 *   - student scope enforced (student must be in assertStaff()'s org)
 *   - ANTHROPIC_API_KEY never exposed to browser
 *   - Parents see nothing from this module (no parent portal actions here)
 */

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/constants";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";
import { downloadDriveFile } from "@/lib/drive/driveClient";
import {
  extractAcademicRecord,
  isExtractionConfigured,
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_VERSION,
  type ExtractedCourse,
} from "@/lib/academicExtraction";
import {
  findDuplicates,
  findConflictsWithVerified,
  type MatchableRecord,
} from "@/lib/courseRecordMatching";

// ── Auth helper ───────────────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ImportJob {
  id:                 string;
  organization_id:    string;
  student_id:         string;
  source_document_id: string | null;
  status:             "pending" | "processing" | "completed" | "failed" | "reviewed";
  provider:           string | null;
  model:              string | null;
  prompt_version:     string | null;
  extraction_version: number | null;
  course_count:       number | null;
  error_message:      string | null;
  started_at:         string | null;
  completed_at:       string | null;
  reviewed_by:        string | null;
  reviewed_at:        string | null;
  created_at:         string;
  document_title?:    string;
}

export interface ProposedCourse {
  id:                              string;
  import_id:                       string | null;
  school_year:                     string;
  grade_level:                     string | null;
  institution_name:                string | null;
  institution_type:                string | null;
  course_name:                     string;
  course_code:                     string | null;
  subject_area:                    string | null;
  term:                            string | null;
  course_level:                    string | null;
  semester_1_grade:                string | null;
  semester_2_grade:                string | null;
  final_grade:                     string | null;
  percentage:                      number | null;
  credits_attempted:               number | null;
  credits_earned:                  number | null;
  source_credits_attempted:        number | null;
  source_credits_earned:           number | null;
  source_credit_unit:              string | null;
  counts_toward_high_school_credit: boolean;
  completion_status:               string;
  verification_status:             string;
  source_document_id:              string | null;
  source_notes:                    string | null;
  needs_review_reason:             string | null;
  duplicate_level:                 "none" | "possible" | "strong" | "conflict" | null;
}

export interface ImportJobWithCourses {
  job:     ImportJob;
  courses: ProposedCourse[];
}

// ── List imports for a student ────────────────────────────────────────────────

export async function getImportJobs(
  studentId: string
): Promise<ActionResult<ImportJob[]>> {
  try {
    const { orgId, supabase } = await assertStaff();

    const { data, error } = await (supabase as any)
      .from("academic_record_imports")
      .select(`
        id, organization_id, student_id, source_document_id, status,
        provider, model, prompt_version, extraction_version, course_count,
        error_message, started_at, completed_at, reviewed_by, reviewed_at, created_at,
        student_documents(title)
      `)
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const jobs: ImportJob[] = (data ?? []).map((row: any) => ({
      ...row,
      document_title: row.student_documents?.title ?? null,
      student_documents: undefined,
    }));

    return { success: true, data: jobs };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Get single import with proposed courses ───────────────────────────────────

export async function getImportJob(
  importId: string,
  studentId: string
): Promise<ActionResult<ImportJobWithCourses>> {
  try {
    const { orgId, supabase } = await assertStaff();

    const [jobRes, coursesRes, existingRes] = await Promise.all([
      (supabase as any)
        .from("academic_record_imports")
        .select("id, organization_id, student_id, source_document_id, status, provider, model, prompt_version, extraction_version, course_count, error_message, started_at, completed_at, reviewed_by, reviewed_at, created_at")
        .eq("id", importId)
        .eq("organization_id", orgId)
        .single(),

      (supabase as any)
        .from("student_course_records")
        .select("id, import_id, school_year, grade_level, institution_name, institution_type, course_name, course_code, subject_area, term, course_level, semester_1_grade, semester_2_grade, final_grade, percentage, credits_attempted, credits_earned, source_credits_attempted, source_credits_earned, source_credit_unit, counts_toward_high_school_credit, completion_status, verification_status, source_document_id, source_notes, source_type")
        .eq("import_id", importId)
        .eq("organization_id", orgId)
        .order("school_year", { ascending: false })
        .order("created_at", { ascending: true }),

      // All existing records for this student (for duplicate detection)
      (supabase as any)
        .from("student_course_records")
        .select("id, student_id, school_year, institution_name, course_name, course_code, term, grade_level, course_level, final_grade, semester_1_grade, semester_2_grade, percentage, credits_earned, credits_attempted, source_credits_attempted, source_credits_earned, source_credit_unit, completion_status, counts_toward_high_school_credit, verification_status")
        .eq("student_id", studentId)
        .eq("organization_id", orgId),
    ]);

    if (jobRes.error) throw jobRes.error;
    if (!jobRes.data) return { success: false, error: "Import job not found." };

    const existing: MatchableRecord[] = (existingRes.data ?? []) as MatchableRecord[];
    const proposedRows = (coursesRes.data ?? []) as any[];

    // Annotate each proposed course with duplicate/conflict level
    const courses: ProposedCourse[] = proposedRows.map((row) => {
      const asMatchable: MatchableRecord = {
        id:                              row.id,
        student_id:                      studentId,
        school_year:                     row.school_year,
        institution_name:                row.institution_name,
        course_name:                     row.course_name,
        course_code:                     row.course_code,
        term:                            row.term,
        grade_level:                     row.grade_level,
        course_level:                    row.course_level,
        final_grade:                     row.final_grade,
        semester_1_grade:                row.semester_1_grade,
        semester_2_grade:                row.semester_2_grade,
        percentage:                      row.percentage,
        credits_earned:                  row.credits_earned,
        credits_attempted:               row.credits_attempted,
        source_credits_attempted:        row.source_credits_attempted,
        source_credits_earned:           row.source_credits_earned,
        source_credit_unit:              row.source_credit_unit,
        completion_status:               row.completion_status,
        counts_toward_high_school_credit: row.counts_toward_high_school_credit,
        verification_status:             row.verification_status,
      };

      // Run duplicate + conflict checks (excluding self)
      const duplicates = findDuplicates(asMatchable, existing);
      const conflicts  = findConflictsWithVerified(asMatchable, existing);

      let duplicateLevel: ProposedCourse["duplicate_level"] = "none";
      if (conflicts.length > 0) duplicateLevel = "conflict";
      else if (duplicates.some((d) => d.matchLevel === "strong")) duplicateLevel = "strong";
      else if (duplicates.some((d) => d.matchLevel === "possible")) duplicateLevel = "possible";

      return {
        id:                              row.id,
        import_id:                       row.import_id,
        school_year:                     row.school_year,
        grade_level:                     row.grade_level,
        institution_name:                row.institution_name,
        institution_type:                row.institution_type,
        course_name:                     row.course_name,
        course_code:                     row.course_code,
        subject_area:                    row.subject_area,
        term:                            row.term,
        course_level:                    row.course_level,
        semester_1_grade:                row.semester_1_grade,
        semester_2_grade:                row.semester_2_grade,
        final_grade:                     row.final_grade,
        percentage:                      row.percentage,
        credits_attempted:               row.credits_attempted,
        credits_earned:                  row.credits_earned,
        source_credits_attempted:        row.source_credits_attempted,
        source_credits_earned:           row.source_credits_earned,
        source_credit_unit:              row.source_credit_unit,
        counts_toward_high_school_credit: row.counts_toward_high_school_credit,
        completion_status:               row.completion_status,
        verification_status:             row.verification_status,
        source_document_id:              row.source_document_id,
        source_notes:                    row.source_notes,
        needs_review_reason:             null,
        duplicate_level:                 duplicateLevel,
      };
    });

    return {
      success: true,
      data: { job: jobRes.data as ImportJob, courses },
    };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Check if document was previously analyzed ─────────────────────────────────

export async function checkPriorImport(
  documentId: string,
  studentId: string
): Promise<ActionResult<ImportJob | null>> {
  try {
    const { orgId, supabase } = await assertStaff();

    const { data, error } = await (supabase as any)
      .from("academic_record_imports")
      .select("id, status, created_at, course_count, provider, model")
      .eq("source_document_id", documentId)
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return { success: true, data: data as ImportJob | null };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Request + execute AI import ───────────────────────────────────────────────

export async function requestAcademicImport(
  studentId: string,
  documentId: string
): Promise<ActionResult<{ importId: string; alreadyExists?: ImportJob }>> {
  try {
    const { user, orgId, supabase } = await assertStaff();

    // Verify the document belongs to this student/org
    const { data: doc, error: docErr } = await (supabase as any)
      .from("student_documents")
      .select("id, title, google_drive_id, google_drive_url, external_url, document_type, academic_record_type, academic_school_year")
      .eq("id", documentId)
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .single();

    if (docErr || !doc) return { success: false, error: "Document not found." };

    // Idempotency check — warn about prior completed import
    const priorCheck = await checkPriorImport(documentId, studentId);
    if (priorCheck.success && priorCheck.data?.status === "completed") {
      return {
        success: true,
        data: { importId: priorCheck.data.id, alreadyExists: priorCheck.data },
      };
    }

    // Determine file retrieval method
    const driveId = doc.google_drive_id ?? null;
    if (!driveId) {
      return { success: false, error: "This document has no Google Drive file ID. Only Drive-uploaded documents can be analyzed." };
    }

    if (!isExtractionConfigured()) {
      return { success: false, error: "ANTHROPIC_API_KEY is not configured. Set it in Vercel environment variables." };
    }

    // Create import record
    const { data: importRow, error: insertErr } = await (supabase as any)
      .from("academic_record_imports")
      .insert({
        organization_id:    orgId,
        student_id:         studentId,
        source_document_id: documentId,
        requested_by:       user.id,
        status:             "processing",
        started_at:         new Date().toISOString(),
        provider:           "anthropic",
        model:              "claude-sonnet-5-5",
        prompt_version:     EXTRACTION_PROMPT_VERSION,
        extraction_version: EXTRACTION_VERSION,
      })
      .select("id")
      .single();

    if (insertErr) throw insertErr;
    const importId = (importRow as any).id as string;

    // Log the request
    await logAudit({
      organization_id: orgId,
      actor_id:        user.id,
      action:          "academic_import.requested",
      resource_type:   "academic_record_import",
      resource_id:     importId,
      new_values:      { document_id: documentId, student_id: studentId },
    });

    // Download file from Drive
    const downloadResult = await downloadDriveFile(driveId);
    if (!downloadResult.success) {
      await (supabase as any)
        .from("academic_record_imports")
        .update({ status: "failed", error_message: downloadResult.error, completed_at: new Date().toISOString() })
        .eq("id", importId);
      return { success: false, error: `Could not retrieve file from Google Drive: ${downloadResult.error}` };
    }

    const { buffer, mimeType } = downloadResult.data;
    const docLabel = doc.title
      ? doc.title
      : [doc.academic_school_year, doc.academic_record_type].filter(Boolean).join(" ") || "Academic Record";

    // Run AI extraction
    const extraction = await extractAcademicRecord(buffer, mimeType, docLabel);

    if (!extraction.success) {
      await (supabase as any)
        .from("academic_record_imports")
        .update({
          status:        "failed",
          error_message: extraction.error,
          raw_extraction: extraction.raw,
          completed_at:  new Date().toISOString(),
        })
        .eq("id", importId);

      await logAudit({
        organization_id: orgId,
        actor_id:        user.id,
        action:          "academic_import.failed",
        resource_type:   "academic_record_import",
        resource_id:     importId,
        new_values:      { error: extraction.error },
      });

      return { success: false, error: extraction.error ?? "Extraction failed." };
    }

    // Create proposed course records
    const proposed = extraction.courses.filter((c) => c.course_name);
    const insertRecords = proposed.map((c: ExtractedCourse) => ({
      organization_id:                  orgId,
      student_id:                       studentId,
      import_id:                        importId,
      source_document_id:               documentId,
      source_type:                      "ai_proposed",
      verification_status:              "needs_review",
      created_by:                       user.id,
      updated_by:                       user.id,
      school_year:                      c.school_year ?? "Unknown",
      grade_level:                      c.grade_level ?? null,
      institution_name:                 c.institution_name ?? null,
      institution_type:                 c.institution_type ?? null,
      course_name:                      c.course_name!,
      course_code:                      c.course_code ?? null,
      subject_area:                     c.subject_area ?? null,
      term:                             c.term ?? null,
      course_level:                     c.course_level ?? null,
      semester_1_grade:                 c.semester_1_grade ?? null,
      semester_2_grade:                 c.semester_2_grade ?? null,
      final_grade:                      c.final_grade ?? null,
      percentage:                       c.percentage ?? null,
      credits_attempted:                c.credits_attempted ?? null,
      credits_earned:                   c.credits_earned ?? null,
      source_credits_attempted:         c.source_credits_attempted ?? null,
      source_credits_earned:            c.source_credits_earned ?? null,
      source_credit_unit:               c.source_credit_unit ?? null,
      counts_toward_high_school_credit: c.counts_toward_high_school_credit ?? false,
      completion_status:                c.completion_status ?? "unknown",
      source_notes:                     [c.source_notes, c.needs_review_reason].filter(Boolean).join(" | ") || null,
    }));

    if (insertRecords.length > 0) {
      const { error: insertCoursesErr } = await (supabase as any)
        .from("student_course_records")
        .insert(insertRecords);
      if (insertCoursesErr) throw insertCoursesErr;
    }

    // Update import to completed
    await (supabase as any)
      .from("academic_record_imports")
      .update({
        status:            "completed",
        raw_extraction:    extraction.raw,
        course_count:      insertRecords.length,
        completed_at:      new Date().toISOString(),
        error_message:     null,
      })
      .eq("id", importId);

    await logAudit({
      organization_id: orgId,
      actor_id:        user.id,
      action:          "academic_import.completed",
      resource_type:   "academic_record_import",
      resource_id:     importId,
      new_values:      { course_count: insertRecords.length, model: "claude-sonnet-5-5" },
    });

    revalidatePath(`/dashboard/students/${studentId}`);
    return { success: true, data: { importId } };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Update a proposed course during review ────────────────────────────────────

export async function updateProposedCourse(
  recordId: string,
  studentId: string,
  payload: Partial<{
    school_year: string;
    grade_level: string | null;
    institution_name: string | null;
    course_name: string;
    course_code: string | null;
    term: string | null;
    course_level: string | null;
    semester_1_grade: string | null;
    semester_2_grade: string | null;
    final_grade: string | null;
    percentage: number | null;
    credits_attempted: number | null;
    credits_earned: number | null;
    source_credits_attempted: number | null;
    source_credits_earned: number | null;
    source_credit_unit: string | null;
    counts_toward_high_school_credit: boolean;
    completion_status: string;
    source_notes: string | null;
  }>
): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertStaff();

    // Only allow updating ai_proposed records via this action
    const { data: existing } = await (supabase as any)
      .from("student_course_records")
      .select("source_type, verification_status")
      .eq("id", recordId)
      .eq("organization_id", orgId)
      .single();

    if (existing?.source_type !== "ai_proposed") {
      return { success: false, error: "This action only updates AI-proposed records." };
    }
    if (existing?.verification_status === "verified") {
      return { success: false, error: "Cannot edit a verified record via the import review flow." };
    }

    const { error } = await (supabase as any)
      .from("student_course_records")
      .update({ ...payload, updated_by: user.id })
      .eq("id", recordId)
      .eq("organization_id", orgId);

    if (error) throw error;
    revalidatePath(`/dashboard/students/${studentId}`);
    return { success: true, data: undefined };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Approve (verify) a proposed course ───────────────────────────────────────

export async function approveProposedCourse(
  recordId: string,
  studentId: string
): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertStaff();

    const { error } = await (supabase as any)
      .from("student_course_records")
      .update({
        verification_status: "verified",
        verified_by:         user.id,
        verified_at:         new Date().toISOString(),
        updated_by:          user.id,
      })
      .eq("id", recordId)
      .eq("organization_id", orgId);

    if (error) throw error;

    await logAudit({
      organization_id: orgId,
      actor_id:        user.id,
      action:          "academic_import.course_approved",
      resource_type:   "student_course_record",
      resource_id:     recordId,
    });

    revalidatePath(`/dashboard/students/${studentId}`);
    return { success: true, data: undefined };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Reject a proposed course ──────────────────────────────────────────────────

export async function rejectProposedCourse(
  recordId: string,
  studentId: string
): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertStaff();

    const { error } = await (supabase as any)
      .from("student_course_records")
      .update({
        verification_status: "rejected",
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

// ── Mark import fully reviewed ────────────────────────────────────────────────

export async function markImportReviewed(
  importId: string,
  studentId: string
): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertStaff();

    const { error } = await (supabase as any)
      .from("academic_record_imports")
      .update({
        status:      "reviewed",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", importId)
      .eq("organization_id", orgId);

    if (error) throw error;

    await logAudit({
      organization_id: orgId,
      actor_id:        user.id,
      action:          "academic_import.reviewed",
      resource_type:   "academic_record_import",
      resource_id:     importId,
    });

    revalidatePath(`/dashboard/students/${studentId}`);
    return { success: true, data: undefined };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

// ── Retry a failed import ─────────────────────────────────────────────────────

export async function retryImport(
  importId: string,
  studentId: string
): Promise<ActionResult<{ importId: string }>> {
  try {
    const { orgId, supabase } = await assertStaff();

    // Get the failed import's document
    const { data: job } = await (supabase as any)
      .from("academic_record_imports")
      .select("source_document_id, status")
      .eq("id", importId)
      .eq("organization_id", orgId)
      .single();

    if (!job) return { success: false, error: "Import not found." };
    if (job.status !== "failed") return { success: false, error: "Only failed imports can be retried." };
    if (!job.source_document_id) return { success: false, error: "No source document on this import." };

    // Delete the failed import record and re-request
    await (supabase as any)
      .from("academic_record_imports")
      .delete()
      .eq("id", importId)
      .eq("organization_id", orgId);

    return requestAcademicImport(studentId, job.source_document_id);
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}
