import * as dotenv from "dotenv";
import { Client } from "pg";
import * as path from "path";
dotenv.config({ path: path.join(__dirname, "../.env.staging") });
const DB_URL = process.env.STAGING_DB_URL!;
if (!DB_URL?.includes("qjyofbxmymquqobalshg")) { process.exit(1); }
const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await c.connect();
  const r = await c.query("SELECT id, first_name, last_name, enrollment_status FROM students WHERE enrollment_status = 'active' LIMIT 5");
  console.log(r.rows);
  await c.end();
}

main().catch(console.error);
