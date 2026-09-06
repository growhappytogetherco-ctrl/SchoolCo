"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { uploadFileToDrive, deleteDriveFile, isDriveConfigured } from "@/lib/drive/driveClient";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AcademicRecordType =
  | "progress_report"
  | "report_card"
  | "transcript"
  | "academic_summary"
  | "assessment_report"
  | "other_academic";

export type AcademicReportingPeriod =
  | "q1" | "q2" | "q3" | "q4"
  | "semester_1" | "semester_2"
  | "full_year" | "mid_year" | "beginning_of_year" | "end_of_year"
  | "other";

export type AcademicRecordSource =
  | "legacy_upload"
  | "schoolco_generated"
  | "external_school";

// Payload for link-only records (legacy external link path)
export interface AcademicDocumentLinkPayload {
  studentId:       string;
  title:           string;
  recordType:      AcademicRecordType;
  schoolYear:      string;
  reportingPeriod: AcademicReportingPeriod | null;
  recordDate:      string | null;
  recordSource:    AcademicRecordSource;
  parentVisible:   boolean;
  googleDriveUrl?: string;
  googleDriveId?:  string;
  externalUrl?:    string;
}

// Payload for direct file upload path
export interface AcademicDocumentFilePayload {
  studentId:       string;
  title:           string;
  recordType:      AcademicRecordType;
  schoolYear:      string;
  reportingPeriod: AcademicReportingPeriod | null;
  recordDate:      string | null;
  recordSource:    AcademicRecordSource;
  parentVisible:   boolean;
  // File data (base64-encoded, same pattern as uploadWorkSampleFile)
  fileBase64:      string;
  fileName:        string;
  mimeType:        string;
}

export interface AcademicHistoryItem {
  id:              string;
  title:           string;
  recordType:      AcademicRecordType;
  recordTypeLabel: string;
  schoolYear:      string;
  reportingPeriod: AcademicReportingPeriod | null;
  periodLabel:     string | null;
  recordDate:      string | null;
  recordSource:    AcademicRecordSource;
  sourceLabel:     string;
  parentVisible:   boolean;
  googleDriveUrl:  string | null;
  googleDriveId:   string | null;
  externalUrl:     string | null;
  createdAt:       string;
}

// ── Label maps ────────────────────────────────────────────────────────────────

export const ACADEMIC_RECORD_TYPE_LABELS: Record<AcademicRecordType, string> = {
  progress_report:   "Progress Report",
  report_card:       "Report Card",
  transcript:        "Transcript",
  academic_summary:  "Academic Summary",
  assessment_report: "Assessment Report",
  other_academic:    "Other Academic Record",
};

export const ACADEMIC_REPORTING_PERIOD_LABELS: Record<AcademicReportingPeriod, string> = {
  q1:               "Q1",
  q2:               "Q2",
  q3:               "Q3",
  q4:               "Q4",
  semester_1:       "Semester 1",
  semester_2:       "Semester 2",
  full_year:        "Full Year",
  mid_year:         "Mid-Year",
  beginning_of_year:"Beginning of Year",
  end_of_year:      "End of Year",
  other:            "Other",
};

