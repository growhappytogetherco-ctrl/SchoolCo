/**
 * Offline dry-run — parses and validates the real roster CSV without
 * writing to the database. Reports what the live import would do.
 *
 * Run:  npx tsx tests/security/dry-run-csv.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Inline the normalizer + parser logic to avoid Next.js server-only imports
function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[_\-\/\\]+/g, " ").trim();
}

const FIELD_ALIASES: Record<string, string> = {
  first_name:             "first_name",
  "first name":           "first_name",
  last_name:              "last_name",
  "last name":            "last_name",
  preferred_name:         "preferred_name",
  "preferred name":       "preferred_name",
  date_of_birth:          "date_of_birth",
  "date of birth":        "date_of_birth",
  dob:                    "date_of_birth",
  grade_level:            "grade_level",
  "grade level":          "grade_level",
  grade:                  "grade_level",
  enrollment_status:      "enrollment_status",
  "enrollment status":    "enrollment_status",
  family_name:            "family_name",
  "family name":          "family_name",
  is_split_household:     "is_split_household",
  "is split household":   "is_split_household",
  address_street:         "address_street",
  "address street":       "address_street",
  address_city:           "address_city",
  "address city":         "address_city",
  address_state:          "address_state",
  "address state":        "address_state",
  address_zip:            "address_zip",
  "address zip":          "address_zip",
  home_phone:             "home_phone",
  "home phone":           "home_phone",
  home_email:             "home_email",
  "home email":           "home_email",
  parent1_name:           "parent1_name",
  "parent1 name":         "parent1_name",
  parent1_email:          "parent1_email",
  "parent1 email":        "parent1_email",
  parent1_phone:          "parent1_phone",
  "parent1 phone":        "parent1_phone",
  parent1_relationship:   "parent1_relationship",
  "parent1 relationship": "parent1_relationship",
  parent1_custody:        "parent1_custody",
  "parent1 custody":      "parent1_custody",
  parent1_legal:          "parent1_legal",
  "parent1 legal":        "parent1_legal",
  parent1_primary_contact:"parent1_primary_contact",
  "parent1 primary contact":"parent1_primary_contact",
  parent1_emergency:      "parent1_emergency",
  "parent1 emergency":    "parent1_emergency",
  parent1_can_pickup:     "parent1_can_pickup",
  "parent1 can pickup":   "parent1_can_pickup",
  parent2_name:           "parent2_name",
  "parent2 name":         "parent2_name",
  parent2_email:          "parent2_email",
  "parent2 email":        "parent2_email",
  parent2_phone:          "parent2_phone",
  "parent2 phone":        "parent2_phone",
  parent2_relationship:   "parent2_relationship",
  "parent2 relationship": "parent2_relationship",
  parent2_custody:        "parent2_custody",
  "parent2 custody":      "parent2_custody",
  parent2_legal:          "parent2_legal",
  "parent2 legal":        "parent2_legal",
  parent2_emergency:      "parent2_emergency",
  "parent2 emergency":    "parent2_emergency",
  parent2_can_pickup:     "parent2_can_pickup",
  "parent2 can pickup":   "parent2_can_pickup",
  emergency_contact_name: "emergency_contact_name",
  "emergency contact name":"emergency_contact_name",
  emergency_contact_phone:"emergency_contact_phone",
  "emergency contact phone":"emergency_contact_phone",
  emergency_contact_rel:  "emergency_contact_rel",
  "emergency contact rel":"emergency_contact_rel",
  allergies:              "allergies",
  medical_conditions:     "medical_conditions",
  "medical conditions":   "medical_conditions",
  medical_notes:          "medical_notes",
  "medical notes":        "medical_notes",
  notes:                  "notes",
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim()); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(Boolean);
  const headers = parseCSVLine(lines[0]).map(normalizeHeader);
  const headerMap: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    const canonical = FIELD_ALIASES[headers[i]];
    if (canonical) headerMap[canonical] = i;
  }
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCSVLine(lines[r]);
    const row: Record<string, string> = {};
    for (const [field, col] of Object.entries(headerMap)) {
      row[field] = (cells[col] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

const csvPath = resolve(process.cwd(), "import/real_rla_roster_import.csv");
const csvText = readFileSync(csvPath, "utf8");
const rows    = parseCSV(csvText);

console.log("\n══════════════════════════════════════════════════════");
console.log("  SchoolCo — Real RLA Roster Dry Run (offline)");
console.log("══════════════════════════════════════════════════════\n");

const students: typeof rows = [];
const skipped:  { name: string; reason: string }[] = [];
const warnings: string[] = [];
const medicalAlerts: string[] = [];
const documentFollowUps: string[] = [];
const dataDecisions: string[] = [];

const familyMap = new Map<string, string[]>();    // family_name → student names
const guardianMap = new Map<string, Set<string>>(); // guardian_name → student names
const studentIds: string[] = [];

let nextId = 1;

for (const row of rows) {
  const firstName = row.first_name;
  const lastName  = row.last_name;
  const fullName  = `${firstName} ${lastName}`.trim();
  const dob       = row.date_of_birth;
  const grade     = row.grade_level;
  const family    = row.family_name;
  const notes     = row.notes ?? "";
  const medNotes  = row.medical_notes ?? "";

  if (!firstName || !lastName) {
    skipped.push({ name: fullName || "(blank)", reason: "Missing first or last name" });
    continue;
  }

  // Stevie Beckham — flag DOB missing, exclude per instructions if DOB still unresolved
  if (firstName === "Stevie" && lastName === "Beckham") {
    if (!dob) {
      skipped.push({ name: fullName, reason: "DOB VERIFICATION REQUIRED — excluded from import pending verification" });
      dataDecisions.push(`Stevie Beckham: DOB unresolved (form says 2010-07-26; birth cert may read 2010-07-20). Excluded from import. Resolve before importing.`);
      continue;
    }
  }

  students.push(row);
  const sid = `RLA-S${String(nextId++).padStart(4, "0")}`;
  studentIds.push(`${sid}: ${fullName}`);

  // Family tracking
  if (family) {
    if (!familyMap.has(family)) familyMap.set(family, []);
    familyMap.get(family)!.push(fullName);
  }

  // Guardian tracking
  for (const prefix of ["parent1", "parent2"] as const) {
    const gname = row[`${prefix}_name`];
    if (gname) {
      if (!guardianMap.has(gname)) guardianMap.set(gname, new Set());
      guardianMap.get(gname)!.add(fullName);
    }
  }

  // Medical alerts
  const allergies = row.allergies;
  const conditions = row.medical_conditions;
  if (notes.includes("ANAPHYLAXIS") || conditions?.toLowerCase().includes("anaphylaxis")) {
    medicalAlerts.push(`⚠️  ${fullName}: ANAPHYLAXIS — ${conditions}. EpiPen required. EpiPen Auth Form must be on file before first day.`);
  }
  if (medNotes.toLowerCase().includes("inhaler") || conditions?.toLowerCase().includes("asthma")) {
    medicalAlerts.push(`⚕  ${fullName}: Asthma — inhaler as needed.`);
  }
  if (medNotes.toLowerCase().includes("medication required") || notes.toLowerCase().includes("medication authorization")) {
    medicalAlerts.push(`⚕  ${fullName}: Medication required during program hours — Medication Authorization Form required before first day.`);
  }

  // Document follow-ups
  if (notes.includes("DOCUMENT FOLLOW-UP")) documentFollowUps.push(`${fullName}: Documents submitted as "Not applicable.pdf" — real documents required.`);
  if (notes.includes("birth certificate still required") || notes.includes("Birth certificate still required")) documentFollowUps.push(`${fullName}: Birth certificate missing or expired. POA on file but expired 2026-08-14.`);
  if (notes.includes("DOB VERIFICATION REQUIRED")) documentFollowUps.push(`${fullName}: DOB conflict — left blank pending verification.`);
  if (notes.includes("PARENT 1 EMAIL VERIFICATION")) dataDecisions.push(`Robert Taylor: Parent 1 email invalid (.con domain). Left blank. Use parent 2 email for interim comms. Verify with Racheal Thornton before portal invite.`);
  if (notes.includes("No guardianship or POA")) documentFollowUps.push(`${fullName}: No guardianship/POA document found. Collect from Tra'Shana Harley before enrollment is complete.`);
  if (notes.includes("IEP")) documentFollowUps.push(`${fullName}: IEP referenced — confirm current copy is on file.`);

  // Post-import guardian additions (split households)
  if (notes.includes("Jean Paul Saint Fleur") && notes.includes("post-import")) {
    dataDecisions.push(`${fullName}: Jean Paul Saint Fleur must be added as third guardian (Saint Fleur Household) after import.`);
  }
  if (notes.includes("Keishla Jolissaint") && notes.includes("post-import")) {
    dataDecisions.push(`Ezra'Miah Johnson: Keishla (Amber) Jolissaint must be added via Jolissaint Household after import — authorized for Ezra ONLY.`);
  }
}

// De-dupe data decisions
const uniqueDecisions = [...new Set(dataDecisions)];

// Count unique families, guardians
const familiesNew = [...familyMap.keys()];
const householdsNew: string[] = [];
for (const [fam, stus] of familyMap) {
  // Split households get 2+ households; others get 1
  const anyRow = rows.find(r => r.family_name === fam);
  if (anyRow?.is_split_household === "yes") {
    householdsNew.push(`${fam} — PRIMARY household`);
    householdsNew.push(`${fam} — SECONDARY household(s) (create manually post-import)`);
  } else {
    householdsNew.push(fam);
  }
}

const guardians = [...guardianMap.entries()];
const totalGuardianships = [...guardianMap.values()].reduce((n, s) => n + s.size, 0);

// Print report
console.log(`── STUDENTS ─────────────────────────────────────────────`);
console.log(`  Ready for import:   ${students.length}`);
console.log(`  Excluded:           ${skipped.length}`);
if (skipped.length) {
  for (const s of skipped) console.log(`    ✘  ${s.name}: ${s.reason}`);
}
console.log();

console.log(`── EXPECTED STUDENT IDs ─────────────────────────────────`);
for (const s of studentIds) console.log(`  ${s}`);
console.log();

console.log(`── FAMILIES (${familiesNew.length}) ────────────────────────────────────────`);
for (const f of familiesNew) {
  const stus = familyMap.get(f)!.join(", ");
  console.log(`  ${f} — [${stus}]`);
}
console.log();

console.log(`── HOUSEHOLDS (${householdsNew.length} entries) ──────────────────────────────────`);
for (const h of householdsNew) console.log(`  ${h}`);
console.log();

console.log(`── GUARDIANS (${guardians.length} unique profiles, ${totalGuardianships} guardianships) ──────────`);
for (const [name, stus] of guardians) {
  console.log(`  ${name} → ${[...stus].join(", ")}`);
}
console.log();

console.log(`── MEDICAL / SAFETY ALERTS ──────────────────────────────`);
if (medicalAlerts.length) {
  for (const a of [...new Set(medicalAlerts)]) console.log(`  ${a}`);
} else {
  console.log("  None");
}
console.log();

console.log(`── DOCUMENT FOLLOW-UPS ──────────────────────────────────`);
if (documentFollowUps.length) {
  for (const d of [...new Set(documentFollowUps)]) console.log(`  📋  ${d}`);
} else {
  console.log("  None");
}
console.log();

console.log(`── DATA DECISIONS REQUIRED ──────────────────────────────`);
if (uniqueDecisions.length) {
  for (const d of uniqueDecisions) console.log(`  ❓  ${d}`);
} else {
  console.log("  None");
}
console.log();

console.log(`── DRIVE FOLDERS THAT WILL BE PROVISIONED ──────────────`);
console.log(`  ${students.length} student root folders in the Shared Drive`);
console.log(`  ${students.length * 13} subfolders (13 per student)`);
console.log(`  Provisioned automatically during live import`);
console.log();

console.log(`── SUMMARY ──────────────────────────────────────────────`);
console.log(`  Total CSV rows:        ${rows.length}`);
console.log(`  Students ready:        ${students.length}`);
console.log(`  Students excluded:     ${skipped.length}`);
console.log(`  Families to create:    ${familiesNew.length}`);
console.log(`  Households to create:  ${Math.ceil(householdsNew.filter(h => !h.includes("SECONDARY")).length)}`);
console.log(`  Guardians to create:   ${guardians.length} profiles`);
console.log(`  Guardianships:         ${totalGuardianships}`);
console.log(`  Medical alerts:        ${[...new Set(medicalAlerts)].length}`);
console.log(`  Document follow-ups:   ${[...new Set(documentFollowUps)].length}`);
console.log();

console.log("══════════════════════════════════════════════════════");
console.log("  DRY RUN COMPLETE — No data was written.");
console.log("══════════════════════════════════════════════════════\n");
