"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import {
  createStudentFolderTree, isDriveConfigured, ensureOrgDriveStructure,
  getDriveFileMetadata, uploadFileToDrive, deleteDriveFile,
} from "@/lib/drive/driveClient";
import { STUDENT_SUBFOLDERS, getSubfolder, getOrgFolderName } from "@/lib/drive/types";
import type { WorkSample, Visibility } from "@/lib/drive/types";

// ─── Org Drive structure ──────────────────────────────────────────────────────

/**
 * Internal helper: ensure org Drive structure exists and persist any new folder IDs
 * to org_drive_folders. No role check — caller must be authenticated.
 */
async function _ensureOrgDriveInDB(
  orgId: string,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ success: true; folderMap: Record<string, string> } | { success: false; error: string }> {
  // Load existing folder IDs from DB (fast path — avoids Drive API calls)
  const { data: existingRows } = await supabase
    .from("org_drive_folders")
    .select("folder_key, google_drive_folder_id")
    .eq("organization_id", orgId);

  const existingMap: Record<string, string> = {};
  for (const row of existingRows ?? []) {
    existingMap[row.folder_key as string] = row.google_drive_folder_id as string;
  }

  const result = await ensureOrgDriveStructure(orgId, existingMap);
  if (!result.success) return { success: false, error: result.error };

  // Upsert only the folders that were newly created
  const newEntries = Object.entries(result.data).filter(([key]) => !existingMap[key]);
  if (newEntries.length > 0) {
    const toUpsert = newEntries.map(([key, folderId]) => ({
      organization_id:         orgId,
      folder_key:              key,
      folder_name:             getOrgFolderName(key),
      google_drive_folder_id:  folderId,
      google_drive_folder_url: `https://drive.google.com/drive/folders/${folderId}`,
      provisioned_by:          userId,
      provisioned_at:          new Date().toISOString(),
    }));
    await supabase.from("org_drive_folders").upsert(toUpsert as never, { onConflict: "organization_id,folder_key" });
  }

  return { success: true, folderMap: result.data };
}

/**
 * Return all org Drive folders stored in the database.
 */
export async function getOrgDriveFolders(): Promise<
  Array<{ key: string; name: string; folderId: string; url: string }>
> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("org_drive_folders")
    .select("folder_key, folder_name, google_drive_folder_id, google_drive_folder_url")
    .eq("organization_id", orgId)
    .order("folder_key");

  return (data ?? []).map((r) => ({
    key:      r.folder_key as string,
    name:     r.folder_name as string,
    folderId: r.google_drive_folder_id as string,
    url:      r.google_drive_folder_url as string,
  }));
}

/**
 * Admin action: create any missing org-level Drive folders and persist results.
 * Safe to call repeatedly — fully idempotent.
 */
export async function provisionOrgDriveStructure(): Promise<
  { success: true; created: number; existing: number; total: number }
  | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  if (!member || !["admin","full_admin","platform_admin"].includes(member.role as string)) {
    return { success: false, error: "Administrator access required" };
  }

  if (!isDriveConfigured()) {
    return { success: false, error: "Google Drive credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_ROOT_FOLDER_ID in your environment variables." };
  }

  // Count folders before provisioning so we can report created vs. existing
  const { data: before } = await supabase
    .from("org_drive_folders")
    .select("folder_key", { count: "exact", head: true })
    .eq("organization_id", orgId);
  const existingBefore = (before as unknown as number | null) ?? 0;

  const result = await _ensureOrgDriveInDB(orgId, user.id, supabase);
  if (!result.success) return { success: false, error: result.error };

  const total   = Object.keys(result.folderMap).length;
  const created = total - existingBefore;
  return { success: true, created: Math.max(0, created), existing: Math.min(total, existingBefore), total };
}

/**
 * Return current Drive configuration and provisioning status.
 */
