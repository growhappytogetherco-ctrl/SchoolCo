/**
 * Temporary Drive verification page — DELETE AFTER USE.
 * Admin-only. Tests Drive connection, org structure, student folder, upload.
 */
import { redirect } from "next/navigation";
import { getUser, getActiveOrgId, createClient } from "@/lib/supabase/server";
import {
  isDriveConfigured, ensureOrgDriveStructure, findExistingStudentFolder,
  createStudentFolderTree, uploadFileToDrive, verifyDriveFolder,
} from "@/lib/drive/driveClient";
import { getOrgFolderName } from "@/lib/drive/types";

const ALLOWED = new Set(["admin","full_admin","platform_admin"]);
const MIA_ID         = "7c7ce9fa-7dbc-46f8-954b-cd1419485d40";
const MIA_DISPLAY    = "TEST-STU-001";
const MIA_NAME       = "Mia Johnson";

type R = { label: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };

export default async function DriveVerifyPage() {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) redirect("/login");

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .single();
  if (!member || !ALLOWED.has(member.role as string)) redirect("/dashboard/home");

  const results: R[] = [];
  const ok  = (l: string, d = "") => { results.push({ label: l, status: "PASS", detail: d }); };
  const bad = (l: string, d = "") => { results.push({ label: l, status: "FAIL", detail: d }); };
  const skip = (l: string, d = "")=> { results.push({ label: l, status: "SKIP", detail: d }); };

  // ── 1. Credential presence ─────────────────────────────────────────────────
  const saPresent  = !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const rfPresent  = !!process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  saPresent  ? ok("GOOGLE_SERVICE_ACCOUNT_JSON", "PRESENT") : bad("GOOGLE_SERVICE_ACCOUNT_JSON", "MISSING");
  rfPresent  ? ok("GOOGLE_DRIVE_ROOT_FOLDER_ID", "PRESENT") : bad("GOOGLE_DRIVE_ROOT_FOLDER_ID", "MISSING");
  isDriveConfigured() ? ok("isDriveConfigured()") : bad("isDriveConfigured()", "returns false");

  if (!isDriveConfigured()) {
    bad("Drive connection", "Skipped — credentials missing");
    return <Results items={results} stopped />;
  }

  // ── 2. Auth + root folder ──────────────────────────────────────────────────
  let drive: any;
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
  try {
    const { google } = await import("googleapis");
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!;
    // Repair literal newlines inside private_key (common Vercel paste issue)
    let credentials: unknown;
    try {
      credentials = JSON.parse(raw);
    } catch {
      const repaired = raw.replace(
        /"private_key"\s*:\s*"([\s\S]*?)"\s*,/,
        (_m: string, key: string) => `"private_key": "${key.replace(/\r?\n/g, "\\n")}",`,
      );
      credentials = JSON.parse(repaired);
      ok("JSON repair applied", "private_key newlines were literal — normalized to \\n. Update Vercel env var to avoid this.");
    }
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/drive"] });
    drive = google.drive({ version: "v3", auth });
    ok("Google Drive auth");
  } catch (e: any) {
    bad("Google Drive auth", e.message);
    return <Results items={results} stopped />;
  }

  try {
    const meta = await drive.files.get({ fileId: rootId, fields: "id,name,trashed,capabilities" });
    if (meta.data.trashed) { bad("Root folder access", "folder is trashed"); return <Results items={results} stopped />; }
    ok("Root folder access", `"${meta.data.name}"`);
    meta.data.capabilities?.canAddChildren
      ? ok("Root folder write permission")
      : bad("Root folder write permission", "canAddChildren = false");
  } catch (e: any) {
    bad("Root folder access", e.message);
    return <Results items={results} stopped />;
  }

  // ── 3. Org structure — run 1 ───────────────────────────────────────────────
  const { data: existingRows } = await supabase
    .from("org_drive_folders")
    .select("folder_key, google_drive_folder_id")
    .eq("organization_id", orgId);

  const existingMap: Record<string,string> = {};
  for (const r of existingRows ?? []) existingMap[r.folder_key as string] = r.google_drive_folder_id as string;

  const run1 = await ensureOrgDriveStructure(orgId, existingMap);
  if (!run1.success) { bad("Org structure provisioning", run1.error); }
  else {
    const total1 = Object.keys(run1.data).length;
    ok("Org structure provisioning — run 1", `${total1} folders`);

    // Persist to DB
    const newEntries = Object.entries(run1.data).filter(([k]) => !existingMap[k]);
    if (newEntries.length > 0) {
      const { error: upsertErr } = await supabase.from("org_drive_folders").upsert(
        newEntries.map(([key, folderId]) => ({
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
      else ok("org_drive_folders upserted", `${newEntries.length} new rows`);
    } else {
      ok("org_drive_folders", "All folders already in DB — no upsert needed");
    }

    // ── 4. Idempotency — run 2 ───────────────────────────────────────────────
    const run2 = await ensureOrgDriveStructure(orgId, run1.data); // all known
    if (!run2.success) { bad("Idempotency — run 2", run2.error); }
    else {
      const total2 = Object.keys(run2.data).length;
      const newOnRun2 = Object.entries(run2.data).filter(([k]) => !run1.data[k]).length;
      const idsMatch  = Object.keys(run1.data).every((k) => run1.data[k] === run2.data[k]);
      newOnRun2 === 0 ? ok("Idempotency — no duplicates", "0 new folders on run 2") : bad("Idempotency — no duplicates", `${newOnRun2} new on run 2`);
      idsMatch ? ok("Idempotency — folder IDs consistent") : bad("Idempotency — folder IDs inconsistent");
    }
  }

  // ── 5. Mia's student folder ────────────────────────────────────────────────
  const studentsFolderId = run1.success ? run1.data["students"] : undefined;
  const miaResult = await createStudentFolderTree(MIA_DISPLAY, MIA_NAME, orgId, studentsFolderId);
  if (!miaResult.success) {
    bad("Mia student folder", miaResult.error);
  } else {
    ok("Mia student folder", `ID: ${miaResult.data.rootFolder.folderId} (wasExisting: ${miaResult.data.wasExisting})`);
    miaResult.data.subfolders.length === 13
      ? ok("13 student subfolders", "All 13 present")
      : bad("13 student subfolders", `Only ${miaResult.data.subfolders.length}`);

    // Verify placed under Students/
    try {
      const meta = await drive.files.get({ fileId: miaResult.data.rootFolder.folderId, fields: "parents" });
      const underStudents = studentsFolderId && meta.data.parents?.includes(studentsFolderId);
      underStudents
        ? ok("Mia folder under Students/")
        : bad("Mia folder under Students/", `parents: ${meta.data.parents?.join(", ")}`);
    } catch { skip("Mia folder parent check"); }

    // ── 6. DB metadata ─────────────────────────────────────────────────────
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
    const { error: sfErr } = await supabase.from("student_drive_folders").upsert(sfToInsert as never, { onConflict: "student_id,folder_key" });
    sfErr ? bad("DB — student_drive_folders upserted", sfErr.message) : ok("DB — student_drive_folders upserted", "13 rows");

    const { data: miaCheck } = await supabase
      .from("students")
      .select("google_drive_folder_id,drive_folder_status,student_display_id")
      .eq("id", MIA_ID).single();
    miaCheck?.google_drive_folder_id === miaResult.data.rootFolder.folderId && miaCheck?.drive_folder_status === "active"
      ? ok("DB — readback verified", `status=active, displayId=${miaCheck.student_display_id}`)
      : bad("DB — readback mismatch", JSON.stringify(miaCheck));

    // ── 7. Mia idempotency ────────────────────────────────────────────────
    const miaRun2 = await createStudentFolderTree(MIA_DISPLAY, MIA_NAME, orgId, studentsFolderId);
    if (!miaRun2.success) { bad("Mia idempotency — run 2", miaRun2.error); }
    else {
      miaRun2.data.rootFolder.folderId === miaResult.data.rootFolder.folderId
        ? ok("Mia idempotency — same folder ID on run 2")
        : bad("Mia idempotency — different folder ID on run 2", miaRun2.data.rootFolder.folderId);
      miaRun2.data.wasExisting ? ok("Mia idempotency — wasExisting=true") : bad("Mia idempotency — wasExisting should be true");
    }

    // ── 7b. Cleanup orphaned Mia folders (from runs that used broken description query) ──
    try {
      const orphanList = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${MIA_DISPLAY} — ${MIA_NAME}' and trashed=false`,
        fields: "files(id,name,parents)",
        pageSize: 20,
      });
      const allMia   = orphanList.data.files ?? [];
      const canonical = miaResult.data.rootFolder.folderId;
      const orphans   = allMia.filter((f: any) => f.id !== canonical);
      for (const orphan of orphans) {
        await drive.files.update({ fileId: orphan.id, requestBody: { trashed: true } }).catch(() => {});
      }
      orphans.length > 0
        ? ok("Orphaned Mia folders trashed", `${orphans.length} duplicate(s) removed`)
        : ok("Orphaned Mia folders", "No orphans found");
    } catch (e: any) {
      skip("Orphaned Mia folder cleanup", e.message);
    }

    // ── 8. Private upload test ────────────────────────────────────────────
    const targetSubfolderId = miaResult.data.subfolders.find((s) => s.key === "academic_records")?.folderId
      ?? miaResult.data.rootFolder.folderId;
    const content = Buffer.from(`SchoolCo Drive verification — ${new Date().toISOString()} — DELETE ME`);
    const uploadRes = await uploadFileToDrive(content, "__drive_verify_delete_me.txt", "text/plain", targetSubfolderId);
    if (!uploadRes.success) {
      bad("Private upload test", uploadRes.error);
    } else {
      ok("Private upload test", `File ID: ${uploadRes.data.fileId}`);

      // Verify not public
      try {
        const permsRes = await drive.permissions.list({ fileId: uploadRes.data.fileId, fields: "permissions(type,role)" });
        const publicPerm = (permsRes.data.permissions ?? []).find((p: any) => p.type === "anyone");
        publicPerm ? bad("File not public", "has 'anyone' permission") : ok("File not public", "no public permissions");
      } catch { skip("File privacy check"); }

      // Delete test file
      try {
        await drive.files.delete({ fileId: uploadRes.data.fileId });
        ok("Test file deleted");
      } catch { bad("Test file cleanup"); }
    }
  }

  // ── 9. Security spot-checks ────────────────────────────────────────────────
  if (run1.success) {
    const checkKeys = ["students", "incident_reports"];
    let anyPublic = false;
    for (const key of checkKeys) {
      const fid = run1.data[key];
      if (!fid) continue;
      try {
        const perms = await drive.permissions.list({ fileId: fid, fields: "permissions(type)" });
        if ((perms.data.permissions ?? []).some((p: any) => p.type === "anyone")) anyPublic = true;
      } catch { /* ignore */ }
    }
    anyPublic ? bad("No public org folders", "a folder has 'anyone' access") : ok("No public org folders", "students + incident_reports checked");
  }

  // ── org_drive_folders row count ───────────────────────────────────────────
  // head:true returns data=null — count is in the `count` property, not `data`
  const { count: orgFolderCount, error: countErr } = await supabase
    .from("org_drive_folders")
    .select("folder_key", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (countErr) {
    bad("Org Drive folders in DB", countErr.message);
  } else {
    const n = orgFolderCount ?? 0;
    n > 0 ? ok("Org Drive folders in DB", `${n} rows`) : bad("Org Drive folders in DB", "0 rows — upsert may have failed silently");
  }

  return <Results items={results} />;
}

function Results({ items, stopped }: { items: R[]; stopped?: boolean }) {
  const passN = items.filter((r) => r.status === "PASS").length;
  const failN = items.filter((r) => r.status === "FAIL").length;
  return (
    <div style={{ fontFamily: "monospace", padding: "2rem", maxWidth: 900 }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Drive Verification Results</h1>
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
      <p style={{ marginTop: 16, fontWeight: "bold" }}>
        {passN} PASS · {failN} FAIL
        {failN === 0 && !stopped
          ? " — ✓ DRIVE INTEGRATION VERIFIED"
          : " — ✗ ISSUES FOUND"}
      </p>
      <p style={{ marginTop: 8, color: "#888", fontSize: 12 }}>
        DELETE this page after verification: src/app/(dashboard)/dashboard/admin/drive-verify/page.tsx
      </p>
    </div>
  );
}
