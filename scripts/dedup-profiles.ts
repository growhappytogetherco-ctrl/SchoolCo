/**
 * Merge duplicate no-email guardian profiles.
 * For each group of profiles with the same full_name and null email,
 * keep the first one and re-point all guardianships to it, then delete duplicates.
 */

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

async function main() {
  // Fetch all no-email profiles
  const { data: profs } = await sb.from("profiles")
    .select("id, full_name").is("email", null).order("full_name");

  // Group by full_name
  const groups = new Map<string, string[]>();
  for (const p of (profs ?? []) as any[]) {
    const key = (p.full_name as string).toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p.id);
  }

  for (const [name, ids] of groups) {
    if (ids.length <= 1) continue;

    const keep = ids[0];
    const remove = ids.slice(1);
    console.log(`\nMerging "${name}": keep ${keep}, remove [${remove.join(", ")}]`);

    // Re-point all guardianships from duplicate profile IDs to the keeper
    for (const dup of remove) {
      const { data: updated, error } = await sb.from("guardianships")
        .update({ profile_id: keep })
        .eq("profile_id", dup)
        .select("id");
      if (error) {
        console.error(`  ERR updating guardianships from ${dup}: ${error.message}`);
      } else {
        console.log(`  Updated ${updated?.length ?? 0} guardianships from ${dup} → ${keep}`);
      }
    }

    // Delete duplicate profiles
    const { error: delErr } = await sb.from("profiles").delete().in("id", remove);
    if (delErr) console.error(`  ERR deleting profiles: ${delErr.message}`);
    else console.log(`  Deleted ${remove.length} duplicate profile(s)`);
  }

  console.log("\nDedup complete.");
}
main().catch(console.error);
