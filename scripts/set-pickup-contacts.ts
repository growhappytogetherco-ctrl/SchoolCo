/**
 * Sets can_pickup=true for the 6 "other" relationship contacts imported as
 * secondary contacts. These are authorized pickup people, not legal guardians.
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
  // These are the profile IDs for the 6 "other" contacts (confirmed authorized for pickup)
  const pickupProfileIds = [
    "1f4a0d82-06a9-4617-aedb-2e024d39eacd", // Rashard Hoggins (Cook)
    "a940c035-b5b1-41f4-a368-ddbcf8483700", // Jasmine Alexander (Harley)
    "b394e68c-320e-4c5c-bafb-e13a24e25831", // Karen McGarry
    "1217097d-69df-4d1e-b6d3-9474d43fdd77", // Emmanuella Clermont (Sears)
    "ce8cce95-a342-4931-b7d6-c8f3841934a0", // Emmanuella Sears (Sears)
    "db07c4ca-568c-4dd4-bf5e-cbde21527f98", // Amy Coombe (Young)
  ];

  const { data, error } = await sb.from("guardianships")
    .update({ can_pickup: true } as never)
    .eq("organization_id", ORG_ID)
    .in("profile_id", pickupProfileIds)
    .select("id, profile_id");

  if (error) { console.error("Error:", error.message); process.exit(1); }

  console.log(`Updated ${(data ?? []).length} guardianship rows → can_pickup = true`);

  // Verify
  const { data: profiles } = await sb.from("profiles")
    .select("id, full_name").in("id", pickupProfileIds);
  for (const p of (profiles ?? []) as any[]) {
    const rows = (data ?? []).filter((g: any) => g.profile_id === p.id);
    console.log(`  ✓ ${p.full_name}: ${rows.length} guardianship(s) updated`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
