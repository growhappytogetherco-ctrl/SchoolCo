/**
 * Split-Household RLS Validation — SchoolCo
 *
 * Creates temporary test data, verifies RLS isolation for the split-household
 * model, then cleans up every record it created.
 *
 * Run:  npx tsx tests/security/split-household-rls.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import * as crypto from "crypto";

// ── Load .env.local ───────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("Missing SUPABASE env vars."); process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures: string[] = [];

function check(label: string, result: boolean, expect: boolean) {
  if (result === expect) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    const msg = `${label} — expected ${expect ? "ALLOW" : "DENY"} but got ${result ? "ALLOW" : "DENY"}`;
    console.error(`  ❌  ${msg}`);
    failures.push(msg);
    failed++;
  }
}

function uid() { return crypto.randomUUID(); }

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function createTestUser(email: string, password: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (error) throw new Error(`createUser(${email}): ${error.message}`);
  return data.user!;
}

async function signInAs(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return c;
}

async function rows(c: SupabaseClient, table: string, filter?: Record<string, string>): Promise<number> {
  let q = (c.from(table) as any).select("id");
  if (filter) for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  const { data, error } = await q;
  if (error) return 0;
  return (data?.length ?? 0);
}

async function canSee(c: SupabaseClient, table: string, filter?: Record<string, string>): Promise<boolean> {
  return (await rows(c, table, filter)) > 0;
}

// Cleanup registry
const toDeleteStudents:        string[] = [];
const toDeleteFamilies:        string[] = [];
const toDeleteHouseholds:      string[] = [];
const toDeleteGuardianships:   string[] = [];
const toDeleteOrgMembers:      string[] = [];
const toDeleteProfiles:        string[] = [];
const toDeleteAuthUsers:       string[] = [];
const toDeleteAttendance:      string[] = [];
const toDeleteStudentGoals:    string[] = [];
const toDeleteConversations:   string[] = [];

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  SchoolCo — Split-Household RLS Security Validation");
  console.log("══════════════════════════════════════════════════════\n");

  // ── 0. Find the RLA org ────────────────────────────────────────────────────
  const { data: orgs } = await admin.from("organizations").select("id, slug").limit(5);
  const rlaOrg = (orgs as any[])?.find((o: any) => o.slug === "rla" || o.slug === "rising-leaders-academy")
              ?? (orgs as any[])?.[0];
  if (!rlaOrg) { console.error("No organization found."); process.exit(1); }
  const ORG_ID: string = rlaOrg.id;

  // Use a second org for cross-org tests (or the same if only one exists)
  const orgB = (orgs as any[])?.find((o: any) => o.id !== ORG_ID);
  const ORG_B_ID: string = orgB?.id ?? ORG_ID;

  const TEST_PW = "T3st$ecurity!2026";
  const SUFFIX  = Date.now().toString(36);
  const PA_EMAIL = `sc.test.pa.${SUFFIX}@example-schoolco.invalid`;
  const PB_EMAIL = `sc.test.pb.${SUFFIX}@example-schoolco.invalid`;

  // ── 1. Create auth users ───────────────────────────────────────────────────
  console.log("── Setting up test data ──");
  const userA = await createTestUser(PA_EMAIL, TEST_PW);
  const userB = await createTestUser(PB_EMAIL, TEST_PW);
  toDeleteAuthUsers.push(userA.id, userB.id);

  // ── 2. Create profiles ─────────────────────────────────────────────────────
  await admin.from("profiles").upsert([
    { id: userA.id, full_name: "Test Parent Alpha", email: PA_EMAIL },
    { id: userB.id, full_name: "Test Parent Beta",  email: PB_EMAIL },
  ]);
  toDeleteProfiles.push(userA.id, userB.id);

  // ── 3. Create org_members (role = parent, status = active) ────────────────
  await admin.from("organization_members").insert([
    { id: uid(), organization_id: ORG_ID, profile_id: userA.id, role: "parent", status: "active" },
    { id: uid(), organization_id: ORG_ID, profile_id: userB.id, role: "parent", status: "active" },
  ]);
  toDeleteOrgMembers.push(userA.id, userB.id);

  // ── 4. Create split-household family ───────────────────────────────────────
  const familyId  = uid();
  const hhAId     = uid();
  const hhBId     = uid();
  await admin.from("families").insert({
    id: familyId, organization_id: ORG_ID,
    family_name: "SC-TEST Split Family",
    is_split_household: true, status: "active",
  });
  toDeleteFamilies.push(familyId);

  await admin.from("households").insert([
    { id: hhAId, organization_id: ORG_ID, family_id: familyId,
      household_label: "SC-TEST Household Alpha", sort_order: 1 },
    { id: hhBId, organization_id: ORG_ID, family_id: familyId,
      household_label: "SC-TEST Household Beta",  sort_order: 2 },
  ]);
  toDeleteHouseholds.push(hhAId, hhBId);

  // ── 5. Create students ─────────────────────────────────────────────────────
  // studentA: only in Household A (visible to Parent A only)
  // studentB: only in Household B (visible to Parent B only)
  // studentShared: in BOTH (visible to both parents)
  const stuAId      = uid();
  const stuBId      = uid();
  const stuSharedId = uid();

  await admin.from("students").insert([
    { id: stuAId,      organization_id: ORG_ID, family_id: familyId,
      first_name: "AlphaOnly",   last_name: "TestKid", grade_level: "5th",
      enrollment_status: "enrolled", student_display_id: `SC-TST-A-${SUFFIX}` },
    { id: stuBId,      organization_id: ORG_ID, family_id: familyId,
      first_name: "BetaOnly",    last_name: "TestKid", grade_level: "5th",
      enrollment_status: "enrolled", student_display_id: `SC-TST-B-${SUFFIX}` },
    { id: stuSharedId, organization_id: ORG_ID, family_id: familyId,
      first_name: "SharedChild", last_name: "TestKid", grade_level: "5th",
      enrollment_status: "enrolled", student_display_id: `SC-TST-S-${SUFFIX}` },
  ]);
  toDeleteStudents.push(stuAId, stuBId, stuSharedId);

  // ── 6. Create guardianships ────────────────────────────────────────────────
  const gA1Id = uid(); // Parent A → studentA (through Household A)
  const gA2Id = uid(); // Parent A → studentShared (through Household A)
  const gB1Id = uid(); // Parent B → studentB (through Household B)
  const gB2Id = uid(); // Parent B → studentShared (through Household B)

  const gRes = await admin.from("guardianships").insert([
    { id: gA1Id, organization_id: ORG_ID, profile_id: userA.id,
      student_id: stuAId,      household_id: hhAId,
      relationship_type: "mother", custody_type: "primary",
      is_legal_guardian: true, is_primary_contact: true,
      is_emergency_contact: true, can_pickup: true, status: "active" },
    { id: gA2Id, organization_id: ORG_ID, profile_id: userA.id,
      student_id: stuSharedId, household_id: hhAId,
      relationship_type: "mother", custody_type: "joint",
      is_legal_guardian: true, is_primary_contact: true,
      is_emergency_contact: true, can_pickup: true, status: "active" },
    { id: gB1Id, organization_id: ORG_ID, profile_id: userB.id,
      student_id: stuBId,      household_id: hhBId,
      relationship_type: "father", custody_type: "primary",
      is_legal_guardian: true, is_primary_contact: true,
      is_emergency_contact: true, can_pickup: true, status: "active" },
    { id: gB2Id, organization_id: ORG_ID, profile_id: userB.id,
      student_id: stuSharedId, household_id: hhBId,
      relationship_type: "father", custody_type: "joint",
      is_legal_guardian: true, is_primary_contact: true,
      is_emergency_contact: true, can_pickup: true, status: "active" },
  ]);
  if (gRes.error) { console.error("Guardianship insert failed:", gRes.error); process.exit(1); }
  toDeleteGuardianships.push(gA1Id, gA2Id, gB1Id, gB2Id);

  // ── 7. Create attendance for all 3 students ────────────────────────────────
  const attAId = uid(), attBId = uid(), attSId = uid();
  const today  = new Date().toISOString().slice(0, 10);
  await admin.from("attendance_records").insert([
    { id: attAId, organization_id: ORG_ID, student_id: stuAId,
      date: today, status: "present", check_in_method: "manual" },
    { id: attBId, organization_id: ORG_ID, student_id: stuBId,
      date: today, status: "present", check_in_method: "manual" },
    { id: attSId, organization_id: ORG_ID, student_id: stuSharedId,
      date: today, status: "present", check_in_method: "manual" },
  ]).select();
  toDeleteAttendance.push(attAId, attBId, attSId);

  // ── 8. Sign in as test parents ─────────────────────────────────────────────
  const clientA = await signInAs(PA_EMAIL, TEST_PW);
  const clientB = await signInAs(PB_EMAIL, TEST_PW);
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("  Test data created. Running assertions...\n");

  // ══════════════════════════════════════════════════════════════
  console.log("── 1. Parent A can see own authorized student ──");
  check("Parent A sees StudentA attendance", await canSee(clientA, "attendance_records", { student_id: stuAId }), true);
  check("Parent A sees SharedStudent attendance", await canSee(clientA, "attendance_records", { student_id: stuSharedId }), true);

  console.log("\n── 2. Parent B can see own authorized student ──");
  check("Parent B sees StudentB attendance", await canSee(clientB, "attendance_records", { student_id: stuBId }), true);
  check("Parent B sees SharedStudent attendance", await canSee(clientB, "attendance_records", { student_id: stuSharedId }), true);

  console.log("\n── 3. Parent A cannot see Parent B's unrelated student ──");
  check("Parent A cannot see StudentB attendance", await canSee(clientA, "attendance_records", { student_id: stuBId }), false);

  console.log("\n── 4. Parent B cannot see Parent A's unrelated student ──");
  check("Parent B cannot see StudentA attendance", await canSee(clientB, "attendance_records", { student_id: stuAId }), false);

  console.log("\n── 5. Both parents can see the shared student ──");
  const aSeesShared = await canSee(clientA, "attendance_records", { student_id: stuSharedId });
  const bSeesShared = await canSee(clientB, "attendance_records", { student_id: stuSharedId });
  check("Parent A sees SharedStudent", aSeesShared, true);
  check("Parent B sees SharedStudent", bSeesShared, true);

  console.log("\n── 6. Household information isolation ──");
  // Parents can see household info only for their own household
  // RLS on households: parents see households where they have an active guardianship
  const aHouseholds = (await (clientA.from("households") as any)
    .select("id").in("id", [hhAId, hhBId])).data as any[] ?? [];
  const bHouseholds = (await (clientB.from("households") as any)
    .select("id").in("id", [hhAId, hhBId])).data as any[] ?? [];
  const aHhIds = aHouseholds.map((h: any) => h.id);
  const bHhIds = bHouseholds.map((h: any) => h.id);

  // Parent A should see hhA (they have guardianships through it)
  check("Parent A can see Household A (their household)", aHhIds.includes(hhAId), true);
  // Parent A should NOT see hhB (they have no guardianship through it)
  check("Parent A cannot see Household B (other parent's household)", aHhIds.includes(hhBId), false);
  // Parent B should see hhB
  check("Parent B can see Household B (their household)", bHhIds.includes(hhBId), true);
  // Parent B should NOT see hhA
  check("Parent B cannot see Household A (other parent's household)", bHhIds.includes(hhAId), false);

  console.log("\n── 7. Guardian cannot see unrelated guardianships ──");
  // Parent A should see their own guardianship rows, not Parent B's
  const aGuardianships = (await (clientA.from("guardianships") as any)
    .select("id").in("id", [gA1Id, gA2Id, gB1Id, gB2Id])).data as any[] ?? [];
  const aGshIds = aGuardianships.map((g: any) => g.id);
  check("Parent A can see own guardianship (studentA)", aGshIds.includes(gA1Id), true);
  check("Parent A cannot see Parent B's guardianship (studentB)", aGshIds.includes(gB1Id), false);

  const bGuardianships = (await (clientB.from("guardianships") as any)
    .select("id").in("id", [gA1Id, gA2Id, gB1Id, gB2Id])).data as any[] ?? [];
  const bGshIds = bGuardianships.map((g: any) => g.id);
  check("Parent B can see own guardianship (studentB)", bGshIds.includes(gB1Id), true);
  check("Parent B cannot see Parent A's guardianship (studentA)", bGshIds.includes(gA1Id), false);

  console.log("\n── 8. Parent cannot access staff-only tables ──");
  check("Parent A cannot read student_medical",      await canSee(clientA, "student_medical"),      false);
  check("Parent A cannot read incidents",            await canSee(clientA, "incidents"),            false);
  check("Parent A cannot read medication_alerts",    await canSee(clientA, "medication_alerts"),    false);
  check("Parent A cannot read student_documents",    await canSee(clientA, "student_documents"),    false);
  check("Parent A cannot read support_flags",        await canSee(clientA, "support_flags"),        false);
  check("Parent A cannot read staff_compliance_records", await canSee(clientA, "staff_compliance_records"), false);

  console.log("\n── 9. Parent attendance access restricted to own students ──");
  // Querying without filter should only return rows for their own children
  const aAttRows = (await (clientA.from("attendance_records") as any)
    .select("student_id").in("student_id", [stuAId, stuBId, stuSharedId])).data as any[] ?? [];
  const aAttStudents = new Set(aAttRows.map((r: any) => r.student_id));
  check("Parent A only sees their own children in attendance", !aAttStudents.has(stuBId), true);
  check("Parent A sees StudentA in attendance", aAttStudents.has(stuAId), true);

  const bAttRows = (await (clientB.from("attendance_records") as any)
    .select("student_id").in("student_id", [stuAId, stuBId, stuSharedId])).data as any[] ?? [];
  const bAttStudents = new Set(bAttRows.map((r: any) => r.student_id));
  check("Parent B only sees their own children in attendance", !bAttStudents.has(stuAId), true);
  check("Parent B sees StudentB in attendance", bAttStudents.has(stuBId), true);

  console.log("\n── 10. Anonymous users blocked ──");
  check("Anonymous cannot read students",           await canSee(anonClient, "students"),           false);
  check("Anonymous cannot read attendance_records", await canSee(anonClient, "attendance_records"), false);
  check("Anonymous cannot read families",           await canSee(anonClient, "families"),           false);
  check("Anonymous cannot read guardianships",      await canSee(anonClient, "guardianships"),      false);
  check("Anonymous cannot read incidents",          await canSee(anonClient, "incidents"),          false);
  check("Anonymous cannot read organization_members", await canSee(anonClient, "organization_members"), false);

  console.log("\n── 11. Cross-org access blocked (if second org available) ──");
  if (ORG_B_ID !== ORG_ID) {
    check(
      "Parent A (org A) cannot read org B families",
      await canSee(clientA, "families", { organization_id: ORG_B_ID }),
      false
    );
    check(
      "Parent A (org A) cannot read org B students",
      await canSee(clientA, "students", { organization_id: ORG_B_ID }),
      false
    );
  } else {
    console.log("  ⚠️  Only one org found — cross-org tests skipped.");
  }

  console.log("\n── 12. Direct filter by unowned student IDs blocked ──");
  // Parent A tries to read StudentB via direct ID filter (URL manipulation scenario)
  const directAttB = (await (clientA.from("attendance_records") as any)
    .select("id").eq("student_id", stuBId)).data as any[] ?? [];
  check("Parent A direct-filter StudentB attendance returns nothing", directAttB.length === 0, true);

  const directStudentB = (await (clientA.from("students") as any)
    .select("id").eq("id", stuBId)).data as any[] ?? [];
  check("Parent A direct-filter StudentB profile returns nothing", directStudentB.length === 0, true);

  // ══════════════════════════════════════════════════════════════
  console.log("\n── Summary ──");
  console.log(`  ${passed} passed  /  ${failed} failed`);
  if (failures.length) {
    console.error("\nFailed assertions:");
    for (const f of failures) console.error(`  ❌  ${f}`);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  console.log("\n── Cleaning up test data ──");
  if (toDeleteAttendance.length)
    await admin.from("attendance_records").delete().in("id", toDeleteAttendance);
  if (toDeleteStudentGoals.length)
    await admin.from("student_goals").delete().in("id", toDeleteStudentGoals);
  if (toDeleteConversations.length)
    await admin.from("conversations").delete().in("id", toDeleteConversations);
  if (toDeleteGuardianships.length)
    await admin.from("guardianships").delete().in("id", toDeleteGuardianships);
  if (toDeleteStudents.length)
    await admin.from("students").delete().in("id", toDeleteStudents);
  if (toDeleteHouseholds.length)
    await admin.from("households").delete().in("id", toDeleteHouseholds);
  if (toDeleteFamilies.length)
    await admin.from("families").delete().in("id", toDeleteFamilies);
  if (toDeleteOrgMembers.length)
    await admin.from("organization_members").delete()
      .in("profile_id", toDeleteOrgMembers).eq("organization_id", ORG_ID);
  if (toDeleteProfiles.length)
    await admin.from("profiles").delete().in("id", toDeleteProfiles);
  for (const uid of toDeleteAuthUsers)
    await admin.auth.admin.deleteUser(uid);

  // Verify cleanup
  const remainingStudents = (await admin.from("students")
    .select("id", { count: "exact" }).in("id", toDeleteStudents)).count ?? 0;
  const remainingFamilies = (await admin.from("families")
    .select("id", { count: "exact" }).in("id", toDeleteFamilies)).count ?? 0;
  const remainingHouseholds = (await admin.from("households")
    .select("id", { count: "exact" }).in("id", toDeleteHouseholds)).count ?? 0;
  const remainingGuardianships = (await admin.from("guardianships")
    .select("id", { count: "exact" }).in("id", toDeleteGuardianships)).count ?? 0;

  console.log(`  Students remaining:    ${remainingStudents} (expect 0)`);
  console.log(`  Families remaining:    ${remainingFamilies} (expect 0)`);
  console.log(`  Households remaining:  ${remainingHouseholds} (expect 0)`);
  console.log(`  Guardianships remaining: ${remainingGuardianships} (expect 0)`);

  const cleanupOk = remainingStudents === 0 && remainingFamilies === 0
    && remainingHouseholds === 0 && remainingGuardianships === 0;
  console.log(cleanupOk ? "  ✅  Cleanup complete" : "  ⚠️  Some test data may remain — check manually");

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
