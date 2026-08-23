/**
 * Full guardian data audit — all 44 guardianships, all 7 families.
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
  // Load all data
  const { data: families }  = await sb.from("families").select("id, family_name, is_split_household").eq("organization_id", ORG_ID).order("family_name");
  const { data: households } = await sb.from("households").select("id, household_label, family_id, sort_order").eq("organization_id", ORG_ID).order("sort_order");
  const { data: students }  = await sb.from("students").select("id, first_name, last_name, student_display_id, family_id").eq("organization_id", ORG_ID).order("student_display_id");
  const { data: profiles }  = await sb.from("profiles").select("id, full_name, email, phone, auth_user_id");
  const { data: gships }    = await sb.from("guardianships").select("id, profile_id, student_id, household_id, relationship_type, custody_type, is_legal_guardian, is_primary_contact, can_pickup, is_emergency_contact, organization_id").eq("organization_id", ORG_ID);
  const { data: members }   = await sb.from("organization_members").select("profile_id, role, status").eq("organization_id", ORG_ID);

  const famById  = new Map((families  ?? []).map((f: any) => [f.id, f]));
  const hhById   = new Map((households ?? []).map((h: any) => [h.id, h]));
  const stuById  = new Map((students  ?? []).map((s: any) => [s.id, s]));
  const profById = new Map((profiles  ?? []).map((p: any) => [p.id, p]));
  const memByProf = new Map((members  ?? []).map((m: any) => [m.profile_id, m]));

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  GUARDIAN DATA AUDIT");
  console.log(`  Families: ${(families??[]).length} | Households: ${(households??[]).length}`);
  console.log(`  Students: ${(students??[]).length} | Profiles: ${(profiles??[]).length}`);
  console.log(`  Guardianships: ${(gships??[]).length} | Org members: ${(members??[]).length}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // ── Identify "Unknown" guardians ─────────────────────────────────────────
  const unknowns: any[] = [];
  for (const g of (gships ?? []) as any[]) {
    const prof = profById.get(g.profile_id);
    if (!prof) {
      unknowns.push({ gship: g, reason: "NO_PROFILE — profile_id references a non-existent profile" });
    } else if (!prof.full_name && !prof.email) {
      unknowns.push({ gship: g, prof, reason: "EMPTY_PROFILE — profile exists but no name or email" });
    } else if (!prof.full_name) {
      unknowns.push({ gship: g, prof, reason: "NO_NAME — profile has email but no full_name" });
    }
  }

  console.log(`Unknown-rendering guardianships: ${unknowns.length}`);
  for (const u of unknowns) {
    const stu = stuById.get(u.gship.student_id);
    console.log(`  ✘ gship ${u.gship.id}`);
    console.log(`    Reason: ${u.reason}`);
    console.log(`    profile_id: ${u.gship.profile_id}`);
    console.log(`    Profile: ${JSON.stringify(u.prof ?? null)}`);
    console.log(`    Student: ${(stu as any)?.student_display_id} ${(stu as any)?.first_name} ${(stu as any)?.last_name}`);
    console.log(`    Relationship: ${u.gship.relationship_type}`);
    console.log();
  }

  // ── Per-family audit ─────────────────────────────────────────────────────
  for (const fam of (families ?? []) as any[]) {
    console.log(`\n─── ${fam.family_name} (split=${fam.is_split_household}) ─────────────`);

    const famStudents = (students ?? []).filter((s: any) => s.family_id === fam.id) as any[];
    const famHHs = (households ?? []).filter((h: any) => h.family_id === fam.id) as any[];
    const famStudentIds = new Set(famStudents.map((s: any) => s.id));
    const famGships = (gships ?? []).filter((g: any) => famStudentIds.has(g.student_id)) as any[];

    // Group guardianships by profile
    const byProfile = new Map<string, any[]>();
    for (const g of famGships) {
      if (!byProfile.has(g.profile_id)) byProfile.set(g.profile_id, []);
      byProfile.get(g.profile_id)!.push(g);
    }

    console.log(`  Households: ${famHHs.map((h: any) => h.household_label).join(", ")}`);
    console.log(`  Students (${famStudents.length}): ${famStudents.map((s: any) => `${s.first_name} ${s.last_name}`).join(", ")}`);
    console.log(`  Guardianship rows: ${famGships.length} across ${byProfile.size} guardian profiles\n`);

    for (const [profileId, gs] of byProfile) {
      const prof = profById.get(profileId) as any;
      const mem = memByProf.get(profileId) as any;
      const name = prof?.full_name ?? "(NO NAME)";
      const email = prof?.email ?? "(no email)";
      const phone = prof?.phone ?? "(no phone)";
      const hasAuth = prof?.auth_user_id ? "Auth ✓" : "No auth";
      const portalStatus = mem ? `${mem.role}/${mem.status}` : "No org membership";

      console.log(`  GUARDIAN: ${name}`);
      console.log(`    profile_id: ${profileId}`);
      console.log(`    email: ${email} | phone: ${phone}`);
      console.log(`    ${hasAuth} | ${portalStatus}`);
      for (const g of gs) {
        const stu = stuById.get(g.student_id);
        const hh = hhById.get(g.household_id);
        console.log(`    → ${(stu as any)?.student_display_id} ${(stu as any)?.first_name} ${(stu as any)?.last_name}`);
        console.log(`       rel=${g.relationship_type} | custody=${g.custody_type} | legal=${g.is_legal_guardian} | pickup=${g.can_pickup} | hh=${(hh as any)?.household_label ?? "(no hh)"}`);
      }
      console.log();
    }
  }

  // ── Duplicate profile check ───────────────────────────────────────────────
  console.log("\n═══ DUPLICATE PROFILE CHECK ═══");
  const byEmail = new Map<string, any[]>();
  const byName  = new Map<string, any[]>();
  for (const p of (profiles ?? []) as any[]) {
    if (p.email) {
      if (!byEmail.has(p.email)) byEmail.set(p.email, []);
      byEmail.get(p.email)!.push(p);
    }
    if (p.full_name) {
      const key = (p.full_name as string).toLowerCase().trim();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(p);
    }
  }

  let dupFound = false;
  for (const [email, profs] of byEmail) {
    if (profs.length > 1) {
      dupFound = true;
      console.log(`  DUP EMAIL: ${email}`);
      for (const p of profs) console.log(`    ${p.id} | ${p.full_name}`);
    }
  }
  for (const [name, profs] of byName) {
    if (profs.length > 1) {
      dupFound = true;
      console.log(`  DUP NAME: "${name}"`);
      for (const p of profs) console.log(`    ${p.id} | ${p.email ?? "(no email)"}`);
    }
  }
  if (!dupFound) console.log("  No duplicates found.");

  // ── Orphaned guardianships ────────────────────────────────────────────────
  console.log("\n═══ ORPHANED / BROKEN RECORDS ═══");
  let clean = true;
  for (const g of (gships ?? []) as any[]) {
    if (!profById.has(g.profile_id)) {
      console.log(`  ORPHAN gship ${g.id}: profile_id ${g.profile_id} does not exist`);
      clean = false;
    }
    if (!stuById.has(g.student_id)) {
      console.log(`  ORPHAN gship ${g.id}: student_id ${g.student_id} does not exist`);
      clean = false;
    }
  }
  if (clean) console.log("  No orphaned guardianships.");

  // ── Summary counts ────────────────────────────────────────────────────────
  console.log("\n═══ SUMMARY ═══");
  console.log(`  Total guardianships: ${(gships??[]).length}`);
  console.log(`  Total guardian profiles (unique): ${new Set((gships??[]).map((g:any)=>g.profile_id)).size}`);
  console.log(`  Unknown-rendering: ${unknowns.length}`);

  // Guardianships missing household
  const noHH = (gships ?? []).filter((g: any) => !g.household_id);
  console.log(`  Guardianships missing household_id: ${noHH.length}`);
  for (const g of noHH as any[]) {
    const prof = profById.get(g.profile_id);
    const stu = stuById.get(g.student_id);
    console.log(`    gship ${g.id} | ${(prof as any)?.full_name ?? "???"} → ${(stu as any)?.first_name} ${(stu as any)?.last_name} | rel: ${g.relationship_type}`);
  }
}

main().catch(console.error);
