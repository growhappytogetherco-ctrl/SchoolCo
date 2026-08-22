/**
 * PRODUCTION LIVE IMPORT — RLA Roster
 *
 * Uses the real SchoolCo parser + mapper + Drive provisioner.
 * Calls Supabase via service role key (auth not required for script execution).
 * Follows identical insertion logic to src/app/actions/importData.ts:executeImport.
 *
 * SAFETY:
 *   - Excludes Stevie Beckham (DOB_VERIFICATION_REQUIRED tag in notes)
 *   - Does NOT send parent invitations
 *   - Does NOT create auth users
 *   - DRY_RUN env var will skip DB writes (for local testing)
 *
 * Run:  npx tsx --tsconfig tsconfig.json scripts/run-live-import.ts [--dry-run]
 */

import { readFileSync, existsSync } from "fs";
import { resolve }                  from "path";
import { createClient }             from "@supabase/supabase-js";

// ── Load env ──────────────────────────────────────────────────────────────────
for (const envFile of [".env.local", ".env.production.local"]) {
  const envPath = resolve(process.cwd(), envFile);
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

const DRY_RUN = process.argv.includes("--dry-run");

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) { console.error("Missing SUPABASE env vars"); process.exit(1); }

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Import parser/mapper (no Next.js deps) ───────────────────────────────────
// We use tsx path aliases via --tsconfig, so @/ resolves to ./src/
import { parseCSV }                 from "@/lib/import/csvParser";
import { mapRows }                  from "@/lib/import/mapper";
import { validateMappedStudents }   from "@/lib/import/validators";
import {
  isDriveConfigured,
  detectSharedDriveId,
  getFolderDriveId,
  ensureOrgDriveStructure,
  createStudentFolderTree,
} from "@/lib/drive/driveClient";
import { getOrgFolderName, getSubfolder } from "@/lib/drive/types";

// ── Load CSV ──────────────────────────────────────────────────────────────────
const csvPath = resolve(process.cwd(), "import/real_rla_roster_import.csv");
const csvText = readFileSync(csvPath, "utf8");

