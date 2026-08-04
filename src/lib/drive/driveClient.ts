/**
 * Google Drive client using a Service Account.
 *
 * Setup required (one-time, done in Google Cloud Console):
 *   1. Create a project at console.cloud.google.com
 *   2. Enable the Google Drive API
 *   3. Create a Service Account (IAM & Admin → Service Accounts)
 *   4. Download the JSON key → copy the entire JSON contents to GOOGLE_SERVICE_ACCOUNT_JSON env var
 *   5. Create a root folder in Drive: "Rising Leaders Academy — Student Records"
 *      Share it with the service account email address (Editor permission)
 *   6. Copy that root folder's ID to GOOGLE_DRIVE_ROOT_FOLDER_ID env var
 *
 * The service account will create all year and student folders inside the root folder.
 * Staff with Google accounts can be granted Viewer access to the root folder.
 *
 * SECURITY: Student folders are NOT set to "Anyone with the link."
 *   Access is controlled by the service account and explicit Google Workspace sharing.
 *   Files uploaded via work_samples are also kept private unless explicitly shared.
 */

import type { DriveResult, CreatedFolder, CreatedSubfolders, UploadedFile } from "./types";
import { STUDENT_SUBFOLDERS } from "./types";

/** True when Drive credentials are configured in environment */
export function isDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);
}

/** Initialize auth — returns null if not configured */
async function getAuth() {
  if (!isDriveConfigured()) return null;
  try {
    const { google } = await import("googleapis");
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    return auth;
  } catch {
    return null;
  }
}

/** Build folder URL from ID */
function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

