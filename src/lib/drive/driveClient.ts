/**
 * Google Drive client using a Service Account.
 *
 * Setup (one-time, Google Cloud Console):
 *   1. Create a project → Enable Drive API
 *   2. IAM & Admin → Service Accounts → Create → Download JSON key
 *   3. Paste full JSON as GOOGLE_SERVICE_ACCOUNT_JSON env var
 *   4. Create a Google Workspace Shared Drive: "Rising Leaders Academy – SchoolCo Records"
 *      Add the service account as Content Manager on the Shared Drive
 *   5. Copy the Shared Drive ID → GOOGLE_DRIVE_ROOT_FOLDER_ID env var
 *
 * Folder hierarchy under the Shared Drive root:
 *   Students/          ← student folders live here (not directly under root)
 *   Families/
 *   Staff/  (Teachers/, Volunteers/)
 *   Curriculum/  (Reading/, Math/, …)
 *   School Documents/
 *   Attendance Reports/  (2026-2027/, …)
 *   Incident Reports/    (Active/, Archived/)
 *   Yearbooks/           (2026-2027/, …)
 *   Archive/             (Students/, Families/, Staff/, Reports/)
 *
 * SECURITY: No folder or file is ever set to "Anyone with the link."
 *   Access is controlled by the service account and explicit sharing only.
 *
 * SHARED DRIVE NOTES:
 *   - All files.list calls include supportsAllDrives + includeItemsFromAllDrives
 *   - Global searches (no parent filter) also set corpora:'allDrives'
 *   - All files.get / files.create / files.update / files.delete / permissions.*
 *     include supportsAllDrives:true
 *   - Files created in a Shared Drive are owned by the organization, not the
 *     service account — this resolves the "no storage quota" error.
 */

import { Readable } from "stream";
import type { DriveResult, CreatedFolder, CreatedSubfolders, UploadedFile, OrgFolderSpec } from "./types";
import { STUDENT_SUBFOLDERS, ORG_FOLDER_STRUCTURE } from "./types";

// ─── Internals ────────────────────────────────────────────────────────────────

/** True when Drive credentials are configured in environment */
export function isDriveConfigured(): boolean {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID);
}

