/**
 * Programmatic financial data backup.
 *
 * Exports all financial tables to backup/financial_<timestamp>.json using
 * the production service role key. Does NOT require pg_dump, Docker, or
 * any special CLI permissions.
 *
 * What is backed up (production → JSON file):
 *   student_charges, charge_adjustments, student_payments,
 *   payment_allocations, students (names redacted), organizations (name only)
 *
 * What is NOT backed up:
 *   auth.users (Supabase-managed, cannot be exported via JS client)
 *   non-financial tables (attendance, reports, etc.)
 *
 * This backup is sufficient to restore all financial records if a migration
 * causes data loss. It is NOT a full database restore — it does not include
 * all 90 migrations' worth of non-financial schema.
 *
 * To restore: run a new Supabase project through all migrations, then
 * INSERT the records from the JSON file.
 *
 * Run:
 *   npx tsx scripts/backup_financial_data.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { writeFileSync, mkdirSync } from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function fetchAll<T>(table: string, select = "*"): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(select);
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
  return data as T[];
}

async function run() {
  console.log(`\n${"═".repeat(60)}`);
  console.log("  SchoolCo Financial Backup");
  console.log(`  ${new Date().toISOString()}`);
  console.log(`${"═".repeat(60)}\n`);

  const [charges, adjustments, payments, allocations, students, orgs] =
    await Promise.all([
      fetchAll("student_charges"),
      fetchAll("charge_adjustments"),
      fetchAll("student_payments"),
      fetchAll("payment_allocations"),
      // Students: export IDs + org + enrollment status but redact names
      fetchAll<Record<string, unknown>>("students", "id, organization_id, grade_level, enrollment_status, created_at"),
      fetchAll<Record<string, unknown>>("organizations", "id, name, slug"),
    ]);

  const backup = {
    backup_at:      new Date().toISOString(),
    supabase_url:   process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/https?:\/\//, "").slice(0, 30) + "…",
    tables: {
      student_charges:    { count: charges.length,     rows: charges },
      charge_adjustments: { count: adjustments.length, rows: adjustments },
      student_payments:   { count: payments.length,    rows: payments },
      payment_allocations:{ count: allocations.length, rows: allocations },
      students_anonymized:{ count: students.length,    rows: students },
      organizations:      { count: orgs.length,        rows: orgs },
    },
    totals: {
      charges_active:  (charges as any[]).filter(r => r.status === "active").length,
      charges_voided:  (charges as any[]).filter(r => r.status === "voided").length,
      payments_active: (payments as any[]).filter(r => r.status === "active").length,
      payments_voided: (payments as any[]).filter(r => r.status === "voided").length,
      total_charged_dollars: (charges as any[])
        .filter(r => r.status === "active")
        .reduce((s: number, r: any) => s + parseFloat(r.original_amount ?? "0"), 0),
      total_paid_dollars: (payments as any[])
        .filter(r => r.status === "active")
        .reduce((s: number, r: any) => s + parseFloat(r.amount ?? "0"), 0),
    },
  };

  mkdirSync(path.resolve(__dirname, "../backup"), { recursive: true });
  const filename = `financial_${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
  const filepath = path.resolve(__dirname, `../backup/${filename}`);
  writeFileSync(filepath, JSON.stringify(backup, null, 2), "utf8");

  console.log("Backup summary:");
  console.log(`  student_charges:     ${charges.length}`);
  console.log(`  charge_adjustments:  ${adjustments.length}`);
  console.log(`  student_payments:    ${payments.length}`);
  console.log(`  payment_allocations: ${allocations.length}`);
  console.log(`  students (anon):     ${students.length}`);
  console.log(`\nTotals:`);
  console.log(`  Active charges: ${backup.totals.charges_active} ($${backup.totals.total_charged_dollars.toFixed(2)})`);
  console.log(`  Active payments:${backup.totals.payments_active} ($${backup.totals.total_paid_dollars.toFixed(2)})`);
  console.log(`\nFile: backup/${filename}`);
  console.log(`Size: ${(JSON.stringify(backup).length / 1024).toFixed(1)} KB`);
  console.log(`\nThis backup is gitignored and will not be committed.`);
  console.log(`Restore path: apply all 90 migrations to a new project, then INSERT from this file.`);
}

run().catch(err => { console.error(err); process.exit(1); });
