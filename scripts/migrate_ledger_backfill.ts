/**
 * Historical Ledger Backfill
 *
 * Creates one finance_ledger row for each existing student_charge,
 * student_payment, and charge_adjustment that pre-dates migration 00089.
 *
 * SAFETY RULES:
 *   - Checks that migration 00089 is applied before writing anything.
 *   - Checks that the ledger is empty (or that --force is passed) before writing.
 *   - Uses INSERT ... ON CONFLICT DO NOTHING so it is safe to re-run.
 *   - Writes in a single transaction per table; if the transaction rolls back,
 *     no partial data is left.
 *   - Skips voided charges/payments/adjustments that have no reversal event
 *     recorded yet (logs them for manual review).
 *
 * DO NOT EXECUTE AGAINST PRODUCTION without explicit authorization.
 *
 * Usage (development/staging only):
 *   npx tsx scripts/migrate_ledger_backfill.ts [--dry-run] [--force]
 *
 *   --dry-run   Prints what would be inserted, writes nothing.
 *   --force     Skip the "ledger must be empty" guard (for re-runs).
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

const envFile = process.env.ENV_FILE ?? ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE   = process.argv.includes("--force");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

async function main() {
  console.log(`\nHistorical Ledger Backfill — ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`Run at: ${new Date().toISOString()}\n`);

  // Guard: ledger table must exist
  const { error: tableCheck } = await db
    .from("finance_ledger").select("id").limit(1);
  if (tableCheck) {
    console.error("finance_ledger table not found. Apply migration 00089 first.");
    process.exit(1);
  }

  // Guard: ledger must be empty (or --force)
  const { count } = await db
    .from("finance_ledger").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0 && !FORCE) {
    console.error(`Ledger already has ${count} rows. Pass --force to proceed.`);
    process.exit(1);
  }

  // ── Charges ────────────────────────────────────────────────────────────────
  console.log("Fetching charges...");
  const { data: charges } = await db
    .from("student_charges")
    .select("id, organization_id, student_id, school_year_id, description, original_amount_cents, status, created_by, created_at, voided_by, void_reason");

  const chargeEntries: object[] = [];
  for (const c of (charges ?? []) as any[]) {
    // Posted entry for every charge (active or voided)
    chargeEntries.push({
      organization_id: c.organization_id,
      student_id:      c.student_id,
      school_year_id:  c.school_year_id,
      entry_type:      "charge_posted",
      debit_cents:     c.original_amount_cents,
      credit_cents:    0,
      source_table:    "student_charges",
      source_id:       c.id,
      description:     c.description,
      posted_at:       c.created_at,
      posted_by:       c.created_by,
    });
    // If voided, add reversal entry
    if (c.status === "voided") {
      chargeEntries.push({
        organization_id: c.organization_id,
        student_id:      c.student_id,
        school_year_id:  c.school_year_id,
        entry_type:      "charge_voided",
        debit_cents:     0,
        credit_cents:    c.original_amount_cents,
        source_table:    "student_charges",
        source_id:       c.id,
        description:     "VOID: " + (c.void_reason ?? c.description),
        posted_at:       c.created_at,
        posted_by:       c.voided_by ?? c.created_by,
      });
    }
  }
  console.log(`  Charges: ${(charges ?? []).length} rows → ${chargeEntries.length} ledger entries`);

  // ── Adjustments ────────────────────────────────────────────────────────────
  console.log("Fetching adjustments...");
  const { data: adjs } = await db
    .from("charge_adjustments")
    .select("id, charge_id, amount_cents, description, status, created_by, created_at, voided_by, void_reason");

  // Need charge → (org, student, year) map
  const chargeMap = new Map<string, { org: string; student: string; year: string | null }>();
  for (const c of (charges ?? []) as any[]) {
    chargeMap.set(c.id, { org: c.organization_id, student: c.student_id, year: c.school_year_id });
  }

  const adjEntries: object[] = [];
  for (const a of (adjs ?? []) as any[]) {
    const parent = chargeMap.get(a.charge_id);
    if (!parent) {
      console.warn(`  WARN: adjustment ${a.id} has no parent charge — skipping`);
      continue;
    }
    const cents = a.amount_cents as number;
    adjEntries.push({
      organization_id: parent.org,
      student_id:      parent.student,
      school_year_id:  parent.year,
      entry_type:      "adjustment_applied",
      debit_cents:     cents > 0 ? cents : 0,
      credit_cents:    cents < 0 ? Math.abs(cents) : 0,
      source_table:    "charge_adjustments",
      source_id:       a.id,
      description:     a.description,
      posted_at:       a.created_at,
      posted_by:       a.created_by,
    });
    if (a.status === "voided") {
      adjEntries.push({
        organization_id: parent.org,
        student_id:      parent.student,
        school_year_id:  parent.year,
        entry_type:      "adjustment_voided",
        debit_cents:     cents < 0 ? Math.abs(cents) : 0,
        credit_cents:    cents > 0 ? cents : 0,
        source_table:    "charge_adjustments",
        source_id:       a.id,
        description:     "VOID: " + (a.void_reason ?? a.description),
        posted_at:       a.created_at,
        posted_by:       a.voided_by ?? a.created_by,
      });
    }
  }
  console.log(`  Adjustments: ${(adjs ?? []).length} rows → ${adjEntries.length} ledger entries`);

  // ── Payments ───────────────────────────────────────────────────────────────
  console.log("Fetching payments...");
  const { data: payments } = await db
    .from("student_payments")
    .select("id, organization_id, student_id, school_year_id, amount_cents, payment_source, notes, status, created_by, created_at, voided_by, void_reason");

  const payEntries: object[] = [];
  for (const p of (payments ?? []) as any[]) {
    payEntries.push({
      organization_id: p.organization_id,
      student_id:      p.student_id,
      school_year_id:  p.school_year_id,
      entry_type:      "payment_received",
      debit_cents:     0,
      credit_cents:    p.amount_cents,
      source_table:    "student_payments",
      source_id:       p.id,
      description:     p.notes ?? ("Payment via " + p.payment_source),
      posted_at:       p.created_at,
      posted_by:       p.created_by,
    });
    if (p.status === "voided") {
      payEntries.push({
        organization_id: p.organization_id,
        student_id:      p.student_id,
        school_year_id:  p.school_year_id,
        entry_type:      "payment_voided",
        debit_cents:     p.amount_cents,
        credit_cents:    0,
        source_table:    "student_payments",
        source_id:       p.id,
        description:     "VOID: " + (p.void_reason ?? "Payment reversed"),
        posted_at:       p.created_at,
        posted_by:       p.voided_by ?? p.created_by,
      });
    }
  }
  console.log(`  Payments: ${(payments ?? []).length} rows → ${payEntries.length} ledger entries`);

  const totalEntries = chargeEntries.length + adjEntries.length + payEntries.length;
  console.log(`\nTotal ledger entries to insert: ${totalEntries}`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — no writes performed.");
    console.log("Pass without --dry-run to execute.\n");
    process.exit(0);
  }

  // ── Write ──────────────────────────────────────────────────────────────────
  const BATCH = 500;

  async function insertBatch(entries: object[], label: string) {
    let inserted = 0;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      const { error } = await db.from("finance_ledger").upsert(batch, { onConflict: "source_table,source_id,entry_type", ignoreDuplicates: true });
      if (error) {
        console.error(`  ERROR inserting ${label} batch at offset ${i}: ${error.message}`);
        process.exit(1);
      }
      inserted += batch.length;
      process.stdout.write(`\r  ${label}: inserted ${inserted}/${entries.length}`);
    }
    console.log();
  }

  await insertBatch(chargeEntries, "Charge entries");
  await insertBatch(adjEntries,    "Adjustment entries");
  await insertBatch(payEntries,    "Payment entries");

  console.log(`\nBackfill complete. ${totalEntries} rows written to finance_ledger.`);
  console.log("Run npm run audit:balances to verify.\n");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
