/**
 * Moves enrollment admin text out of allergies/medical_notes into staff notes.
 * Approved 2026-08-22. Does NOT modify students with real medical data.
 *
 * KEEP (real medical):
 *   Jris Farr-Saint Fleur — bee/wasp anaphylaxis, EpiPen
 *   Blake McGarry          — amoxicillin/penicillin allergy + asthma
 *
 * FIX (admin text in medical fields):
 *   Neriah Cook             — allergies[] → staff note, clear allergies
 *   Zi Farr-Saint Fleur     — allergies[] → staff note, clear allergies
 *   Emz Farr-Saint Fleur    — allergies[] → staff note, clear allergies
 *   Jacob Joseph            — allergies[] → staff note, clear allergies
 *   Robert Taylor           — allergies[] → staff note, clear allergies
 *   Lily Hasibar            — medical_notes → staff note, clear medical_notes
 *   Khloe McBride           — medical_notes → staff note, clear medical_notes
 *   Jade Payne              — medical_notes → staff note, clear medical_notes
 *   Ezra Johnson            — medical_notes → staff note, clear medical_notes (keep allergies: ["Asthma"])
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
const AUTHOR_ID = "7ba9a63f-c33d-4a25-b716-125e27bdf1b5"; // full_admin

// Students with ONLY admin text in allergies — clear the array
const CLEAR_ALLERGIES = [
  { id: "fdbb260c-68ac-402f-a41f-b09e32f580c5", name: "Neriah Cook" },
  { id: "98c14cb5-cbc0-4994-8428-318403e7602e", name: "Zi Farr-Saint Fleur" },
  { id: "37b3609f-34ab-4a90-96c4-a80475ce6412", name: "Emz Farr-Saint Fleur" },
  { id: "0ec49023-88e5-4cdf-b278-9aced05b72e1", name: "Jacob Joseph" },
  { id: "f5ee34b2-62a7-4fe8-be0f-e33a5c5ab6e5", name: "Robert Taylor" },
];

// Students with ONLY admin text in medical_notes — clear the field
const CLEAR_MEDICAL_NOTES = [
  { id: "b360a9df-95d3-4a86-8a4b-5e7ade4f337f", name: "Lily Hasibar" },
  { id: "24a3ff68-9bac-43f5-b0e4-215bad5cf218", name: "Khloe McBride" },
  { id: "1e63a897-62ae-4925-b6c6-1a9639e28daf", name: "Jade Payne" },
  { id: "77063bf3-e50d-4978-8818-581a1e023d86", name: "Ezra Johnson" }, // keep allergies: ["Asthma"]
];

// These have real medical data — DO NOT TOUCH
const KEEP_IDS = [
  "f1142bc7-c543-4544-a932-319593b43f99", // Jris Farr-Saint Fleur
  "e2ca0cba-a14a-4fee-b0d5-2461a73f179b", // Blake McGarry
];

async function main() {
  // 1. Fetch current data to capture the text before clearing
  const allIds = [...CLEAR_ALLERGIES, ...CLEAR_MEDICAL_NOTES].map(s => s.id);
  const { data: students, error: fe } = await sb
    .from("students")
    .select("id, first_name, last_name, preferred_name, allergies, medical_notes")
    .in("id", allIds);

  if (fe) { console.error("Fetch error:", fe.message); process.exit(1); }

  const byId = Object.fromEntries((students ?? []).map(s => [s.id, s]));

  // Verify no overlap with keep list
  for (const s of students ?? []) {
    if (KEEP_IDS.some(k => s.id.startsWith(k))) {
      console.error(`✘ ABORT: ${s.id} is in the KEEP list but also targeted. Review script.`);
      process.exit(1);
    }
  }

  // 2. Move allergies text to staff notes, then clear
  for (const target of CLEAR_ALLERGIES) {
    const s = byId[target.id];
    if (!s) { console.log(`  SKIP ${target.name}: not found`); continue; }
    const allergyText = (s.allergies ?? []).join(" | ");
    if (!allergyText) { console.log(`  SKIP ${target.name}: allergies already empty`); continue; }

    // Create staff note
    const { error: ne } = await sb.from("staff_notes").insert({
      organization_id: ORG_ID,
      student_id: target.id,
      author_id: AUTHOR_ID,
      category: "general",
      priority: "normal",
      title: "Enrollment Admin Notes (moved from allergies field)",
      body: allergyText,
      is_pinned: false,
      follow_up_required: true,
      status: "open",
    });
    if (ne) { console.error(`✘ Note insert failed for ${target.name}:`, ne.message); process.exit(1); }

    // Clear allergies
    const { error: ue } = await sb.from("students").update({ allergies: [] }).eq("id", target.id);
    if (ue) { console.error(`✘ Clear allergies failed for ${target.name}:`, ue.message); process.exit(1); }

    console.log(`✓ ${target.name}: allergies → staff note, allergies cleared`);
  }

  // 3. Move medical_notes to staff notes, then clear
  for (const target of CLEAR_MEDICAL_NOTES) {
    const s = byId[target.id];
    if (!s) { console.log(`  SKIP ${target.name}: not found`); continue; }
    const notesText = s.medical_notes;
    if (!notesText) { console.log(`  SKIP ${target.name}: medical_notes already empty`); continue; }

    // Create staff note
    const { error: ne } = await sb.from("staff_notes").insert({
      organization_id: ORG_ID,
      student_id: target.id,
      author_id: AUTHOR_ID,
      category: "general",
      priority: "normal",
      title: "Enrollment Admin Notes (moved from medical notes field)",
      body: notesText,
      is_pinned: false,
      follow_up_required: true,
      status: "open",
    });
    if (ne) { console.error(`✘ Note insert failed for ${target.name}:`, ne.message); process.exit(1); }

    // Clear medical_notes
    const { error: ue } = await sb.from("students").update({ medical_notes: null }).eq("id", target.id);
    if (ue) { console.error(`✘ Clear medical_notes failed for ${target.name}:`, ue.message); process.exit(1); }

    console.log(`✓ ${target.name}: medical_notes → staff note, medical_notes cleared`);
  }

  // 4. Verify final state
  const { data: final } = await sb
    .from("students")
    .select("id, first_name, last_name, preferred_name, allergies, medical_notes")
    .in("id", allIds);

  console.log("\n=== Final state ===");
  for (const s of final ?? []) {
    const name = s.preferred_name ? `${s.preferred_name} ${s.last_name}` : `${s.first_name} ${s.last_name}`;
    const hasAllergies = s.allergies && s.allergies.length > 0;
    const hasNotes = !!s.medical_notes;
    if (hasAllergies || hasNotes) {
      console.log(`  STILL HAS DATA — ${name}: allergies=${JSON.stringify(s.allergies)}, medical_notes=${s.medical_notes}`);
    } else {
      console.log(`  CLEAN — ${name}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
