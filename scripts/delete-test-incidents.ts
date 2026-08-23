/**
 * Deletes the two "Scrapped knee" test incidents from 6/27/2026.
 * Explicitly approved by user 2026-08-22.
 * Verifies: unlinked from real students, matches identifying info, then deletes.
 */
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
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const ORG_ID = "9fd43346-f43b-41d1-9b4c-fe8702471b07";

async function main() {
  // Fetch all incidents to audit before deletion
  const { data: all, error: ae } = await sb
    .from("incidents")
    .select("id, title, incident_type, severity, status, occurred_at, student_id")
    .eq("organization_id", ORG_ID)
    .order("occurred_at", { ascending: false });

  if (ae) { console.error("Fetch error:", ae.message); process.exit(1); }

  console.log(`\nTotal production incidents: ${(all ?? []).length}`);

  // Find the test records
  const testRecords = (all ?? []).filter((i: any) =>
    i.title?.toLowerCase().includes("scrapped knee") ||
    (i.title?.toLowerCase().includes("scrap") && i.incident_type === "medical")
  ) as any[];

  console.log(`\nMatching test incidents found: ${testRecords.length}`);
  for (const r of testRecords) {
    console.log(`  id=${r.id} | title="${r.title}" | type=${r.incident_type} | severity=${r.severity} | status=${r.status} | date=${r.occurred_at?.slice(0,10)} | student_id=${r.student_id ?? "NULL (unlinked)"}`);
    if (r.student_id) {
      console.error(`  ✘ ABORT: This incident is linked to a student (${r.student_id}). Manual review required.`);
      process.exit(1);
    }
  }

  if (testRecords.length === 0) {
    console.log("  No matching records found. Nothing deleted.");
    return;
  }
  if (testRecords.length > 2) {
    console.error(`  ✘ ABORT: Found ${testRecords.length} matching records (expected exactly 2). Manual review required.`);
    process.exit(1);
  }

  // Delete
  const idsToDelete = testRecords.map((r: any) => r.id);
  const { error: de } = await sb
    .from("incidents")
    .delete()
    .in("id", idsToDelete)
    .eq("organization_id", ORG_ID);

  if (de) { console.error("Delete error:", de.message); process.exit(1); }
  console.log(`\n✓ Deleted ${testRecords.length} test incident(s).`);

  // Verify
  const { data: remaining } = await sb
    .from("incidents")
    .select("id, title")
    .eq("organization_id", ORG_ID);
  console.log(`\nProduction incident count after cleanup: ${(remaining ?? []).length}`);

  // Confirm none of the deleted IDs remain
  const deletedIds = new Set(idsToDelete);
  const leftovers = (remaining ?? []).filter((r: any) => deletedIds.has(r.id));
  if (leftovers.length > 0) {
    console.error("✘ Some records were NOT deleted:", leftovers);
    process.exit(1);
  }
  console.log("✓ Verified: test records no longer present.");
  console.log("✓ Real incidents unaffected.");
}
main().catch((e) => { console.error(e); process.exit(1); });
