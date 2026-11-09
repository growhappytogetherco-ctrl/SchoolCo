import * as dotenv from "dotenv";
import { Client } from "pg";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env.staging") });

const DB_URL = process.env.STAGING_DB_URL;
if (!DB_URL?.includes("qjyofbxmymquqobalshg")) {
  console.error("ABORT: STAGING_DB_URL missing or does not contain staging project ref qjyofbxmymquqobalshg");
  process.exit(1);
}

console.log("Staging project ref confirmed: qjyofbxmymquqobalshg ✓");

const migrationPath = path.join(__dirname, "../supabase/migrations/00106_graduation_planner.sql");
const sql = fs.readFileSync(migrationPath, "utf-8");

const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log("Connected to staging DB.");

  // Safety check: confirm we are NOT on production
  const urlCheck = await client.query("SELECT current_database()");
  console.log("Current DB:", urlCheck.rows[0].current_database);

  // Check no graduation tables exist yet
  const existing = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name LIKE 'graduation%'
    ORDER BY table_name
  `);
  if (existing.rows.length > 0) {
    console.error("ABORT: graduation tables already exist:", existing.rows.map((r: any) => r.table_name).join(", "));
    console.error("Migration 00106 may have already been applied. Check before re-running.");
    await client.end();
    process.exit(1);
  }
  console.log("No existing graduation tables — clean start ✓");

  // Apply migration
  console.log("\nApplying migration 00106_graduation_planner.sql...");
  await client.query(sql);
  console.log("Migration applied successfully ✓");

  // Verify tables were created
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name LIKE 'graduation%' OR table_name LIKE 'student_graduation%'
    ORDER BY table_name
  `);
  console.log("\nCreated tables:", tables.rows.map((r: any) => r.table_name).join(", "));

  // Verify RLS enabled
  const rls = await client.query(`
    SELECT tablename, rowsecurity FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'graduation_requirement_templates',
        'graduation_requirements',
        'graduation_plans',
        'student_graduation_requirements',
        'graduation_plan_entries',
        'graduation_plan_manual_credits',
        'graduation_guidance_reviews'
      )
    ORDER BY tablename
  `);
  console.log("\nRLS status:");
  for (const row of rls.rows) {
    console.log(`  ${row.tablename}: rowsecurity=${row.rowsecurity}`);
    if (!row.rowsecurity) {
      console.error(`  ERROR: RLS not enabled on ${row.tablename}`);
    }
  }

  // Verify seed data
  const template = await client.query(`
    SELECT id, cohort_year, label, total_credits_required FROM graduation_requirement_templates
    WHERE cohort_year = 2023 AND organization_id IS NULL
  `);
  console.log("\nSeeded template:", JSON.stringify(template.rows[0], null, 2));

  const reqs = await client.query(`
    SELECT category, requirement_name, default_credits FROM graduation_requirements r
    JOIN graduation_requirement_templates t ON t.id = r.template_id
    WHERE t.cohort_year = 2023
    ORDER BY r.sort_order
  `);
  console.log("\nSeeded requirements:");
  let total = 0;
  for (const row of reqs.rows) {
    console.log(`  [${row.category}] ${row.requirement_name}: ${row.default_credits}`);
    total += parseFloat(row.default_credits);
  }
  console.log(`\n  Total credits: ${total} (expected: 24.0)`);
  if (Math.abs(total - 24.0) > 0.001) {
    console.error("ERROR: Total credits mismatch!");
  } else {
    console.log("  Total credits match ✓");
  }

  // Verify RLS policies
  const policies = await client.query(`
    SELECT tablename, policyname, cmd FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'graduation_requirement_templates',
        'graduation_requirements',
        'graduation_plans',
        'student_graduation_requirements',
        'graduation_plan_entries',
        'graduation_plan_manual_credits',
        'graduation_guidance_reviews'
      )
    ORDER BY tablename, policyname
  `);
  console.log(`\nRLS policies created: ${policies.rows.length}`);
  for (const row of policies.rows) {
    console.log(`  ${row.tablename}: ${row.policyname} (${row.cmd})`);
  }

  // Confirm no UPDATE/DELETE policies on immutable tables
  const immutablePolicies = await client.query(`
    SELECT tablename, policyname, cmd FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'graduation_requirement_templates',
        'graduation_requirements',
        'graduation_guidance_reviews'
      )
      AND cmd IN ('UPDATE', 'DELETE')
  `);
  if (immutablePolicies.rows.length > 0) {
    console.error("ERROR: UPDATE/DELETE policies found on immutable tables:", immutablePolicies.rows);
  } else {
    console.log("\nNo UPDATE/DELETE policies on immutable tables ✓");
  }

  await client.end();
  console.log("\n=== Migration 00106 applied to staging successfully ===");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  client.end().catch(() => {});
  process.exit(1);
});
