import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

const envFile = process.env.ENV_FILE ?? ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const checks: [string, string][] = [
  ["student_charges",         "id, original_amount, original_amount_cents, status"],
  ["student_payments",        "id, amount, amount_cents, status"],
  ["charge_adjustments",      "id, amount, amount_cents, status"],
  ["payment_allocations",     "id, amount, amount_cents"],
  ["finance_ledger",          "id"],
  ["family_finance_accounts", "id, account_name, status"],
  ["finance_settings",        "id"],
  ["organizations",           "id, name"],
  ["guardianships",           "id, status, profile_id"],
];

async function main() {
  console.log("Staging schema verification");
  console.log("URL:", process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 50));
  console.log();
  for (const [t, sel] of checks) {
    const { data, error } = await sb.from(t).select(sel);
    if (error) {
      console.log("FAIL", t.padEnd(28), "—", error.message);
    } else {
      console.log("OK  ", t.padEnd(28), "—", data?.length ?? 0, "rows");
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
