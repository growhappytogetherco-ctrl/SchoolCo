/**
 * Creates the Johnson Family split-household structure:
 *
 * Family: Johnson Family (already exists, is_split_household=yes)
 *
 * Households (to create):
 *   1. Johnson – Primary  (already exists: update household_id on Elisa/Kenny guardianships)
 *   2. Saint Fleur – Secondary (NEW): Jean Paul Saint Fleur → Jezziyn, Jrisstyn, Emeliya, Jacob
 *   3. Jolissaint – Secondary (NEW): Keishla (Amber) Jolissaint → Ezra ONLY
 *
 * Guardians to create:
 *   - Jean Paul Saint Fleur (no email yet — flagged for follow-up)
 *   - Keishla Jolissaint (email: ayala.keishla28@gmail.com, phone: (321) 493-4024)
 *
 * Guardianship settings for Amber:
 *   - Ezra'Miah Johnson only
 *   - relationship: mother (bio)
 *   - custody: joint
 *   - is_legal_guardian: true
 *   - household: Jolissaint
 *
 * Guardianship settings for Jean Paul:
 *   - Jezziyn, Jrisstyn, Emeliya, Jacob
 *   - relationship: father (bio)
 *   - custody: joint
 *   - is_legal_guardian: true
 *   - household: Saint Fleur
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

const ORG_ID = "9fd43346-f43b-41d1-9b4c-fe8702471b07";

function ok(msg: string)   { console.log(`  ✓  ${msg}`); }
function warn(msg: string) { console.log(`  ⚠  ${msg}`); }
function err(msg: string)  { console.error(`  ✘  ${msg}`); }

async function main() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  Johnson Family Split-Household Setup");
  console.log("══════════════════════════════════════════════════════\n");

  // ── 1. Find Johnson Family ────────────────────────────────────────────────────
  const { data: jfam } = await sb.from("families")
    .select("id, family_name, is_split_household")
    .eq("organization_id", ORG_ID).eq("family_name", "Johnson Family").single();

  if (!jfam) { err("Johnson Family not found"); process.exit(1); }
  const familyId = (jfam as any).id;
  ok(`Johnson Family: ${familyId} (split=${(jfam as any).is_split_household})`);

  // Mark as split if not already
  if (!(jfam as any).is_split_household) {
    await sb.from("families").update({ is_split_household: true }).eq("id", familyId);
    ok("Marked Johnson Family as split-household");
  }

  // ── 2. Get all Johnson family students ────────────────────────────────────────
  const { data: students } = await sb.from("students")
    .select("id, first_name, last_name, student_display_id")
    .eq("organization_id", ORG_ID).eq("family_id", familyId);

  const studentMap: Record<string, string> = {};
  for (const s of (students ?? []) as any[]) {
    const key = `${s.first_name} ${s.last_name}`.toLowerCase().replace(/'/g, "'");
    studentMap[key] = s.id;
    ok(`  Student: ${s.student_display_id} ${s.first_name} ${s.last_name} (${s.id})`);
  }

  const ezraId     = studentMap["ezra'miah johnson"] ?? studentMap["ezramiah johnson"];
  const jezziynId  = studentMap["jezziyn farr-saint fleur"];
  const jrisstynId = studentMap["jrisstyn farr-saint fleur"];
  const emeliId    = studentMap["emeliya farr-saint fleur"];
  const jacobId    = studentMap["eddy jacob joseph"];

  if (!ezraId)     { err("Ezra'Miah not found"); process.exit(1); }
  if (!jezziynId)  { err("Jezziyn not found"); process.exit(1); }
  if (!jrisstynId) { err("Jrisstyn not found"); process.exit(1); }
  if (!emeliId)    { err("Emeliya not found"); process.exit(1); }
  if (!jacobId)    { err("Eddy Jacob not found"); process.exit(1); }

  // ── 3. Find/create households ─────────────────────────────────────────────────
  const { data: existingHHs } = await sb.from("households")
    .select("id, household_label, sort_order")
    .eq("organization_id", ORG_ID).eq("family_id", familyId);

  console.log(`\n  Existing households under Johnson Family:`);
  for (const hh of (existingHHs ?? []) as any[]) {
    ok(`  [${hh.sort_order}] ${hh.household_label} (${hh.id})`);
  }

  const johnsonHH = (existingHHs ?? []).find((hh: any) => hh.sort_order === 1) as any;
  const johnsonHHId = johnsonHH?.id as string | undefined;
  if (!johnsonHHId) { err("Primary Johnson household not found"); process.exit(1); }
  ok(`Primary household (Johnson): ${johnsonHHId}`);

  // Saint Fleur household
  let sfHHId: string;
  const existingSF = (existingHHs ?? []).find((hh: any) =>
    (hh.household_label as string).toLowerCase().includes("saint fleur")
  ) as any;
  if (existingSF) {
    sfHHId = existingSF.id;
    ok(`Saint Fleur household already exists: ${sfHHId}`);
  } else {
    const { data: newSF, error: sfErr } = await sb.from("households").insert({
      organization_id: ORG_ID,
      family_id:       familyId,
      household_label: "Saint Fleur – Secondary",
      sort_order:      2,
      // Address unknown — flag for admin follow-up
    }).select("id").single();
    if (sfErr || !newSF) { err(`Saint Fleur household create: ${sfErr?.message}`); process.exit(1); }
    sfHHId = (newSF as any).id;
    ok(`Created Saint Fleur household: ${sfHHId} (no address — flagged for follow-up)`);
  }

  // Jolissaint household
  let joHHId: string;
  const existingJo = (existingHHs ?? []).find((hh: any) =>
    (hh.household_label as string).toLowerCase().includes("jolissaint")
  ) as any;
  if (existingJo) {
    joHHId = existingJo.id;
    ok(`Jolissaint household already exists: ${joHHId}`);
  } else {
    const { data: newJo, error: joErr } = await sb.from("households").insert({
      organization_id: ORG_ID,
      family_id:       familyId,
      household_label: "Jolissaint – Secondary",
      sort_order:      3,
      address_json:    { street1: "510 Olney St", city: "Palm Bay", state: "FL", zip: "32908" },
      phone:           "(321) 493-4024",
      email:           "ayala.keishla28@gmail.com",
    }).select("id").single();
    if (joErr || !newJo) { err(`Jolissaint household create: ${joErr?.message}`); process.exit(1); }
    joHHId = (newJo as any).id;
    ok(`Created Jolissaint household: ${joHHId} (510 Olney St, Palm Bay FL 32908)`);
  }

  // ── 4. Update Elisa/Kenny guardianship household_ids to Johnson HH ─────────────
  console.log("\n  Updating Elisa/Kenny guardianship household_ids…");

  // Find Elisa and Kenny by profile email
  const { data: elisaProf } = await sb.from("profiles").select("id").eq("email", "elisa_farr@yahoo.com").single();
  const { data: kennyProf } = await sb.from("profiles").select("id").eq("email", "kennethbjohnson321@gmail.com").single();

  const elisaId = (elisaProf as any)?.id as string | undefined;
  const kennyId = (kennyProf as any)?.id as string | undefined;
  if (!elisaId) warn("Elisa profile not found by email");
  if (!kennyId) warn("Kenny profile not found by email");

  for (const [label, pid] of [["Elisa", elisaId], ["Kenny", kennyId]] as [string, string | undefined][]) {
    if (!pid) continue;
    const { data: updated } = await sb.from("guardianships")
      .update({ household_id: johnsonHHId })
      .eq("organization_id", ORG_ID)
      .eq("profile_id", pid)
      .select("id, student_id");
    ok(`${label}: set household_id on ${(updated ?? []).length} guardianships`);
  }

  // ── 5. Create Jean Paul Saint Fleur profile + guardianships ───────────────────
  console.log("\n  Setting up Jean Paul Saint Fleur…");

  // Check if Jean Paul already exists
  const { data: jpProfs } = await sb.from("profiles")
    .select("id, full_name, email").is("email", null);
  const existingJP = (jpProfs ?? []).find((p: any) =>
    (p.full_name as string).toLowerCase().includes("jean paul")
  ) as any;

  let jpProfileId: string;
  if (existingJP) {
    jpProfileId = existingJP.id;
    ok(`Jean Paul profile already exists: ${jpProfileId}`);
  } else {
    const { data: jpProf, error: jpErr } = await sb.from("profiles").insert({
      id:        crypto.randomUUID(),
      full_name: "Jean Paul Saint Fleur",
      email:     null,
      phone:     null,
    }).select("id").single();
    if (jpErr || !jpProf) { err(`Jean Paul profile: ${jpErr?.message}`); process.exit(1); }
    jpProfileId = (jpProf as any).id;
    ok(`Created Jean Paul Saint Fleur profile: ${jpProfileId} (no contact info — follow-up needed)`);
  }

  // Jean Paul guardianships: Jezziyn, Jrisstyn, Emeliya, Jacob → Saint Fleur HH
  const jpStudents = [
    { id: jezziynId, name: "Jezziyn" },
    { id: jrisstynId, name: "Jrisstyn" },
    { id: emeliId, name: "Emeliya" },
    { id: jacobId, name: "Jacob" },
  ];

  for (const stu of jpStudents) {
    const { data: existing } = await sb.from("guardianships")
      .select("id").eq("organization_id", ORG_ID)
      .eq("profile_id", jpProfileId).eq("student_id", stu.id).single();
    if (existing) {
      // Update household_id in case it's missing
      await sb.from("guardianships").update({ household_id: sfHHId })
        .eq("id", (existing as any).id);
      ok(`JP → ${stu.name}: guardianship exists, updated household`);
    } else {
      const { error: gErr } = await sb.from("guardianships").insert({
        organization_id:    ORG_ID,
        profile_id:         jpProfileId,
        student_id:         stu.id,
        household_id:       sfHHId,
        relationship_type:  "father",
        custody_type:       "joint",
        is_legal_guardian:  true,
        is_primary_contact: false,
        is_emergency_contact: true,
        can_pickup:         true,
      });
      if (gErr) { err(`JP → ${stu.name}: ${gErr.message}`); } else { ok(`JP → ${stu.name}: guardianship created`); }
    }
  }

  // ── 6. Create Keishla/Amber Jolissaint profile + guardianship ─────────────────
  console.log("\n  Setting up Keishla (Amber) Jolissaint…");

  const { data: amberProf } = await sb.from("profiles")
    .select("id").eq("email", "ayala.keishla28@gmail.com").single();

  let amberProfileId: string;
  if (amberProf) {
    amberProfileId = (amberProf as any).id;
    ok(`Amber profile already exists: ${amberProfileId}`);
  } else {
    const { data: newAmber, error: aErr } = await sb.from("profiles").insert({
      id:        crypto.randomUUID(),
      full_name: "Keishla Jolissaint",
      email:     "ayala.keishla28@gmail.com",
      phone:     "(321) 493-4024",
    }).select("id").single();
    if (aErr || !newAmber) { err(`Amber profile: ${aErr?.message}`); process.exit(1); }
    amberProfileId = (newAmber as any).id;
    ok(`Created Keishla Jolissaint profile: ${amberProfileId}`);
  }

  // Amber guardianship: Ezra ONLY → Jolissaint HH
  const { data: amberExisting } = await sb.from("guardianships")
    .select("id").eq("organization_id", ORG_ID)
    .eq("profile_id", amberProfileId).eq("student_id", ezraId).single();

  if (amberExisting) {
    await sb.from("guardianships").update({ household_id: joHHId })
      .eq("id", (amberExisting as any).id);
    ok("Amber → Ezra: guardianship exists, updated household");
  } else {
    const { error: agErr } = await sb.from("guardianships").insert({
      organization_id:    ORG_ID,
      profile_id:         amberProfileId,
      student_id:         ezraId,
      household_id:       joHHId,
      relationship_type:  "mother",
      custody_type:       "joint",
      is_legal_guardian:  true,
      is_primary_contact: false,
      is_emergency_contact: true,
      can_pickup:         true,
    });
    if (agErr) { err(`Amber → Ezra: ${agErr.message}`); } else { ok("Amber → Ezra: guardianship created"); }
  }

  // ── 7. Verify Amber has NO access to other Johnson students ───────────────────
  console.log("\n  Verifying Amber isolation…");
  const { data: amberAll } = await sb.from("guardianships")
    .select("student_id").eq("organization_id", ORG_ID).eq("profile_id", amberProfileId);
  const amberStudents = (amberAll ?? []).map((g: any) => g.student_id);
  if (amberStudents.every((id: string) => id === ezraId)) {
    ok(`Amber has access to exactly 1 student (Ezra only) ✓`);
  } else {
    const extra = amberStudents.filter((id: string) => id !== ezraId);
    err(`Amber has unexpected access to student IDs: ${extra.join(", ")}`);
  }

  // ── 8. Verify Jean Paul has NO access to Ezra ────────────────────────────────
  console.log("\n  Verifying Jean Paul isolation from Ezra…");
  const { data: jpAll } = await sb.from("guardianships")
    .select("student_id").eq("organization_id", ORG_ID).eq("profile_id", jpProfileId);
  const jpStudentIds = (jpAll ?? []).map((g: any) => g.student_id);
  if (!jpStudentIds.includes(ezraId)) {
    ok(`Jean Paul has NO access to Ezra ✓ (${jpStudentIds.length} students)`);
  } else {
    err("Jean Paul has unexpected access to Ezra!");
  }

  // ── 9. Final household count for Johnson Family ───────────────────────────────
  console.log("\n  Final Johnson Family households:");
  const { data: finalHHs } = await sb.from("households")
    .select("id, household_label, sort_order")
    .eq("organization_id", ORG_ID).eq("family_id", familyId)
    .order("sort_order");
  for (const hh of (finalHHs ?? []) as any[]) {
    ok(`  [${hh.sort_order}] ${hh.household_label} (${hh.id})`);
  }

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  JOHNSON SPLIT-HOUSEHOLD SETUP COMPLETE");
  console.log(`  Households: ${(finalHHs ?? []).length} (expected 3)`);
  console.log(`  Jean Paul guardianships: ${jpStudentIds.length} (expected 4)`);
  console.log(`  Amber guardianships: ${amberStudents.length} (expected 1, Ezra only)`);
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
