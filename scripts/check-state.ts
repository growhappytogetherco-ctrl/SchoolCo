import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
for (const f of [".env.local", ".env.production.local"]) {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const ORG_ID = "9fd43346-f43b-41d1-9b4c-fe8702471b07";

async function main() {
  const { data: notes, error: nErr } = await sb.from("staff_notes")
    .select("id, student_id, title").eq("organization_id", ORG_ID);
  console.log(`staff_notes: ${notes?.length ?? 0}  ${nErr?.message ?? ""}`);
  for (const n of notes ?? []) console.log(" ", n.title, n.student_id);

  const { data: profs } = await sb.from("profiles")
    .select("id, full_name, email").is("email", null).order("full_name");
  console.log(`\nNo-email profiles: ${profs?.length ?? 0}`);
  for (const p of profs ?? []) console.log(" ", p.full_name, p.id);

  // Check guardianships by profile to detect duplicates
  const { data: gships } = await sb.from("guardianships")
    .select("id, profile_id, student_id").eq("organization_id", ORG_ID);
  const profileCounts = new Map<string, number>();
  for (const g of gships ?? []) {
    profileCounts.set(g.profile_id, (profileCounts.get(g.profile_id) ?? 0) + 1);
  }
  console.log(`\nGuardianships by profile:`);
  for (const [pid, count] of profileCounts) {
    const prof = (profs ?? []).find((p: any) => p.id === pid);
    const label = prof?.full_name ?? pid;
    if (count > 1) console.log(` [${count}x] ${label}`);
  }
}
main().catch(console.error);
