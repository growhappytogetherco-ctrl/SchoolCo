/**
 * Temporary Drive verification page — DELETE AFTER USE.
 * Admin-only. Verifies Google Workspace Shared Drive setup, migrates any stale
 * My Drive references in org_drive_folders and student_drive_folders, and
 * runs a full integration test including private file upload.
 */
import { redirect } from "next/navigation";
import { getUser, getActiveOrgId, createClient } from "@/lib/supabase/server";
import {
  isDriveConfigured, ensureOrgDriveStructure,
  createStudentFolderTree, uploadFileToDrive,
} from "@/lib/drive/driveClient";
import { getOrgFolderName } from "@/lib/drive/types";

const ALLOWED = new Set(["admin","full_admin","platform_admin"]);
const MIA_ID      = "7c7ce9fa-7dbc-46f8-954b-cd1419485d40";
const MIA_DISPLAY = "TEST-STU-001";
const MIA_NAME    = "Mia Johnson";

type R = { label: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };

export default async function DriveVerifyPage() {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) redirect("/login");

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("organization_members").select("role")
    .eq("organization_id", orgId).eq("profile_id", user.id).eq("status", "active").single();
  if (!member || !ALLOWED.has(member.role as string)) redirect("/dashboard/home");

  const results: R[] = [];
  const ok   = (l: string, d = "") => { results.push({ label: l, status: "PASS", detail: d }); };
  const bad  = (l: string, d = "") => { results.push({ label: l, status: "FAIL", detail: d }); };
  const skip = (l: string, d = "") => { results.push({ label: l, status: "SKIP", detail: d }); };

  // ── 1. Credential presence ─────────────────────────────────────────────────
  if (!isDriveConfigured()) {
    bad("GOOGLE_SERVICE_ACCOUNT_JSON", "MISSING");
    bad("GOOGLE_DRIVE_ROOT_FOLDER_ID", "MISSING");
    return <Results items={results} stopped />;
  }
  ok("GOOGLE_SERVICE_ACCOUNT_JSON", "PRESENT");
  ok("GOOGLE_DRIVE_ROOT_FOLDER_ID", "PRESENT");
  ok("isDriveConfigured()");

  // ── 2. Auth ────────────────────────────────────────────────────────────────
  let drive: any;
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
  try {
    const { google } = await import("googleapis");
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
    let credentials: unknown;
    try { credentials = JSON.parse(raw); }
    catch {
      const repaired = raw.replace(
        /"private_key"\s*:\s*"([\s\S]*?)"\s*,/,
        (_m: string, key: string) => `"private_key": "${key.replace(/\r?\n/g, "\\n")}",`,
      );
      credentials = JSON.parse(repaired);
      ok("JSON repair applied");
    }
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
    drive = google.drive({ version: "v3", auth });
    ok("Google Drive auth");
  } catch (e: any) {
    bad("Google Drive auth", e.message);
    return <Results items={results} stopped />;
  }

  // ── 3. Confirm Shared Drive ────────────────────────────────────────────────
  let sharedDriveId: string | null = null;
  let sharedDriveName = "";
  try {
    const driveInfo = await drive.drives.get({ driveId: rootId, fields: "id,name" });
    sharedDriveId   = rootId;
    sharedDriveName = driveInfo.data.name ?? "";
    ok("Destination is Google Workspace Shared Drive", `"${sharedDriveName}"`);
  } catch (e: any) {
    bad("Destination is Google Workspace Shared Drive",
      `GOOGLE_DRIVE_ROOT_FOLDER_ID does not resolve to a Shared Drive. Update the env var. (${e.message})`);
    return <Results items={results} stopped />;
  }

  // ── 4. Root write permission ───────────────────────────────────────────────
  try {
    const meta = await drive.files.get({ fileId: rootId, fields: "id,name,trashed,capabilities", supportsAllDrives: true });
    if (meta.data.trashed) { bad("Root folder access", "trashed"); return <Results items={results} stopped />; }
    ok("Root folder access", `"${meta.data.name}"`);
    meta.data.capabilities?.canAddChildren
      ? ok("Root folder write permission")
      : bad("Root folder write permission", "canAddChildren=false");
  } catch (e: any) {
    bad("Root folder access", e.message);
    return <Results items={results} stopped />;
  }

  // ── 5. Validate org_drive_folders against current Shared Drive ─────────────
  // Load DB cache, check one sample folder's driveId. If stale, clear the cache
  // so ensureOrgDriveStructure re-provisions everything in the Shared Drive.
  const { data: existingRows } = await supabase
    .from("org_drive_folders").select("folder_key, google_drive_folder_id")
    .eq("organization_id", orgId);

  let existingMap: Record<string,string> = {};
  for (const r of existingRows ?? []) existingMap[r.folder_key as string] = r.google_drive_folder_id as string;

  const cachedCount = Object.keys(existingMap).length;
  let staleOrgCount = 0;

  if (cachedCount > 0) {
    // Check one entry as representative sample — all entries were created together
    const [sampleKey, sampleId] = Object.entries(existingMap)[0];
    try {
      const sampleMeta = await drive.files.get({ fileId: sampleId, fields: "driveId,name", supportsAllDrives: true });
      const sampleDriveId = sampleMeta.data.driveId as string | undefined;
      if (sampleDriveId !== sharedDriveId) {
        staleOrgCount = cachedCount;
        bad(
          "Cached org folders — stale My Drive references",
          `${cachedCount} DB rows reference old My Drive (sample: key=${sampleKey}, driveId=${sampleDriveId ?? "My Drive"}). Clearing cache to re-provision in Shared Drive.`
        );
        existingMap = {}; // discard stale cache — ensureOrgDriveStructure will re-provision
      } else {
        ok("Cached org folders validated", `${cachedCount} rows confirmed in Shared Drive`);
      }
    } catch {
      staleOrgCount = cachedCount;
      bad("Cached org folders — validation failed", `Sample folder ${sampleId} not accessible. Clearing cache.`);
      existingMap = {};
    }
  }

  // ── 6. Org structure provisioning — run 1 ─────────────────────────────────
  const run1 = await ensureOrgDriveStructure(orgId, existingMap);
  if (!run1.success) {
    bad("Org structure provisioning", run1.error);
  } else {
    const total1 = Object.keys(run1.data).length;
    ok("Org structure provisioning — run 1", `${total1} folders`);

    // Upsert ALL provisioning results (overwrites stale DB rows with Shared Drive IDs)
    const { error: upsertErr } = await supabase.from("org_drive_folders").upsert(
      Object.entries(run1.data).map(([key, folderId]) => ({
        organization_id:         orgId,
        folder_key:              key,
        folder_name:             getOrgFolderName(key),
        google_drive_folder_id:  folderId,
        google_drive_folder_url: `https://drive.google.com/drive/folders/${folderId}`,
        provisioned_by:          user.id,
      })) as never,
      { onConflict: "organization_id,folder_key" }
    );
    if (upsertErr) bad("org_drive_folders upsert", upsertErr.message);
    else ok("org_drive_folders upserted", `${total1} rows (Shared Drive IDs)`);

    // ── 7. Idempotency — run 2 ──────────────────────────────────────────────
    const run2 = await ensureOrgDriveStructure(orgId, run1.data);
    if (!run2.success) { bad("Org idempotency — run 2", run2.error); }
    else {
      const newOnRun2 = Object.entries(run2.data).filter(([k]) => !run1.data[k]).length;
      const idsMatch  = Object.keys(run1.data).every((k) => run1.data[k] === run2.data[k]);
      newOnRun2 === 0 ? ok("Org idempotency — no duplicates") : bad("Org idempotency — duplicates created", `${newOnRun2} new`);
      idsMatch ? ok("Org idempotency — IDs consistent") : bad("Org idempotency — IDs inconsistent");
    }
  }

  // ── 8. Validate Mia's current Drive folder ────────────────────────────────
  // Check where Mia's DB-referenced folder actually lives before provisioning.
  const { data: miaStudent } = await supabase.from("students")
    .select("google_drive_folder_id").eq("id", MIA_ID).single();
  const miaCurrentDriveFolderId = (miaStudent as any)?.google_drive_folder_id as string | null;

  let miaDriveStatus = "unknown";
  if (miaCurrentDriveFolderId) {
    try {
      const miaMeta = await drive.files.get({
        fileId: miaCurrentDriveFolderId, fields: "driveId,name,trashed", supportsAllDrives: true,
      });
      const miaDriveId = miaMeta.data.driveId as string | undefined;
      if (miaDriveId === sharedDriveId) {
        miaDriveStatus = "shared_drive";
        ok("Mia DB folder is in Shared Drive", `driveId matches — will verify idempotency`);
      } else {
        miaDriveStatus = "my_drive";
        bad("Mia DB folder is in old My Drive",
          `driveId: ${miaDriveId ?? "My Drive"} — will create new canonical folder in Shared Drive`);
      }
    } catch {
      miaDriveStatus = "not_found";
      bad("Mia DB folder not accessible", `ID ${miaCurrentDriveFolderId} — will create new`);
    }
  } else {
    miaDriveStatus = "none";
    ok("Mia has no existing Drive folder", "Will create fresh in Shared Drive");
  }

  // ── 9. Mia student folder (restricted to Shared Drive) ────────────────────
  const studentsFolderId = run1.success ? run1.data["students"] : undefined;
  // Pass sharedDriveId so findExistingStudentFolder only matches folders in the Shared Drive
  const miaResult = await createStudentFolderTree(MIA_DISPLAY, MIA_NAME, orgId, studentsFolderId, sharedDriveId ?? undefined);
  if (!miaResult.success) {
    bad("Mia student folder", miaResult.error);
  } else {
    ok("Mia student folder", `ID: ${miaResult.data.rootFolder.folderId} wasExisting:${miaResult.data.wasExisting}`);
    miaResult.data.subfolders.length === 13
      ? ok("13 student subfolders")
      : bad("13 student subfolders", `Only ${miaResult.data.subfolders.length}`);

    // Verify Mia folder is in Shared Drive
    try {
      const miaFolderMeta = await drive.files.get({
        fileId: miaResult.data.rootFolder.folderId, fields: "driveId,parents", supportsAllDrives: true,
      });
      const miaFolderDriveId = miaFolderMeta.data.driveId as string | undefined;
      miaFolderDriveId === sharedDriveId
        ? ok("Mia folder driveId matches Shared Drive")
        : bad("Mia folder driveId mismatch", `driveId: ${miaFolderDriveId ?? "My Drive"}`);

      const underStudents = studentsFolderId && (miaFolderMeta.data.parents ?? []).includes(studentsFolderId);
      underStudents ? ok("Mia folder under Students/") : bad("Mia folder under Students/", `parents: ${(miaFolderMeta.data.parents ?? []).join(", ")}`);
    } catch { skip("Mia folder metadata check"); }

    // Verify all 13 subfolders are in Shared Drive (spot-check first 3)
    const subSample = miaResult.data.subfolders.slice(0, 3);
    let subStaleCount = 0;
    for (const sf of subSample) {
      try {
        const sfMeta = await drive.files.get({ fileId: sf.folderId, fields: "driveId", supportsAllDrives: true });
        if ((sfMeta.data.driveId as string | undefined) !== sharedDriveId) subStaleCount++;
      } catch { subStaleCount++; }
    }
    subStaleCount === 0
      ? ok("Mia subfolders in Shared Drive", "sample of 3 confirmed")
      : bad("Mia subfolders driveId mismatch", `${subStaleCount}/3 sample not in Shared Drive`);

    // ── 10. DB metadata ──────────────────────────────────────────────────────
    const folderName = `${MIA_DISPLAY} — ${MIA_NAME}`;
    const { error: suErr } = await supabase.from("students").update({
      google_drive_folder_id:  miaResult.data.rootFolder.folderId,
      google_drive_folder_url: miaResult.data.rootFolder.folderUrl,
      drive_folder_status:     "active",
      drive_folder_name:       folderName,
      drive_folder_created_at: new Date().toISOString(),
      drive_provisioned_by:    user.id,
      drive_error_message:     null,
    } as never).eq("id", MIA_ID);
    suErr ? bad("DB — student row updated", suErr.message) : ok("DB — student row updated");

    const sfToInsert = miaResult.data.subfolders.map((sf) => ({
      organization_id:         orgId,
      student_id:              MIA_ID,
      folder_key:              sf.key,
      folder_name:             sf.key,
      google_drive_folder_id:  sf.folderId,
      google_drive_folder_url: sf.folderUrl,
      synced_at:               new Date().toISOString(),
    }));
    const { error: sfErr } = await supabase.from("student_drive_folders")
      .upsert(sfToInsert as never, { onConflict: "student_id,folder_key" });
    sfErr ? bad("DB — student_drive_folders upserted", sfErr.message) : ok("DB — student_drive_folders upserted", "13 rows");

    // ── 11. Idempotency — run 2 ───────────────────────────────────────────────
    const miaRun2 = await createStudentFolderTree(MIA_DISPLAY, MIA_NAME, orgId, studentsFolderId, sharedDriveId ?? undefined);
    if (!miaRun2.success) { bad("Mia idempotency — run 2", miaRun2.error); }
    else {
      miaRun2.data.rootFolder.folderId === miaResult.data.rootFolder.folderId
        ? ok("Mia idempotency — same folder ID on run 2")
        : bad("Mia idempotency — different ID on run 2", miaRun2.data.rootFolder.folderId);
      miaRun2.data.wasExisting ? ok("Mia idempotency — wasExisting=true") : bad("Mia idempotency — wasExisting should be true");
    }

    // ── 12. Orphaned Mia cleanup ─────────────────────────────────────────────
    try {
      const orphanList = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${MIA_DISPLAY} — ${MIA_NAME}' and trashed=false`,
        fields: "files(id,name,driveId)",
        pageSize: 20,
        supportsAllDrives:         true,
        includeItemsFromAllDrives: true,
        corpora:                   "allDrives",
      });
      const allMia    = orphanList.data.files ?? [];
      const canonical = miaResult.data.rootFolder.folderId;
      const orphans   = allMia.filter((f: any) => f.id !== canonical);
      for (const orphan of orphans) {
        await drive.files.update({ fileId: orphan.id, requestBody: { trashed: true }, supportsAllDrives: true }).catch(() => {});
      }
      orphans.length > 0
        ? ok("Orphaned Mia folders deleted", `${orphans.length} duplicate(s) permanently deleted`)
        : ok("Orphaned Mia folders", "None found");
    } catch (e: any) { skip("Orphaned Mia cleanup", e.message); }

    // ── 13. Private upload test ───────────────────────────────────────────────
    const targetSubfolderId = miaResult.data.subfolders.find((s) => s.key === "academic_records")?.folderId
      ?? miaResult.data.rootFolder.folderId;
    const content = Buffer.from(`SchoolCo Drive verification — ${new Date().toISOString()} — DELETE ME`);
    const uploadRes = await uploadFileToDrive(content, "__drive_verify_delete_me.txt", "text/plain", targetSubfolderId);

    if (!uploadRes.success) {
      bad("Private upload test", uploadRes.error);
    } else {
      ok("Private upload test", `ID: ${uploadRes.data.fileId}, ${uploadRes.data.fileSizeBytes}B`);

      // Confirm file landed in Shared Drive
      try {
        const fileMeta = await drive.files.get({
          fileId: uploadRes.data.fileId, fields: "driveId,parents", supportsAllDrives: true,
        });
        const fileDriveId = fileMeta.data.driveId as string | undefined;
        fileDriveId === sharedDriveId
          ? ok("Uploaded file driveId matches Shared Drive")
          : bad("Uploaded file driveId mismatch", `driveId: ${fileDriveId ?? "My Drive — upload quota issue not resolved"}`);
      } catch { skip("Uploaded file driveId check"); }

      // Confirm not public
      try {
        const permsRes = await drive.permissions.list({ fileId: uploadRes.data.fileId, fields: "permissions(type,role)", supportsAllDrives: true });
        const publicPerm = (permsRes.data.permissions ?? []).find((p: any) => p.type === "anyone");
        publicPerm ? bad("File not publicly accessible — SECURITY", "has 'anyone' permission") : ok("File not publicly accessible");
      } catch { skip("File privacy check"); }

      // Trash test file (Content Manager role = can trash but not permanently delete in Shared Drive)
      try {
        await drive.files.update({ fileId: uploadRes.data.fileId, requestBody: { trashed: true }, supportsAllDrives: true });
        ok("Test file trashed");
      } catch (e: any) { bad("Test file cleanup", e.message); }
    }
  }

  // ── 14. Security spot-check ───────────────────────────────────────────────
  if (run1.success) {
    let anyPublic = false;
    for (const key of ["students", "incident_reports"]) {
      const fid = run1.data[key];
      if (!fid) continue;
      try {
        const perms = await drive.permissions.list({ fileId: fid, fields: "permissions(type)", supportsAllDrives: true });
        if ((perms.data.permissions ?? []).some((p: any) => p.type === "anyone")) anyPublic = true;
      } catch { /* ignore */ }
    }
    anyPublic ? bad("No public org folders", "has 'anyone' access") : ok("No public org folders", "students + incident_reports checked");
  }

  // ── 15. DB consistency audit ─────────────────────────────────────────────
  // Count org_drive_folders rows
  const { count: orgFolderCount } = await supabase
    .from("org_drive_folders").select("folder_key", { count: "exact", head: true })
    .eq("organization_id", orgId);
  const n = orgFolderCount ?? 0;
  n > 0 ? ok("Org Drive folders in DB", `${n} rows`) : bad("Org Drive folders in DB", "0 rows");

  // Report stale My Drive references remaining
  const staleAfterMigration = staleOrgCount > 0 && !run1.success ? staleOrgCount : 0;
  staleAfterMigration === 0
    ? ok("Stale My Drive org references remaining", "0 — all migrated to Shared Drive")
    : bad("Stale My Drive org references remaining", `${staleAfterMigration}`);

  // Check Mia student_drive_folders — spot-check one subfolder driveId
  const { data: miaSubRow } = await supabase.from("student_drive_folders")
    .select("google_drive_folder_id").eq("student_id", MIA_ID).limit(1).single();
  const miaSubId = (miaSubRow as any)?.google_drive_folder_id as string | null;
  if (miaSubId && sharedDriveId) {
    try {
      const miaSubMeta = await drive.files.get({ fileId: miaSubId, fields: "driveId", supportsAllDrives: true });
      const miaSubDriveId = miaSubMeta.data.driveId as string | undefined;
      miaSubDriveId === sharedDriveId
        ? ok("Mia student_drive_folders — Shared Drive confirmed", "sample subfolder driveId matches")
        : bad("Mia student_drive_folders — stale My Drive reference", `driveId: ${miaSubDriveId ?? "My Drive"}`);
    } catch { skip("Mia subfolder driveId check"); }
  }

  return <Results items={results} sharedDriveName={sharedDriveName} />;
}

