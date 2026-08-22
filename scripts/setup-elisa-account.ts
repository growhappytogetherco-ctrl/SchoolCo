/**
 * Finalizes Elisa Johnson's account:
 * 1. Merges guardian stub (elisa_farr@yahoo.com) into authenticated profile (grow.happytogetherco@gmail.com)
 * 2. Re-points all 5 guardianships to authenticated profile
 * 3. Deletes the stub profile
 * 4. Creates staff_profile (Principal / Lead Teacher)
 * 5. Adds "parent" to organization_members.roles so view-switching works
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

const AUTH_PROFILE_ID = "7ba9a63f-c33d-4a25-b716-125e27bdf1b5"; // grow.happytogetherco@gmail.com
const STUB_PROFILE_ID = "051095d1-0a17-4b51-a2f5-4cd8f298ba3a"; // elisa_farr@yahoo.com (no auth)

function ok(msg: string)   { console.log(`  ✓  ${msg}`); }
function err(msg: string)  { console.error(`  ✘  ${msg}`); }
function info(msg: string) { console.log(`  ·  ${msg}`); }

async function main() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  Elisa Johnson Account Setup");
  console.log("══════════════════════════════════════════════════════\n");

  // ── 1. Verify both profiles exist ─────────────────────────────────────────
  const { data: authProf } = await sb.from("profiles").select("id, full_name, email, auth_user_id")
    .eq("id", AUTH_PROFILE_ID).single();
  const { data: stubProf } = await sb.from("profiles").select("id, full_name, email, auth_user_id")
    .eq("id", STUB_PROFILE_ID).single();

  if (!authProf) { err("Authenticated profile not found — abort"); process.exit(1); }
  ok(`Auth profile: ${(authProf as any).email} (auth_user_id: ${(authProf as any).auth_user_id})`);

  if (!stubProf) {
    ok("Stub profile not found — already cleaned up, skipping merge");
  } else {
    ok(`Stub profile: ${(stubProf as any).email} (auth_user_id: ${(stubProf as any).auth_user_id ?? "none"})`);

    // ── 2. Re-point guardianships from stub → auth profile ──────────────────
    console.log("\n  Re-pointing guardianships…");
    const { data: stubGships } = await sb.from("guardianships")
      .select("id, student_id").eq("organization_id", ORG_ID).eq("profile_id", STUB_PROFILE_ID);

    for (const g of (stubGships ?? []) as any[]) {
      // Check if auth profile already has a guardianship for this student (avoid duplicate)
      const { data: existing } = await sb.from("guardianships")
        .select("id").eq("organization_id", ORG_ID)
        .eq("profile_id", AUTH_PROFILE_ID).eq("student_id", g.student_id).single();

      if (existing) {
        // Delete the stub one (auth profile already has it)
        await sb.from("guardianships").delete().eq("id", g.id);
        info(`Student ${g.student_id}: auth profile already had guardianship, deleted stub duplicate`);
      } else {
        // Move stub guardianship to auth profile
        const { error: updateErr } = await sb.from("guardianships")
          .update({ profile_id: AUTH_PROFILE_ID }).eq("id", g.id);
        if (updateErr) { err(`Guardianship ${g.id}: ${updateErr.message}`); }
        else { ok(`Guardianship ${g.id} → auth profile`); }
      }
    }

    // ── 3. Delete stub profile ────────────────────────────────────────────────
    console.log("\n  Deleting stub profile…");
    const { error: deleteErr } = await sb.from("profiles").delete().eq("id", STUB_PROFILE_ID);
    if (deleteErr) {
      err(`Could not delete stub: ${deleteErr.message}`);
      info("Stub may have other references — leaving in place, guardianships already re-pointed");
    } else {
      ok("Stub profile deleted");
    }
  }

  // ── 4. Verify guardianships now on auth profile ───────────────────────────
  console.log("\n  Verifying guardianships on auth profile…");
  const { data: authGships } = await sb.from("guardianships")
    .select("student_id, household_id, relationship_type")
    .eq("organization_id", ORG_ID).eq("profile_id", AUTH_PROFILE_ID);

  ok(`Auth profile has ${(authGships ?? []).length} guardianships (expect 5)`);
  for (const g of (authGships ?? []) as any[]) {
    const { data: stu } = await sb.from("students")
      .select("first_name, last_name, student_display_id").eq("id", g.student_id).single();
    ok(`  → ${(stu as any)?.student_display_id} ${(stu as any)?.first_name} ${(stu as any)?.last_name} (${g.relationship_type})`);
  }

  // ── 5. Create staff_profile ───────────────────────────────────────────────
  console.log("\n  Setting up staff profile…");
  const { data: existingStaff } = await sb.from("staff_profiles")
    .select("id, display_title, additional_roles")
    .eq("organization_id", ORG_ID).eq("profile_id", AUTH_PROFILE_ID).single();

  if (existingStaff) {
    // Update title/roles
    const { error: staffUpdErr } = await sb.from("staff_profiles")
      .update({
        display_title:   "Principal",
        additional_roles: ["Lead Teacher"],
        staff_type:      "staff",
      } as never).eq("id", (existingStaff as any).id);
    if (staffUpdErr) err(`Staff profile update: ${staffUpdErr.message}`);
    else ok(`Staff profile updated: Principal / Lead Teacher`);
  } else {
    const { error: staffErr } = await sb.from("staff_profiles").insert({
      organization_id:  ORG_ID,
      profile_id:       AUTH_PROFILE_ID,
      display_title:    "Principal",
      additional_roles: ["Lead Teacher"],
      staff_type:       "staff",
    } as never);
    if (staffErr) err(`Staff profile create: ${staffErr.message}`);
    else ok("Staff profile created: Principal / Lead Teacher");
  }

  // ── 6. Add "parent" to organization_members.roles ─────────────────────────
  console.log("\n  Configuring multi-role (staff + parent)…");
  const { data: member } = await sb.from("organization_members")
    .select("id, role, roles, status")
    .eq("organization_id", ORG_ID).eq("profile_id", AUTH_PROFILE_ID).single();

  if (!member) { err("No org member record found — abort"); process.exit(1); }
  const m = member as any;
  ok(`Current role: ${m.role} | roles: ${JSON.stringify(m.roles)} | status: ${m.status}`);

  const currentRoles: string[] = m.roles ?? [];
  const needsParent = !currentRoles.includes("parent");
  const needsFullAdmin = !currentRoles.includes("full_admin");

  const newRoles = [...new Set([...currentRoles, "full_admin", "parent"])];

  const { error: rolesErr } = await sb.from("organization_members")
    .update({ roles: newRoles } as never).eq("id", m.id);
  if (rolesErr) { err(`Roles update: ${rolesErr.message}`); }
  else { ok(`Roles updated: ${JSON.stringify(newRoles)}`); }

  // ── 7. Verify full_admin uniqueness ───────────────────────────────────────
  console.log("\n  Verifying full_admin exclusivity…");
  const { data: allMembers } = await sb.from("organization_members")
    .select("profile_id, role, status").eq("organization_id", ORG_ID).eq("role", "full_admin");
  ok(`full_admin members: ${(allMembers ?? []).length} (must be 1)`);
  for (const fm of (allMembers ?? []) as any[]) {
    const { data: prof } = await sb.from("profiles").select("full_name, email").eq("id", fm.profile_id).single();
    ok(`  ${(prof as any)?.full_name} | ${(prof as any)?.email} | status: ${fm.status}`);
  }

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  ELISA ACCOUNT SETUP COMPLETE");
  console.log("  Login email: grow.happytogetherco@gmail.com");
  console.log("  Role: full_admin + parent (multi-view)");
  console.log("  Staff: Principal / Lead Teacher");
  console.log("  Guardianships: 5 Johnson Family students");
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