export async function getDriveStatus(): Promise<{
  configured: boolean;
  provisionedFolderCount: number;
  totalExpectedFolders: number;
  folders: Array<{ key: string; name: string; folderId: string; url: string }>;
}> {
  const orgId = await getActiveOrgId();

  let folders: Array<{ key: string; name: string; folderId: string; url: string }> = [];
  if (orgId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("org_drive_folders")
      .select("folder_key, folder_name, google_drive_folder_id, google_drive_folder_url")
      .eq("organization_id", orgId)
      .order("folder_key");
    folders = (data ?? []).map((r) => ({
      key:      r.folder_key as string,
      name:     r.folder_name as string,
      folderId: r.google_drive_folder_id as string,
      url:      r.google_drive_folder_url as string,
    }));
  }

  // Count total expected folders from spec
  function countSpec(specs: import("@/lib/drive/types").OrgFolderSpec[]): number {
    return specs.reduce((n, s) => n + 1 + countSpec(s.children ?? []), 0);
  }
  const { ORG_FOLDER_STRUCTURE } = await import("@/lib/drive/types");
  const totalExpectedFolders = countSpec(ORG_FOLDER_STRUCTURE);

  return {
    configured: isDriveConfigured(),
    provisionedFolderCount: folders.length,
    totalExpectedFolders,
    folders,
  };
}

// ─── Student Drive folder management ─────────────────────────────────────────

/**
 * Create the standard 13-subfolder Drive tree for a student, under Students/.
 * Idempotent — if folder already exists anywhere in Drive, reuses it.
 * Auto-provisions the org folder structure if the Students/ folder is not yet
 * recorded in the database.
 */
export async function createStudentDriveFolders(studentId: string): Promise<
  { success: true; folderUrl: string } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, first_name, last_name, student_display_id, google_drive_folder_id, google_drive_folder_url, drive_folder_status")
    .eq("id", studentId)
    .eq("organization_id", orgId)
    .single();

  if (!student) return { success: false, error: "Student not found" };
  if ((student.drive_folder_status as string) === "active" && student.google_drive_folder_id) {
    return { success: true, folderUrl: student.google_drive_folder_url as string };
  }

  if (!isDriveConfigured()) {
    await supabase.from("students").update({ drive_folder_status: "error" } as never).eq("id", studentId);
    return { success: false, error: "Google Drive is not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_ROOT_FOLDER_ID to your environment." };
  }

  // Get or auto-provision the Students/ org folder
  const { data: orgFolderRow } = await supabase
    .from("org_drive_folders")
    .select("google_drive_folder_id")
    .eq("organization_id", orgId)
    .eq("folder_key", "students")
    .single();

  let studentsFolderId: string;
  if (orgFolderRow?.google_drive_folder_id) {
    studentsFolderId = orgFolderRow.google_drive_folder_id as string;
  } else {
    // Org structure not yet provisioned — do it now
    const prov = await _ensureOrgDriveInDB(orgId, user.id, supabase);
    if (!prov.success) {
      await supabase.from("students").update({ drive_folder_status: "error", drive_error_message: prov.error } as never).eq("id", studentId);
      return { success: false, error: `Could not provision Drive folder structure: ${prov.error}` };
    }
    studentsFolderId = prov.folderMap["students"] ?? process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
  }

  const studentDisplayId = (student.student_display_id as string | null) ?? studentId;
  const studentName      = `${student.first_name as string} ${student.last_name as string}`;

  await supabase.from("students").update({ drive_folder_status: "creating" } as never).eq("id", studentId);

  const result = await createStudentFolderTree(studentDisplayId, studentName, orgId, studentsFolderId);

  if (!result.success) {
    await supabase.from("students").update({ drive_folder_status: "error", drive_error_message: result.error } as never).eq("id", studentId);
    return { success: false, error: result.error };
  }

  const { rootFolder, subfolders } = result.data;
  const folderName = `${studentDisplayId} — ${studentName}`;

  await supabase.from("students").update({
    google_drive_folder_id:  rootFolder.folderId,
    google_drive_folder_url: rootFolder.folderUrl,
    drive_folder_status:     "active",
    drive_folder_created_at: new Date().toISOString(),
    drive_folder_name:       folderName,
    drive_provisioned_by:    user.id,
    drive_error_message:     null,
  } as never).eq("id", studentId);

  const subfoldersToInsert = subfolders.map((sf) => {
    const def = getSubfolder(sf.key)!;
    return {
      organization_id:         orgId,
      student_id:              studentId,
      folder_key:              sf.key,
      folder_name:             def.name,
      sort_order:              def.sortOrder,
      google_drive_folder_id:  sf.folderId,
      google_drive_folder_url: sf.folderUrl,
      is_internal_only:        def.isInternalOnly,
      parent_can_view:         def.parentCanView,
      yearbook_eligible:       def.yearbookEligible,
      synced_at:               new Date().toISOString(),
    };
  });

  await supabase.from("student_drive_folders").upsert(subfoldersToInsert as never, { onConflict: "student_id,folder_key" });

  return { success: true, folderUrl: rootFolder.folderUrl };
}

