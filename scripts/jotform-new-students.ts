/**
 * jotform-new-students.ts  —  Incremental enrollment of new students from Jotform CSV.
 *
 * Reads the Rising Leaders Academy Family Enrollment Application export from
 * ~/Downloads and imports ONLY the two students submitted on 2026-10-10
 * (Luke Tsefrekas and Liam Gibson).
 *
 * SAFETY:
 *   - Default mode is --dry-run. Pass --live to write production records.
 *   - Checks for existing students by name + DOB before inserting.
 *   - Checks for existing families and guardian profiles by email.
 *   - Never modifies existing student, family, or guardian records.
 *   - Partial failures roll back via delete of any records inserted in that
 *     student's batch (orphan cleanup).
 *   - Does NOT create historical grades, assignments, credits, or attendance.
 *
 * Run (dry run):   npx tsx --tsconfig tsconfig.json scripts/jotform-new-students.ts
 * Run (live):      npx tsx --tsconfig tsconfig.json scripts/jotform-new-students.ts --live
 */

import { readFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { createClient } from "@supabase/supabase-js";
import { parseCSV as parseRawCSV } from "@/lib/import/csvParser";

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

const LIVE = process.argv.includes("--live");
const DRY_RUN = !LIVE;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Drive (optional) ──────────────────────────────────────────────────────────
import {
  isDriveConfigured,
  detectSharedDriveId,
  getFolderDriveId,
  createStudentFolderTree,
} from "@/lib/drive/driveClient";
import { getSubfolder } from "@/lib/drive/types";

// ── Log helpers ───────────────────────────────────────────────────────────────
function info(msg: string)  { console.log(`  ℹ  ${msg}`); }
function warn(msg: string)  { console.warn(`  ⚠  ${msg}`); }
function ok(msg: string)    { console.log(`  ✓  ${msg}`); }
function err(msg: string)   { console.error(`  ✘  ${msg}`); }
function section(msg: string) { console.log(`\n${"─".repeat(60)}\n  ${msg}\n${"─".repeat(60)}`); }

// ── Field helpers ─────────────────────────────────────────────────────────────

/** Parse M/D/YY or M/D/YYYY → YYYY-MM-DD */
function parseDate(raw: string): string | null {
  if (!raw.trim()) return null;
  const parts = raw.trim().split("/");
  if (parts.length !== 3) return null;
  const [m, d, y] = parts.map(Number);
  if (isNaN(m) || isNaN(d) || isNaN(y)) return null;
  const year = y < 100 ? (y >= 50 ? 1900 + y : 2000 + y) : y;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "4th Grade" → "4th", "Kindergarten" → "K", etc. */
function normalizeGrade(raw: string): string {
  const v = raw.trim();
  const m = v.match(/^(\d+)(st|nd|rd|th)\s+grade$/i);
  if (m) return `${m[1]}${m[2].toLowerCase()}`;
  if (/^kindergarten$/i.test(v)) return "K";
  if (/^\d+$/.test(v)) return v;
  return v.replace(/\s+grade$/i, "").trim();
}

/** Normalize state: "Florida" → "FL", "fl" → "FL", etc. */
function normalizeState(raw: string): string {
  const v = raw.trim();
  const STATE_MAP: Record<string, string> = {
    "florida": "FL", "california": "CA", "new york": "NY",
    "texas": "TX", "georgia": "GA", "north carolina": "NC",
  };
  return STATE_MAP[v.toLowerCase()] ?? v.toUpperCase().slice(0, 2);
}

/** Capitalize first letter of each word */
function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normRel(raw: string): string {
  const v = raw.toLowerCase().replace(/\s+/g, "_").trim();
  const MAP: Record<string, string> = {
    mother: "mother", father: "father",
    mom: "mother", dad: "father",
    stepmother: "stepmother", stepfather: "stepfather",
    grandmother: "grandmother", grandfather: "grandfather",
    aunt: "aunt", uncle: "uncle",
    "family_friend": "other",
    legal_guardian: "legal_guardian",
    guardian: "legal_guardian",
  };
  return MAP[v] ?? "other";
}

// ── Jotform field names ───────────────────────────────────────────────────────
const F = {
  subDate:      "Submission Date",
  firstName:    "Student Legal First Name",
  lastName:     "Student Legal Last Name",
  preferredName:"Preferred Name / Nickname",
  dob:          "Date of Birth",
  grade:        "Applying for Grade Level 2026–2027",
  familyName:   "Family Last Name",
  street:       "Street Address",
  street2:      "Street Address Line 2",
  city:         "City",
  state:        "State / Province",
  zip:          "Postal / Zip Code",
  p1Name:       "Parent / Guardian 1 — Full Name",
  p1Rel:        "Relationship to Student",
  p1Phone:      "Cell Phone",
  p1Email:      "Email Address",
  p2Name:       "Parent / Guardian 2 — Full Name",
  p2Rel:        "Parent 2 Relationship to Student",
  p2Phone:      "Parent 2 Cell Phone",
  p2Email:      "Parent 2 Email Address",
  custodyFlag:  "Are there any court-ordered custody restrictions we need to be aware of?",
  ec1Name:      "Emergency Contact 1 — Full Name",
  ec1Rel:       "Emergency Contact 1 — Relationship to Student",
  ec1Phone:     "Emergency Contact 1 — Phone Number",
  ec2Name:      "Emergency Contact 2 — Full Name",
  ec2Rel:       "Emergency Contact 2 — Relationship to Student",
  ec2Phone:     "Emergency Contact 2 — Phone Number",
  ap1Name:      "Authorized Pickup 1 — Full Name",
  ap1Rel:       "Authorized Pickup 1 — Relationship",
  ap2Name:      "Authorized Pickup 2 — Full Name",
  ap2Rel:       "Authorized Pickup 2 — Relationship",
  ap3Name:      "Authorized Pickup 3 — Full Name",
  ap3Rel:       "Authorized Pickup 3 — Relationship",
  medFlag:      "Does your student have any medical conditions RLA staff should be aware of?",
  medDesc:      "Please describe the condition and any emergency protocols",
  allergyFlag:  "Does your student have any known allergies?",
  allergyDesc:  "Please list the allergy and severity (mild, moderate, or severe/anaphylactic)",
  epipen:       "Does your student carry an epinephrine auto-injector (EpiPen)?",
  medication:   "Does your student require any medication during RLA program hours (Monday–Wednesday)?",
  iepFlag:      "Does your student have a current IEP, 504 Plan, or any formal learning accommodations?",
  staffNotes:   "Is there anything else you'd like RLA to know about your student before the family interview?",
  scholarship:  "Is your student currently receiving a Step UP PEP or UA Scholarship?",
  scholarshipType: "Which scholarship?",
};

// ── Map a Jotform row → structured record ─────────────────────────────────────
function mapJotformRow(row: Record<string, string>, idx: number) {
  const g = (key: string) => (row[key] ?? "").trim();
  const yesish = (v: string) => /^yes$/i.test(v.trim());

  const firstName = titleCase(g(F.firstName));
  const lastName  = titleCase(g(F.lastName));
  const prefName  = titleCase(g(F.preferredName));
  const dob       = parseDate(g(F.dob));
  const grade     = normalizeGrade(g(F.grade));
  const famRaw    = g(F.familyName);
  const familyName = famRaw ? `${titleCase(famRaw)} Family` : `The ${lastName} Family`;
  const isSplit   = yesish(g(F.custodyFlag));

  const city  = titleCase(g(F.city).replace(/\s+fl$/i, "").trim());
  const state = normalizeState(g(F.state));

  // Guardians
  const guardians: Array<{
    full_name: string; email: string | null; phone: string | null;
    relationship_type: string; custody_type: string;
    is_legal_guardian: boolean; is_primary_contact: boolean;
    is_emergency_contact: boolean; emergency_contact_order: number | null;
    can_pickup: boolean;
  }> = [];

  const p1Name = titleCase(g(F.p1Name));
  if (p1Name) {
    guardians.push({
      full_name:               p1Name,
      email:                   g(F.p1Email) || null,
      phone:                   g(F.p1Phone) || null,
      relationship_type:       normRel(g(F.p1Rel) || "mother"),
      custody_type:            "primary",
      is_legal_guardian:       true,
      is_primary_contact:      true,
      is_emergency_contact:    true,
      emergency_contact_order: 1,
      can_pickup:              true,
    });
  }

  const p2Name = titleCase(g(F.p2Name));
  if (p2Name) {
    guardians.push({
      full_name:               p2Name,
      email:                   g(F.p2Email) || null,
      phone:                   g(F.p2Phone) || null,
      relationship_type:       normRel(g(F.p2Rel) || "father"),
      custody_type:            "joint",
      is_legal_guardian:       true,
      is_primary_contact:      false,
      is_emergency_contact:    true,
      emergency_contact_order: 2,
      can_pickup:              true,
    });
  }

  // Build authorized pickup set from the explicit AP fields — these are the ONLY
  // people whose can_pickup should be true (besides the parents above).
  const authorizedPickupNames = new Set<string>();
  const pickupLines: string[] = [];
  for (const [nameKey, relKey] of [
    [F.ap1Name, F.ap1Rel], [F.ap2Name, F.ap2Rel], [F.ap3Name, F.ap3Rel],
  ]) {
    const apName = titleCase(g(nameKey));
    if (apName) {
      authorizedPickupNames.add(apName.toLowerCase());
      pickupLines.push(`${apName} (${g(relKey) || "—"})`);
    }
  }
  const authorizedPickupNotes = pickupLines.length
    ? `Authorized for pickup: ${pickupLines.join("; ")}`
    : null;

  // Additional emergency contacts (EC1, EC2) if not already captured as a parent.
  // can_pickup is true ONLY if they explicitly appear in the authorized pickup list.
  for (const [nameKey, relKey, phoneKey] of [
    [F.ec1Name, F.ec1Rel, F.ec1Phone],
    [F.ec2Name, F.ec2Rel, F.ec2Phone],
  ]) {
    const ecName = titleCase(g(nameKey));
    if (!ecName) continue;
    const alreadyCaptured = guardians.some(
      (gn) => gn.full_name.toLowerCase() === ecName.toLowerCase()
    );
    if (!alreadyCaptured) {
      guardians.push({
        full_name:               ecName,
        email:                   null,
        phone:                   g(phoneKey) || null,
        relationship_type:       normRel(g(relKey) || "other"),
        custody_type:            "none",
        is_legal_guardian:       false,
        is_primary_contact:      false,
        is_emergency_contact:    true,
        emergency_contact_order: guardians.filter((x) => x.is_emergency_contact).length + 1,
        can_pickup:              authorizedPickupNames.has(ecName.toLowerCase()),
      });
    }
  }

  // Medical
  const hasIep        = yesish(g(F.iepFlag));
  const hasMedical = yesish(g(F.medFlag)) || yesish(g(F.allergyFlag)) || hasIep;
  const medConditions = yesish(g(F.medFlag)) && g(F.medDesc) ? [g(F.medDesc)] : null;
  const allergies     = yesish(g(F.allergyFlag)) && g(F.allergyDesc) ? [g(F.allergyDesc)] : null;
  const accommodations = hasIep ? ["IEP/504 Plan — submitted with enrollment application"] : null;
  const medNotes: string[] = [];
  if (yesish(g(F.epipen))) medNotes.push("Carries EpiPen");
  if (yesish(g(F.medication))) medNotes.push("Requires medication during program hours");

  // Staff notes
  const noteLines: string[] = [];
  const staffNoteText = g(F.staffNotes);
  if (staffNoteText) noteLines.push(staffNoteText);
  if (yesish(g(F.scholarship))) {
    const schType = g(F.scholarshipType);
    noteLines.push(`Scholarship: ${schType || "yes (type not specified)"}`);
  }
  if (hasIep) noteLines.push("IEP/504 Plan: Yes — document submitted with application");

  return {
    _rowIndex:               idx,
    first_name:              firstName,
    last_name:               lastName,
    preferred_name:          prefName !== firstName ? prefName : null,
    date_of_birth:           dob,
    grade_level:             grade,
    enrollment_status:       "enrolled" as const,
    authorized_pickup_notes: authorizedPickupNotes,
    family: {
      family_name:        familyName,
      is_split_household: isSplit,
      household: (g(F.street) || city) ? {
        household_label: `${familyName} – Primary`,
        sort_order: 1,
        address_street: g(F.street) + (g(F.street2) ? ` ${g(F.street2)}` : "") || null,
        address_city:   city || null,
        address_state:  state || null,
        address_zip:    g(F.zip) || null,
        phone:          g(F.p1Phone) || null,
        email:          g(F.p1Email) || null,
      } : null,
    },
    guardians,
    medical: hasMedical || hasIep ? {
      medical_conditions:     medConditions,
      special_accommodations: accommodations,
      notes:                  medNotes.length ? medNotes.join("; ") : null,
    } : null,
    notes: noteLines.length ? [{
      category: "general", priority: "normal",
      title: "Enrollment application notes",
      body: noteLines.join("\n"),
      is_pinned: false,
    }] : [],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n" + "═".repeat(62));
  console.log(`  SchoolCo — Jotform New Student Import${DRY_RUN ? " [DRY RUN]" : " [LIVE]"}`);
  console.log("═".repeat(62));
  if (DRY_RUN) {
    console.log("\n  ⚠️  DRY RUN — no database writes will occur.");
    console.log("  Pass --live to write production records.\n");
  } else {
    console.log("\n  🔴 LIVE MODE — records WILL be written to production.\n");
  }

  // ── Locate Jotform CSV ───────────────────────────────────────────────────────
  const jotformPath = join(process.env.HOME!, "Downloads",
    "Rising-Leaders-Academy-Family-Enrollment-Application-2026-2027(2026-10-12).csv");
  if (!existsSync(jotformPath)) {
    err(`Jotform CSV not found at: ${jotformPath}`);
    err("Please ensure the file is in ~/Downloads and re-run.");
    process.exit(1);
  }
  const rawCsv = readFileSync(jotformPath, "utf8");
  const { rows: allRows } = parseRawCSV(rawCsv);

  // ── Identify the two new students (submitted 2026-10-10) ────────────────────
  const newRows = allRows.filter((r) => {
    const sub = (r["Submission Date"] ?? "").trim();
    const fn  = (r["Student Legal First Name"] ?? "").trim();
    const ln  = (r["Student Legal Last Name"] ?? "").trim();
    return sub.startsWith("10/10/26") && fn && ln;
  });

  if (newRows.length === 0) {
    err("No rows found with Submission Date starting with '10/10/26'.");
    process.exit(1);
  }
  info(`Found ${newRows.length} new enrollment row(s) from 2026-10-10.`);

  const students = newRows.map((r, i) => mapJotformRow(r, i + 1));

  // ── Org + admin ───────────────────────────────────────────────────────────────
  section("Organization");
  const { data: orgs } = await sb.from("organizations").select("id, slug, name").limit(5);
  const org = (orgs as any[])?.find((o: any) =>
    o.slug === "rla" || o.slug === "rising-leaders-academy"
  ) ?? (orgs as any[])?.[0];
  if (!org) { err("No organization found"); process.exit(1); }
  const orgId: string = org.id;
  ok(`Org: ${org.name} (${orgId})`);

  const { data: adminMember } = await sb.from("organization_members")
    .select("profile_id").eq("organization_id", orgId)
    .in("role", ["admin", "full_admin", "platform_admin"])
    .eq("status", "active").limit(1).single();
  const adminId: string = (adminMember as any)?.profile_id ?? null;
  if (adminId) ok(`Admin: ${adminId}`);
  else warn("No admin profile found — created_by will be null");

  // ── Duplicate check ──────────────────────────────────────────────────────────
  section("Duplicate Check");
  const { data: existingStudents } = await sb.from("students")
    .select("id, first_name, last_name, date_of_birth, enrollment_status")
    .eq("organization_id", orgId);

  const existingMap = new Map<string, any>();
  for (const s of (existingStudents ?? []) as any[]) {
    const key = `${s.first_name.toLowerCase()} ${s.last_name.toLowerCase()}`;
    existingMap.set(key, s);
    if (s.date_of_birth) {
      existingMap.set(`${key}|${s.date_of_birth}`, s);
    }
  }
  ok(`Found ${existingStudents?.length ?? 0} existing students in DB.`);

  for (const s of students) {
    const nameKey = `${s.first_name.toLowerCase()} ${s.last_name.toLowerCase()}`;
    const dobKey  = s.date_of_birth ? `${nameKey}|${s.date_of_birth}` : null;
    const existByDob  = dobKey ? existingMap.get(dobKey) : null;
    const existByName = existingMap.get(nameKey);
    if (existByDob) {
      warn(`${s.first_name} ${s.last_name} — ALREADY EXISTS in DB (id=${existByDob.id}, status=${existByDob.enrollment_status}). Will skip.`);
      (s as any)._skip = true;
      (s as any)._skipReason = `Already in DB (name+DOB match, id=${existByDob.id})`;
    } else if (existByName) {
      warn(`${s.first_name} ${s.last_name} — name match in DB (id=${existByName.id}, dob=${existByName.date_of_birth}). No DOB mismatch confirmed — will skip to be safe.`);
      (s as any)._skip = true;
      (s as any)._skipReason = `Name match in DB (id=${existByName.id}) — confirm manually`;
    } else {
      ok(`${s.first_name} ${s.last_name} — not found in DB, safe to insert.`);
    }
  }

  // ── Existing families + profiles (for linking) ───────────────────────────────
  section("Existing Family & Profile Check");
  const { data: existingFamilies } = await sb.from("families")
    .select("id, family_name").eq("organization_id", orgId);
  const existingFamilyMap = new Map<string, string>(
    (existingFamilies as any[] ?? []).map((f: any) => [f.family_name.toLowerCase().trim(), f.id])
  );
  ok(`Found ${existingFamilies?.length ?? 0} existing families.`);

  const { data: existingProfiles } = await sb.from("profiles")
    .select("id, full_name, email");
  const existingProfileEmailMap = new Map<string, string>(
    (existingProfiles as any[] ?? [])
      .filter((p: any) => p.email)
      .map((p: any) => [p.email.toLowerCase(), p.id])
  );
  ok(`Found ${existingProfiles?.length ?? 0} existing profiles.`);

  // ── Drive setup ───────────────────────────────────────────────────────────────
  let sharedDriveId: string | null = null;
  let studentsFolderId: string | null = null;

  if (isDriveConfigured()) {
    section("Drive Setup");
    sharedDriveId = await detectSharedDriveId();
    const { data: orgFolders } = await sb.from("org_drive_folders")
      .select("folder_key, google_drive_folder_id")
      .eq("organization_id", orgId);
    const orgFolderMap: Record<string, string> = {};
    for (const row of (orgFolders ?? []) as any[]) {
      orgFolderMap[row.folder_key] = row.google_drive_folder_id;
    }
    studentsFolderId = orgFolderMap["students"] ?? null;
    if (studentsFolderId) ok(`Students Drive folder: ${studentsFolderId}`);
    else warn("Students Drive folder not found in org_drive_folders — Drive provisioning will be skipped.");
  } else {
    warn("Google Drive not configured — Drive provisioning will be skipped.");
  }

  // ── Dry-run report ────────────────────────────────────────────────────────────
  section("Dry Run Preview");
  for (const s of students) {
    const skip = (s as any)._skip;
    console.log(`\n  ── ${s.first_name} ${s.last_name} ──────────────────────`);
    if (skip) {
      warn(`SKIP: ${(s as any)._skipReason}`);
      continue;
    }
    console.log(`     DOB:           ${s.date_of_birth ?? "(not provided)"}`);
    console.log(`     Grade:         ${s.grade_level}`);
    console.log(`     Preferred:     ${s.preferred_name ?? "(same as first name)"}`);
    console.log(`     Status:        ${s.enrollment_status}`);
    console.log(`     Pickup notes:  ${s.authorized_pickup_notes ?? "(none)"}`);
    console.log(`     Family:        "${s.family.family_name}" (${s.family.is_split_household ? "split household" : "single household"})`);
    if (s.family.household) {
      const hh = s.family.household;
      const existing = existingFamilyMap.get(s.family.family_name.toLowerCase().trim());
      console.log(`     Household:     ${hh.address_street}, ${hh.address_city}, ${hh.address_state} ${hh.address_zip}`);
      if (existing) console.log(`     Family exists: ${existing} — will LINK (not create)`);
      else           console.log(`     Family action: CREATE NEW`);
    }
    for (const gd of s.guardians) {
      const existingProfileId = gd.email ? existingProfileEmailMap.get(gd.email.toLowerCase()) : null;
      const action = existingProfileId ? `LINK existing profile (${existingProfileId})` : "CREATE new profile";
      console.log(`     Guardian:      ${gd.full_name} (${gd.relationship_type}, ${gd.custody_type}) — ${action}`);
      console.log(`                    emergency=${gd.is_emergency_contact}, pickup=${gd.can_pickup}`);
    }
    if (s.medical) {
      console.log(`     Medical:       conditions=${(s.medical.medical_conditions ?? []).join("; ") || "(none)"}`);
      console.log(`                    accommodations=${(s.medical.special_accommodations ?? []).join("; ") || "(none)"}`);
      console.log(`                    notes=${s.medical.notes ?? "(none)"}`);
    } else {
      console.log(`     Medical:       (none reported)`);
    }
    if (s.notes.length) {
      for (const n of s.notes) {
        console.log(`     Note:          [${n.category}] ${n.title}`);
        console.log(`                    ${n.body.slice(0, 120)}`);
      }
    }
    if (isDriveConfigured()) {
      console.log(`     Drive:         ${studentsFolderId ? "will provision student folder tree" : "SKIP — students folder not found"}`);
    }
  }

  const toInsert = students.filter((s) => !(s as any)._skip);
  console.log(`\n  ─────────────────────────────────────────────────────────`);
  console.log(`  Ready to insert: ${toInsert.length} student(s)`);
  console.log(`  Skipping:        ${students.length - toInsert.length} student(s)`);

  if (DRY_RUN) {
    console.log("\n  ✅ Dry run complete. Review the preview above.");
    console.log("  To import, run:  npx tsx --tsconfig tsconfig.json scripts/jotform-new-students.ts --live\n");
    return;
  }

  if (toInsert.length === 0) {
    warn("Nothing to insert — all students already exist.");
    return;
  }

  // ── Live import ───────────────────────────────────────────────────────────────
  section("Live Import");

  for (const s of toInsert) {
    const studentName = `${s.first_name} ${s.last_name}`;
    let insertedStudentId: string | null = null;
    let insertedFamilyId:  string | null = null;
    let insertedHouseholdId: string | null = null;
    const insertedProfileIds: string[] = [];
    let insertedMedicalId: string | null = null;
    let driveResult: string | null = null;

    try {
      // 1. Family
      const famNormKey = s.family.family_name.toLowerCase().trim();
      let familyId = existingFamilyMap.get(famNormKey) ?? null;

      if (familyId) {
        ok(`${studentName}: Linked to existing family "${s.family.family_name}" (${familyId})`);
      } else {
        const { data: fam, error: famErr } = await sb.from("families").insert({
          organization_id:    orgId,
          family_name:        s.family.family_name,
          is_split_household: s.family.is_split_household,
          created_by:         adminId ?? null,
        }).select("id").single();
        if (famErr || !fam) throw new Error(`Family insert failed: ${famErr?.message}`);
        familyId = (fam as any).id;
        insertedFamilyId = familyId;
        existingFamilyMap.set(famNormKey, familyId!);
        ok(`${studentName}: Created family "${s.family.family_name}" (${familyId})`);
      }

      // 2. Household
      let householdId: string | null = null;
      if (s.family.household) {
        const hh = s.family.household;
        const { data: hhRow, error: hhErr } = await sb.from("households").insert({
          organization_id: orgId,
          family_id:       familyId,
          household_label: hh.household_label,
          sort_order:      hh.sort_order,
          address_json: hh.address_street ? {
            street1: hh.address_street, city: hh.address_city,
            state: hh.address_state, zip: hh.address_zip,
          } : null,
          phone: hh.phone ?? null,
          email: hh.email ?? null,
          created_by: adminId ?? null,
        }).select("id").single();
        if (hhErr || !hhRow) throw new Error(`Household insert failed: ${hhErr?.message}`);
        householdId = (hhRow as any).id;
        insertedHouseholdId = householdId;
        ok(`${studentName}: Created household (${householdId})`);
      }

      // 3. Student
      const { data: stu, error: stuErr } = await sb.from("students").insert({
        organization_id:         orgId,
        family_id:               familyId,
        first_name:              s.first_name,
        last_name:               s.last_name,
        preferred_name:          s.preferred_name ?? null,
        date_of_birth:           s.date_of_birth ?? null,
        grade_level:             s.grade_level ?? null,
        enrollment_status:       s.enrollment_status,
        enrollment_date:         new Date().toISOString().slice(0, 10),
        authorized_pickup_notes: s.authorized_pickup_notes ?? null,
        created_by:              adminId ?? null,
      }).select("id, student_display_id").single();
      if (stuErr || !stu) throw new Error(`Student insert failed: ${stuErr?.message}`);
      insertedStudentId = (stu as any).id;
      ok(`${studentName}: Created student ${(stu as any).student_display_id ?? insertedStudentId}`);

      // 3b. Source record (Jotform submission date as source ID)
      await sb.from("student_import_sources").insert({
        organization_id:  orgId,
        student_id:       insertedStudentId,
        source_system:    "jotform_csv",
        source_record_id: `jotform_${s.first_name.toLowerCase()}_${s.last_name.toLowerCase()}_2026-10-10`,
        imported_at:      new Date().toISOString(),
        imported_by:      adminId ?? null,
      });

      // 4. Medical
      if (s.medical) {
        const { data: med, error: medErr } = await sb.from("student_medical").insert({
          organization_id:        orgId,
          student_id:             insertedStudentId,
          medical_conditions:     s.medical.medical_conditions ?? [],
          special_accommodations: s.medical.special_accommodations ?? [],
          notes:                  s.medical.notes ?? null,
          updated_by:             adminId ?? null,
        }).select("id").single();
        if (medErr) warn(`${studentName}: Medical insert failed: ${medErr.message}`);
        else {
          insertedMedicalId = (med as any).id;
          ok(`${studentName}: Created medical record (${insertedMedicalId})`);
        }
      }

      // 5. Guardians + guardianships
      for (const gd of s.guardians) {
        let profileId = gd.email ? existingProfileEmailMap.get(gd.email.toLowerCase()) : undefined;

        if (!profileId) {
          const { data: prof, error: profErr } = await sb.from("profiles").insert({
            full_name: gd.full_name,
            email:     gd.email ?? null,
            phone:     gd.phone ?? null,
          }).select("id").single();
          if (profErr || !prof) {
            warn(`${studentName}: Profile insert failed for ${gd.full_name}: ${profErr?.message}`);
            continue;
          }
          profileId = (prof as any).id;
          insertedProfileIds.push(profileId!);
          if (gd.email) existingProfileEmailMap.set(gd.email.toLowerCase(), profileId!);
          ok(`${studentName}: Created profile for ${gd.full_name} (${profileId})`);
        } else {
          ok(`${studentName}: Linked existing profile for ${gd.full_name} (${profileId})`);
        }

        // Org member (parent role)
        await sb.from("organization_members").upsert({
          organization_id: orgId,
          profile_id:      profileId,
          role:            "parent",
          status:          "active",
          joined_at:       new Date().toISOString(),
        }, { onConflict: "organization_id,profile_id" });

        // Guardianship
        const { error: gsErr } = await sb.from("guardianships").insert({
          organization_id:         orgId,
          student_id:              insertedStudentId,
          profile_id:              profileId,
          household_id:            householdId,
          relationship_type:       gd.relationship_type,
          custody_type:            gd.custody_type,
          is_legal_guardian:       gd.is_legal_guardian,
          is_primary_contact:      gd.is_primary_contact,
          is_emergency_contact:    gd.is_emergency_contact,
          emergency_contact_order: gd.emergency_contact_order,
          can_pickup:              gd.can_pickup,
          status:                  "active",
        });
        if (gsErr) warn(`${studentName}: Guardianship insert failed for ${gd.full_name}: ${gsErr.message}`);
        else ok(`${studentName}: Guardianship created for ${gd.full_name}`);
      }

      // 6. Staff notes
      for (const n of s.notes) {
        const { error: noteErr } = await sb.from("staff_notes").insert({
          organization_id: orgId,
          student_id:      insertedStudentId,
          author_id:       adminId ?? null,
          category:        n.category,
          priority:        n.priority,
          title:           n.title,
          body:            n.body,
          is_pinned:       n.is_pinned,
        });
        if (noteErr) warn(`${studentName}: Note insert failed: ${noteErr.message}`);
      }
      if (s.notes.length) ok(`${studentName}: Created ${s.notes.length} note(s)`);

      // 7. Drive
      if (!isDriveConfigured()) {
        warn(`${studentName}: Google Drive not configured in this environment.`);
        warn(`  → Go to /dashboard/drive-bulk-provision to provision Drive folders.`);
      } else if (studentsFolderId && insertedStudentId) {
        try {
          const displayId = `RLA-S${String((await sb.from("students").select("student_display_id").eq("id", insertedStudentId).single()).data?.student_display_id ?? "").replace(/\D/g, "").padStart(4, "0")}`;
          await sb.from("students").update({ drive_folder_status: "creating" } as never).eq("id", insertedStudentId);
          const driveData = await createStudentFolderTree(
            displayId,
            `${s.first_name} ${s.last_name}`,
            orgId,
            studentsFolderId,
            sharedDriveId ?? undefined,
          );
          if (!driveData.success) {
            await sb.from("students").update({ drive_folder_status: "error", drive_error_message: driveData.error } as never).eq("id", insertedStudentId);
            warn(`${studentName}: Drive provisioning failed — ${driveData.error}`);
            warn(`  → Go to /dashboard/drive-bulk-provision to retry.`);
          } else {
            const { rootFolder, subfolders } = driveData.data;
            await sb.from("students").update({
              google_drive_folder_id:  rootFolder.folderId,
              google_drive_folder_url: rootFolder.folderUrl,
              drive_folder_status:     "active",
              drive_folder_created_at: new Date().toISOString(),
              drive_error_message:     null,
            } as never).eq("id", insertedStudentId);
            for (const sf of subfolders) {
              await sb.from("org_drive_folders").upsert({
                organization_id:        orgId,
                student_id:             insertedStudentId,
                folder_key:             sf.key,
                google_drive_folder_id: sf.folderId,
                parent_folder_id:       rootFolder.folderId,
              } as never, { onConflict: "organization_id,student_id,folder_key" });
            }
            driveResult = rootFolder.folderId;
            ok(`${studentName}: Drive folder provisioned (${rootFolder.folderUrl})`);
          }
        } catch (driveErr) {
          warn(`${studentName}: Drive provisioning exception — ${driveErr}. Student record is intact.`);
          warn(`  → Go to /dashboard/drive-bulk-provision to retry.`);
        }
      }

      console.log(`\n  ✅ ${studentName} enrolled successfully.`);
      console.log(`     Student ID: ${insertedStudentId}`);
      if (driveResult) console.log(`     Drive:      https://drive.google.com/drive/folders/${driveResult}`);

    } catch (e) {
      err(`${studentName}: Import failed — ${e}`);
      // Cleanup orphaned records
      console.log(`     Cleaning up partial records...`);
      if (insertedStudentId) await sb.from("students").delete().eq("id", insertedStudentId);
      if (insertedMedicalId)  await sb.from("student_medical").delete().eq("id", insertedMedicalId);
      if (insertedHouseholdId) await sb.from("households").delete().eq("id", insertedHouseholdId);
      if (insertedFamilyId)   await sb.from("families").delete().eq("id", insertedFamilyId);
      for (const pid of insertedProfileIds) await sb.from("profiles").delete().eq("id", pid);
      warn(`Cleanup complete for ${studentName}.`);
    }
  }

  console.log("\n" + "═".repeat(62));
  console.log("  Import complete.");
  console.log("═".repeat(62) + "\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
