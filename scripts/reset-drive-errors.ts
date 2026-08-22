import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
for (const f of [".env.local", ".env.production.local"]) {
  const p = resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[m[1]] = val;
  }
}

import { createClient } from "@supabase/supabase-js";
const ORG_ID = "9fd43346-f43b-41d1-9b4c-fe8702471b07";

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { error } = await sb.from("students")
    .update({ drive_folder_status: null, drive_error_message: null } as never)
    .eq("organization_id", ORG_ID)
    .in("drive_folder_status", ["error", "creating"]);

  if (error) { console.error("Error:", error.message); process.exit(1); }
  console.log("Reset complete.");

  const { data: check } = await sb.from("students")
    .select("student_display_id, drive_folder_status")
    .eq("organization_id", ORG_ID).order("student_display_id");
  for (const s of (check ?? []) as any[]) {
    console.log(`  ${s.student_display_id}: ${s.drive_folder_status ?? "null (pending)"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