async function getAuth() {
  if (!isDriveConfigured()) return null;
  try {
    const { google } = await import("googleapis");
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;

    // Vercel sometimes stores multiline env vars with literal newlines inside the
    // private_key string instead of \n escape sequences, breaking JSON.parse.
    // Repair: replace literal newlines within the private_key value only.
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

/**
 * Idempotent folder find-or-create.
 * Search order: (1) appProperties tag → (2) exact name in parent → (3) create new.
 * appProperties are the only Drive API v3 custom field that supports q= querying;
 * the description field is human-readable only and cannot be used in files.list queries.
 *
 * All calls include supportsAllDrives:true so this works in both My Drive and
 * Workspace Shared Drives without modification.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findOrCreateFolder(drive: any, name: string, parentId: string, tag: string): Promise<string> {
  // 1. Search by appProperties tag (queryable in Drive API v3)
  const byTag = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and appProperties has { key='sc_tag' and value='${tag}' } and trashed=false`,
    fields: "files(id)",
    pageSize: 2,
    supportsAllDrives:        true,
    includeItemsFromAllDrives: true,
  });
  if (byTag.data.files?.length) return byTag.data.files[0].id as string;

  // 2. Fallback: match by exact name (handles manually-created folders)
  const byName = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and name='${name}' and trashed=false`,
    fields: "files(id)",
    pageSize: 2,
    supportsAllDrives:        true,
    includeItemsFromAllDrives: true,
  });
  if (byName.data.files?.length) {
    const id = byName.data.files[0].id as string;
    // Backfill appProperties so future calls use the fast path
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
    fields: "id",
    supportsAllDrives: true,
  });
  return res.data.id as string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ensure every folder in the org Drive hierarchy exists under the root folder.
 * Completely idempotent — any key already in existingFolders is skipped without
 * a Drive API call. New folders are created and returned alongside existing ones.
 *
 * @param orgId          Organisation UUID (used in appProperties tags)
 * @param existingFolders Caller-supplied map of key→folderId already known (from DB)
 * @returns Map of ALL folder keys (existing + newly created) → Drive folder ID
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
 * Find an existing student folder anywhere across all drives by its appProperties tag.
 * Does NOT restrict search to a specific parent — so folders can be found regardless
 * of where they were placed.
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

    const tag = `schoolco-student:${orgId}:${studentDisplayId}`;
    const res = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and appProperties has { key='sc_tag' and value='${tag}' } and trashed=false`,
      fields: "files(id,name)",
      pageSize: 5,
      supportsAllDrives:        true,
      includeItemsFromAllDrives: true,
      corpora:                   "allDrives",
    });

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
 * Idempotent:
 *   - Searches globally by appProperties tag first
 *   - If found: verifies all 13 subfolders exist, creates any missing ones
 *   - If not found: creates root folder under parentFolderId (should be Students/ folder)
 *
 * @param parentFolderId  ID of the "Students" org folder. Falls back to Drive root if omitted.
 */
export async function createStudentFolderTree(
  studentDisplayId: string,
  studentName: string,
  orgId: string,
  parentFolderId?: string,
): Promise<DriveResult<CreatedSubfolders>> {
  const auth = await getAuth();
  if (!auth) return { success: false, error: "Google Drive is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON and GOOGLE_DRIVE_ROOT_FOLDER_ID.", code: "NOT_CONFIGURED" };

  try {
    const { google } = await import("googleapis");
    const drive = google.drive({ version: "v3", auth });
    const effectiveParentId = parentFolderId ?? process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;

    const folderName = `${studentDisplayId} — ${studentName}`;
    const tag        = `schoolco-student:${orgId}:${studentDisplayId}`;

    // ── Idempotency: find existing folder anywhere across all drives ─────────
    const existingSearch = await findExistingStudentFolder(orgId, studentDisplayId);
    if (existingSearch.success && existingSearch.data) {
      const existingRootId = existingSearch.data;

      // Fetch current subfolders
      const subRes = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and '${existingRootId}' in parents and trashed=false`,
        fields: "files(id,name)",
        pageSize: 50,
        supportsAllDrives:        true,
        includeItemsFromAllDrives: true,
      });
      const existingSubs = subRes.data.files ?? [];

      // Verify / create any missing subfolders (handles spec changes)
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
            fields: "id",
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
      fields: "id",
      supportsAllDrives: true,
    });
    const rootId = rootRes.data.id!;

    // Create all 13 subfolders
    const subfolders: CreatedSubfolders["subfolders"] = [];
    for (const def of STUDENT_SUBFOLDERS) {
      const subRes = await drive.files.create({
        requestBody: {
          name:     def.name,
          mimeType: "application/vnd.google-apps.folder",
          parents:  [rootId],
        },
        fields: "id",
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
 * When the parent folder is inside a Shared Drive, the file is owned by the
 * Shared Drive organization (no per-service-account quota issue).
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
      requestBody: {
        name:    fileName,
        parents: [parentFolderId],
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
      fields: "id,size,thumbnailLink,mimeType",
      supportsAllDrives: true,
    });

    const fileId = res.data.id!;

    // NOTE: Files are kept private (service account / Shared Drive org only).
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
      supportsAllDrives:     true,
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
    const res = await drive.files.get({
      fileId,
      fields:            "id,name,mimeType,size,thumbnailLink",
      supportsAllDrives: true,
    });
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
    const res = await drive.files.get({
      fileId:            folderId,
      fields:            "id,name,trashed",
      supportsAllDrives: true,
    });
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
 * Delete a file from Drive (permanent, no trash).
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
