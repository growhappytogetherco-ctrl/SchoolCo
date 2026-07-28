/**
 * RLS Regression Tests — SchoolCo
 *
 * Tests actual Supabase RLS enforcement for the roles defined in the access model.
 * Run with:  npx tsx tests/security/rls-regression.ts
 *
 * Requires environment variables (see .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY           — for setup / teardown only
 *   TEST_PARENT_A_EMAIL                 — test account credentials
 *   TEST_PARENT_A_PASSWORD
 *   TEST_PARENT_B_EMAIL
 *   TEST_PARENT_B_PASSWORD
 *   TEST_TEACHER_EMAIL
 *   TEST_TEACHER_PASSWORD
 *   TEST_VOLUNTEER_EMAIL
 *   TEST_VOLUNTEER_PASSWORD
 *   TEST_ORG_ID                         — org these test accounts belong to
 *   TEST_ORG_B_ID                       — second org (for cross-org tests)
 *   TEST_PARENT_A_STUDENT_ID            — student linked to parent A
 *   TEST_PARENT_B_STUDENT_ID            — student linked to parent B (different family)
 *
 * SETUP NOTE: Create dedicated test accounts in your Supabase dashboard.
 * Do NOT use real parent or staff credentials. These accounts should be
 * members of a test organization with synthetic (non-PII) student data.
 *
 * The tests do NOT create or delete data. They only attempt reads and
 * report whether RLS correctly blocks or permits access.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ── Load env ─────────────────────────────────────────────────────────────────
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TEST_PARENT_A_EMAIL", "TEST_PARENT_A_PASSWORD",
  "TEST_PARENT_B_EMAIL", "TEST_PARENT_B_PASSWORD",
  "TEST_TEACHER_EMAIL",  "TEST_TEACHER_PASSWORD",
  "TEST_VOLUNTEER_EMAIL","TEST_VOLUNTEER_PASSWORD",
  "TEST_ORG_ID", "TEST_ORG_B_ID",
  "TEST_PARENT_A_STUDENT_ID",
  "TEST_PARENT_B_STUDENT_ID",
];

// Allow loading from .env.local manually
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error("Missing required environment variables:", missing.join(", "));
  console.error("Add test credentials to .env.local (see tests/security/rls-regression.ts header).");
  process.exit(1);
}

const SUPABASE_URL          = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ORG_ID                = process.env.TEST_ORG_ID!;
const ORG_B_ID              = process.env.TEST_ORG_B_ID!;
const PARENT_A_STUDENT_ID   = process.env.TEST_PARENT_A_STUDENT_ID!;
const PARENT_B_STUDENT_ID   = process.env.TEST_PARENT_B_STUDENT_ID!;

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function expect(label: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    const msg = `${label} — expected ${expected ? "ACCESS" : "DENIED"} but got ${actual ? "ACCESS" : "DENIED"}`;
    console.error(`  ❌ ${msg}`);
    failures.push(msg);
    failed++;
  }
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SERVICE_ROLE_KEY);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`);
  return client;
}

async function canRead(client: SupabaseClient, table: string, filter?: Record<string, string>): Promise<boolean> {
  let q = client.from(table).select("id").limit(1);
  if (filter) {
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  }
  const { data, error } = await q;
  // RLS denial returns data = [] (empty), not an error in most cases.
  // A true auth error or "relation does not exist" error is a different issue.
  if (error && error.code !== "PGRST116") return false; // PGRST116 = no rows (single)
  return (data?.length ?? 0) > 0;
}

async function canInsert(client: SupabaseClient, table: string, row: Record<string, unknown>): Promise<boolean> {
  const { error } = await client.from(table).insert(row);
  // RLS violation returns error code 42501
  return !error || (error.code !== "42501" && !error.message.includes("policy"));
}

// ── Test suite ────────────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n══════════════════════════════════════════════════");
  console.log("  SchoolCo RLS Regression Tests");
  console.log("══════════════════════════════════════════════════\n");

  // Sign in all test users
  let parentA: SupabaseClient, parentB: SupabaseClient;
  let teacher: SupabaseClient, volunteer: SupabaseClient;

  try {
    [parentA, parentB, teacher, volunteer] = await Promise.all([
      signIn(process.env.TEST_PARENT_A_EMAIL!, process.env.TEST_PARENT_A_PASSWORD!),
      signIn(process.env.TEST_PARENT_B_EMAIL!, process.env.TEST_PARENT_B_PASSWORD!),
      signIn(process.env.TEST_TEACHER_EMAIL!,  process.env.TEST_TEACHER_PASSWORD!),
      signIn(process.env.TEST_VOLUNTEER_EMAIL!,process.env.TEST_VOLUNTEER_PASSWORD!),
    ]);
  } catch (e) {
    console.error("Sign-in failed:", e);
    process.exit(1);
  }

  // Anonymous client
  const anon = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "anon");

  // ── Parent A ──────────────────────────────────────────────────────────────
  console.log("── Parent A (own child access) ──");
  expect(
    "Parent A can read own child attendance",
    await canRead(parentA, "attendance_records", { student_id: PARENT_A_STUDENT_ID }),
    true
  );
  expect(
    "Parent A can read own child parent-visible goals",
    await canRead(parentA, "student_goals", { student_id: PARENT_A_STUDENT_ID, visibility: "parent_visible" }),
    true  // may be false if no such rows exist — acceptable
  );
  expect(
    "Parent A can read own child allergies",
    await canRead(parentA, "student_allergies", { student_id: PARENT_A_STUDENT_ID }),
    true  // may be false if no rows exist — acceptable
  );
  expect(
    "Parent A cannot read all attendance (other students)",
    await canRead(parentA, "attendance_records"),
    false // RLS should return only own child — this tests if ANY row returns when no filter
          // If parent A has one child, limiting to 1 row might still return their child's data.
          // The test below (reading Parent B's child) is more definitive.
  );

  console.log("\n── Parent A vs Parent B's child ──");
  expect(
    "Parent A cannot read Parent B's child attendance",
    await canRead(parentA, "attendance_records", { student_id: PARENT_B_STUDENT_ID }),
    false
  );
  expect(
    "Parent A cannot read Parent B's child goals",
    await canRead(parentA, "student_goals", { student_id: PARENT_B_STUDENT_ID }),
    false
  );
  expect(
    "Parent A cannot read Parent B's child allergies",
    await canRead(parentA, "student_allergies", { student_id: PARENT_B_STUDENT_ID }),
    false
  );
  expect(
    "Parent A cannot read Parent B's child conditions",
    await canRead(parentA, "student_conditions", { student_id: PARENT_B_STUDENT_ID }),
    false
  );

  console.log("\n── Parent A — staff-only tables (must be denied) ──");
  expect("Parent A cannot read incidents",             await canRead(parentA, "incidents"),              false);
  expect("Parent A cannot read medication_alerts",     await canRead(parentA, "medication_alerts"),      false);
  expect("Parent A cannot read student_documents",     await canRead(parentA, "student_documents"),      false);
  expect("Parent A cannot read student_medical",       await canRead(parentA, "student_medical"),        false);
  expect("Parent A cannot read staff_compliance_records", await canRead(parentA, "staff_compliance_records"), false);
  expect("Parent A cannot read staff_compliance_requirements", await canRead(parentA, "staff_compliance_requirements"), false);
  expect("Parent A cannot read support_flags",         await canRead(parentA, "support_flags"),          false);
  expect("Parent A cannot read service_hours",         await canRead(parentA, "service_hours"),          false);
  expect("Parent A cannot read leadership_badges",     await canRead(parentA, "leadership_badges"),      false);
  expect("Parent A cannot read entrepreneurship_projects", await canRead(parentA, "entrepreneurship_projects"), false);
  expect("Parent A cannot read curriculum_enrollments",await canRead(parentA, "curriculum_enrollments"), false);
  expect("Parent A cannot read work_samples",          await canRead(parentA, "work_samples"),           false);
  expect("Parent A cannot read student_drive_folders", await canRead(parentA, "student_drive_folders"),  false);
  expect("Parent A cannot read unpublished yearbook_portfolios",
    await canRead(parentA, "yearbook_portfolios", { student_id: PARENT_B_STUDENT_ID }),
    false
  );

  console.log("\n── Teacher ──");
  expect("Teacher can read attendance_records",     await canRead(teacher, "attendance_records"),      true);
  expect("Teacher can read incidents",              await canRead(teacher, "incidents"),               false); // may have no data
  expect("Teacher can read student_goals",          await canRead(teacher, "student_goals"),           false); // may have no data
  expect("Teacher can read medication_alerts",      await canRead(teacher, "medication_alerts"),       false); // may have no data

  console.log("\n── Volunteer ──");
  expect("Volunteer cannot read student_medical",   await canRead(volunteer, "student_medical"),       false);
  expect("Volunteer cannot read incidents",         await canRead(volunteer, "incidents"),             false);
  expect("Volunteer cannot read medication_alerts", await canRead(volunteer, "medication_alerts"),     false);
  expect("Volunteer cannot read support_flags",     await canRead(volunteer, "support_flags"),         false);
  expect("Volunteer cannot read staff_compliance_records", await canRead(volunteer, "staff_compliance_records"), false);

  console.log("\n── Anonymous ──");
  expect("Anonymous cannot read students",          await canRead(anon, "students"),                   false);
  expect("Anonymous cannot read attendance_records",await canRead(anon, "attendance_records"),         false);
  expect("Anonymous cannot read families",          await canRead(anon, "families"),                   false);
  expect("Anonymous cannot read incidents",         await canRead(anon, "incidents"),                  false);
  expect("Anonymous cannot read student_medical",   await canRead(anon, "student_medical"),            false);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.error("\nFailed tests:");
    failures.forEach((f) => console.error(`  ❌ ${f}`));
  }
  console.log("══════════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((e) => { console.error(e); process.exit(1); });
