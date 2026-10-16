import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: path.resolve(process.cwd(), ".env.staging") });
const DB_URL = process.env.STAGING_DB_URL;
if (!DB_URL?.includes("qjyofbxmymquqobalshg")) { console.error("Not staging — aborting"); process.exit(1); }

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const sql = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/00093_fix_invoice_number_format.sql"), "utf-8"
  );
  await client.query(sql);
  console.log("Migration 00093 applied.");

  // Verify with real org
  const orgRow = await client.query(`SELECT id, short_name FROM organizations LIMIT 1;`);
  if (orgRow.rows.length > 0) {
    const orgId = orgRow.rows[0].id;
    const r = await client.query(`SELECT generate_invoice_number($1::uuid) AS num;`, [orgId]);
    console.log(`Sample invoice number: ${r.rows[0].num}`);
    // Cleanup
    await client.query(`DELETE FROM invoice_sequences WHERE organization_id=$1;`, [orgId]);
    console.log("(test sequence cleaned up)");
  }
  await client.end();
  console.log("Done.");
}
main().catch(e => { console.error(e.message); process.exit(1); });
