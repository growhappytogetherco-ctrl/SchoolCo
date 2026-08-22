/**
 * complete-import.ts  —  Phase 2 of the RLA live import.
 *
 * Students and families are already in the DB (18 students, 7 families).
 * This script adds:
 *   - 7 households (one per family)
 *   - Guardian profiles + guardianships
 *   - Medical records
 *   - Staff notes
 *
 * Run:  npx tsx --tsconfig tsconfig.json scripts/complete-import.ts
 * Safe to re-run: uses upsert / checks for existing records.
 */

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

import { parseCSV } from "@/lib/import/csvParser";
import { mapRows } from "@/lib/import/mapper";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function ok(msg: string)   { console.log(`  ✓  ${msg}`); }
function warn(msg: string) { console.log(`  ⚠  ${msg}`); }
function err(msg: string)  { console.error(`  ✘  ${msg}`); }

async function main() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  SchoolCo — RLA Import Phase 2: Households + Guardians");
  console.log("══════════════════════════════════════════════════════\n");

  // ── Resolve org + admin ──────────────────────────────────────────────────────
  const { data: orgs } = await sb.from("organizations").select("id, name, slug");
  const rla = (orgs as any[])?.find((o: any) => o.slug === "rla" || o.slug === "rising-leaders-academy");
  if (!rla) { err("RLA org not found"); process.exit(1); }
  const orgId = rla.id as string;
  ok(`Org: ${rla.name} (${orgId})`);

  const { data: adminMember } = await sb.from("organization_members")
    .select("profile_id").eq("organization_id", orgId)
    .in("role", ["admin", "full_admin", "platform_admin"]).eq("status", "active").limit(1).single();
  const adminId = (adminMember as any)?.profile_id as string | undefined;
  ok(`Admin profile: ${adminId ?? "(none — created_by will be null)"}`);

  // ── Parse CSV ────────────────────────────────────────────────────────────────
  const csvText = readFileSync(resolve(process.cwd(), "import/real_rla_roster_import.csv"), "utf8");
  const { rows: csvRows } = parseCSV(csvText);
  const mappedRows = mapRows(csvRows);

  // Exclude Stevie Beckham
  const approvedRows = mappedRows.filter((s: any) =>
    !(s.first_name === "Stevie" && s.last_name === "Beckham"),
  );

  // ── Load existing DB state ───────────────────────────────────────────────────
  const { data: dbStudents } = await sb.from("students")
    .select("id, first_name, last_name, family_id, student_display_id")
    .eq("organization_id", orgId);

  const studentMap = new Map<string, { id: string; family_id: string; displayId: string }>();
  for (const s of (dbStudents ?? []) as any[]) {
    const key = `${s.first_name} ${s.last_name}`.toLowerCase();
    studentMap.set(key, { id: s.id, family_id: s.family_id, displayId: s.student_display_id ?? "" });
  }
  ok(`Loaded ${studentMap.size} students from DB`);

  const { data: dbFamilies } = await sb.from("families")
    .select("id, family_name").eq("organization_id", orgId);
  const familyMap = new Map<string, string>();
  for (const f of (dbFamilies ?? []) as any[]) familyMap.set(f.family_name.toLowerCase(), f.id);
  ok(`Loaded ${familyMap.size} families from DB`);

  const { data: dbHouseholds } = await sb.from("households")
    .select("id, family_id").eq("organization_id", orgId);
  const householdFamilyIds = new Set((dbHouseholds ?? []).map((h: any) => h.family_id));
  const householdByFamily = new Map<string, string>();
  for (const h of (dbHouseholds ?? []) as any[]) householdByFamily.set(h.family_id, h.id);
  ok(`Loaded ${householdFamilyIds.size} existing households`);

  const { data: dbProfiles } = await sb.from("profiles").select("id, email");
  const profileEmailMap = new Map<string, string>();
  for (const p of (dbProfiles ?? []) as any[]) {
    if (p.email) profileEmailMap.set(p.email.toLowerCase(), p.id);
  }
  ok(`Loaded ${profileEmailMap.size} existing profiles`);

  const { data: dbGuardianships } = await sb.from("guardianships")
    .select("id, profile_id, student_id").eq("organization_id", orgId);
  const existingGuardianships = new Set(
    (dbGuardianships ?? []).map((g: any) => `${g.profile_id}:${g.student_id}`),
  );
  ok(`Loaded ${existingGuardianships.size} existing guardianships`);

  const { data: dbMedical } = await sb.from("student_medical")
    .select("student_id").eq("organization_id", orgId);
  const studentsWithMedical = new Set((dbMedical ?? []).map((m: any) => m.student_id));
  ok(`Loaded ${studentsWithMedical.size} students with existing medical records`);

  const { data: dbNotes } = await sb.from("staff_notes")
    .select("student_id").eq("organization_id", orgId);
  const studentsWithNotes = new Set((dbNotes ?? []).map((n: any) => n.student_id));
  ok(`Loaded ${studentsWithNotes.size} students with existing notes`);

  console.log();

  // ── Track families already processed for households ──────────────────────────
  const processedFamilies = new Set<string>();
  let insertedHouseholds = 0, insertedProfiles = 0, insertedGuardianships = 0;
  let insertedMedical = 0, insertedNotes = 0;

  // ── Row-by-row processing ─────────────────────────────────────────────────────
  for (const s of approvedRows as any[]) {
    const fullName = `${s.first_name} ${s.last_name}`;
    const normName = fullName.toLowerCase();
    const dbStu = studentMap.get(normName);

    if (!dbStu) {
      warn(`Student not found in DB: "${fullName}" — skipping`);
      continue;
    }

    const { id: studentId, family_id: familyId } = dbStu;

    // ── Household ──────────────────────────────────────────────────────────────
    if (familyId && !householdFamilyIds.has(familyId) && !processedFamilies.has(familyId)) {
      processedFamilies.add(familyId);
      if (s.family?.household) {
        const hh = s.family.household;
        const addrJson = hh.address_street ? {
          street1: hh.address_street, city: hh.address_city,
          state: hh.address_state, zip: hh.address_zip,
        } : null;
        const { data: hhRow, error: hhErr } = await sb.from("households").insert({
          organization_id: orgId,
          family_id:       familyId,
          household_label: hh.household_label,
          sort_order:      hh.sort_order ?? 1,
          address_json:    addrJson,
          phone:           hh.phone,
          email:           hh.email,
          created_by:      adminId ?? null,
        }).select("id").single();

        if (hhErr || !hhRow) {
          err(`Household for family ${familyId}: ${hhErr?.message}`);
        } else {
          householdFamilyIds.add(familyId);
          householdByFamily.set(familyId, (hhRow as any).id);
          insertedHouseholds++;
          ok(`Household: ${hh.household_label} (family ${familyId})`);
        }
      }
    }

    const householdId = householdByFamily.get(familyId) ?? null;

    // ── Guardians ──────────────────────────────────────────────────────────────
    for (const g of (s.guardians ?? []) as any[]) {
      try {
        let profileId: string | undefined;
        if (g.email) profileId = profileEmailMap.get(g.email.toLowerCase());

        if (!profileId) {
          const newId = crypto.randomUUID();
          const { data: prof, error: profErr } = await sb.from("profiles").insert({
            id:        newId,
            full_name: g.full_name,
            email:     g.email ?? null,
            phone:     g.phone ?? null,
          }).select("id").single();

          if (profErr || !prof) {
            warn(`Profile for "${g.full_name}": ${profErr?.message}`);
            continue;
          }
          profileId = (prof as any).id;
          insertedProfiles++;
          if (g.email) profileEmailMap.set(g.email.toLowerCase(), profileId!);
          ok(`  Profile: ${g.full_name} (${g.email ?? "no email"})`);
        }

        const key = `${profileId}:${studentId}`;
        if (existingGuardianships.has(key)) continue;

        const { error: gErr } = await sb.from("guardianships").insert({
          organization_id:         orgId,
          profile_id:              profileId,
          student_id:              studentId,
          household_id:            householdId,
          relationship_type:       g.relationship_type,
          custody_type:            g.custody_type,
          is_legal_guardian:       g.is_legal_guardian ?? false,
          is_primary_contact:      g.is_primary_contact ?? false,
          is_emergency_contact:    g.is_emergency_contact ?? false,
          emergency_contact_order: g.emergency_contact_order ?? null,
          can_pickup:              g.can_pickup ?? false,
          pickup_restrictions:     g.pickup_restrictions ?? null,
          created_by:              adminId ?? null,
        });

        if (gErr) {
          warn(`  Guardianship ${g.full_name} → ${fullName}: ${gErr.message}`);
        } else {
          existingGuardianships.add(key);
          insertedGuardianships++;
        }
      } catch (gEx) {
        warn(`  Guardian exception for "${g.full_name}": ${gEx}`);
      }
    }

    // ── Medical ────────────────────────────────────────────────────────────────
    if (s.medical && !studentsWithMedical.has(studentId)) {
      const { error: medErr } = await sb.from("student_medical").insert({
        organization_id:        orgId,
        student_id:             studentId,
        medical_conditions:     s.medical.medical_conditions ?? [],
        special_accommodations: s.medical.special_accommodations ?? [],
        notes:                  s.medical.notes ?? null,
        primary_doctor_name:    s.medical.primary_doctor_name ?? null,
        primary_doctor_phone:   s.medical.primary_doctor_phone ?? null,
        insurance_provider:     s.medical.insurance_provider ?? null,
        insurance_policy_number: s.medical.insurance_policy_number ?? null,
        updated_by:             adminId ?? null,
      });
      if (medErr) {
        warn(`Medical for ${fullName}: ${medErr.message}`);
      } else {
        studentsWithMedical.add(studentId);
        insertedMedical++;
        ok(`  Medical: ${fullName}`);
      }
    }

    // ── Staff notes ────────────────────────────────────────────────────────────
    if ((s.notes ?? []).length > 0 && !studentsWithNotes.has(studentId)) {
      for (const n of s.notes as any[]) {
        const { error: noteErr } = await sb.from("staff_notes").insert({
          organization_id: orgId,
          student_id:      studentId,
          author_id:       adminId ?? null,
          category:        n.category ?? "general",
          priority:        n.priority ?? "normal",
          title:           n.title ?? "Import note",
          body:            n.body ?? "",
          is_pinned:       n.is_pinned ?? false,
        });
        if (noteErr) {
          warn(`Note for ${fullName}: ${noteErr.message}`);
        } else {
          studentsWithNotes.add(studentId);
          insertedNotes++;
          ok(`  Note: ${fullName} — ${n.title ?? n.category}`);
        }
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  PHASE 2 COMPLETE");
  console.log(`  Households:      ${insertedHouseholds}`);
  console.log(`  New profiles:    ${insertedProfiles}`);
  console.log(`  Guardianships:   ${insertedGuardianships}`);
  console.log(`  Medical records: ${insertedMedical}`);
  console.log(`  Staff notes:     ${insertedNotes}`);
  console.log("══════════════════════════════════════════════════════\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
