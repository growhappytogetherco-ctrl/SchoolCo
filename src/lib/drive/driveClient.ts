/**
 * Google Drive client using a Service Account with Google Workspace Shared Drive.
 *
 * SHARED DRIVE NOTES:
 *   - GOOGLE_DRIVE_ROOT_FOLDER_ID must be a Shared Drive ID (not a My Drive folder).
 *   - All files.* and permissions.* calls include supportsAllDrives:true.
 *   - Global searches include includeItemsFromAllDrives:true + corpora:'allDrives'.
 *   - findExistingStudentFolder restricts to corpora:'drive' when sharedDriveId is
 *     provided — prevents matching student folders from a different (old) drive.
 *   - Files created in a Shared Drive are owned by the organization, not the service
 *     account, which resolves the "no storage quota" error.
 *
 * SECURITY: No folder or file is ever set to "Anyone with the link."
 */

import { Readable } from "stream";
import type { DriveResult, CreatedFolder, CreatedSubfolders, UploadedFile, OrgFolderSpec } from "./types";
import { STUDENT_SUBFOLDERS, ORG_FOLDER_STRUCTURE } from "./types";

// ─── Internals ────────────────────────────────────────────────────────────────

export function isDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);
}

async function getAuth() {
  if (!isDriveConfigured()) return null;
  try {
    const { google } = await import("googleapis");
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
    let credentials: unknown;
    try {
      credentials = JSON.parse(raw);
    } catch {
      const repaired = raw.replace(
        /"private_key"\s*:\s*"([\s\S]*?)"\s*,/,
        (_m, key: string) => `"private_key": "${key.replace(/\r?\n/g, "\\n")}",`,
      );
      credentials = JSON.parse(repaired);
    }
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    return auth;
  } catch {
    return null;
  }
}

function folderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}

function fileUrl(id: string): string {
  return `https://drive.google.com/file/d/${id}/view`;
}

// ─── Drive destination helpers ────────────────────────────────────────────────

/**
 * Returns the Shared Drive ID if GOOGLE_DRIVE_ROOT_FOLDER_ID is a Shared Drive,
 * or null if it is a regular My Drive folder (or if Drive is not configured).
 * Use this to decide whether to restrict searches to a specific drive.
 */
export async function detectSharedDriveId(): Promise<string | null> {
  const auth = await getAuth();
  if (!auth) return null;
  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
    await drive.drives.get({ driveId: rootId, fields: "id" });
    return rootId; // succeeds only if rootId is a Shared Drive
  } catch {
    return null;
  }
}

/**
 * Returns the driveId of a file/folder (non-null only for Shared Drive items),
 * or null on error / for My Drive items.
 */
export async function getFolderDriveId(folderId: string): Promise<string | null> {
  const auth = await getAuth();
  if (!auth) return null;
  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get({ fileId: folderId, fields: "driveId", supportsAllDrives: true });
    return (res.data.driveId as string | undefined) ?? null;
  } catch {
    return null;
  }
}

// ─── Idempotent folder helpers ────────────────────────────────────────────────

/**
 * Idempotent folder find-or-create within a specific parent.
 * Search order: (1) appProperties tag → (2) exact name → (3) create.
 * appProperties are the only Drive API v3 custom field queryable in files.list.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findOrCreateFolder(drive: any, name: string, parentId: string, tag: string): Promise<string> {
  // 1. Search by appProperties tag
  const byTag = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and appProperties has { key='sc_tag' and value='${tag}' } and trashed=false`,
    fields:                    "files(id)",
    pageSize:                  2,
    supportsAllDrives:         true,
    includeItemsFromAllDrives: true,
  });
  if (byTag.data.files?.length) return byTag.data.files[0].id as string;

  // 2. Fallback: exact name match (handles manually-created folders)
  const byName = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and name='${name}' and trashed=false`,
    fields:                    "files(id)",
    pageSize:                  2,
    supportsAllDrives:         true,
    includeItemsFromAllDrives: true,
  });
  if (byName.data.files?.length) {
    const id = byName.data.files[0].id as string;
    await drive.files.update({
      fileId: id,
      requestBody: { appProperties: { sc_tag: tag } },
      supportsAllDrives: true,
    }).catch(() => {});
    return id;
  }

  // 3. Create new folder
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType:      "application/vnd.google-apps.folder",
      parents:       [parentId],
      appProperties: { sc_tag: tag },
    },
    fields:            "id",
    supportsAllDrives: true,
  });
  return res.data.id as string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ensure every folder in the org Drive hierarchy exists under the root folder.
 * Idempotent — keys already in existingFolders are skipped.
 *
 * IMPORTANT: Callers must validate existingFolders against the current Drive
 * destination before passing them here. Stale My Drive IDs must be excluded
 * so this function re-creates them under the current Shared Drive.
 *
 * @param orgId          Organisation UUID (used in appProperties tags)
 * @param existingFolders Pre-validated map of key→folderId already confirmed in the active Drive
 */
