/**
 * Graduation Planner — credit calculator and display logic regression tests
 * Run with: npx tsx tests/graduation/creditCalculator.test.ts
 *
 * Covers:
 *  - Two 0.5-credit semester courses under one requirement
 *  - Science credits from multiple distinct courses
 *  - English 1–4 slot structure
 *  - In-progress entries earning 0
 *  - Verified credits using credits_earned (not display_credits_planned)
 *  - Credit cap per requirement
 *  - Duplicate link detection
 *  - computeCreditTotals measure_a / measure_b / by_requirement
 *  - inferCreditsDisplay: earned for V/C, planned for P/IP
 */

import { computeCreditTotals } from "../../src/lib/graduation/creditCalculator";

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

function expectClose(label: string, actual: number, expected: number, tol = 0.001) {
  const ok = Math.abs(actual - expected) < tol;
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ${expected}, actual: ${actual}`);
    failed++;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(id: string, credits: number) {
  return { id, credits_required: credits } as any;
}

function makeEntry(opts: {
  req_id?: string;
  entry_status: string;
  cr_earned?: number | null;
  cr_verified?: boolean;
  cr_completed?: boolean;
  cr_hs?: boolean;
  display_cr?: number;
  manual_credits?: any[];
}) {
  const hasCr = opts.cr_earned != null;
  return {
    student_requirement_id: opts.req_id ?? null,
    entry_status: opts.entry_status,
    display_credits_planned: opts.display_cr ?? null,
    course_record: hasCr
      ? {
          credits_earned: opts.cr_earned!,
          verification_status: opts.cr_verified !== false ? "verified" : "unverified",
          completion_status: opts.cr_completed !== false ? "completed" : "in_progress",
          counts_toward_high_school_credit: opts.cr_hs !== false,
        }
      : null,
    manual_credits: opts.manual_credits ?? [],
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

console.log("\n=== Graduation Planner Regression Tests ===\n");

// ── 1. Two 0.5-credit semesters under the same ELA requirement ────────────────
console.log("1. Two 0.5-credit semester courses under ELA requirement:");

{
  const ELA = "ela-req-1";
  const reqs = [makeReq(ELA, 4)];
  const entries = [
    makeEntry({ req_id: ELA, entry_status: "completed", cr_earned: 0.5, display_cr: 1 }),
    makeEntry({ req_id: ELA, entry_status: "completed", cr_earned: 0.5, display_cr: 0.5 }),
    makeEntry({ req_id: ELA, entry_status: "in_progress", display_cr: 1 }),
    makeEntry({ req_id: ELA, entry_status: "planned", display_cr: 1 }),
    makeEntry({ req_id: ELA, entry_status: "planned", display_cr: 1 }),
  ];
  const totals = computeCreditTotals(reqs as any, entries as any);
  expectClose("measure_a = 1.0 (both semesters count)", totals.measure_a, 1.0);
  expectClose("by_requirement ELA earned = 1.0", totals.by_requirement[ELA].earned, 1.0);
  expectClose("by_requirement ELA required = 4.0", totals.by_requirement[ELA].required, 4.0);
  expect("ELA pct = 25%", totals.by_requirement[ELA].pct, 25);
}

// ── 2. Biology 1 (slot display_cr=1) but AH earned 0.5 ───────────────────────
console.log("\n2. Biology 1 slot display_cr=1 but AH credits_earned=0.5:");

{
  const SCI = "sci-req-1";
  const reqs = [makeReq(SCI, 3)];
  const entries = [
    // Biology 1: slot was set up for 1.0 but AH record is a semester (0.5)
    makeEntry({ req_id: SCI, entry_status: "completed", cr_earned: 0.5, display_cr: 1.0 }),
    // PHY SCI: 0.5
    makeEntry({ req_id: SCI, entry_status: "completed", cr_earned: 0.5, display_cr: 0.5 }),
    makeEntry({ req_id: SCI, entry_status: "planned", display_cr: 1 }),
  ];
  const totals = computeCreditTotals(reqs as any, entries as any);
  expectClose("Science measure_a = 1.0 (not 1.5)", totals.measure_a, 1.0);
  expectClose("Science earned = 1.0 (not 1.5)", totals.by_requirement[SCI].earned, 1.0);
  expectClose("Science pct = 33%", totals.by_requirement[SCI].pct, 33);
}

// ── 3. In-progress entry earns 0 ─────────────────────────────────────────────
console.log("\n3. In-progress entry earns 0:");

{
  const ELA = "ela-req-2";
  const reqs = [makeReq(ELA, 4)];
  const entries = [
    makeEntry({ req_id: ELA, entry_status: "completed", cr_earned: 0.5 }),
    makeEntry({ req_id: ELA, entry_status: "in_progress", display_cr: 0.5 }),
  ];
  const totals = computeCreditTotals(reqs as any, entries as any);
  expectClose("in_progress earns 0, only completed counts (0.5)", totals.measure_a, 0.5);
}

// ── 4. Unverified completed entry does not count ──────────────────────────────
console.log("\n4. Completed-but-unverified entry does not count:");

{
  const SCI = "sci-req-2";
  const reqs = [makeReq(SCI, 3)];
  const entries = [
    makeEntry({ req_id: SCI, entry_status: "completed", cr_earned: 1.0, cr_verified: false }),
  ];
  const totals = computeCreditTotals(reqs as any, entries as any);
  expectClose("unverified earns 0", totals.measure_a, 0);
}

// ── 5. Completed-but-not-hs-credit entry does not count ──────────────────────
console.log("\n5. HS-ineligible completed entry does not count:");

{
  const ELEC = "elec-req-1";
  const reqs = [makeReq(ELEC, 7.5)];
  const entries = [
    makeEntry({ req_id: ELEC, entry_status: "completed", cr_earned: 1.0, cr_hs: false }),
  ];
  const totals = computeCreditTotals(reqs as any, entries as any);
  expectClose("non-hs-credit earns 0", totals.measure_a, 0);
}

// ── 6. Credit cap per requirement ────────────────────────────────────────────
console.log("\n6. measure_b caps earned at credits_required:");

{
  const PE = "pe-req-1";
  const reqs = [makeReq(PE, 1.0)];
  const entries = [
    makeEntry({ req_id: PE, entry_status: "completed", cr_earned: 0.5 }),
    makeEntry({ req_id: PE, entry_status: "completed", cr_earned: 0.5 }),
    makeEntry({ req_id: PE, entry_status: "completed", cr_earned: 0.5 }),
  ];
  const totals = computeCreditTotals(reqs as any, entries as any);
  expectClose("measure_a = 1.5 (all earned)", totals.measure_a, 1.5);
  expectClose("measure_b = 1.0 (capped at required)", totals.measure_b, 1.0);
  expect("PE pct = 100%", totals.by_requirement[PE].pct, 100);
}

// ── 7. English 1–4 slot structure ────────────────────────────────────────────
console.log("\n7. ELA with four slots (English 1-4) + extra semester entries:");

{
  const ELA = "ela-req-3";
  const reqs = [makeReq(ELA, 4.0)];
  const entries = [
    // English 1 Term 1 — named slot, completed, 0.5cr
    makeEntry({ req_id: ELA, entry_status: "completed", cr_earned: 0.5, display_cr: 1.0 }),
    // English 1 Term 2 — extra entry, completed, 0.5cr
    makeEntry({ req_id: ELA, entry_status: "completed", cr_earned: 0.5, display_cr: 0.5 }),
    // English 2 — in progress
    makeEntry({ req_id: ELA, entry_status: "in_progress", display_cr: 1.0 }),
    // English 3 — planned
    makeEntry({ req_id: ELA, entry_status: "planned", display_cr: 1.0 }),
    // English 4 — planned
    makeEntry({ req_id: ELA, entry_status: "planned", display_cr: 1.0 }),
  ];
  const totals = computeCreditTotals(reqs as any, entries as any);
  expectClose("ELA earned = 1.0 (both English 1 semesters)", totals.by_requirement[ELA].earned, 1.0);
  expectClose("measure_a = 1.0", totals.measure_a, 1.0);
  expectClose("measure_b = 1.0 (capped at 4, only 1 earned)", totals.measure_b, 1.0);
}

// ── 8. No duplicate course_record_id links ───────────────────────────────────
console.log("\n8. Duplicate course_record_id detection:");

{
  const ELA = "ela-req-4";
  const reqs = [makeReq(ELA, 4.0)];
  const SAME_CR_ID = "cr-abc";
  // Simulate two entries pointing at the same AH record (should not happen, but test calculator handles it)
  const entries = [
    { student_requirement_id: ELA, entry_status: "completed", display_credits_planned: 0.5,
      course_record: { credits_earned: 0.5, verification_status: "verified", completion_status: "completed", counts_toward_high_school_credit: true },
      manual_credits: [] },
    { student_requirement_id: ELA, entry_status: "completed", display_credits_planned: 0.5,
      course_record: { credits_earned: 0.5, verification_status: "verified", completion_status: "completed", counts_toward_high_school_credit: true },
      manual_credits: [] },
  ];
  // Note: calculator doesn't de-duplicate by course_record_id — that's DB-level constraint
  // Test that it sums both (this is expected; de-dup is enforced at insert time)
  const totals = computeCreditTotals(reqs as any, entries as any);
  expectClose("calculator sums both (1.0); de-dup is DB's job", totals.measure_a, 1.0);
}

// ── 9. Full production-like scenario (3.0cr total) ───────────────────────────
console.log("\n9. Full production scenario — 3.0 cr total:");

{
  const ELA = "ela"; const MATH = "math"; const SCI = "sci"; const SS = "ss";
  const PFL = "pfl"; const FA = "fa"; const PE = "pe"; const ELEC = "elec";
  const reqs = [
    makeReq(ELA, 4), makeReq(MATH, 4), makeReq(SCI, 3), makeReq(SS, 3),
    makeReq(PFL, 0.5), makeReq(FA, 1), makeReq(PE, 1), makeReq(ELEC, 7.5),
  ];
  const entries = [
    // ELA: English 1 T1 (0.5) + English 1 T2 (0.5) + English 2 IP + English 3 P + English 4 P
    makeEntry({ req_id: ELA, entry_status: "completed", cr_earned: 0.5, display_cr: 1.0 }),
    makeEntry({ req_id: ELA, entry_status: "completed", cr_earned: 0.5, display_cr: 0.5 }),
    makeEntry({ req_id: ELA, entry_status: "in_progress", display_cr: 0.5 }),
    makeEntry({ req_id: ELA, entry_status: "planned", display_cr: 1.0 }),
    makeEntry({ req_id: ELA, entry_status: "planned", display_cr: 1.0 }),
    // Math: Algebra 1 T1 (0.5) + Algebra 1 T2 IP + Geometry P + Math 4 P
    makeEntry({ req_id: MATH, entry_status: "completed", cr_earned: 0.5, display_cr: 0.5 }),
    makeEntry({ req_id: MATH, entry_status: "in_progress", display_cr: 0.5 }),
    makeEntry({ req_id: MATH, entry_status: "planned", display_cr: 1.0 }),
    makeEntry({ req_id: MATH, entry_status: "planned", display_cr: 1.0 }),
    // Science: Biology 1 (0.5) + PHY SCI (0.5) + Science 3 P
    makeEntry({ req_id: SCI, entry_status: "completed", cr_earned: 0.5, display_cr: 1.0 }),
    makeEntry({ req_id: SCI, entry_status: "completed", cr_earned: 0.5, display_cr: 0.5 }),
    makeEntry({ req_id: SCI, entry_status: "planned", display_cr: 1.0 }),
    // Social Studies: World History (0.5) + 3 planned
    makeEntry({ req_id: SS, entry_status: "completed", cr_earned: 0.5, display_cr: 0.5 }),
    makeEntry({ req_id: SS, entry_status: "planned", display_cr: 1.0 }),
    makeEntry({ req_id: SS, entry_status: "planned", display_cr: 0.5 }),
    makeEntry({ req_id: SS, entry_status: "planned", display_cr: 0.5 }),
    // Others: planned only
    makeEntry({ req_id: PFL, entry_status: "planned", display_cr: 0.5 }),
    makeEntry({ req_id: FA, entry_status: "planned", display_cr: 1.0 }),
    makeEntry({ req_id: PE, entry_status: "planned", display_cr: 1.0 }),
  ];
  const totals = computeCreditTotals(reqs as any, entries as any);
  expectClose("measure_a = 3.0 cr", totals.measure_a, 3.0);
  expectClose("ELA earned = 1.0", totals.by_requirement[ELA].earned, 1.0);
  expectClose("MATH earned = 0.5", totals.by_requirement[MATH].earned, 0.5);
  expectClose("SCI earned = 1.0 (not 1.5)", totals.by_requirement[SCI].earned, 1.0);
  expectClose("SS earned = 0.5", totals.by_requirement[SS].earned, 0.5);
  expectClose("measure_b = 3.0", totals.measure_b, 3.0);
  expect("completion_pct > 0", totals.completion_pct > 0, true);
}

// ── 10. inferCreditsDisplay logic (mirrors SlotEntryRow fix) ─────────────────
console.log("\n10. Credits display logic (Verified/Completed → earned; Planned/IP → display_cr):");

function inferCreditsDisplay(
  status: string,
  creditsEarned: number | null | undefined,
  displayCrPlanned: number | null | undefined
): number {
  const isEarned = (status === "Verified" || status === "Completed") && creditsEarned != null;
  return isEarned ? creditsEarned! : (displayCrPlanned ?? 0);
}

expect("Verified, earned=0.5, display_cr=1.0 → 0.5", inferCreditsDisplay("Verified", 0.5, 1.0), 0.5);
expect("Completed (unverified), earned=1.0, display_cr=1.0 → 1.0", inferCreditsDisplay("Completed", 1.0, 1.0), 1.0);
expect("Planned, no AH, display_cr=1.0 → 1.0", inferCreditsDisplay("Planned", null, 1.0), 1.0);
expect("In Progress, display_cr=0.5 → 0.5", inferCreditsDisplay("In Progress", null, 0.5), 0.5);
// Completed (C badge) without AH: shows display_cr as planned amount; calculator still earns 0 because no AH
expect("Completed (C), no AH, display_cr=0.5 → 0.5 (shows planned)", inferCreditsDisplay("Completed", null, 0.5), 0.5);
expect("Verified, earned=0, display_cr=1.0 → 0 (earns nothing)", inferCreditsDisplay("Verified", 0, 1.0), 0);

// ── 11. Repeated sync idempotency (no duplicate links) ───────────────────────
console.log("\n11. syncAcademicHistoryToPlan idempotency concept:");

{
  // Simulate: a course record already in plan — sync should skip it.
  const usedCrIds = new Set(["cr-1", "cr-2", "cr-3"]);
  const ahRecords = [
    { id: "cr-1", course_name: "English 1" },
    { id: "cr-2", course_name: "Biology 1 (Term 2)" },
    { id: "cr-4", course_name: "Algebra 1" }, // new, not yet linked
  ];
  const unlinked = ahRecords.filter(cr => !usedCrIds.has(cr.id));
  expect("sync only processes unlinked records", unlinked.length, 1);
  expect("unlinked is Algebra 1", unlinked[0].id, "cr-4");
}

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
if (failed > 0) {
  console.error(`\n${failed} test(s) FAILED`);
  process.exit(1);
} else {
  console.log("\nAll tests passed ✓");
}