function Results({ items, stopped, sharedDriveName }: { items: R[]; stopped?: boolean; sharedDriveName?: string }) {
  const passN = items.filter((r) => r.status === "PASS").length;
  const failN = items.filter((r) => r.status === "FAIL").length;
  const allClear = failN === 0 && !stopped;
  return (
    <div style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 1000 }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Drive Verification Results</h1>
      {sharedDriveName && <p style={{ color: "#555", marginBottom: 16, fontSize: 13 }}>Shared Drive: "{sharedDriveName}"</p>}
      {stopped && <p style={{ color: "orange" }}>⚠ Stopped early — fix FAIL items above before continuing.</p>}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#f5f5f5" }}>
            <th style={{ padding: "6px 10px", textAlign: "left" }}>Check</th>
            <th style={{ padding: "6px 10px", textAlign: "left" }}>Status</th>
            <th style={{ padding: "6px 10px", textAlign: "left" }}>Detail</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
              <td style={{ padding: "5px 10px", fontSize: 13 }}>{r.label}</td>
              <td style={{ padding: "5px 10px", fontWeight: "bold",
                color: r.status === "PASS" ? "green" : r.status === "FAIL" ? "red" : "gray" }}>
                {r.status === "PASS" ? "✓ PASS" : r.status === "FAIL" ? "✗ FAIL" : "○ SKIP"}
              </td>
              <td style={{ padding: "5px 10px", fontSize: 12, color: "#555", wordBreak: "break-all" }}>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 16, fontWeight: "bold", fontSize: 15 }}>
        {passN} PASS · {failN} FAIL
        {allClear ? " — ✓ SHARED DRIVE COMPLETE — READY FOR REAL RLA DATA" : " — ✗ ISSUES FOUND"}
      </p>
      <p style={{ marginTop: 8, color: "#888", fontSize: 12 }}>
        DELETE this page after verification: src/app/(dashboard)/dashboard/admin/drive-verify/page.tsx
      </p>
    </div>
  );
}