/**
 * Link an existing Drive folder to a student (when folder was created manually).
 */
export async function linkStudentDriveFolder(studentId: string, folderId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  if (!folderId.trim()) return { success: false, error: "Folder ID is required" };

  const supabase = await createClient();
  const folderUrl = `https://drive.google.com/drive/folders/${folderId.trim()}`;

  await supabase.from("students").update({
    google_drive_folder_id:  folderId.trim(),
    google_drive_folder_url: folderUrl,
    drive_folder_status:     "manually_linked",
    drive_folder_created_at: new Date().toISOString(),
  } as never).eq("id", studentId).eq("organization_id", orgId);

  return { success: true };
}

/**
 * Get a student's subfolder records.
 */
export async function getStudentDriveFolders(studentId: string) {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("student_drive_folders")
    .select("*")
    .eq("student_id", studentId)
    .order("sort_order");

  return (data ?? []) as Array<{
    id: string; folder_key: string; folder_name: string; sort_order: number;
    google_drive_folder_id: string | null; google_drive_folder_url: string | null;
    is_internal_only: boolean; parent_can_view: boolean; yearbook_eligible: boolean;
  }>;
}

// ─── Work samples ─────────────────────────────────────────────────────────────

export interface CreateWorkSamplePayload {
  title: string;
  subject?: string | null;
  description?: string | null;
  work_date?: string | null;
  file_type: string;
  google_drive_file_id?: string | null;
  google_drive_file_url?: string | null;
  google_drive_folder_key?: string | null;
  external_url?: string | null;
  visibility: Visibility;
  visible_to_parent: boolean;
  include_in_yearbook: boolean;
  yearbook_caption?: string | null;
  yearbook_section?: string | null;
  yearbook_highlight?: boolean;
  quality_rating?: number | null;
  teacher_comments?: string | null;
}

export async function createWorkSample(studentId: string, payload: CreateWorkSamplePayload): Promise<
  { success: true; id: string } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  if (!payload.title.trim()) return { success: false, error: "Title is required" };

  // If a Drive file ID was provided, fetch metadata to get size/thumbnail
  let thumbnail_url: string | null = null;
  let file_size_bytes: number | null = null;
  let mime_type: string | null = null;

  if (payload.google_drive_file_id) {
    const meta = await getDriveFileMetadata(payload.google_drive_file_id);
    if (meta.success) {
      thumbnail_url  = meta.data.thumbnailLink ?? null;
      file_size_bytes = meta.data.size;
      mime_type      = meta.data.mimeType;
    }
  }

  // Get student's current grade for denormalization
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("grade_level")
    .eq("id", studentId)
    .eq("organization_id", orgId)
    .single();

  const { data, error } = await supabase
    .from("work_samples")
    .insert({
      organization_id:         orgId,
      student_id:              studentId,
      uploaded_by:             user.id,
      title:                   payload.title.trim(),
      subject:                 payload.subject  || null,
      description:             payload.description || null,
      work_date:               payload.work_date || null,
      grade_level:             (student?.grade_level as string | null) ?? null,
      file_type:               payload.file_type,
      google_drive_file_id:    payload.google_drive_file_id  || null,
      google_drive_file_url:   payload.google_drive_file_url || null,
      google_drive_folder_key: payload.google_drive_folder_key || "work_samples",
      external_url:            payload.external_url || null,
      thumbnail_url,
      file_size_bytes,
      mime_type,
      visibility:              payload.visibility,
      visible_to_parent:       payload.visible_to_parent,
      include_in_yearbook:     payload.include_in_yearbook,
      yearbook_caption:        payload.yearbook_caption   || null,
      yearbook_section:        payload.yearbook_section   || null,
      yearbook_highlight:      payload.yearbook_highlight ?? false,
      quality_rating:          payload.quality_rating     ?? null,
      teacher_comments:        payload.teacher_comments   || null,
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Insert failed" };
  return { success: true, id: data.id as string };
}

export async function getWorkSamples(studentId: string): Promise<WorkSample[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("work_samples")
    .select("*, profiles:uploaded_by(full_name)")
    .eq("student_id", studentId)
    .order("work_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>;
    const profObj = r.profiles as Record<string, string> | null;
    return { ...r, uploader_name: profObj?.full_name ?? null } as WorkSample;
  });
}