export const ACADEMIC_RECORD_SOURCE_LABELS: Record<AcademicRecordSource, string> = {
  legacy_upload:      "Uploaded Historical Record",
  schoolco_generated: "SchoolCo Report",
  external_school:    "External School Record",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDriveFileId(url: string): string | null {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Build a clean Drive filename from academic metadata.
 * Falls back to original filename if fields are missing.
 */
function buildDriveFileName(
  originalName: string,
  recordType: AcademicRecordType,
  schoolYear: string,
  period: AcademicReportingPeriod | null,
): string {
  const ext = originalName.includes(".") ? originalName.split(".").pop()! : "pdf";
  const typePart = ACADEMIC_RECORD_TYPE_LABELS[recordType].replace(/\s+/g, "_");
  const yearPart = schoolYear.replace(/[–—]/g, "-").replace(/\s+/g, "");
  const periodPart = period ? `_${ACADEMIC_REPORTING_PERIOD_LABELS[period].replace(/\s+/g, "_")}` : "";
  return `${typePart}${periodPart}_${yearPart}.${ext}`;
}

async function assertStaff(orgId: string): Promise<{ userId: string } | { error: string }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const staffRoles = ["teacher", "staff", "registrar", "admin", "full_admin", "platform_admin"];
  if (!member || !staffRoles.includes(member.role as string)) {
    return { error: "Insufficient permissions" };
  }
  return { userId: user.id };
}

async function insertDocumentRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  params: {
    studentId:       string;
    title:           string;
    recordType:      AcademicRecordType;
    schoolYear:      string;
    reportingPeriod: AcademicReportingPeriod | null;
    recordDate:      string | null;
    recordSource:    AcademicRecordSource;
    parentVisible:   boolean;
    driveFileId:     string | null;
    driveFileUrl:    string | null;
    externalUrl:     string | null;
  },
): Promise<ActionResult<{ documentId: string }>> {
  const visibility = params.parentVisible ? "parent_visible" : "internal";
  const { data, error } = await supabase
    .from("student_documents")
    .insert({
      organization_id:            orgId,
      student_id:                 params.studentId,
      title:                      params.title.trim(),
      document_type:              "academic_record",
      google_drive_id:            params.driveFileId,
      google_drive_url:           params.driveFileUrl,
      external_url:               params.externalUrl,
      staff_only:                 !params.parentVisible,
      shared_with_family:         params.parentVisible,
      visibility,
      academic_record_type:       params.recordType,
      academic_school_year:       params.schoolYear.trim(),
      academic_reporting_period:  params.reportingPeriod ?? null,
      academic_record_date:       params.recordDate ?? null,
      academic_record_source:     params.recordSource,
      uploaded_by:                userId,
    } as never)
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data: { documentId: (data as any).id } };
}

// ── Direct file upload ────────────────────────────────────────────────────────
// Primary path: file is base64-encoded by the client, uploaded to the student's
// existing "02 Academic Records" Drive subfolder, then a student_documents row
// is created. If the DB insert fails after a successful Drive upload, the Drive
// file is deleted to avoid orphans.

export async function uploadAcademicDocumentFile(
  payload: AcademicDocumentFilePayload,
): Promise<ActionResult<{ documentId: string; driveFileUrl: string }>> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization" };

  const authResult = await assertStaff(orgId);
  if ("error" in authResult) return { success: false, error: authResult.error };

  if (!payload.title.trim())      return { success: false, error: "Title is required" };
  if (!payload.schoolYear.trim()) return { success: false, error: "School year is required" };
  if (!payload.fileBase64)        return { success: false, error: "No file data received" };

  const supabase = await createClient();

  if (!isDriveConfigured()) {
    return { success: false, error: "Google Drive is not configured. Contact your administrator." };
  }

  // Resolve the student's "academic_records" subfolder ID
  const { data: driveFolder } = await supabase
    .from("student_drive_folders")
    .select("google_drive_folder_id")
    .eq("student_id", payload.studentId)
    .eq("folder_key", "academic_records")
    .single();

  if (!driveFolder?.google_drive_folder_id) {
    // Folder row missing — student's Drive structure needs provisioning
    return {
      success: false,
      error:   "This student's Drive folder has not been set up yet. Go to the Documents tab and create the student's Drive folder first, then try again.",
      // errorCode exposed so modal can show the provision button
    } as ActionResult<never> & { errorCode?: string };
  }

  const folderIdStr = driveFolder.google_drive_folder_id as string;

  // Build a clean filename
  const cleanFileName = buildDriveFileName(
    payload.fileName,
    payload.recordType,
    payload.schoolYear,
    payload.reportingPeriod,
  );

  const buffer = Buffer.from(payload.fileBase64, "base64");
  const uploadResult = await uploadFileToDrive(buffer, cleanFileName, payload.mimeType, folderIdStr);

  if (!uploadResult.success) {
    return { success: false, error: `Drive upload failed: ${uploadResult.error}` };
  }

  const { fileId, fileUrl } = uploadResult.data;

  // Now write the DB row. If this fails, clean up the Drive file.
  const dbResult = await insertDocumentRow(supabase, orgId, authResult.userId, {
    studentId:       payload.studentId,
    title:           payload.title,
    recordType:      payload.recordType,
    schoolYear:      payload.schoolYear,
    reportingPeriod: payload.reportingPeriod,
    recordDate:      payload.recordDate,
    recordSource:    payload.recordSource,
    parentVisible:   payload.parentVisible,
    driveFileId:     fileId,
    driveFileUrl:    fileUrl,
    externalUrl:     null,
  });

  if (!dbResult.success) {
    // Best-effort cleanup — delete the just-uploaded Drive file to avoid orphan
    await deleteDriveFile(fileId).catch(() => {});
    return { success: false, error: `Record save failed: ${dbResult.error}. The uploaded file has been removed from Drive.` };
  }

  revalidatePath(`/dashboard/students/${payload.studentId}`);
  return { success: true, data: { documentId: dbResult.data.documentId, driveFileUrl: fileUrl } };
}

