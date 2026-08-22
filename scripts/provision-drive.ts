/**
 * Bulk Drive folder provisioning for all 18 RLA students.
 * Safe to re-run: skips students that already have active Drive folders.
 *
 * Run:  npx tsx --tsconfig tsconfig.json scripts/provision-drive.ts
 * Test: npx tsx --tsconfig tsconfig.json scripts/provision-drive.ts --dry-run
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
for (const f of [".env.local", ".env.production.local"]) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) {
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (m && !process.env[m[1]]) {
        let val = m[2].trim();
        // Strip surrounding outer quotes added by vercel env pull
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[m[1]] = val;
      }
    }
  }
}

import { createClient } from "@supabase/supabase-js";
import { isDriveConfigured, ensureOrgDriveStructure, createStudentFolderTree } from "@/lib/drive/driveClient";
import { getOrgFolderName, getSubfolder } from "@/lib/drive/types";

const DRY_RUN = process.argv.includes("--dry-run");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const ORG_ID = "9fd43346-f43b-41d1-9b4c-fe8702471b07";

function ok(msg: string)   { console.log(`  ✓  ${msg}`); }
function warn(msg: string) { console.log(`  ⚠  ${msg}`); }
function err(msg: string)  { console.error(`  ✘  ${msg}`); }

async function main() {
  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`  SchoolCo — Drive Bulk Provisioning${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`══════════════════════════════════════════════════════\n`);

  if (!isDriveConfigured()) {
    err("Drive not configured (missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_DRIVE_ROOT_FOLDER_ID)");
    process.exit(1);
  }
  ok("Drive configured");

  // ── Resolve org-level Drive structure ─────────────────────────────────────────
  const { data: orgFolderRow } = await sb.from("org_drive_folders")
    .select("google_drive_folder_id")
    .eq("organization_id", ORG_ID).eq("folder_key", "students").single();

  let studentsFolderId: string;
  if (orgFolderRow?.google_drive_folder_id) {
    studentsFolderId = (orgFolderRow as any).google_drive_folder_id;
    ok(`Students folder: ${studentsFolderId}`);
  } else {
    ok("Provisioning org Drive structure…");
    if (!DRY_RUN) {
      const prov = await ensureOrgDriveStructure(ORG_ID, undefined as never, sb as never);
      if (!(prov as any).success) { err(`Org structure: ${(prov as any).error}`); process.exit(1); }
      studentsFolderId = (prov as any).folderMap?.["students"] ?? process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
      ok(`Org structure provisioned. Students folder: ${studentsFolderId}`);
    } else {
      studentsFolderId = "DRY-STUDENTS-FOLDER";
    }
  }

  // ── Load students ─────────────────────────────────────────────────────────────
  const { data: students } = await sb.from("students")
    .select("id, first_name, last_name, student_display_id, google_drive_folder_id, drive_folder_status")
    .eq("organization_id", ORG_ID).order("student_display_id");

  const total = (students ?? []).length;
  ok(`Loaded ${total} students`);

  let provisioned = 0, skipped = 0, failed = 0;
  const failures: { name: string; error: string }[] = [];

  for (const stu of (students ?? []) as any[]) {
    const displayId  = stu.student_display_id ?? stu.id;
    const stuName    = `${stu.first_name} ${stu.last_name}`;
    const fullLabel  = `${displayId} — ${stuName}`;

    // Skip if already active
    if (stu.drive_folder_status === "active" && stu.google_drive_folder_id) {
      ok(`SKIP ${fullLabel} (already provisioned: ${stu.google_drive_folder_id})`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      ok(`DRY ${fullLabel}`);
      provisioned++;
      continue;
    }

    // Mark as creating
    await sb.from("students").update({ drive_folder_status: "creating" } as never).eq("id", stu.id);

    const result = await createStudentFolderTree(displayId, stuName, ORG_ID, studentsFolderId);

    if (!result.success) {
      await sb.from("students").update({ drive_folder_status: "error", drive_error_message: result.error } as never).eq("id", stu.id);
      err(`${fullLabel}: ${result.error}`);
      failures.push({ name: fullLabel, error: result.error });
      failed++;
      continue;
    }

    const { rootFolder, subfolders } = result.data;

    // Persist in org_drive_folders
    for (const [key, fid] of Object.entries(subfolders as Record<string, string>)) {
      await sb.from("org_drive_folders").upsert({
        organization_id:        ORG_ID,
        student_id:             stu.id,
        folder_key:             key,
        google_drive_folder_id: fid,
        parent_folder_id:       rootFolder.folderId,
      } as never, { onConflict: "organization_id,student_id,folder_key" });
    }

    // Update student record
    await sb.from("students").update({
      google_drive_folder_id:  rootFolder.folderId,
      google_drive_folder_url: rootFolder.folderUrl,
      drive_folder_status:     "active",
      drive_folder_created_at: new Date().toISOString(),
      drive_error_message:     null,
    } as never).eq("id", stu.id);

    ok(`${fullLabel}: ${rootFolder.folderUrl}`);
    provisioned++;

    // Small delay to avoid Drive API rate limits
    await new Promise((r) => setTimeout(r, 600));
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n══════════════════════════════════════════════════════`);
  console.log(`  DRIVE PROVISIONING ${DRY_RUN ? "DRY RUN " : ""}COMPLETE`);
  console.log(`  Provisioned: ${provisioned}`);
  console.log(`  Skipped:     ${skipped}`);
  console.log(`  Failed:      ${failed}`);
  if (failures.length) {
    console.log(`\n  Failures:`);
    for (const f of failures) console.log(`    ✘  ${f.name}: ${f.error}`);
  }
  console.log(`══════════════════════════════════════════════════════\n`);

  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