export async function updateWorkSample(
  sampleId: string,
  studentId: string,
  payload: Partial<CreateWorkSamplePayload>,
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_samples")
    .update({ ...payload, updated_at: new Date().toISOString() } as never)
    .eq("id", sampleId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  return error ? { success: false, error: error.message } : { success: true };
}

export async function deleteWorkSample(sampleId: string, studentId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();

  // Get file ID for Drive deletion
  const { data: sample } = await supabase
    .from("work_samples")
    .select("google_drive_file_id")
    .eq("id", sampleId)
    .eq("student_id", studentId)
    .single();

  const { error } = await supabase
    .from("work_samples")
    .delete()
    .eq("id", sampleId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  // Attempt Drive deletion (non-fatal if it fails)
  if (sample?.google_drive_file_id) {
    await deleteDriveFile(sample.google_drive_file_id as string);
  }

  return { success: true };
}

// ─── Upload via server (streaming to Drive) ───────────────────────────────────

/**
 * Server-side file upload: receives base64-encoded file content,
 * uploads to Drive, saves work sample record.
 *
 * For large files, prefer generating a Drive upload link and uploading
 * client-side directly (Phase 6+ enhancement).
 */
export async function uploadWorkSampleFile(
  studentId: string,
  fileBase64: string,
  fileName: string,
  mimeType: string,
  folderKey: string,
  metadata: Omit<CreateWorkSamplePayload, "google_drive_file_id" | "google_drive_file_url" | "google_drive_folder_key">,
): Promise<{ success: true; id: string; fileUrl: string } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  if (!isDriveConfigured()) {
    // Fallback: save record without Drive upload, just store the metadata
    const result = await createWorkSample(studentId, {
      ...metadata,
      google_drive_file_id:  null,
      google_drive_file_url: null,
      google_drive_folder_key: folderKey,
    });
    if (!result.success) return result;
    return { success: true, id: result.id, fileUrl: "" };
  }

  // Get the subfolder ID from DB
  const supabase = await createClient();
  const { data: driveFolder } = await supabase
    .from("student_drive_folders")
    .select("google_drive_folder_id")
    .eq("student_id", studentId)
    .eq("folder_key", folderKey)
    .single();

  if (!driveFolder?.google_drive_folder_id) {
    return { success: false, error: `Student Drive folder "${folderKey}" not found. Create Drive folders first.` };
  }

  const buffer = Buffer.from(fileBase64, "base64");
  const uploadResult = await uploadFileToDrive(buffer, fileName, mimeType, driveFolder.google_drive_folder_id as string);

  if (!uploadResult.success) return uploadResult;

  const { fileId, fileUrl, thumbnailUrl } = uploadResult.data;

  const result = await createWorkSample(studentId, {
    ...metadata,
    google_drive_file_id:    fileId,
    google_drive_file_url:   fileUrl,
    google_drive_folder_key: folderKey,
  });

  if (!result.success) return result;
  return { success: true, id: result.id, fileUrl };
}

