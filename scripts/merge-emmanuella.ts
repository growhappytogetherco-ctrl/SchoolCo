/**
 * Merge Emmanuella Sears (ce8cce95) → Emmanuella Clermont (1217097d).
 * Moves Braylee's guardianship, then deletes the duplicate profile.
 * Approved by user 2026-08-22.
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

const KEEP_ID   = "1217097d-69df-4d1e-b6d3-9474d43fdd77"; // Emmanuella Clermont
const DELETE_ID = "ce8cce95-a342-4931-b7d6-c8f3841934a0"; // Emmanuella Sears (duplicate)
const GSHIP_ID  = "c1f82b7e-af3d-4a68-b7f5-ae5124f1e3ce"; // Braylee's guardianship

async function main() {
  // Step 1: Re-point Braylee's guardianship to the keeper profile
  const { error: e1 } = await sb
    .from("guardianships")
    .update({ profile_id: KEEP_ID } as never)
    .eq("id", GSHIP_ID);
  if (e1) { console.error("Failed to re-point guardianship:", e1.message); process.exit(1); }
  console.log("✓ Moved Braylee's guardianship → Emmanuella Clermont");

  // Step 2: Verify no remaining guardianships reference the duplicate
  const { data: remaining } = await sb
    .from("guardianships")
    .select("id, student_id")
    .eq("profile_id", DELETE_ID);
  if ((remaining ?? []).length > 0) {
    console.error("✘ Duplicate profile still has guardianships — aborting delete:", remaining);
    process.exit(1);
  }

  // Step 3: Delete the duplicate profile
  const { error: e3 } = await sb
    .from("profiles")
    .delete()
    .eq("id", DELETE_ID);
  if (e3) { console.error("Failed to delete duplicate profile:", e3.message); process.exit(1); }
  console.log("✓ Deleted duplicate profile Emmanuella Sears (ce8cce95)");

  // Step 4: Verify final state
  const { data: gships } = await sb
    .from("guardianships")
    .select("id, student_id, profile_id")
    .eq("profile_id", KEEP_ID);
  const { data: students } = await sb
    .from("students")
    .select("id, first_name, last_name")
    .in("id", (gships ?? []).map((g: any) => g.student_id));
  console.log("\nFinal state — Emmanuella Clermont linked to:");
  for (const g of (gships ?? []) as any[]) {
    const s = (students ?? []).find((s: any) => s.id === g.student_id) as any;
    console.log(`  ✓ ${s?.first_name} ${s?.last_name}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
