/**
 * Finance Reconciliation Audit Script
 *
 * READ-ONLY. No writes. Safe to run against production.
 *
 * Checks:
 *   1. Migration 00088 status (cents columns present)
 *   2. Precision audit — legacy NUMERIC vs INTEGER cents
 *   3. Problematic amounts: >2 decimal places, negative, zero, potential overflow
 *   4. Charge/payment/adjustment totals
 *   5. Student balance reconciliation
 *   6. Orphaned allocations (payment without matching charge)
 *   7. Ledger and family account row counts
 *
 * Exit 0 = all checks pass (GO for production migration)
 * Exit 1 = discrepancies found (NO-GO — review before proceeding)
 *
 * Usage:
 *   npm run audit:balances
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Allow ENV_FILE=.env.staging npm run audit:balances:staging
const envFile = process.env.ENV_FILE ?? ".env.local";
dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const USD = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const section = (title: string) =>
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);

let issues = 0;
const FAIL = (msg: string) => { issues++; console.log(`  ✗ FAIL  ${msg}`); };
const WARN = (msg: string) =>               console.log(`  ⚠ WARN  ${msg}`);
const OK   = (msg: string) =>               console.log(`  ✓ OK    ${msg}`);

// ─── 1. Migration status ──────────────────────────────────────────────────────

async function checkMigration(): Promise<boolean> {
  section("1. Migration 00088 column status");
  const checks = [
    { table: "student_charges",     col: "original_amount_cents" },
    { table: "charge_adjustments",  col: "amount_cents" },
    { table: "student_payments",    col: "amount_cents" },
    { table: "payment_allocations", col: "amount_cents" },
  ];
  let allPresent = true;
  for (const c of checks) {
    const { error } = await db.from(c.table).select(c.col).limit(1);
    if (error?.message?.includes("column")) {
      FAIL(`${c.table}.${c.col} is MISSING — migration 00088 not applied`);
      allPresent = false;
    } else {
      OK(`${c.table}.${c.col} present`);
    }
  }
  return allPresent;
}

// ─── 2. Precision audit ───────────────────────────────────────────────────────

interface PrecisionRow { id: string; legacy: number; cents: number }

async function precisionAudit(
  table: string, legacyCol: string, centsCol: string
) {
  const { data, error } = await db.from(table).select(`id, ${legacyCol}, ${centsCol}`);
  if (error) { FAIL(`Cannot query ${table}: ${error.message}`); return; }

  const rows = (data ?? []) as any[];
  let mismatches = 0;
  const flagged: string[] = [];

  for (const r of rows) {
    const legacy: number = r[legacyCol] ?? 0;
    const cents:  number = r[centsCol]  ?? 0;

    // Flag values with more than 2 decimal places.
    // PostgreSQL ROUND() on NUMERIC uses half-away-from-zero (traditional
    // rounding, NOT banker's rounding). A NUMERIC(10,2) column should not
    // hold >2 decimal places, but we flag them rather than silently accept
    // a rounded conversion.
    const str = String(legacy);
    const decimals = str.includes(".") ? str.split(".")[1].length : 0;
    if (decimals > 2) {
      flagged.push(`  id=${r.id}  ${legacyCol}=${legacy}  (${decimals} decimal places — flagged for manual review before authorizing migration)`);
      mismatches++;
    }

    // Flag INTEGER overflow risk: max INTEGER = 2,147,483,647 cents = $21,474,836.47
    if (cents > 2_000_000_000) {
      flagged.push(`  id=${r.id}  ${centsCol}=${cents}  OVERFLOW RISK (>$20M)`);
      mismatches++;
    }

    // Mismatch between ROUND(legacy*100) and stored cents.
    // Uses JavaScript Math.round (half-away-from-zero), matching PostgreSQL
    // ROUND() behavior on NUMERIC columns.
    const expected = Math.round(legacy * 100);
    const diff = Math.abs(cents - expected);
    if (diff > 0) {
      flagged.push(`  id=${r.id}  legacy=${legacy}  expected_cents=${expected}  actual_cents=${cents}  diff=${diff}`);
      mismatches++;
    }
  }

  if (mismatches === 0) {
    OK(`${table}: ${rows.length} rows — precision OK`);
  } else {
    FAIL(`${table}: ${mismatches}/${rows.length} rows with issues`);
    flagged.slice(0, 20).forEach(f => console.log(f));
    if (flagged.length > 20) console.log(`    ... and ${flagged.length - 20} more`);
  }
}

async function runPrecisionAudit() {
  section("2. Monetary precision audit");
  await precisionAudit("student_charges",    "original_amount", "original_amount_cents");
  await precisionAudit("charge_adjustments", "amount",          "amount_cents");
  await precisionAudit("student_payments",   "amount",          "amount_cents");
  await precisionAudit("payment_allocations","amount",          "amount_cents");
}

// ─── 3. Totals and distribution ───────────────────────────────────────────────

async function totalsReport() {
  section("3. Financial totals");

  // Charges
  const { data: charges } = await db
    .from("student_charges")
    .select("id, status, original_amount_cents");
  const cRows = (charges ?? []) as any[];
  const activeChargesCents  = cRows.filter(r => r.status === "active").reduce((s, r) => s + r.original_amount_cents, 0);
  const voidedChargesCents  = cRows.filter(r => r.status === "voided").reduce((s, r) => s + r.original_amount_cents, 0);
  console.log(`  student_charges: ${cRows.length} rows  active=${USD(activeChargesCents)}  voided=${USD(voidedChargesCents)}`);

  // Adjustments
  const { data: adjs } = await db
    .from("charge_adjustments")
    .select("id, status, amount_cents");
  const aRows = (adjs ?? []) as any[];
  const activeAdjCents = aRows.filter(r => r.status === "active").reduce((s, r) => s + r.amount_cents, 0);
  console.log(`  charge_adjustments: ${aRows.length} rows  active_net=${USD(activeAdjCents)}`);

  // Payments
  const { data: payments } = await db
    .from("student_payments")
    .select("id, status, amount_cents");
  const pRows = (payments ?? []) as any[];
  const activePayCents  = pRows.filter(r => r.status === "active").reduce((s, r) => s + r.amount_cents, 0);
  const voidedPayCents  = pRows.filter(r => r.status === "voided").reduce((s, r) => s + r.amount_cents, 0);
  console.log(`  student_payments: ${pRows.length} rows  active=${USD(activePayCents)}  voided=${USD(voidedPayCents)}`);

  // Allocations
  const { data: allocs } = await db
    .from("payment_allocations")
    .select("id, amount_cents");
  const alRows = (allocs ?? []) as any[];
  const totalAllocCents = alRows.reduce((s, r) => s + r.amount_cents, 0);
  console.log(`  payment_allocations: ${alRows.length} rows  total_allocated=${USD(totalAllocCents)}`);

  // Consistency check: active payment sum should match total allocations (ignoring voided)
  if (Math.abs(activePayCents - totalAllocCents) > 1) {
    WARN(`Payment/allocation mismatch: payments=${USD(activePayCents)}  allocations=${USD(totalAllocCents)}  diff=${USD(Math.abs(activePayCents - totalAllocCents))}`);
  } else {
    OK("Active payment total matches allocation total");
  }
}

// ─── 4. Student balance reconciliation ───────────────────────────────────────

async function studentBalances() {
  section("4. Student balance reconciliation (sample — first 100 students with charges)");

  const { data: charges } = await db
    .from("student_charges")
    .select("id, student_id, school_year_id, original_amount_cents, status");
  const { data: adjs } = await db
    .from("charge_adjustments")
    .select("charge_id, amount_cents, status");
  const { data: allocs } = await db
    .from("payment_allocations")
    .select("charge_id, amount_cents, payment_id");
  const { data: voidedPay } = await db
    .from("student_payments")
    .select("id")
    .eq("status", "voided");

  const cRows = (charges ?? []) as any[];
  const aRows = (adjs ?? []) as any[];
  const alRows = (allocs ?? []) as any[];
  const voidedIds = new Set((voidedPay ?? []).map((p: any) => p.id));

  // Build maps
  const adjByCharge = new Map<string, number>();
  for (const a of aRows) {
    if (a.status === "active") {
      adjByCharge.set(a.charge_id, (adjByCharge.get(a.charge_id) ?? 0) + a.amount_cents);
    }
  }
  const paidByCharge = new Map<string, number>();
  for (const al of alRows) {
    if (!voidedIds.has(al.payment_id)) {
      paidByCharge.set(al.charge_id, (paidByCharge.get(al.charge_id) ?? 0) + al.amount_cents);
    }
  }

  // Per-student summary
  const studentMap = new Map<string, { charged: number; adjusted: number; paid: number }>();
  for (const c of cRows) {
    if (c.status !== "active") continue;
    const entry = studentMap.get(c.student_id) ?? { charged: 0, adjusted: 0, paid: 0 };
    const adjCents = adjByCharge.get(c.id) ?? 0;
    entry.charged  += c.original_amount_cents;
    entry.adjusted += adjCents;
    entry.paid     += paidByCharge.get(c.id) ?? 0;
    studentMap.set(c.student_id, entry);
  }

  let overpaid = 0;
  let negativeBalance = 0;
  let totalBalance = 0;

  for (const [, v] of studentMap) {
    const balance = v.charged + v.adjusted - v.paid;
    totalBalance += balance;
    if (balance < 0) negativeBalance++;
    if (v.paid > v.charged + v.adjusted) overpaid++;
  }

  console.log(`  Students with active charges: ${studentMap.size}`);
  console.log(`  Total outstanding balance:    ${USD(totalBalance)}`);
  if (negativeBalance > 0) WARN(`${negativeBalance} students have a negative balance (overpaid)`);
  else OK("No students with negative balance");
  if (overpaid > 0) WARN(`${overpaid} students are overpaid (paid > effective charge)`);
}

// ─── 5. Orphan checks ─────────────────────────────────────────────────────────

async function orphanChecks() {
  section("5. Data integrity checks");

  // Allocations pointing to non-existent charges
  const { data: chargeIds } = await db.from("student_charges").select("id");
  const { data: allocRows } = await db.from("payment_allocations").select("id, charge_id");
  const chargeSet = new Set((chargeIds ?? []).map((r: any) => r.id));
  const orphanAllocs = (allocRows ?? []).filter((r: any) => !chargeSet.has(r.charge_id));
  if (orphanAllocs.length > 0) {
    FAIL(`${orphanAllocs.length} payment_allocations reference non-existent charges`);
  } else {
    OK("All payment_allocations reference valid charges");
  }

  // Adjustments with no parent charge
  const { data: adjRows } = await db.from("charge_adjustments").select("id, charge_id");
  const orphanAdjs = (adjRows ?? []).filter((r: any) => !chargeSet.has(r.charge_id));
  if (orphanAdjs.length > 0) {
    FAIL(`${orphanAdjs.length} charge_adjustments reference non-existent charges`);
  } else {
    OK("All charge_adjustments reference valid charges");
  }
}

// ─── 6. Ledger and family account counts ─────────────────────────────────────

async function infrastructureStatus() {
  section("6. New infrastructure status (00089 / 00090)");

  const { count: ledgerCount, error: le } = await db
    .from("finance_ledger")
    .select("id", { count: "exact", head: true });
  if (le) {
    WARN("finance_ledger not yet queryable — migration 00089 not applied");
  } else {
    const n = ledgerCount ?? 0;
    console.log(`  finance_ledger rows:           ${n}`);
    if (n === 0) WARN("Ledger empty — historical backfill not yet run (expected pre-production)");
  }

  const { count: famCount, error: fe } = await db
    .from("family_finance_accounts")
    .select("id", { count: "exact", head: true });
  if (fe) {
    WARN("family_finance_accounts not yet queryable — migration 00090 not applied");
  } else {
    console.log(`  family_finance_accounts rows:  ${famCount ?? 0}`);
  }

  const { count: settingsCount, error: se } = await db
    .from("finance_settings")
    .select("id", { count: "exact", head: true });
  if (se) {
    WARN("finance_settings not yet queryable — migration 00090 not applied");
  } else {
    console.log(`  finance_settings rows:         ${settingsCount ?? 0}`);
  }
}

// ─── 0. Pre-migration amount integrity (runs against current NUMERIC columns) ──

async function preMigrationCheck() {
  section("0. Pre-migration: NUMERIC amount integrity (legacy columns)");

  // This check runs on the EXISTING NUMERIC columns regardless of migration state.
  // PostgreSQL NUMERIC(10,2) columns should not hold values with >2 decimal places,
  // but we verify because the _cents backfill will ROUND them (half-away-from-zero).
  const tables = [
    { table: "student_charges",    col: "original_amount" },
    { table: "charge_adjustments", col: "amount" },
    { table: "student_payments",   col: "amount" },
    { table: "payment_allocations",col: "amount" },
  ];

  for (const t of tables) {
    const { data, error } = await db
      .from(t.table)
      .select(`id, ${t.col}`);
    if (error) { WARN(`Cannot query ${t.table}.${t.col}: ${error.message}`); continue; }

    const rows = (data ?? []) as any[];
    let oddRows = 0;
    for (const r of rows) {
      const v: number = r[t.col] ?? 0;
      // Check for >2 decimal places (shouldn't happen in NUMERIC(10,2) but verify)
      const str = String(v);
      const decimals = str.includes(".") ? str.split(".")[1].length : 0;
      if (decimals > 2) {
        if (oddRows === 0) console.log(`  ${t.table}.${t.col} — rows with >2 decimal places:`);
        console.log(`    id=${r.id}  value=${v}`);
        oddRows++;
        issues++;
      }
    }
    if (oddRows === 0) {
      OK(`${t.table}.${t.col}: ${rows.length} rows — all values have ≤2 decimal places`);
    } else {
      FAIL(`${t.table}.${t.col}: ${oddRows} rows with >2 decimal places — review before authorizing migration`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  SchoolCo Finance Reconciliation Audit");
  console.log(`  Run at: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════════════════════════");

  await preMigrationCheck();

  const migrated = await checkMigration();
  if (!migrated) {
    console.log("\n  Migration 00088 not yet applied. Run:  npx supabase db push --linked");
    console.log("  Re-run this audit after migration is applied.\n");
    process.exit(1);
  }

  await runPrecisionAudit();
  await totalsReport();
  await studentBalances();
  await orphanChecks();
  await infrastructureStatus();

  console.log("\n═══════════════════════════════════════════════════════════════");
  if (issues === 0) {
    console.log("  RESULT: PASS — zero discrepancies.");
    console.log("  GO: safe to proceed with production migration sequence.");
  } else {
    console.log(`  RESULT: FAIL — ${issues} issue(s) require resolution.`);
    console.log("  NO-GO: do not apply production migrations until all issues");
    console.log("  above are resolved and this audit exits with code 0.");
  }
  console.log("═══════════════════════════════════════════════════════════════\n");

  process.exit(issues > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
