import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

for (const envFile of [".env.local", ".env.production.local"]) {
  const envPath = resolve(process.cwd(), envFile);
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DELETE_ORPHANS = process.argv.includes("--delete-orphan-families");

async function main() {
  const { data: orgs } = await supabase.from("organizations").select("id, name, slug");
  const rla = (orgs ?? []).find((o: any) => o.slug === "rla" || o.slug === "rising-leaders-academy");
  if (!rla) { console.log("RLA org NOT FOUND"); return; }
  const ORG_ID = rla.id;
  console.log("Org:", rla.name, ORG_ID);

  const { data: students, error: sErr } = await supabase
    .from("students").select("id, first_name, last_name, student_display_id, organization_id, family_id")
    .eq("organization_id", ORG_ID).order("student_display_id");
  console.log(`\nSTUDENTS: ${students?.length ?? 0}  err=${sErr?.message ?? "none"}`);
  for (const s of students ?? []) console.log(`  ${s.student_display_id}  ${s.first_name} ${s.last_name}  (${s.id})`);

  const { data: families } = await supabase
    .from("families").select("id, family_name, is_split_household").eq("organization_id", ORG_ID);
  console.log(`\nFAMILIES: ${families?.length ?? 0}`);
  for (const f of families ?? []) console.log(`  [${f.id}] ${f.family_name}${f.is_split_household ? " [SPLIT]" : ""}`);

  if (DELETE_ORPHANS) {
    if ((students?.length ?? 0) > 0) {
      console.log("\nERROR: Students exist — refusing to delete families.");
      return;
    }
    const ids = (families ?? []).map((f: any) => f.id);
    if (ids.length === 0) { console.log("\nNo families to delete."); return; }
    const { error } = await supabase.from("families").delete().in("id", ids);
    if (error) console.log("DELETE ERROR:", error.message);
    else console.log(`\nDeleted ${ids.length} orphan families.`);
    return;
  }

  const { data: households, error: hhErr } = await supabase
    .from("households").select("id, household_label, family_id").eq("organization_id", ORG_ID);
  console.log(`\nHOUSEHOLDS: ${households?.length ?? 0}  err=${hhErr?.message ?? "none"}`);
  for (const h of households ?? []) console.log(`  ${h.household_label}`);

  const { data: guardianships } = await supabase
    .from("guardianships").select("id, profile_id").eq("organization_id", ORG_ID);
  console.log(`\nGUARDIANSHIPS: ${guardianships?.length ?? 0}`);
  console.log(`UNIQUE GUARDIAN PROFILES: ${new Set(guardianships?.map((g: any) => g.profile_id)).size}`);

  const { data: medical } = await supabase
    .from("student_medical").select("id").eq("organization_id", ORG_ID);
  console.log(`\nMEDICAL RECORDS: ${medical?.length ?? 0}`);

  const { data: notes } = await supabase
    .from("staff_notes").select("id").eq("organization_id", ORG_ID);
  console.log(`STAFF NOTES: ${notes?.length ?? 0}`);
}

main().catch(console.error);