export async function ensureOrgDriveStructure(
  orgId: string,
  existingFolders: Record<string, string> = {},
): Promise<DriveResult<Record<string, string>>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const rootParentId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;

    const result: Record<string, string> = { ...existingFolders };

    async function processSpec(spec: OrgFolderSpec, parentId: string): Promise<void> {
      if (!result[spec.key]) {
        const tag = `schoolco-org:${orgId}:${spec.key}`;
        result[spec.key] = await findOrCreateFolder(drive, spec.name, parentId, tag);
      }
      const childParentId = result[spec.key];
      for (const child of spec.children ?? []) {
        await processSpec(child, childParentId);
      }
    }

    for (const spec of ORG_FOLDER_STRUCTURE) {
      await processSpec(spec, rootParentId);
    }

    return { success: true, data: result };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Drive structure provisioning failed: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Find an existing student folder by its appProperties tag.
 *
 * When sharedDriveId is provided: restricts search to that Shared Drive only
 * (corpora:'drive'). This prevents re-using a student folder from an old My Drive
 * when the application has switched to a Workspace Shared Drive.
 *
 * When sharedDriveId is omitted: searches all drives (legacy / My Drive mode).
 */
export async function findExistingStudentFolder(
  orgId: string,
  studentDisplayId: string,
  sharedDriveId?: string,
): Promise<DriveResult<string | null>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });

    const tag = `schoolco-student:${orgId}:${studentDisplayId}`;

    const listParams: Record<string, unknown> = {
      q: `mimeType='application/vnd.google-apps.folder' and appProperties has { key='sc_tag' and value='${tag}' } and trashed=false`,
      fields:                    "files(id,name)",
      pageSize:                  5,
      supportsAllDrives:         true,
      includeItemsFromAllDrives: true,
    };

    if (sharedDriveId) {
      // Restrict to the specific Shared Drive — never reuse a folder from a different drive
      listParams["corpora"] = "drive";
      listParams["driveId"] = sharedDriveId;
    } else {
      listParams["corpora"] = "allDrives";
    }

    const res = await drive.files.list(listParams as never);
    const files = res.data.files ?? [];
    if (files.length > 0) return { success: true, data: files[0].id as string };
    return { success: true, data: null };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Drive search failed: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Create (or find and verify) a student's Drive folder tree.
 * Idempotent — searches for existing folder by appProperties tag first.
 *
 * @param parentFolderId  ID of the "Students" org folder (falls back to Drive root if omitted)
 * @param sharedDriveId   When set, restricts idempotency search to this Shared Drive.
 *                        Pass when Shared Drive is configured to prevent re-using old My Drive folders.
 */