// ── Link-only upload (secondary / external path) ──────────────────────────────

export async function uploadAcademicDocumentLink(
  payload: AcademicDocumentLinkPayload,
): Promise<ActionResult<{ documentId: string }>> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization" };

  const authResult = await assertStaff(orgId);
  if ("error" in authResult) return { success: false, error: authResult.error };

  if (!payload.title.trim())      return { success: false, error: "Title is required" };
  if (!payload.schoolYear.trim()) return { success: false, error: "School year is required" };
  if (!payload.googleDriveUrl && !payload.googleDriveId && !payload.externalUrl) {
    return { success: false, error: "A Google Drive link or external URL is required" };
  }

  const supabase = await createClient();

  let driveFileId = payload.googleDriveId ?? null;
  let driveFileUrl = payload.googleDriveUrl ?? null;
  if (!driveFileId && driveFileUrl) driveFileId = extractDriveFileId(driveFileUrl);
  if (driveFileId && !driveFileUrl) driveFileUrl = `https://drive.google.com/file/d/${driveFileId}/view`;

  const dbResult = await insertDocumentRow(supabase, orgId, authResult.userId, {
    studentId:       payload.studentId,
    title:           payload.title,
    recordType:      payload.recordType,
    schoolYear:      payload.schoolYear,
    reportingPeriod: payload.reportingPeriod,
    recordDate:      payload.recordDate,
    recordSource:    payload.recordSource,
    parentVisible:   payload.parentVisible,
    driveFileId,
    driveFileUrl,
    externalUrl:     payload.externalUrl ?? null,
  });

  if (!dbResult.success) return dbResult;

  revalidatePath(`/dashboard/students/${payload.studentId}`);
  return dbResult;
}

// ── Duplicate detection ───────────────────────────────────────────────────────

export async function checkAcademicDocumentDuplicate(
  studentId: string,
  recordType: AcademicRecordType,
  schoolYear: string,
  reportingPeriod: AcademicReportingPeriod | null,
): Promise<ActionResult<{ hasDuplicate: boolean; existingTitle: string | null }>> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization" };

  const supabase = await createClient();
  let query = supabase
    .from("student_documents")
    .select("id, title")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("document_type", "academic_record")
    .eq("academic_record_type", recordType)
    .eq("academic_school_year", schoolYear);

  if (reportingPeriod) query = query.eq("academic_reporting_period", reportingPeriod);

  const { data } = await query.limit(1);
  const found = data?.[0] as any;
  return {
    success: true,
    data: { hasDuplicate: !!found, existingTitle: found?.title ?? null },
  };
}

