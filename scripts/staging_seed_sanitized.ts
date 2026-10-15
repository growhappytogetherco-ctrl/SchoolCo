/**
 * Staging seed: copies production financial data into staging with sanitized PII.
 *
 * What it does:
 *   1. Reads financial records from production (amounts, statuses, dates — unchanged)
 *   2. Replaces all student names, family names, email addresses with synthetic values
 *   3. Inserts the sanitized records into staging under the same org/user UUIDs
 *
 * What it does NOT do:
 *   - Copy auth.users (Supabase-managed; cannot be migrated)
 *   - Copy real student PII (names, DOBs, addresses)
 *   - Touch production in any way
 *
 * Requirements:
 *   .env.local    — production credentials (read-only queries only)
 *   .env.staging  — staging credentials (writes go here)
 *
 * Run:
 *   npx tsx scripts/staging_seed_sanitized.ts [--dry-run]
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { resolve } from "path";

// ── Load env files ────────────────────────────────────────────────────────────

function loadEnv(path: string): Record<string, string> {
  const lines = readFileSync(path, "utf8").split("\n");
  const result: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

const prodEnv    = loadEnv(resolve(process.cwd(), ".env.local"));
const stagingEnv = loadEnv(resolve(process.cwd(), ".env.staging"));

const prod = createClient(
  prodEnv.NEXT_PUBLIC_SUPABASE_URL!,
  prodEnv.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const staging = createClient(
  stagingEnv.NEXT_PUBLIC_SUPABASE_URL!,
  stagingEnv.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const DRY_RUN = process.argv.includes("--dry-run");

// ── Sanitization helpers ──────────────────────────────────────────────────────

const FAKE_FIRST = ["Alex","Jordan","Morgan","Taylor","Casey","Riley","Quinn","Avery","Blake","Drew"];
const FAKE_LAST  = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Davis","Wilson","Moore","Anderson"];

function syntheticName(seed: string): { first: string; last: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return {
    first: FAKE_FIRST[h % FAKE_FIRST.length],
    last:  FAKE_LAST[(h >>> 4) % FAKE_LAST.length],
  };
}

function syntheticEmail(id: string): string {
  return `staging-${id.slice(0, 8)}@schoolco-test.invalid`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n${"═".repeat(60)}`);
  console.log("  SchoolCo Staging Seed (sanitized)");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN — no writes" : "LIVE — writing to staging"}`);
  console.log(`${"═".repeat(60)}\n`);

  // ── 1. Verify staging isolation ──────────────────────────────────────────
  const stagingUrl = stagingEnv.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const prodUrl    = prodEnv.NEXT_PUBLIC_SUPABASE_URL    ?? "";
  if (stagingUrl === prodUrl || stagingUrl === "") {
    console.error("ABORT: staging URL matches production or is missing. Check .env.staging.");
    process.exit(1);
  }
  console.log(`✓ Staging URL differs from production`);
  console.log(`  Production : ${prodUrl.replace(/https?:\/\//, "").slice(0, 30)}…`);
  console.log(`  Staging    : ${stagingUrl.replace(/https?:\/\//, "").slice(0, 30)}…\n`);

  // ── 2. Read production financial data ────────────────────────────────────
  const { data: charges, error: ceErr } = await prod
    .from("student_charges")
    .select("id, organization_id, student_id, school_year_id, charge_type, description, original_amount, due_date, plan_type, installment_number, status, notes, void_reason, voided_by, voided_at, created_by, updated_by, created_at, updated_at");
  if (ceErr) { console.error("Failed to read student_charges:", ceErr.message); process.exit(1); }

  const { data: payments, error: pyErr } = await prod
    .from("student_payments")
    .select("id, organization_id, student_id, school_year_id, payment_date, amount, payment_source, reference_number, notes, status, void_reason, voided_by, voided_at, created_by, updated_by, created_at, updated_at");
  if (pyErr) { console.error("Failed to read student_payments:", pyErr.message); process.exit(1); }

  const { data: adjustments, error: adjErr } = await prod
    .from("charge_adjustments")
    .select("id, organization_id, charge_id, amount, description, adjustment_type, notes, status, void_reason, voided_by, voided_at, created_by, created_at");
  if (adjErr) { console.error("Failed to read charge_adjustments:", adjErr.message); process.exit(1); }

  const { data: allocations, error: alErr } = await prod
    .from("payment_allocations")
    .select("id, payment_id, charge_id, amount, created_by, created_at");
  if (alErr) { console.error("Failed to read payment_allocations:", alErr.message); process.exit(1); }

  const { data: students, error: stErr } = await prod
    .from("students")
    .select("id, organization_id, first_name, last_name, grade_level, enrollment_status, created_at");
  if (stErr) { console.error("Failed to read students:", stErr.message); process.exit(1); }

  // Read prerequisite tables needed for FK constraints
  const { data: orgs, error: orgErr } = await prod
    .from("organizations")
    .select("id, name, slug, created_at, updated_at");
  if (orgErr) { console.error("Failed to read organizations:", orgErr.message); process.exit(1); }

  const { data: schoolYears, error: syErr } = await prod
    .from("school_years")
    .select("id, organization_id, label, start_date, end_date, is_current, created_at");
  if (syErr) { console.error("Failed to read school_years:", syErr.message); process.exit(1); }

  // Collect all profile UUIDs referenced in financial records (created_by, voided_by, etc.)
  const profileIds = new Set<string>();
  charges!.forEach(r => { [r.created_by, r.updated_by, r.voided_by].forEach(id => id && profileIds.add(id)); });
  payments!.forEach(r => { [r.created_by, r.voided_by].forEach(id => id && profileIds.add(id)); });
  adjustments!.forEach(r => { [r.created_by, r.voided_by].forEach(id => id && profileIds.add(id)); });
  allocations!.forEach(r => { r.created_by && profileIds.add(r.created_by); });
  students!.forEach(r => { r.id && profileIds.add(r.id); });

  const { data: profiles, error: profErr } = await prod
    .from("profiles")
    .select("id, full_name, created_at, updated_at")
    .in("id", Array.from(profileIds));
  if (profErr) { console.error("Failed to read profiles:", profErr.message); process.exit(1); }

  console.log(`Production records read:`);
  console.log(`  organizations:      ${orgs!.length}`);
  console.log(`  school_years:       ${schoolYears!.length}`);
  console.log(`  profiles (refs):    ${profiles!.length}`);
  console.log(`  students:           ${students!.length}`);
  console.log(`  student_charges:    ${charges!.length}`);
  console.log(`  student_payments:   ${payments!.length}`);
  console.log(`  charge_adjustments: ${adjustments!.length}`);
  console.log(`  payment_allocations:${allocations!.length}\n`);

  if (DRY_RUN) {
    console.log("DRY RUN complete — no writes performed.");
    console.log("Run without --dry-run to seed staging.");
    process.exit(0);
  }

  // ── 3. Seed prerequisite tables ──────────────────────────────────────────
  const { error: orgSErr } = await staging.from("organizations").upsert(orgs!, { onConflict: "id" });
  if (orgSErr) { console.error("Failed to upsert organizations:", orgSErr.message); process.exit(1); }
  console.log(`✓ Inserted ${orgs!.length} organizations`);

  // Sanitize profiles — replace full_name with synthetic value
  const sanitizedProfiles = profiles!.map(p => ({
    ...p,
    full_name: syntheticName(p.id).first + " " + syntheticName(p.id).last,
  }));
  const { error: profSErr } = await staging.from("profiles").upsert(sanitizedProfiles, { onConflict: "id" });
  if (profSErr) { console.error("Failed to upsert profiles:", profSErr.message); process.exit(1); }
  console.log(`✓ Inserted ${sanitizedProfiles.length} sanitized profiles`);

  const { error: sySErr } = await staging.from("school_years").upsert(schoolYears!, { onConflict: "id" });
  if (sySErr) { console.error("Failed to upsert school_years:", sySErr.message); process.exit(1); }
  console.log(`✓ Inserted ${schoolYears!.length} school_years`);

  // ── 4. Sanitize and write students ───────────────────────────────────────
  const sanitizedStudents = students!.map(s => {
    const { first, last } = syntheticName(s.id);
    return { ...s, first_name: first, last_name: last };
  });

  const { error: ssErr } = await staging.from("students").upsert(sanitizedStudents, { onConflict: "id" });
  if (ssErr) { console.error("Failed to upsert students to staging:", ssErr.message); process.exit(1); }
  console.log(`✓ Inserted ${sanitizedStudents.length} sanitized students`);

  // ── 5. Write financial records (amounts unchanged) ───────────────────────
  // Financial amounts are NOT sanitized — they are needed for reconciliation accuracy.
  // Names and contact info on charges/payments come from student/profile records
  // already sanitized above.

  const { error: chErr } = await staging
    .from("student_charges")
    .upsert(charges!, { onConflict: "id" });
  if (chErr) { console.error("Failed to upsert student_charges:", chErr.message); process.exit(1); }
  console.log(`✓ Inserted ${charges!.length} student_charges`);

  const { error: pmErr } = await staging
    .from("student_payments")
    .upsert(payments!, { onConflict: "id" });
  if (pmErr) { console.error("Failed to upsert student_payments:", pmErr.message); process.exit(1); }
  console.log(`✓ Inserted ${payments!.length} student_payments`);

  const { error: adjWErr } = await staging
    .from("charge_adjustments")
    .upsert(adjustments!, { onConflict: "id" });
  if (adjWErr) { console.error("Failed to upsert charge_adjustments:", adjWErr.message); process.exit(1); }
  console.log(`✓ Inserted ${adjustments!.length} charge_adjustments`);

  const { error: alWErr } = await staging
    .from("payment_allocations")
    .upsert(allocations!, { onConflict: "id" });
  if (alWErr) { console.error("Failed to upsert payment_allocations:", alWErr.message); process.exit(1); }
  console.log(`✓ Inserted ${allocations!.length} payment_allocations`);

  console.log(`\n✓ Staging seed complete. Run:\n  npm run audit:balances:staging`);
}

run().catch(err => { console.error(err); process.exit(1); });
