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

  // Auth users
  const { data: authData } = await sb.auth.admin.listUsers({ perPage: 200 });
  const allUsers = authData?.users ?? [];
  const elisaAuth = allUsers.filter(u =>
    u.email?.toLowerCase().includes("elisa") ||
    u.email?.toLowerCase().includes("happytogether") ||
    u.email?.toLowerCase().includes("farr") ||
    u.email?.toLowerCase().includes("grow.happy")
  );
  console.log("=== Auth users matching Elisa ===");
  for (const u of elisaAuth) console.log(`  ${u.id} | ${u.email} | created: ${u.created_at?.slice(0,10)}`);
  console.log(`  (total auth users: ${allUsers.length})`);

  // All profiles
  const { data: profiles } = await sb.from("profiles").select("id, full_name, email, auth_user_id");
  const elisaProfiles = (profiles ?? []).filter((p: any) =>
    p.full_name?.toLowerCase().includes("elisa") ||
    p.email?.toLowerCase().includes("elisa") ||
    p.email?.toLowerCase().includes("farr") ||
    p.email?.toLowerCase().includes("happytogether") ||
    p.email?.toLowerCase().includes("grow.happy")
  );
  console.log("\n=== Profiles matching Elisa ===");
  for (const p of elisaProfiles as any[]) {
    console.log(`  profile: ${p.id} | name: ${p.full_name} | email: ${p.email} | auth_user_id: ${p.auth_user_id}`);
  }

  // full_admin members
  const { data: members } = await sb.from("organization_members")
    .select("profile_id, role, status").eq("organization_id", ORG_ID);
  const fullAdmins = (members ?? []).filter((m: any) => m.role === "full_admin");
  console.log("\n=== full_admin members ===");
  for (const m of fullAdmins as any[]) {
    const prof = (profiles ?? []).find((p: any) => p.id === m.profile_id) as any;
    console.log(`  profile: ${m.profile_id} | email: ${prof?.email} | name: ${prof?.full_name} | status: ${m.status}`);
  }

  // Guardianships for all Elisa profiles
  for (const p of elisaProfiles as any[]) {
    const { data: gships } = await sb.from("guardianships")
      .select("student_id, household_id, relationship_type")
      .eq("organization_id", ORG_ID).eq("profile_id", p.id);
    if ((gships ?? []).length > 0) {
      console.log(`\n  Guardianships for ${p.full_name} (${p.id}):`);
      for (const g of (gships ?? []) as any[]) {
        const { data: stu } = await sb.from("students")
          .select("first_name, last_name, student_display_id").eq("id", g.student_id).single();
        const { data: hh } = await sb.from("households")
          .select("household_label").eq("id", g.household_id).single();
        console.log(`    ${(stu as any)?.student_display_id} ${(stu as any)?.first_name} ${(stu as any)?.last_name} | ${(hh as any)?.household_label} | ${g.relationship_type}`);
      }
    }
  }

  // Staff record
  const { data: staff } = await sb.from("staff_profiles")
    .select("profile_id, title, is_lead_teacher, is_teacher").eq("organization_id", ORG_ID);
  console.log("\n=== Staff profiles ===");
  for (const s of (staff ?? []) as any[]) {
    const prof = (profiles ?? []).find((p: any) => p.id === s.profile_id) as any;
    console.log(`  ${prof?.full_name ?? s.profile_id} | title: ${s.title} | lead_teacher: ${s.is_lead_teacher} | teacher: ${s.is_teacher}`);
  }
}
main().catch(console.error);