/** Build file view URL from ID */
function fileUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/view`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search for an existing student folder in the root by SchoolCo student ID.
 * Uses the description field set at creation time: "schoolco-student:{orgId}:{studentDisplayId}".
 * Returns the folder ID if found, null otherwise.
 */
export async function findExistingStudentFolder(
  orgId: string,
  studentDisplayId: string,
): Promise<DriveResult<string | null>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const rootParentId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;

    const tag = `schoolco-student:${orgId}:${studentDisplayId}`;
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and '${rootParentId}' in parents and description contains '${tag}' and trashed=false`,
      fields: "files(id,name,description)",
      pageSize: 5,
    });

    const files = res.data.files ?? [];
    if (files.length > 0) {
      return { success: true, data: files[0].id! };
    }
    return { success: true, data: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Drive search failed: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Create a student's root Drive folder + all 13 standard subfolders.
 * Idempotent: checks for an existing folder by student display ID before creating.
 *
 * Folder name format: "RLA-S0001 — First Last"
 * Description tag: "schoolco-student:{orgId}:{studentDisplayId}"
 *
 * Returns IDs for storage in the database.
 */
export async function createStudentFolderTree(
  studentDisplayId: string,
  studentName: string,
  orgId: string,
): Promise<DriveResult<CreatedSubfolders>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_ROOT_FOLDER_ID.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const rootParentId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;

    const folderName = `${studentDisplayId} — ${studentName}`;
    const tag = `schoolco-student:${orgId}:${studentDisplayId}`;

    // Idempotency: search for existing folder before creating
    const existingSearch = await findExistingStudentFolder(orgId, studentDisplayId);
    if (existingSearch.success && existingSearch.data) {
      const existingRootId = existingSearch.data;

      // Fetch existing subfolders
      const subRes = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and '${existingRootId}' in parents and trashed=false`,
        fields: "files(id,name)",
        pageSize: 50,
      });
      const existingSubs = subRes.data.files ?? [];

      const subfolders: CreatedSubfolders["subfolders"] = STUDENT_SUBFOLDERS.map((def) => {
        const existing = existingSubs.find((f) => f.name === def.name);
        return {
          key: def.key,
          folderId: existing?.id ?? "",
          folderUrl: existing?.id ? folderUrl(existing.id) : "",
        };
      });

      return {
        success: true,
        data: {
          rootFolder: { folderId: existingRootId, folderUrl: folderUrl(existingRootId) },
          subfolders,
          wasExisting: true,
        },
      };
    }

    // Create student root folder
    const rootRes = await drive.files.create({
      requestBody: {
        name:        folderName,
        mimeType:    "application/vnd.google-apps.folder",
        parents:     [rootParentId],
        description: tag,
      },
      fields: "id",
    });

    const rootId = rootRes.data.id!;
    const subfolders: CreatedSubfolders["subfolders"] = [];

    // Create all 13 subfolders inside the root
    for (const def of STUDENT_SUBFOLDERS) {
      const subRes = await drive.files.create({
        requestBody: {
          name:        def.name,
          mimeType:    "application/vnd.google-apps.folder",
          parents:     [rootId],
          description: def.description,
        },
        fields: "id",
      });
      subfolders.push({
        key:       def.key,
        folderId:  subRes.data.id!,
        folderUrl: folderUrl(subRes.data.id!),
      });
    }

    return {
      success: true,
      data: {
        rootFolder: { folderId: rootId, folderUrl: folderUrl(rootId) },
        subfolders,
        wasExisting: false,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Drive folder creation failed: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Upload a file buffer to a specific Drive subfolder.
 * Files are uploaded as restricted (service-account only) and NOT set to
 * "anyone with the link." Sharing with staff or parents must be done explicitly
 * through SchoolCo permissions and the work_sample visible_to_parent flag.
 */
export async function uploadFileToDrive(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  parentFolderId: string,
): Promise<DriveResult<UploadedFile>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const { Readable } = await import("stream");
    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.create({
      requestBody: {
        name:    fileName,
        parents: [parentFolderId],
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: "id,size,thumbnailLink,mimeType",
    });

    const fileId = res.data.id!;

    // NOTE: Files are kept private (service account only).
    // Do NOT add "anyone" reader permission here.
    // Sharing is handled explicitly per file based on SchoolCo visibility settings.

    return {
      success: true,
      data: {
        fileId,
        fileUrl:       fileUrl(fileId),
        thumbnailUrl:  res.data.thumbnailLink ?? undefined,
        mimeType:      res.data.mimeType ?? mimeType,
        fileSizeBytes: Number(res.data.size ?? 0),
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Drive upload failed: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Grant a specific Google account viewer access to a file.
 * Call this when a work sample's visible_to_parent flag is set to true
 * and the parent's Google account is known.
 */
export async function shareFileWithUser(
  fileId: string,
  emailAddress: string,
  role: "reader" | "commenter" = "reader",
): Promise<DriveResult> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });

    await drive.permissions.create({
      fileId,
      requestBody: { role, type: "user", emailAddress },
      sendNotificationEmail: false,
    });

    return { success: true, data: undefined };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Could not share file: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Get metadata for an existing Drive file (verify access, get thumbnail).
 */
export async function getDriveFileMetadata(fileId: string): Promise<DriveResult<{ name: string; mimeType: string; size: number; thumbnailLink?: string }>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get({ fileId, fields: "id,name,mimeType,size,thumbnailLink" });
    return {
      success: true,
      data: {
        name:          res.data.name ?? "Untitled",
        mimeType:      res.data.mimeType ?? "application/octet-stream",
        size:          Number(res.data.size ?? 0),
        thumbnailLink: res.data.thumbnailLink ?? undefined,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Could not fetch file metadata: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Verify a Drive folder still exists and is accessible by the service account.
 * Returns the folder name if accessible, error if not.
 */
export async function verifyDriveFolder(folderId: string): Promise<DriveResult<{ name: string }>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get({ fileId: folderId, fields: "id,name,trashed" });
    if (res.data.trashed) {
      return { success: false, error: "Folder has been moved to trash.", code: "TRASHED" };
    }
    return { success: true, data: { name: res.data.name ?? "Unknown" } };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Could not verify folder: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Delete a file from Drive.
 */
export async function deleteDriveFile(fileId: string): Promise<DriveResult> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    await drive.files.delete({ fileId });
    return { success: true, data: undefined };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Could not delete file: ${msg}`, code: "DRIVE_ERROR" };
  }
}
