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
    path.resolve(process.cwd(), "supabase/migrations/00094_order_items_updated_fields.sql"), "utf-8"
  );
  await c.query(sql);
  const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name='order_items' AND column_name IN ('updated_by','updated_at')");
  console.log("Added columns:", r.rows.map((x: any) => x.column_name).join(", "));
  await c.end();
  console.log("Migration 00094 applied.");
}
main().catch(e => { console.error(e.message); process.exit(1); });
