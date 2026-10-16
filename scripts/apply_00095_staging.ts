import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env.staging") });
const DB_URL = process.env.STAGING_DB_URL!;
if (!DB_URL?.includes("qjyofbxmymquqobalshg")) { console.error("Not staging — aborting"); process.exit(1); }

async function main() {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const sql = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/00095_orders_phase2.sql"), "utf-8"
  );
  await c.query(sql);
  console.log("Migration 00095 applied.");

  // Seed RLA payment settings (staging org)
  const orgRow = await c.query(`SELECT id FROM organizations LIMIT 1;`);
  if (orgRow.rows.length > 0) {
    const orgId = orgRow.rows[0].id;
    await c.query(`
      INSERT INTO finance_settings (organization_id, zelle_recipient, zelle_type, check_payee, cash_instructions, zelle_enabled, manual_payments_enabled)
      VALUES ($1, '321-795-9724', 'phone', 'Healing Through Christ Foundation',
              'Bring to front office in an envelope labeled with Amount, child''s name, and invoice number',
              true, true)
      ON CONFLICT (organization_id) DO UPDATE SET
        zelle_recipient    = EXCLUDED.zelle_recipient,
        zelle_type         = EXCLUDED.zelle_type,
        check_payee        = EXCLUDED.check_payee,
        cash_instructions  = EXCLUDED.cash_instructions,
        zelle_enabled      = true,
        manual_payments_enabled = true;
    `, [orgId]);
    console.log(`Seeded payment settings for org ${orgId}`);
  }

  // Verify
  const tables = await c.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('order_payments','order_email_log')
    ORDER BY table_name;
  `);
  console.log("Tables created:", tables.rows.map((r: any) => r.table_name).join(", "));

  const cols = await c.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name IN ('invoiced_at','due_date','billing_recipient_id','billing_recipient_email','invoice_sent_count')
    ORDER BY column_name;
  `);
  console.log("orders new columns:", cols.rows.map((r: any) => r.column_name).join(", "));

  await c.end();
  console.log("Done.");
}
main().catch(e => { console.error(e.message); process.exit(1); });
