/**
 * Full verification of Johnson split-household relationships + medical spot-check
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

async function main() {
  console.log("\n══ RELATIONSHIP VERIFICATION ══\n");

  // Load students
  const { data: students } = await sb.from("students")
    .select("id, first_name, last_name, student_display_id, family_id")
    .eq("organization_id", ORG_ID).order("student_display_id");

  const studentById = new Map<string, any>();
  for (const s of (students ?? []) as any[]) studentById.set(s.id, s);

  // Load guardianships with profile info
  const { data: gships } = await sb.from("guardianships")
    .select("id, profile_id, student_id, household_id, relationship_type, custody_type, is_legal_guardian")
    .eq("organization_id", ORG_ID);

  // Load profiles
  const { data: profiles } = await sb.from("profiles").select("id, full_name, email");
  const profById = new Map<string, any>();
  for (const p of (profiles ?? []) as any[]) profById.set(p.id, p);

  // Load households
  const { data: households } = await sb.from("households")
    .select("id, household_label, family_id").eq("organization_id", ORG_ID);
  const hhById = new Map<string, any>();
  for (const h of (households ?? []) as any[]) hhById.set(h.id, h);

  // Build guardian → students map
  const guardianStudents = new Map<string, { stuName: string; stuId: string; hhLabel: string }[]>();
  for (const g of (gships ?? []) as any[]) {
    const stu = studentById.get(g.student_id);
    const hh = hhById.get(g.household_id);
    if (!guardianStudents.has(g.profile_id)) guardianStudents.set(g.profile_id, []);
    guardianStudents.get(g.profile_id)!.push({
      stuName: stu ? `${stu.first_name} ${stu.last_name}` : g.student_id,
      stuId: g.student_id,
      hhLabel: hh?.household_label ?? "(no household)",
    });
  }

  // Key profiles
  const elisa  = (profiles ?? []).find((p: any) => p.email === "elisa_farr@yahoo.com") as any;
  const kenny  = (profiles ?? []).find((p: any) => p.email === "kennethbjohnson321@gmail.com") as any;
  const amber  = (profiles ?? []).find((p: any) => p.email === "ayala.keishla28@gmail.com") as any;
  const jpList = (profiles ?? []).filter((p: any) => !p.email && p.full_name?.includes("Jean Paul")) as any[];
  const jp     = jpList[0];

  const { data: johnsonFamily } = await sb.from("families").select("id, is_split_household")
    .eq("organization_id", ORG_ID).eq("family_name", "Johnson Family").single();

  console.log("Johnson Family:");
  console.log(`  is_split_household: ${(johnsonFamily as any)?.is_split_household}`);

  const jfHHs = (households ?? []).filter((h: any) => h.family_id === (johnsonFamily as any)?.id);
  console.log(`  Households: ${jfHHs.length}`);
  for (const h of jfHHs) console.log(`    [${(h as any).household_label}]`);

  console.log("\nElisa Johnson:");
  for (const r of (elisa ? (guardianStudents.get(elisa.id) ?? []) : [])) {
    console.log(`  → ${r.stuName} (${r.hhLabel})`);
  }

  console.log("\nKenny Johnson:");
  for (const r of (kenny ? (guardianStudents.get(kenny.id) ?? []) : [])) {
    console.log(`  → ${r.stuName} (${r.hhLabel})`);
  }

  console.log("\nKeishla (Amber) Jolissaint:");
  for (const r of (amber ? (guardianStudents.get(amber?.id) ?? []) : [])) {
    console.log(`  → ${r.stuName} (${r.hhLabel})`);
  }
  const amberHasOnlyEzra = amber
    ? (guardianStudents.get(amber.id) ?? []).every((r) => r.stuName.includes("Ezra"))
    : false;
  console.log(`  ISOLATION CHECK: ${amberHasOnlyEzra ? "✓ Ezra only" : "✘ UNEXPECTED ACCESS"}`);

  console.log("\nJean Paul Saint Fleur:");
  for (const r of (jp ? (guardianStudents.get(jp.id) ?? []) : [])) {
    console.log(`  → ${r.stuName} (${r.hhLabel})`);
  }
  const jpHasNoEzra = jp
    ? !(guardianStudents.get(jp.id) ?? []).some((r) => r.stuName.includes("Ezra"))
    : false;
  console.log(`  ISOLATION CHECK: ${jpHasNoEzra ? "✓ No Ezra" : "✘ HAS EZRA ACCESS"}`);

  // Duplicate check
  const profileCounts = new Map<string, number>();
  for (const g of (gships ?? []) as any[]) {
    const key = `${g.profile_id}:${g.student_id}`;
    profileCounts.set(key, (profileCounts.get(key) ?? 0) + 1);
  }
  const dupes = [...profileCounts.entries()].filter(([, c]) => c > 1);
  console.log(`\nDuplicate guardianships: ${dupes.length}`);
  if (dupes.length > 0) for (const [k, c] of dupes) console.log(`  ${k} (×${c})`);

  // Invitations
  const { data: invites } = await sb.from("organization_members")
    .select("id, status").eq("organization_id", ORG_ID).eq("status", "invited");
  console.log(`\nPortal invitations sent: ${(invites ?? []).length} (must be 0)`);

  // Medical spot check
  console.log("\n══ MEDICAL SPOT CHECK ══\n");

  const jrisstyn = (students ?? []).find((s: any) => s.first_name === "Jrisstyn") as any;
  const ezra = (students ?? []).find((s: any) => s.first_name?.includes("Ezra")) as any;
  const blake = (students ?? []).find((s: any) => s.first_name === "Blake") as any;

  for (const [label, stu] of [["Jrisstyn", jrisstyn], ["Ezra", ezra], ["Blake", blake]] as [string, any][]) {
    if (!stu) { console.log(`${label}: NOT FOUND`); continue; }
    const { data: med } = await sb.from("student_medical")
      .select("medical_conditions, notes, special_accommodations")
      .eq("student_id", stu.id).single();
    if (!med) { console.log(`${label}: NO MEDICAL RECORD`); continue; }
    const m = med as any;
    console.log(`${label} (${stu.student_display_id}):`);
    console.log(`  conditions: ${JSON.stringify(m.medical_conditions)}`);
    console.log(`  notes: ${m.notes?.slice(0, 120) ?? "(none)"}`);
  }
}

main().catch(console.error);