export async function createStudentFolderTree(
  studentDisplayId: string,
  studentName: string,
  orgId: string,
  parentFolderId?: string,
  sharedDriveId?: string,
): Promise<DriveResult<CreatedSubfolders>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const effectiveParentId = parentFolderId ?? process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;

    const folderName = `${studentDisplayId} — ${studentName}`;
    const tag        = `schoolco-student:${orgId}:${studentDisplayId}`;

    // ── Idempotency: find existing folder (restricted to sharedDriveId when set) ─
    const existingSearch = await findExistingStudentFolder(orgId, studentDisplayId, sharedDriveId);
    if (existingSearch.success && existingSearch.data) {
      const existingRootId = existingSearch.data;

      const subRes = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and '${existingRootId}' in parents and trashed=false`,
        fields:                    "files(id,name)",
        pageSize:                  50,
        supportsAllDrives:         true,
        includeItemsFromAllDrives: true,
      });
      const existingSubs = subRes.data.files ?? [];

      const subfolders: CreatedSubfolders["subfolders"] = [];
      for (const def of STUDENT_SUBFOLDERS) {
        const found = existingSubs.find((f) => f.name === def.name);
        if (found) {
          subfolders.push({ key: def.key, folderId: found.id!, folderUrl: folderUrl(found.id!) });
        } else {
          const newSub = await drive.files.create({
            requestBody: {
              name:     def.name,
              mimeType: "application/vnd.google-apps.folder",
              parents:  [existingRootId],
            },
            fields:            "id",
            supportsAllDrives: true,
          });
          subfolders.push({ key: def.key, folderId: newSub.data.id!, folderUrl: folderUrl(newSub.data.id!) });
        }
      }

      return {
        success: true,
        data: { rootFolder: { folderId: existingRootId, folderUrl: folderUrl(existingRootId) }, subfolders, wasExisting: true },
      };
    }

    // ── Create new student root folder under Students/ ───────────────────────
    const rootRes = await drive.files.create({
      requestBody: {
        name:          folderName,
        mimeType:      "application/vnd.google-apps.folder",
        parents:       [effectiveParentId],
        appProperties: { sc_tag: tag },
      },
      fields:            "id",
      supportsAllDrives: true,
    });
    const rootId = rootRes.data.id!;

    const subfolders: CreatedSubfolders["subfolders"] = [];
    for (const def of STUDENT_SUBFOLDERS) {
      const subRes = await drive.files.create({
        requestBody: {
          name:     def.name,
          mimeType: "application/vnd.google-apps.folder",
          parents:  [rootId],
        },
        fields:            "id",
        supportsAllDrives: true,
      });
      subfolders.push({ key: def.key, folderId: subRes.data.id!, folderUrl: folderUrl(subRes.data.id!) });
    }

    return {
      success: true,
      data: { rootFolder: { folderId: rootId, folderUrl: folderUrl(rootId) }, subfolders, wasExisting: false },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Drive folder creation failed: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Upload a file buffer to a specific Drive subfolder.
 * When the parent is in a Shared Drive, the file is org-owned (no quota issue).
 * Files are NOT set to "anyone with the link" — private by default.
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
    const drive = google.drive({ version: "v3", auth });

    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [parentFolderId] },
      media:       { mimeType, body: Readable.from(buffer) },
      fields:      "id,size,thumbnailLink,mimeType,driveId",
      supportsAllDrives: true,
    });

    const fileId = res.data.id!;
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
      requestBody:           { role, type: "user", emailAddress },
      sendNotificationEmail: false,
      supportsAllDrives:     true,
    });
    return { success: true, data: undefined };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Could not share file: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Get metadata for an existing Drive file.
 */
export async function getDriveFileMetadata(fileId: string): Promise<DriveResult<{ name: string; mimeType: string; size: number; thumbnailLink?: string }>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get({ fileId, fields: "id,name,mimeType,size,thumbnailLink", supportsAllDrives: true });
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
 * Verify a Drive folder still exists and is accessible.
 */
export async function verifyDriveFolder(folderId: string): Promise<DriveResult<{ name: string }>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const res = await drive.files.get({ fileId: folderId, fields: "id,name,trashed", supportsAllDrives: true });
    if (res.data.trashed) return { success: false, error: "Folder has been moved to trash.", code: "TRASHED" };
    return { success: true, data: { name: res.data.name ?? "Unknown" } };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Could not verify folder: ${msg}`, code: "DRIVE_ERROR" };
  }
}

/**
 * Permanently delete a file from Drive.
 */
export async function deleteDriveFile(fileId: string): Promise<DriveResult> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    await drive.files.delete({ fileId, supportsAllDrives: true });
    return { success: true, data: undefined };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `Could not delete file: ${msg}`, code: "DRIVE_ERROR" };
  }
}
