/**
 * Google Drive client using a Service Account.
 *
 * Setup required (one-time, done in Google Cloud Console):
 *   1. Create a project at console.cloud.google.com
 *   2. Enable the Google Drive API
 *   3. Create a Service Account (IAM & Admin → Service Accounts)
 *   4. Download the JSON key → copy contents to GOOGLE_SERVICE_ACCOUNT_JSON env var
 *   5. Create a "SchoolCo Root" folder in Drive and share it with the service account email (Editor)
 *   6. Copy that folder's ID to GOOGLE_DRIVE_ROOT_FOLDER_ID env var
 *
 * The service account will create all student folders inside the root folder.
 * Staff can be granted view access to the root folder to see everything.
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
 * Create a student's root Drive folder + all 11 standard subfolders.
 * Returns IDs for storage in the database.
 */
export async function createStudentFolderTree(
  studentName: string,
  orgId: string,
): Promise<DriveResult<CreatedSubfolders>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_ROOT_FOLDER_ID.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const rootParentId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;

    // Create student root folder
    const rootRes = await drive.files.create({
      requestBody: {
        name:     `${studentName} — Portfolio`,
        mimeType: "application/vnd.google-apps.folder",
        parents:  [rootParentId],
        description: `SchoolCo student portfolio — org:${orgId}`,
      },
      fields: "id",
    });

    const rootId = rootRes.data.id!;
    const subfolders: CreatedSubfolders["subfolders"] = [];

    // Create all 11 subfolders inside the root
    for (const def of STUDENT_SUBFOLDERS) {
      const subRes = await drive.files.create({
        requestBody: {
          name:     def.name,
          mimeType: "application/vnd.google-apps.folder",
          parents:  [rootId],
          description: def.description,
        },
        fields: "id",
      });
      subfolders.push({
        key:      def.key,
        folderId: subRes.data.id!,
        folderUrl: folderUrl(subRes.data.id!),
      });
    }

    return {
      success: true,
      data: {
        rootFolder: { folderId: rootId, folderUrl: folderUrl(rootId) },
        subfolders,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Drive folder creation failed: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Upload a file buffer to a specific Drive subfolder.
 * Used by server-side upload handler.
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

    // Make the file viewable by anyone with the link (for sharing with staff/parents)
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });

    return {
      success: true,
      data: {
        fileId,
        fileUrl:      fileUrl(fileId),
        thumbnailUrl: res.data.thumbnailLink ?? undefined,
        mimeType:     res.data.mimeType ?? mimeType,
        fileSizeBytes: Number(res.data.size ?? 0),
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Drive upload failed: ${msg}`, code: "DRIVE_ERROR" };
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
