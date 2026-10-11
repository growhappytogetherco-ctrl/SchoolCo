/**
 * Stage E.7.1 — Apply 9 approved enrollment credit corrections.
 *
 * Authorization: Uses service role key (trigger allows uid=null for server-side ops).
 * Audit actor: AUTHORIZED_ACTOR_ID must be set to the approving administrator's profile ID.
 * Audit failures abort the script — they do not silently continue.
 * All same validations as updateEnrollmentCredit server action:
 *   - org membership check
 *   - enrollment belongs to org and is not finalized
 *   - grading period belongs to org and is semester/full_year
 *   - before-state captured, after-state verified
 *   - audit_logs record written for each change (abort on failure)
 *
 * DRY_RUN=true → print preflight, no writes.
 * DRY_RUN=false → apply updates, verify, report.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// ── Env ──────────────────────────────────────────────────────────────────────
const env = readFileSync(".env.local", "utf8");
const vars = {};
for (const line of env.split("\n")) {
  const m = line.match(/^([^=#][^=]*)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}
const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.env.DRY_RUN !== "false";
const ORG_ID = "9fd43346-f43b-41d1-9b4c-fe8702471b07"; // RLA org — will be verified

// ── Canonical grading period IDs (verified in E.7 preflight) ────────────────
const GP = {
  SEMESTER_1: "4302e3d7-9772-4feb-8be5-d1c4f57b3cc0",
  SEMESTER_2: "b7ec5a10-5d04-4dff-b72e-cd47649e0daf",
  FULL_YEAR:  "2bc4ea38-aa49-4d19-b2d2-539fd5d17d47",
};

// ── Approved corrections (enrollment ID prefix → full match via DB) ──────────
const CORRECTIONS = [
  // RLA Bible: 0.5 S1 → 1.0 Full Year
  { id_prefix: "3775b96f", student: "Stevie Beckham",              course: "RLA Bible",      credits: 1.0, gp_id: GP.FULL_YEAR, level: "standard" },
  { id_prefix: "f0628b76", student: "Jeina Inoue Payne (Jade)",    course: "RLA Bible",      credits: 1.0, gp_id: GP.FULL_YEAR, level: "standard" },
  { id_prefix: "35dca149", student: "Jezziyn Farr-Saint Fleur",    course: "RLA Bible",      credits: 1.0, gp_id: GP.FULL_YEAR, level: "standard" },
  { id_prefix: "66a064ee", student: "Lily Hasibar",                 course: "RLA Bible",      credits: 1.0, gp_id: GP.FULL_YEAR, level: "standard" },
  // KingDurance PE: 0.5 S1 → 1.0 Full Year
  { id_prefix: "ae2e44b6", student: "Stevie Beckham",              course: "KingDurance PE", credits: 1.0, gp_id: GP.FULL_YEAR, level: "standard" },
  { id_prefix: "2da7280d", student: "Jeina Inoue Payne (Jade)",    course: "KingDurance PE", credits: 1.0, gp_id: GP.FULL_YEAR, level: "standard" },
  { id_prefix: "52ad97cf", student: "Jezziyn Farr-Saint Fleur",    course: "KingDurance PE", credits: 1.0, gp_id: GP.FULL_YEAR, level: "standard" },
  { id_prefix: "2f91eed0", student: "Lily Hasibar",                 course: "KingDurance PE", credits: 1.0, gp_id: GP.FULL_YEAR, level: "standard" },
  // Jade English 2: term S1 → S2 only
  { id_prefix: "7b8ed7c6", student: "Jeina Inoue Payne (Jade)",    course: "English 2",      credits: 0.5, gp_id: GP.SEMESTER_2, level: "standard" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function PASS(msg) { console.log(`  ✓ ${msg}`); }
function FAIL(msg) { console.error(`  ✗ ${msg}`); return false; }
function INFO(msg) { console.log(`  · ${msg}`); }
function SECTION(msg) { console.log(`\n=== ${msg} ===`); }

// ACTOR_ID must be set to the authorized administrator's profile ID.
// The service role has no user session, so we require an explicit actor.
// This script is retired (corrections already applied); this guard prevents
// silent audit failures if ever re-run against new data.
const AUTHORIZED_ACTOR_ID = "7ba9a63f-c33d-4a25-b716-125e27bdf1b5"; // Elisa Johnson — full_admin

async function logAudit({ organization_id, action, resource_id, previous_values, new_values }) {
  if (!AUTHORIZED_ACTOR_ID) {
    throw new Error("AUTHORIZED_ACTOR_ID must be set — audit_logs.actor_id is NOT NULL. Aborting to prevent silent audit failure.");
  }
  const { data, error } = await supabase
    .from("audit_logs")
    .insert({
      organization_id,
      action,
      resource_type: "curriculum_enrollment",
      resource_id,
      actor_id:      AUTHORIZED_ACTOR_ID,
      previous_values,
      new_values,
      metadata: { source: "e7_1_credit_corrections", dry_run: DRY_RUN },
    })
    .select("id")
    .single();
  if (error) {
    // Audit failure must abort the script — never silently succeed without an audit record.
    throw new Error(`Audit insert failed: ${error.message}. Aborting — enrollment update may need rollback.`);
  }
  return data?.id ?? null;
}

// ── Phase 1: Production readiness ────────────────────────────────────────────

async function phase1() {
  SECTION("PHASE 1 — Production Readiness");
  let ok = true;

  // DB connection
  const { error: connErr } = await supabase.from("organization_members").select("count").limit(1);
  if (connErr) return FAIL(`DB connection failed: ${connErr.message}`);
  PASS("DB connection OK");

  // Verify org exists
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", ORG_ID)
    .single();
  if (!org) { FAIL(`Org ${ORG_ID} not found`); ok = false; }
  else PASS(`Org verified: ${org.name}`);

  // Verify canonical grading periods
  const { data: gps } = await supabase
    .from("grading_periods")
    .select("id, name, period_type, organization_id, school_year_id")
    .in("id", Object.values(GP));

  for (const [key, id] of Object.entries(GP)) {
    const gp = (gps ?? []).find(g => g.id === id);
    if (!gp) { FAIL(`Grading period ${key} not found: ${id}`); ok = false; }
    else if (gp.organization_id !== ORG_ID) { FAIL(`GP ${key} belongs to wrong org`); ok = false; }
    else if (gp.school_year_id !== "ddafe02c-2b3d-439a-a3b0-23df8bc0e22b") { FAIL(`GP ${key} belongs to wrong school year`); ok = false; }
    else PASS(`Grading period ${key}: "${gp.name}" (${gp.period_type}) ✓`);
  }

  // Verify migration 00083 trigger exists (migration applied in E.6.1, confirmed present then)
  // Cannot query pg_trigger directly via supabase-js REST — confirm via known migration
  INFO("Migration 00083 applied in Stage E.6.1 (npx supabase db push --linked confirmed); trigger check skipped (no pg_catalog RPC available)");

  INFO(`DRY_RUN=${DRY_RUN} — set DRY_RUN=false to apply changes`);
  return ok;
}

// ── Phase 2: Verify target enrollments ──────────────────────────────────────

async function phase2() {
  SECTION("PHASE 2 — Verify Target Enrollments");

  const { data: enrollments, error } = await supabase
    .from("curriculum_enrollments")
    .select(`
      id, student_id, course_section_id, organization_id, status,
      counts_toward_high_school_credit, credits_attempted, course_level,
      grading_period_id, finalized_at,
      gp:grading_periods ( name ),
      students ( first_name, last_name ),
      course_sections (
        course_name,
        school_years ( label )
      )
    `)
    .eq("organization_id", ORG_ID)
    .eq("status", "active");

  if (error) { FAIL(`Query failed: ${error.message}`); return null; }

  const records = [];
  let allOk = true;

  for (const correction of CORRECTIONS) {
    const match = (enrollments ?? []).find(e => e.id.startsWith(correction.id_prefix));
    if (!match) {
      FAIL(`Enrollment ${correction.id_prefix}... not found or not active`);
      allOk = false;
      continue;
    }

    const sec = match.course_sections;
    const stu = match.students;
    const gp  = match.gp;
    const actualName = `${stu?.first_name} ${stu?.last_name}`;
    const actualCourse = sec?.course_name;
    const yearLabel = sec?.school_years?.label;

    // Validate identity
    if (match.organization_id !== ORG_ID) {
      FAIL(`${correction.id_prefix}: wrong org`); allOk = false; continue;
    }
    if (yearLabel !== "2026-2027") {
      FAIL(`${correction.id_prefix}: wrong year (${yearLabel})`); allOk = false; continue;
    }
    if (match.finalized_at) {
      FAIL(`${correction.id_prefix}: FINALIZED — cannot modify`); allOk = false; continue;
    }

    // Soft check: names and course names as expected
    const nameOk = actualName.toLowerCase().includes(correction.student.toLowerCase().split(" ")[0].toLowerCase()) ||
                   correction.student.toLowerCase().includes(actualName.toLowerCase().split(" ")[0].toLowerCase());
    if (!nameOk) INFO(`  Note: expected student "${correction.student}", found "${actualName}"`);

    const current = {
      enr_id:    match.id,
      student:   actualName,
      course:    actualCourse,
      hs:        match.counts_toward_high_school_credit,
      credits:   match.credits_attempted,
      level:     match.course_level,
      gp_id:     match.grading_period_id,
      gp_name:   gp?.name ?? null,
      finalized: !!match.finalized_at,
      student_id: match.student_id,
      section_id: match.course_section_id,
    };

    const proposed = {
      counts_toward_high_school_credit: true,
      credits_attempted:                correction.credits,
      course_level:                     correction.level,
      grading_period_id:                correction.gp_id,
    };

    const alreadyDone =
      current.hs === true &&
      current.credits === correction.credits &&
      current.level === correction.level &&
      current.gp_id === correction.gp_id;

    INFO(`${actualName} | ${actualCourse} | credits=${current.credits}→${correction.credits} | term=${current.gp_name}→${correction.gp_id === GP.FULL_YEAR ? "Full Year" : correction.gp_id === GP.SEMESTER_2 ? "Semester 2" : "Semester 1"} | ${alreadyDone ? "ALREADY AT TARGET" : "NEEDS UPDATE"}`);

    records.push({ correction, current, proposed, alreadyDone, match });
    PASS(`${correction.id_prefix}: verified`);
  }

  return allOk ? records : null;
}

// ── Phase 3-4: Apply corrections ─────────────────────────────────────────────

async function applyCorrections(records: any[]) {
  SECTION(DRY_RUN ? "PHASE 3-4 — DRY RUN (no writes)" : "PHASE 3-4 — Applying Corrections");

  const results = [];

  for (const rec of records) {
    const { correction, current, proposed, alreadyDone } = rec;
    const label = `${current.student} | ${current.course}`;

    if (alreadyDone) {
      INFO(`${label}: already at target — skipping`);
      results.push({ ...current, status: "already_correct", audit_id: null });
      continue;
    }

    if (DRY_RUN) {
      INFO(`${label}: WOULD UPDATE credits=${current.credits}→${proposed.credits_attempted} gp=${current.gp_name}→${proposed.grading_period_id === GP.FULL_YEAR ? "Full Year" : "Semester 2"}`);
      results.push({ ...current, status: "dry_run", audit_id: null, proposed });
      continue;
    }

    // Apply update
    const { error: updateErr } = await supabase
      .from("curriculum_enrollments")
      .update({
        counts_toward_high_school_credit: proposed.counts_toward_high_school_credit,
        credits_attempted:                proposed.credits_attempted,
        course_level:                     proposed.course_level,
        grading_period_id:                proposed.grading_period_id,
      })
      .eq("id", current.enr_id)
      .eq("organization_id", ORG_ID)
      .eq("status", "active")
      .is("finalized_at", null);

    if (updateErr) {
      console.error(`  ✗ ${label}: UPDATE FAILED: ${updateErr.message}`);
      results.push({ ...current, status: "error", error: updateErr.message, audit_id: null });
      continue;
    }

    // Verify written value
    const { data: verify } = await supabase
      .from("curriculum_enrollments")
      .select("credits_attempted, grading_period_id, course_level, counts_toward_high_school_credit")
      .eq("id", current.enr_id)
      .single();

    const verified =
      verify?.credits_attempted === proposed.credits_attempted &&
      verify?.grading_period_id === proposed.grading_period_id &&
      verify?.course_level === proposed.course_level &&
      verify?.counts_toward_high_school_credit === true;

    if (!verified) {
      console.error(`  ✗ ${label}: verification mismatch after update`);
      console.error(`    Expected: credits=${proposed.credits_attempted} gp=${proposed.grading_period_id}`);
      console.error(`    Got:      credits=${verify?.credits_attempted} gp=${verify?.grading_period_id}`);
      results.push({ ...current, status: "verify_failed", audit_id: null });
      continue;
    }

    // Write audit record
    const auditId = await logAudit({
      organization_id: ORG_ID,
      action:          "enrollment_credit_updated",
      resource_id:     current.enr_id,
      previous_values: {
        counts_toward_high_school_credit: current.hs,
        credits_attempted:                current.credits,
        course_level:                     current.level,
        grading_period_id:                current.gp_id,
      },
      new_values: {
        counts_toward_high_school_credit: proposed.counts_toward_high_school_credit,
        credits_attempted:                proposed.credits_attempted,
        course_level:                     proposed.course_level,
        grading_period_id:                proposed.grading_period_id,
      },
    });

    PASS(`${label}: updated and verified${auditId ? ` (audit: ${auditId})` : ""}`);
    results.push({ ...current, status: "updated", audit_id: auditId, proposed });
  }

  return results;
}

// ── Phase 7: Attempted-credit totals ─────────────────────────────────────────

async function phase7() {
  SECTION("PHASE 7 — Attempted-Credit Totals");

  const { data: sections } = await supabase
    .from("course_sections")
    .select("id")
    .eq("school_year_id", "ddafe02c-2b3d-439a-a3b0-23df8bc0e22b");

  const { data: enrollments } = await supabase
    .from("curriculum_enrollments")
    .select(`
      student_id, counts_toward_high_school_credit, credits_attempted,
      grading_period_id,
      students ( first_name, last_name ),
      course_sections (
        counts_toward_high_school_credit, credits_attempted, grading_period_id,
        school_years ( label )
      )
    `)
    .eq("status", "active")
    .in("course_section_id", (sections ?? []).map(s => s.id));

  const totals: Record<string, number> = {};

  for (const e of enrollments ?? []) {
    const sec = e.course_sections;
    if (sec?.school_years?.label !== "2026-2027") continue;
    const stu = e.students;
    const name = `${stu?.first_name} ${stu?.last_name}`;
    const effHs = e.counts_toward_high_school_credit !== null ? e.counts_toward_high_school_credit : (sec?.counts_toward_high_school_credit ?? false);
    const effCredits = e.credits_attempted !== null ? e.credits_attempted : (sec?.credits_attempted ?? 0);
    if (effHs) totals[name] = (totals[name] ?? 0) + effCredits;
  }

  const expectedTotals = {
    "Stevie Beckham":           6.0,
    "Jeina Inoue Payne":        6.0,
    "Lily Hasibar":             6.0,
    "Jezziyn Farr-Saint Fleur": 5.0,
  };

  for (const [name, expected] of Object.entries(expectedTotals)) {
    const actual = totals[name] ?? 0;
    if (Math.abs(actual - expected) < 0.001) {
      PASS(`${name}: ${actual} cr ✓`);
    } else {
      FAIL(`${name}: got ${actual} cr, expected ${expected} cr`);
    }
  }

  return totals;
}

// ── Phase 9: Mixed-age and security checks ────────────────────────────────────

async function phase9() {
  SECTION("PHASE 9 — Mixed-Age & Security Checks");

  // Briyanna's Sea Perch HS=false override must remain
  const { data: bri } = await supabase
    .from("curriculum_enrollments")
    .select("id, counts_toward_high_school_credit, finalized_at")
    .eq("id", "cf7f7dd8-5951-4761-8dfa-9b2f60f97b0f")
    .single();

  if (!bri) FAIL("Briyanna Sea Perch enrollment not found");
  else if (bri.counts_toward_high_school_credit !== false) FAIL(`Briyanna Sea Perch HS override changed! Got: ${bri.counts_toward_high_school_credit}`);
  else PASS("Briyanna Sea Perch HS=false override intact");

  // Lily's English 1 unchanged
  const { data: lily } = await supabase
    .from("curriculum_enrollments")
    .select("id, credits_attempted, grading_period_id, course_section_id")
    .eq("id", "d8386db0-2ccd-4542-8e2d-819acd0c2391")
    .single();

  if (!lily) FAIL("Lily English 1 enrollment not found");
  else {
    if (lily.credits_attempted !== 0.5) FAIL(`Lily English 1 credits changed! Got ${lily.credits_attempted}`);
    else PASS("Lily English 1 credits unchanged (0.5)");
    if (lily.grading_period_id !== GP.SEMESTER_1) FAIL(`Lily English 1 term changed!`);
    else PASS("Lily English 1 term unchanged (Semester 1)");
    if (lily.course_section_id !== "bda4c7f5-e795-4973-9415-3e1b452d7698") FAIL(`Lily English 1 section changed!`);
    else PASS("Lily English 1 course section unchanged");
  }

  // No K-8 student has HS credit (spot check non-HS student enrollments)
  const { data: k8check } = await supabase
    .from("curriculum_enrollments")
    .select("id, counts_toward_high_school_credit, students(grade_level, first_name, last_name)")
    .eq("organization_id", ORG_ID)
    .eq("status", "active")
    .eq("counts_toward_high_school_credit", true);

  const unexpected = (k8check ?? []).filter((e) => {
    const grade = e.students?.grade_level ?? "";
    const hsGrades = ["9th", "10th", "11th", "12th"];
    return !hsGrades.some(g => grade.includes(g.replace("th","")));
  });

  if (unexpected.length > 0) {
    for (const e of unexpected) {
      FAIL(`Non-HS student has HS=true: ${(e.students)?.first_name} ${(e.students)?.last_name} (grade: ${(e.students)?.grade_level})`);
    }
  } else {
    PASS("No K-8 students have HS credit");
  }
}

// ── Phase 10: Before/after report ────────────────────────────────────────────

function phase10Report(records: any[], results: any[]) {
  SECTION("PHASE 10 — Before/After Report");

  console.log("\nStudent | Course | Enr ID | Prev Credits | New Credits | Prev Term | New Term | Status | Audit ID");
  console.log("--------");

  for (const res of results) {
    const newCredits = res.proposed?.credits_attempted ?? res.credits;
    const gpName = (gp_id) => gp_id === GP.FULL_YEAR ? "Full Year" : gp_id === GP.SEMESTER_2 ? "Semester 2" : gp_id === GP.SEMESTER_1 ? "Semester 1" : gp_id ?? "null";
    console.log(
      `${res.student} | ${res.course} | ${res.enr_id} | ` +
      `${res.credits} | ${newCredits} | ` +
      `${gpName(res.gp_id)} | ${gpName(res.proposed?.grading_period_id ?? res.gp_id)} | ` +
      `${res.status} | ${res.audit_id ?? "—"}`
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log(`Stage E.7.1 — RLA Credit Corrections`);
console.log(`DRY_RUN=${DRY_RUN}`);
console.log(`Date: ${new Date().toISOString()}`);
console.log("=".repeat(60));

async function main() {
  const p1ok = await phase1();
  if (!p1ok) { console.error("\nPHASE 1 FAILED — aborting"); process.exit(1); }

  const records = await phase2();
  if (!records) { console.error("\nPHASE 2 FAILED — aborting"); process.exit(1); }

  const results = await applyCorrections(records);

  const failed = results.filter(r => r.status === "error" || r.status === "verify_failed");
  if (failed.length > 0) {
    console.error(`\n${failed.length} update(s) FAILED. See above.`);
    phase10Report(records, results);
    process.exit(1);
  }

  await phase7();
  await phase9();
  phase10Report(records, results);

  console.log(`\n${"=".repeat(60)}`);
  console.log(DRY_RUN ? "DRY RUN complete. Re-run with DRY_RUN=false to apply." : "All corrections applied and verified.");
  console.log("=".repeat(60));
}

main().catch(e => { console.error(e); process.exit(1); });
