/**
 * Stage E.7.1 — Retrospective audit repair.
 *
 * The 9 approved enrollment credit corrections were applied successfully by
 * scripts/e7_1_credit_corrections.ts on 2026-10-11T16:55:31.622Z using the
 * Supabase service role. The subsequent audit_logs inserts failed because the
 * service role executes without an authenticated user (actor_id = NULL), but
 * audit_logs.actor_id is NOT NULL.
 *
 * This script creates 9 retrospective audit records representing those changes.
 * It does NOT modify any enrollment data.
 *
 * Actor attribution:
 *   - Approved by:  Elisa Johnson (full_admin, profile 7ba9a63f-c33d-4a25-b716-125e27bdf1b5)
 *   - Executed by:  service role via scripts/e7_1_credit_corrections.ts
 *   - audit created_at: now() (NOT backdated to correction timestamp)
 *
 * Idempotent: checks for existing enrollment_credit_updated events with
 * repair_audit=true for each enrollment ID before inserting.
 *
 * DRY_RUN=true  → print what would be inserted, no writes.
 * DRY_RUN=false → insert 9 audit records, verify all inserted.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const vars: Record<string, string> = {};
for (const line of env.split("\n")) {
  const m = line.match(/^([^=#][^=]*)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}
const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);

const DRY_RUN = process.env.DRY_RUN !== "false";
const ORG_ID        = "9fd43346-f43b-41d1-9b4c-fe8702471b07";
const ACTOR_ID      = "7ba9a63f-c33d-4a25-b716-125e27bdf1b5"; // Elisa Johnson — full_admin
const CORRECTION_TS = "2026-10-11T16:55:31.622Z"; // Actual execution timestamp from script output

const GP = {
  SEMESTER_1: "4302e3d7-9772-4feb-8be5-d1c4f57b3cc0",
  SEMESTER_2: "b7ec5a10-5d04-4dff-b72e-cd47649e0daf",
  FULL_YEAR:  "2bc4ea38-aa49-4d19-b2d2-539fd5d17d47",
};

// The 9 approved corrections with before/after values
const CORRECTIONS = [
  {
    enrollment_id:    "3775b96f-ba03-4145-a6f3-f9748e2216b5",
    student:          "Stevie Beckham",
    course:           "RLA Bible",
    prev_credits:     0.5,  prev_gp_id: GP.SEMESTER_1,
    new_credits:      1.0,  new_gp_id:  GP.FULL_YEAR,
  },
  {
    enrollment_id:    "f0628b76-af14-478e-b406-529a848e817b",
    student:          "Jeina Inoue Payne",
    course:           "RLA Bible",
    prev_credits:     0.5,  prev_gp_id: GP.SEMESTER_1,
    new_credits:      1.0,  new_gp_id:  GP.FULL_YEAR,
  },
  {
    enrollment_id:    "35dca149-36e6-4f36-b47c-78e62d511cbd",
    student:          "Jezziyn Farr-Saint Fleur",
    course:           "RLA Bible",
    prev_credits:     0.5,  prev_gp_id: GP.SEMESTER_1,
    new_credits:      1.0,  new_gp_id:  GP.FULL_YEAR,
  },
  {
    enrollment_id:    "66a064ee-3ed8-4cf0-ac4e-c920091e01ad",
    student:          "Lily Hasibar",
    course:           "RLA Bible",
    prev_credits:     0.5,  prev_gp_id: GP.SEMESTER_1,
    new_credits:      1.0,  new_gp_id:  GP.FULL_YEAR,
  },
  {
    enrollment_id:    "ae2e44b6-9b65-4707-ad53-fb2adf83b77e",
    student:          "Stevie Beckham",
    course:           "KingDurance PE",
    prev_credits:     0.5,  prev_gp_id: GP.SEMESTER_1,
    new_credits:      1.0,  new_gp_id:  GP.FULL_YEAR,
  },
  {
    enrollment_id:    "2da7280d-8d80-44d9-822b-dac39268a4b2",
    student:          "Jeina Inoue Payne",
    course:           "KingDurance PE",
    prev_credits:     0.5,  prev_gp_id: GP.SEMESTER_1,
    new_credits:      1.0,  new_gp_id:  GP.FULL_YEAR,
  },
  {
    enrollment_id:    "52ad97cf-83d4-4bc6-a2cf-80b2e552c9e7",
    student:          "Jezziyn Farr-Saint Fleur",
    course:           "KingDurance PE",
    prev_credits:     0.5,  prev_gp_id: GP.SEMESTER_1,
    new_credits:      1.0,  new_gp_id:  GP.FULL_YEAR,
  },
  {
    enrollment_id:    "2f91eed0-8b0e-4cd5-a872-7b2af09055fd",
    student:          "Lily Hasibar",
    course:           "KingDurance PE",
    prev_credits:     0.5,  prev_gp_id: GP.SEMESTER_1,
    new_credits:      1.0,  new_gp_id:  GP.FULL_YEAR,
  },
  {
    enrollment_id:    "7b8ed7c6-161b-4847-ae41-ec4bfceb6e3c",
    student:          "Jeina Inoue Payne",
    course:           "English 2",
    prev_credits:     0.5,  prev_gp_id: GP.SEMESTER_1,
    new_credits:      0.5,  new_gp_id:  GP.SEMESTER_2,
  },
];

async function main() {
  console.log("============================================================");
  console.log("Stage E.7.1 — Retrospective Audit Repair");
  console.log(`DRY_RUN=${DRY_RUN}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("============================================================\n");

  // 1. Verify org and actor
  const { data: org } = await (supabase as any)
    .from("organizations").select("name").eq("id", ORG_ID).single();
  if (!org) { console.error("Org not found"); process.exit(1); }
  console.log(`✓ Org: ${org.name}`);

  const { data: actor } = await (supabase as any)
    .from("organization_members")
    .select("role, profiles(email, full_name)")
    .eq("organization_id", ORG_ID)
    .eq("profile_id", ACTOR_ID)
    .eq("status", "active")
    .single();
  if (!actor) { console.error("Actor not found in org"); process.exit(1); }
  const p = (actor as any).profiles;
  console.log(`✓ Actor verified: ${p?.full_name} <${p?.email}> — role: ${actor.role}`);

  // 2. Check for existing repair audit records (idempotency check)
  const { data: existing } = await (supabase as any)
    .from("audit_logs")
    .select("resource_id, metadata")
    .eq("organization_id", ORG_ID)
    .eq("action", "enrollment_credit_updated")
    .eq("actor_id", ACTOR_ID);

  const alreadyRepaired = new Set<string>(
    ((existing ?? []) as any[])
      .filter(r => r.metadata?.repair_audit === true)
      .map(r => r.resource_id)
  );

  if (alreadyRepaired.size > 0) {
    console.log(`\n⚠ Already have repair audit records for ${alreadyRepaired.size} enrollment(s) — will skip those.`);
  }

  // 3. Verify current enrollment states match post-correction values
  console.log("\n=== VERIFY — Current enrollment state (must match post-correction) ===");
  let verifyOk = true;
  for (const c of CORRECTIONS) {
    const { data: enr } = await (supabase as any)
      .from("curriculum_enrollments")
      .select("id, credits_attempted, grading_period_id, finalized_at")
      .eq("id", c.enrollment_id)
      .eq("organization_id", ORG_ID)
      .single();

    if (!enr) {
      console.log(`  ✗ ${c.student} | ${c.course}: enrollment not found`);
      verifyOk = false;
      continue;
    }
    const credMatch = Number(enr.credits_attempted) === c.new_credits;
    const gpMatch   = enr.grading_period_id === c.new_gp_id;
    const status    = credMatch && gpMatch ? "✓" : "✗ MISMATCH";
    console.log(`  ${status} ${c.student} | ${c.course}: ${enr.credits_attempted} cr, gp=${enr.grading_period_id?.substring(0,8)}`);
    if (!credMatch || !gpMatch) verifyOk = false;
  }

  if (!verifyOk) {
    console.error("\n✗ Enrollment state verification failed — aborting audit repair.");
    process.exit(1);
  }
  console.log("  All 9 enrollments confirmed at post-correction values.");

  // 4. Build and insert audit records
  console.log("\n=== AUDIT REPAIR ===");
  let inserted = 0;
  let skipped  = 0;

  for (const c of CORRECTIONS) {
    if (alreadyRepaired.has(c.enrollment_id)) {
      console.log(`  SKIP (already repaired): ${c.student} | ${c.course}`);
      skipped++;
      continue;
    }

    const auditRow = {
      organization_id: ORG_ID,
      actor_id:        ACTOR_ID,
      action:          "enrollment_credit_updated",
      resource_type:   "curriculum_enrollment",
      resource_id:     c.enrollment_id,
      previous_values: {
        credits_attempted:  c.prev_credits,
        grading_period_id:  c.prev_gp_id,
        course_level:       "standard",
        counts_toward_high_school_credit: true,
      },
      new_values: {
        credits_attempted:  c.new_credits,
        grading_period_id:  c.new_gp_id,
        course_level:       "standard",
        counts_toward_high_school_credit: true,
      },
      metadata: {
        repair_audit:             true,
        repair_reason:            "Service-role script executed successfully but audit insert failed: actor_id NOT NULL constraint. Retrospective record created with authorized approver as actor.",
        approved_by:              "Elisa Johnson (full_admin) — profile_id 7ba9a63f-c33d-4a25-b716-125e27bdf1b5",
        executed_by:              "service_role — scripts/e7_1_credit_corrections.ts DRY_RUN=false",
        executed_at:              CORRECTION_TS,
        audit_reconstructed_at:   new Date().toISOString(),
        source_stage:             "E.7.1",
        student:                  c.student,
        course:                   c.course,
      },
    };

    if (DRY_RUN) {
      console.log(`  WOULD INSERT: ${c.student} | ${c.course}`);
      console.log(`    prev: ${c.prev_credits} cr, gp ${c.prev_gp_id.substring(0,8)}`);
      console.log(`    new:  ${c.new_credits} cr, gp ${c.new_gp_id.substring(0,8)}`);
      inserted++;
      continue;
    }

    const { error } = await (supabase as any).from("audit_logs").insert(auditRow);
    if (error) {
      console.error(`  ✗ INSERT FAILED: ${c.student} | ${c.course}: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ✓ Inserted: ${c.student} | ${c.course}`);
    inserted++;
  }

  // 5. Verify all 9 repair records now exist
  if (!DRY_RUN) {
    console.log("\n=== VERIFICATION ===");
    const { data: repairs } = await (supabase as any)
      .from("audit_logs")
      .select("resource_id, created_at, metadata")
      .eq("organization_id", ORG_ID)
      .eq("action", "enrollment_credit_updated")
      .eq("actor_id", ACTOR_ID);

    const repairedIds = new Set<string>(
      ((repairs ?? []) as any[])
        .filter(r => r.metadata?.repair_audit === true)
        .map(r => r.resource_id)
    );

    for (const c of CORRECTIONS) {
      const found = repairedIds.has(c.enrollment_id);
      console.log(`  ${found ? "✓" : "✗ MISSING"} ${c.student} | ${c.course}`);
    }

    const total = repairedIds.size;
    if (total === 9) {
      console.log(`\n✓ All 9 repair audit records confirmed present.`);
    } else {
      console.error(`\n✗ Expected 9 repair records, found ${total}`);
      process.exit(1);
    }
  }

  console.log("\n============================================================");
  if (DRY_RUN) {
    console.log(`DRY RUN complete. ${inserted} records would be inserted.`);
    console.log("Re-run with DRY_RUN=false to apply.");
  } else {
    console.log(`Audit repair complete. Inserted: ${inserted}, Skipped (already done): ${skipped}`);
  }
  console.log("============================================================");
}

main().catch(console.error);