// ── Log helpers ───────────────────────────────────────────────────────────────
const importLog: string[] = [];
function info(msg: string)  { console.log(`  ℹ  ${msg}`);  importLog.push(`INFO  ${msg}`); }
function warn(msg: string)  { console.warn(`  ⚠  ${msg}`); importLog.push(`WARN  ${msg}`); }
function err(msg: string)   { console.error(`  ✘  ${msg}`);importLog.push(`ERR   ${msg}`); }
function ok(msg: string)    { console.log(`  ✓  ${msg}`);  importLog.push(`OK    ${msg}`); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  SchoolCo — LIVE RLA Roster Import${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (DRY_RUN) console.log("  ⚠️  DRY RUN MODE — no database writes will occur\n");

  // ── Get org + admin user ─────────────────────────────────────────────────────
  const { data: orgs } = await sb.from("organizations").select("id, slug, name").limit(5);
  const org = (orgs as any[])?.find((o: any) => o.slug === "rla" || o.slug === "rising-leaders-academy")
           ?? (orgs as any[])?.[0];
  if (!org) { err("No organization found"); process.exit(1); }
  const orgId: string = org.id;
  console.log(`  Org: ${org.name} (${orgId})`);

  // Get admin profile (Elisa's profile = the one auth user in the DB)
  const { data: adminProfile } = await sb.from("profiles").select("id, full_name, email").limit(1).single();
  const adminId: string = (adminProfile as any)?.id;
  console.log(`  Admin: ${(adminProfile as any)?.full_name} (${(adminProfile as any)?.email})`);
  if (!adminId) { err("No admin profile found"); process.exit(1); }

  // ── Parse + map + validate CSV ───────────────────────────────────────────────
  const { rows } = parseCSV(csvText);
  const mapped   = mapRows(rows);
  const { validRows, invalidRows } = validateMappedStudents(mapped);

  console.log(`\n  CSV rows: ${rows.length}  |  Valid: ${validRows.length}  |  Invalid: ${invalidRows.length}`);
  if (invalidRows.length) {
    for (const iv of invalidRows) warn(`Row ${iv._rowIndex}: ${iv.first_name} ${iv.last_name} — validation failed`);
  }

  // ── Exclude Stevie Beckham ────────────────────────────────────────────────────
  const approvedRows = validRows.filter((s) => {
    const isStevieBeckham = s.first_name.toLowerCase() === "stevie" && s.last_name.toLowerCase() === "beckham";
    if (isStevieBeckham) {
      warn("Stevie Beckham EXCLUDED — DOB_VERIFICATION_REQUIRED. Will NOT be imported.");
      return false;
    }
    return true;
  });

  console.log(`\n  Students approved for import: ${approvedRows.length}`);
  console.log(`  Students excluded: ${validRows.length - approvedRows.length} (Stevie Beckham — DOB pending)\n`);

  // ── Pre-import snapshot ───────────────────────────────────────────────────────
  const snap = async (table: string) => {
    const { count } = await (sb.from(table) as any).select("id", { count: "exact", head: true });
    return count ?? 0;
  };
  const pre = {
    students:     await snap("students"),
    families:     await snap("families"),
    households:   await snap("households"),
    guardianships: await snap("guardianships"),
    profiles:     await snap("profiles"),
    drive_folders: await snap("student_drive_folders"),
  };
  console.log(`  Pre-import counts: students=${pre.students} families=${pre.families} households=${pre.households} guardianships=${pre.guardianships} profiles=${pre.profiles}`);
  if (pre.students > 0) {
    err(`${pre.students} students already exist — aborting to prevent duplicate import`);
    process.exit(1);
  }

  // ── Drive setup ───────────────────────────────────────────────────────────────
  let studentsFolderIdForImport: string | null = null;
  let sharedDriveIdForImport:    string | null = null;
  const driveFailures: Array<{ name: string; error: string }> = [];

  if (isDriveConfigured()) {
    console.log("  Setting up Google Drive...");
    sharedDriveIdForImport = await detectSharedDriveId();

    const { data: existingOrgRows } = await sb
      .from("org_drive_folders")
      .select("folder_key, google_drive_folder_id")
      .eq("organization_id", orgId);

    let existingOrgMap: Record<string, string> = {};
    for (const row of (existingOrgRows ?? []) as any[]) {
      existingOrgMap[row.folder_key] = row.google_drive_folder_id;
    }

    // Validate cache against active Drive
    if (sharedDriveIdForImport && Object.keys(existingOrgMap).length > 0) {
      const [, sampleId] = Object.entries(existingOrgMap)[0];
      const sampleDriveId = await getFolderDriveId(sampleId);
      if (sampleDriveId !== sharedDriveIdForImport) {
        warn(`org_drive_folders cache stale (driveId=${sampleDriveId ?? "My Drive"}) — re-provisioning in Shared Drive`);
        existingOrgMap = {};
      }
    }

    if (!DRY_RUN) {
      const orgResult = await ensureOrgDriveStructure(orgId, existingOrgMap);
      if (!orgResult.success) {
        err(`Drive setup failed: ${orgResult.error}`);
        process.exit(1);
      }
      await sb.from("org_drive_folders").upsert(
        Object.entries(orgResult.data).map(([key, folderId]) => ({
          organization_id:         orgId,
          folder_key:              key,
          folder_name:             getOrgFolderName(key),
          google_drive_folder_id:  folderId,
          google_drive_folder_url: `https://drive.google.com/drive/folders/${folderId}`,
          provisioned_by:          adminId,
          provisioned_at:          new Date().toISOString(),
        })) as never,
        { onConflict: "organization_id,folder_key" }
      );
      studentsFolderIdForImport = orgResult.data["students"] ?? null;
      ok(`Drive org structure verified. Students folder: ${studentsFolderIdForImport}`);
    } else {
      info("DRY RUN: Drive org structure check skipped");
    }
  } else {
    warn("Drive not configured — skipping Drive provisioning");
  }

  // ── Caches ────────────────────────────────────────────────────────────────────
  const existingStudentMap     = new Map<string, string>();
  const existingFamilyMap      = new Map<string, string>();
  const existingProfileEmailMap = new Map<string, string>();

  // Load admin profile email into map so Elisa isn't re-created as a guardian
  if ((adminProfile as any)?.email) {
    existingProfileEmailMap.set((adminProfile as any).email.toLowerCase(), adminId);
  }

  // ── Import tracking ───────────────────────────────────────────────────────────
  const results: Array<{
    row: number;
    name: string;
    studentId: string;
    displayId: string;
    familyId: string;
    familyAction: "insert" | "link";
    guardians: number;
    drive: "ok" | "failed" | "skipped";
    hasMedical: boolean;
    hasNote: boolean;
  }> = [];

  let insertedStudents = 0, insertedFamilies = 0, insertedHouseholds = 0;
  let insertedGuardians = 0, insertedMedical = 0, insertedNotes = 0;
  let skippedStudents = 0;

  console.log("\n  ── Importing students ──\n");

  // ── Row-by-row import ─────────────────────────────────────────────────────────
  for (const s of approvedRows) {
    const fullName = `${s.first_name} ${s.last_name}`;
    const normName = fullName.toLowerCase();

    if (existingStudentMap.has(normName)) {
      warn(`Row ${s._rowIndex}: SKIP duplicate "${fullName}"`);
      skippedStudents++;
      continue;
    }

    try {
      // ── 1. Family ──────────────────────────────────────────────────────
      const famNorm = (s.family?.family_name ?? "").toLowerCase();
      let familyId  = existingFamilyMap.get(famNorm) ?? "";
      let famAction: "insert" | "link" = "link";

      if (!familyId) {
        famAction = "insert";
        if (!DRY_RUN) {
          const { data: fam, error: famErr } = await sb
            .from("families")
            .insert({
              organization_id:    orgId,
              family_name:        s.family!.family_name,
              is_split_household: s.family!.is_split_household,
              created_by:         adminId,
            })
            .select("id").single();
          if (famErr || !fam) throw new Error(`Family insert: ${famErr?.message}`);
          familyId = (fam as any).id;
          insertedFamilies++;
          existingFamilyMap.set(famNorm, familyId);

          // Household
          if (s.family?.household) {
            const hh = s.family.household;
            const addrJson = hh.address_street ? {
              street1: hh.address_street, city: hh.address_city,
              state: hh.address_state,   zip: hh.address_zip,
            } : null;
            await sb.from("households").insert({
              organization_id: orgId,
              family_id:       familyId,
              household_label: hh.household_label,
              sort_order:      hh.sort_order,
              address_json:    addrJson as never,
              phone:           hh.phone,
              email:           hh.email,
              created_by:      adminId,
            });
            insertedHouseholds++;
          }
        } else {
          familyId = `DRY-FAM-${famNorm}`;
          existingFamilyMap.set(famNorm, familyId);
        }
      }

      // ── 2. Student ──────────────────────────────────────────────────────
      let studentId  = "";
      let displayId  = "";

      if (!DRY_RUN) {
        const { data: stu, error: stuErr } = await sb
          .from("students")
          .insert({
            organization_id:        orgId,
            family_id:              familyId,
            first_name:             s.first_name,
            last_name:              s.last_name,
            preferred_name:         s.preferred_name,
            grade_level:            s.grade_level,
            enrollment_status:      s.enrollment_status,
            date_of_birth:          s.date_of_birth,
            medical_notes:          s.medical_notes,
            allergies:              s.allergies as never,
            scholarship_info:       s.scholarship_info as never,
            authorized_pickup_notes: s.authorized_pickup_notes,
            created_by:             adminId,
          } as never)
          .select("id, student_display_id")
          .single();

        if (stuErr || !stu) throw new Error(`Student insert: ${stuErr?.message}`);
        studentId = (stu as any).id;
        displayId = (stu as any).student_display_id ?? "";
        insertedStudents++;
        existingStudentMap.set(normName, studentId);
        ok(`${displayId} — ${fullName} (id: ${studentId})`);
      } else {
        studentId = `DRY-STU-${normName.replace(/ /g,"-")}`;
        displayId = `RLA-S${String(insertedStudents + 1).padStart(4,"0")}`;
        insertedStudents++;
        existingStudentMap.set(normName, studentId);
        ok(`${displayId} — ${fullName} [DRY RUN]`);
      }

      // ── 2b. Drive folder ──────────────────────────────────────────────
      let driveStatus: "ok" | "failed" | "skipped" = "skipped";
      if (isDriveConfigured() && studentsFolderIdForImport && !DRY_RUN) {
        const driveResult = await createStudentFolderTree(
          displayId, fullName, orgId,
          studentsFolderIdForImport,
          sharedDriveIdForImport ?? undefined,
        );
        if (driveResult.success) {
          driveStatus = "ok";
          const folderName = `${displayId} — ${fullName}`;
          await sb.from("students").update({
            google_drive_folder_id:  driveResult.data.rootFolder.folderId,
            google_drive_folder_url: driveResult.data.rootFolder.folderUrl,
            drive_folder_status:     "active",
            drive_folder_created_at: new Date().toISOString(),
            drive_folder_name:       folderName,
            drive_provisioned_by:    adminId,
            drive_error_message:     null,
          } as never).eq("id", studentId);

          const sfRows = driveResult.data.subfolders.map((sf: any) => {
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
          await sb.from("student_drive_folders").upsert(sfRows as never, { onConflict: "student_id,folder_key" });
          info(`  Drive: ${driveResult.data.subfolders.length} subfolders created`);
        } else {
          driveStatus = "failed";
          driveFailures.push({ name: fullName, error: driveResult.error });
          warn(`  Drive FAILED for ${fullName}: ${driveResult.error}`);
          if (!DRY_RUN) {
            await sb.from("students").update({
              drive_folder_status: "error",
              drive_error_message: driveResult.error,
            } as never).eq("id", studentId);
          }
        }
      }

      // ── 3. Guardians ──────────────────────────────────────────────────
      let guardiansThisRow = 0;
      for (const g of s.guardians ?? []) {
        try {
          let profileId: string | undefined;
          if (g.email) profileId = existingProfileEmailMap.get(g.email.toLowerCase());

          if (!profileId && !DRY_RUN) {
            const { data: prof } = await sb
              .from("profiles")
              .insert({ full_name: g.full_name, email: g.email, phone: g.phone } as never)
              .select("id").single();
            if (prof) {
              profileId = (prof as any).id;
              insertedGuardians++;
              if (g.email) existingProfileEmailMap.set(g.email.toLowerCase(), profileId!);
            }
          } else if (!profileId) {
            profileId = `DRY-PROF-${g.full_name.toLowerCase().replace(/ /g,"-")}`;
            insertedGuardians++;
          }

          if (profileId && !DRY_RUN) {
            await sb.from("guardianships").insert({
              organization_id:         orgId,
              profile_id:              profileId,
              student_id:              studentId,
              relationship_type:       g.relationship_type as never,
              custody_type:            g.custody_type as never,
              is_legal_guardian:       g.is_legal_guardian,
              is_primary_contact:      g.is_primary_contact,
              is_emergency_contact:    g.is_emergency_contact,
              emergency_contact_order: g.emergency_contact_order,
              can_pickup:              g.can_pickup,
              pickup_restrictions:     g.pickup_restrictions,
              created_by:              adminId,
            } as never);
          }
          guardiansThisRow++;
        } catch (gErr) {
          warn(`  Guardian "${g.full_name}" for ${fullName}: ${gErr}`);
        }
      }

      // ── 4. Medical ─────────────────────────────────────────────────────
      let hasMed = false;
      if (s.medical && !DRY_RUN) {
        await sb.from("student_medical").insert({
          organization_id:        orgId,
          student_id:             studentId,
          medical_conditions:     s.medical.medical_conditions as never,
          special_accommodations: s.medical.special_accommodations as never,
          notes:                  s.medical.notes,
          primary_doctor_name:    s.medical.primary_doctor_name,
          primary_doctor_phone:   s.medical.primary_doctor_phone,
          insurance_provider:     s.medical.insurance_provider,
          insurance_policy_number: s.medical.insurance_policy_number,
          updated_by:             adminId,
        } as never);
        insertedMedical++;
        hasMed = true;
      } else if (s.medical) {
        hasMed = true;
      }

      // ── 5. Staff note ──────────────────────────────────────────────────
      let hasNote = false;
      for (const n of s.notes ?? []) {
        if (!DRY_RUN) {
          await sb.from("staff_notes").insert({
            organization_id: orgId,
            student_id:      studentId,
            author_id:       adminId,
            category:        n.category,
            priority:        n.priority,
            title:           n.title,
            body:            n.body,
            is_pinned:       n.is_pinned,
          } as never);
          insertedNotes++;
        }
        hasNote = true;
      }

      results.push({
        row:        s._rowIndex,
        name:       fullName,
        studentId,
        displayId,
        familyId,
        familyAction: famAction,
        guardians:    guardiansThisRow,
        drive:        driveStatus,
        hasMedical:   hasMed,
        hasNote,
      });

    } catch (rowErr) {
      err(`Row ${s._rowIndex}: FAILED for "${fullName}" — ${rowErr}`);
    }
  }

  // ── Post-import verification ────────────────────────────────────────────────
  console.log("\n  ── Post-import counts ──\n");
  const post = DRY_RUN ? { students: insertedStudents, families: insertedFamilies, households: insertedHouseholds } : {
    students:    await snap("students"),
    families:    await snap("families"),
    households:  await snap("households"),
  };
  console.log(`  Students:    ${post.students} (expected 18)`);
  console.log(`  Families:    ${post.families} (expected 7)`);
  console.log(`  Households:  ${post.households} (expected 7)`);

  // ── Summary table ──────────────────────────────────────────────────────────
  console.log("\n  ── Import Results ──\n");
  console.log("  Display ID  | Student Name                          | Family        | Drive  | Med | Note");
  console.log("  ──────────────────────────────────────────────────────────────────────────────────────────");
  for (const r of results) {
    const driveIcon = r.drive === "ok" ? "✓" : r.drive === "failed" ? "✘" : "–";
    const famLabel  = r.familyAction === "insert" ? "NEW" : "link";
    console.log(
      `  ${r.displayId.padEnd(12)} | ${r.name.padEnd(36)} | ${famLabel.padEnd(13)} | ${driveIcon.padEnd(6)} | ${r.hasMedical ? "✓" : "–"}   | ${r.hasNote ? "✓" : "–"}`
    );
  }

  console.log(`\n  Inserted: ${insertedStudents} students, ${insertedFamilies} families, ${insertedHouseholds} households, ${insertedGuardians} guardian profiles, ${insertedMedical} medical records, ${insertedNotes} staff notes`);
  if (driveFailures.length) {
    console.error(`\n  Drive failures (${driveFailures.length}):`);
    for (const f of driveFailures) console.error(`    ✘  ${f.name}: ${f.error}`);
  }

  // ── Audit record ──────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    await sb.from("import_jobs").insert({
      organization_id:     orgId,
      created_by:          adminId,
      entity_type:         "students",
      file_name:           "real_rla_roster_import.csv",
      status:              "completed",
      source:              "csv",
      total_rows:          rows.length,
      inserted_students:   insertedStudents,
      inserted_families:   insertedFamilies,
      inserted_households: insertedHouseholds,
      inserted_guardians:  insertedGuardians,
      inserted_medical:    insertedMedical,
      inserted_notes:      insertedNotes,
      skipped_students:    skippedStudents,
      completed_at:        new Date().toISOString(),
      import_log:          importLog as never,
    });
    console.log("\n  ✓  import_jobs audit record created");
  }

  const allOk = insertedStudents === 18 && driveFailures.length === 0;
  console.log("\n════════════════════════════════════════════════════════════");
  if (DRY_RUN) {
    console.log("  DRY RUN COMPLETE — no data written");
  } else if (allOk) {
    console.log("  ✅  LIVE IMPORT COMPLETE — 18 students, Drive provisioned");
  } else {
    console.log(`  ⚠️  IMPORT COMPLETE WITH ISSUES — students=${insertedStudents}/18 drive_failures=${driveFailures.length}`);
  }
  console.log("════════════════════════════════════════════════════════════\n");

  process.exit(allOk || DRY_RUN ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

// ── helper (re-declared locally so tsx can tree-shake unused deps) ──────────
async function snap(table: string): Promise<number> {
  const { count } = await (sb.from(table) as any).select("id", { count: "exact", head: true });
  return count ?? 0;
}
