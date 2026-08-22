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
const COOK_FAMILY_ID = "2093b806-9145-456f-84ba-eea20ea1d435";

async function main() {
  // Get admin profile ID
  const { data: adminRow } = await sb.from("organization_members")
    .select("profile_id").eq("organization_id", ORG_ID).eq("role", "admin").limit(1).single();
  const adminId = (adminRow as any)?.profile_id;
  console.log("Admin ID:", adminId);

  // Test household insert
  const { data: hh, error: hhErr } = await sb.from("households").insert({
    organization_id: ORG_ID,
    family_id: COOK_FAMILY_ID,
    household_label: "Cook Family",
    sort_order: 1,
    created_by: adminId,
  }).select("id");
  console.log("Household insert:", JSON.stringify(hh), hhErr?.message ?? "OK");
  if (hh?.[0]) {
    await sb.from("households").delete().eq("id", (hh[0] as any).id);
    console.log("Test household cleaned up");
  }

  // Test profile insert with self-generated UUID (no auth user)
  const { createId } = await import("@paralleldrive/cuid2").catch(() => ({ createId: () => crypto.randomUUID() }));
  const newId = crypto.randomUUID();
  const { data: prof, error: profErr } = await sb.from("profiles").insert({
    id: newId,
    full_name: "Test Guardian",
    email: "testguardian@schoolco.test",
    phone: "(555) 000-0000",
  }).select("id");
  console.log("Profile insert (with UUID, no auth user):", JSON.stringify(prof), profErr?.message ?? "OK");

  if (prof?.[0]) {
    const profileId = (prof[0] as any).id;
    const stuId = "e1bf9f92-8bc3-4e05-b545-57a748bc6a93"; // Quintrell Cook
    const { data: gship, error: gErr } = await sb.from("guardianships").insert({
      organization_id: ORG_ID,
      profile_id: profileId,
      student_id: stuId,
      relationship_type: "mother",
      custody_type: "primary",
      is_legal_guardian: true,
      is_primary_contact: true,
      is_emergency_contact: true,
      can_pickup: true,
      created_by: adminId,
    }).select("id");
    console.log("Guardianship insert:", JSON.stringify(gship), gErr?.message ?? "OK");
    if (gship?.[0]) await sb.from("guardianships").delete().eq("id", (gship[0] as any).id);
    await sb.from("profiles").delete().eq("id", profileId);
    console.log("Test guardian + guardianship cleaned up");
  }
}

main().catch(console.error);