// ── Read: academic documents for staff ───────────────────────────────────────

export async function getStudentAcademicDocuments(
  studentId: string,
): Promise<ActionResult<AcademicHistoryItem[]>> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization" };

  const authResult = await assertStaff(orgId);
  if ("error" in authResult) return { success: false, error: authResult.error };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_documents")
    .select("id, title, academic_record_type, academic_school_year, academic_reporting_period, academic_record_date, academic_record_source, visibility, google_drive_id, google_drive_url, external_url, created_at")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("document_type", "academic_record")
    .order("academic_school_year", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  return { success: true, data: mapToHistoryItems(data ?? []) };
}

// ── Read: academic documents for parent ──────────────────────────────────────

export async function getMyChildAcademicDocuments(
  studentId: string,
): Promise<ActionResult<AcademicHistoryItem[]>> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization" };

  const supabase = await createClient();

  const { data: guardianship } = await supabase
    .from("guardianships")
    .select("id")
    .eq("guardian_profile_id", user.id)
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  if (!guardianship) return { success: false, error: "Access denied" };

  const { data, error } = await supabase
    .from("student_documents")
    .select("id, title, academic_record_type, academic_school_year, academic_reporting_period, academic_record_date, academic_record_source, google_drive_url, external_url, created_at")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("document_type", "academic_record")
    .eq("visibility", "parent_visible")
    .order("academic_school_year", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    data: (data ?? []).map((d: any) => ({
      id:              d.id,
      title:           d.title,
      recordType:      d.academic_record_type as AcademicRecordType,
      recordTypeLabel: ACADEMIC_RECORD_TYPE_LABELS[d.academic_record_type as AcademicRecordType] ?? d.academic_record_type,
      schoolYear:      d.academic_school_year ?? "",
      reportingPeriod: d.academic_reporting_period as AcademicReportingPeriod | null,
      periodLabel:     d.academic_reporting_period
        ? (ACADEMIC_REPORTING_PERIOD_LABELS[d.academic_reporting_period as AcademicReportingPeriod] ?? d.academic_reporting_period)
        : null,
      recordDate:      d.academic_record_date,
      recordSource:    d.academic_record_source as AcademicRecordSource,
      sourceLabel:     ACADEMIC_RECORD_SOURCE_LABELS[d.academic_record_source as AcademicRecordSource] ?? d.academic_record_source,
      parentVisible:   true,
      googleDriveUrl:  d.google_drive_url,
      googleDriveId:   null,
      externalUrl:     d.external_url,
      createdAt:       d.created_at,
    })),
  };
}

// ── Shared mapping helper ─────────────────────────────────────────────────────

function mapToHistoryItems(rows: any[]): AcademicHistoryItem[] {
  return rows.map((d) => ({
    id:              d.id,
    title:           d.title,
    recordType:      d.academic_record_type as AcademicRecordType,
    recordTypeLabel: ACADEMIC_RECORD_TYPE_LABELS[d.academic_record_type as AcademicRecordType] ?? d.academic_record_type,
    schoolYear:      d.academic_school_year ?? "",
    reportingPeriod: d.academic_reporting_period as AcademicReportingPeriod | null,
    periodLabel:     d.academic_reporting_period
      ? (ACADEMIC_REPORTING_PERIOD_LABELS[d.academic_reporting_period as AcademicReportingPeriod] ?? d.academic_reporting_period)
      : null,
    recordDate:      d.academic_record_date,
    recordSource:    d.academic_record_source as AcademicRecordSource,
    sourceLabel:     ACADEMIC_RECORD_SOURCE_LABELS[d.academic_record_source as AcademicRecordSource] ?? d.academic_record_source,
    parentVisible:   d.visibility === "parent_visible",
    googleDriveUrl:  d.google_drive_url,
    googleDriveId:   d.google_drive_id,
    externalUrl:     d.external_url,
    createdAt:       d.created_at,
  }));
}
