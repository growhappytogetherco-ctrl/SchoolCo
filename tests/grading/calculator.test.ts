/**
 * Grading calculator tests
 * Run with: npx tsx tests/grading/calculator.test.ts
 *
 * Tests every calculation rule from the Stage 2 spec.
 * No external dependencies required.
 */

import {
  lookupLetterGrade,
  calculatePointsGrade,
  calculateWeightedGrade,
  calculateSemesterGrade,
  calculateYTDGrade,
  formatPercentage,
} from "../../src/lib/grading/calculator";
import type { GradeInput, GradeScaleLevel } from "../../src/lib/grading/types";

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

function approx(label: string, actual: number | null, expected: number, tolerance = 0.001) {
  if (actual === null) {
    console.error(`  ✗ ${label} — got null, expected ~${expected}`);
    failed++;
    return;
  }
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    expected: ~${expected} (±${tolerance})`);
    console.error(`    actual:   ${actual}`);
    failed++;
  }
}

function section(name: string) {
  console.log(`\n── ${name} ─────────────────────────────────────────────`);
}

// ── Standard A–F scale (matches production seed) ─────────────────────────────

const SCALE: GradeScaleLevel[] = [
  { letter: "A+", min_pct: 97,   max_pct: 100,  gpa_points: 4.0 },
  { letter: "A",  min_pct: 93,   max_pct: 96.9, gpa_points: 4.0 },
  { letter: "A-", min_pct: 90,   max_pct: 92.9, gpa_points: 3.7 },
  { letter: "B+", min_pct: 87,   max_pct: 89.9, gpa_points: 3.3 },
  { letter: "B",  min_pct: 83,   max_pct: 86.9, gpa_points: 3.0 },
  { letter: "B-", min_pct: 80,   max_pct: 82.9, gpa_points: 2.7 },
  { letter: "C+", min_pct: 77,   max_pct: 79.9, gpa_points: 2.3 },
  { letter: "C",  min_pct: 73,   max_pct: 76.9, gpa_points: 2.0 },
  { letter: "C-", min_pct: 70,   max_pct: 72.9, gpa_points: 1.7 },
  { letter: "D+", min_pct: 67,   max_pct: 69.9, gpa_points: 1.3 },
  { letter: "D",  min_pct: 63,   max_pct: 66.9, gpa_points: 1.0 },
  { letter: "D-", min_pct: 60,   max_pct: 62.9, gpa_points: 0.7 },
  { letter: "F",  min_pct: 0,    max_pct: 59.9, gpa_points: 0.0 },
];

function g(
  id: string,
  points_possible: number,
  points_earned: number | null,
  grade_status: GradeInput["grade_status"],
  category: GradeInput["category"] = "homework",
  is_graded = true
): GradeInput {
  return { assignment_id: id, points_possible, points_earned, grade_status, category, is_graded };
}

// ═════════════════════════════════════════════════════════════════════════════
// LETTER GRADE LOOKUP
// ═════════════════════════════════════════════════════════════════════════════

section("Letter grade lookup");
expect("100%  → A+",   lookupLetterGrade(100,   SCALE), "A+");
expect("97%   → A+",   lookupLetterGrade(97,    SCALE), "A+");
expect("96.9% → A",    lookupLetterGrade(96.9,  SCALE), "A");
expect("93%   → A",    lookupLetterGrade(93,    SCALE), "A");
expect("92.9% → A-",   lookupLetterGrade(92.9,  SCALE), "A-");
expect("90%   → A-",   lookupLetterGrade(90,    SCALE), "A-");
expect("89.9% → B+",   lookupLetterGrade(89.9,  SCALE), "B+");
expect("87%   → B+",   lookupLetterGrade(87,    SCALE), "B+");
expect("83%   → B",    lookupLetterGrade(83,    SCALE), "B");
expect("80%   → B-",   lookupLetterGrade(80,    SCALE), "B-");
expect("77%   → C+",   lookupLetterGrade(77,    SCALE), "C+");
expect("73%   → C",    lookupLetterGrade(73,    SCALE), "C");
expect("70%   → C-",   lookupLetterGrade(70,    SCALE), "C-");
expect("67%   → D+",   lookupLetterGrade(67,    SCALE), "D+");
expect("63%   → D",    lookupLetterGrade(63,    SCALE), "D");
expect("60%   → D-",   lookupLetterGrade(60,    SCALE), "D-");
expect("59.9% → F",    lookupLetterGrade(59.9,  SCALE), "F");
expect("0%    → F",    lookupLetterGrade(0,     SCALE), "F");
expect("null  → null", lookupLetterGrade(null,  SCALE), null);
// Floating point boundary — 96.5% should be A (not A+, not a gap)
expect("96.5% → A (no gap)", lookupLetterGrade(96.5, SCALE), "A");

section("Letter grade — extra credit (> 100)");
expect("110% → A+", lookupLetterGrade(110, SCALE), "A+");
expect("105% → A+", lookupLetterGrade(105, SCALE), "A+");

// ═════════════════════════════════════════════════════════════════════════════
// BASIC POINTS-BASED CALCULATION
// ═════════════════════════════════════════════════════════════════════════════

section("Basic points — single assignment");
{
  const r = calculatePointsGrade([g("a1", 20, 18, "graded")], SCALE);
  expect("state = graded",         r.state,         "graded");
  approx("percentage = 90",        r.percentage,    90);
  expect("letter = A-",            r.letter_grade,  "A-");
  expect("earned = 18",            r.earned,        18);
  expect("possible = 20",          r.possible,      20);
  expect("count_graded = 1",       r.count_graded,  1);
}

section("Basic points — multiple assignments");
{
  // 18/20 + 42/50 = 60/70 = 85.714...%
  const r = calculatePointsGrade([
    g("a1", 20, 18, "graded"),
    g("a2", 50, 42, "graded"),
  ], SCALE);
  approx("percentage ≈ 85.714", r.percentage, 85.714);
  expect("letter = B",         r.letter_grade, "B");
  expect("earned = 60",        r.earned,        60);
  expect("possible = 70",      r.possible,      70);
}

section("Points — spec example (three assignments)");
{
  // 18/20 + 45/50 + 92/100 = 155/170 = 91.176...
  const r = calculatePointsGrade([
    g("a1",  20,  18, "graded"),
    g("a2",  50,  45, "graded"),
    g("a3", 100,  92, "graded"),
  ], SCALE);
  approx("percentage ≈ 91.176", r.percentage, 91.176);
  expect("letter = A-",         r.letter_grade, "A-");
  expect("earned = 155",        r.earned, 155);
  expect("possible = 170",      r.possible, 170);
}

// ═════════════════════════════════════════════════════════════════════════════
// SPECIAL GRADE STATUSES
// ═════════════════════════════════════════════════════════════════════════════

section("Excused — excluded from both earned and possible");
{
  // 18/20 graded + excused 0/100 → grade is still 18/20 = 90%
  const r = calculatePointsGrade([
    g("a1",  20,  18, "graded"),
    g("a2", 100, null, "excused"),
  ], SCALE);
  approx("percentage = 90 (excused excluded)", r.percentage, 90);
  expect("earned = 18",       r.earned,   18);
  expect("possible = 20",     r.possible, 20);
  expect("count_excused = 1", r.count_excused, 1);
  expect("letter = A-",       r.letter_grade, "A-");
}

section("Missing — counts as 0/possible");
{
  // 18/20 graded + missing 0/20 → 18/40 = 45%
  const r = calculatePointsGrade([
    g("a1", 20, 18, "graded"),
    g("a2", 20, null, "missing"),
  ], SCALE);
  approx("percentage = 45", r.percentage, 45);
  expect("earned = 18",       r.earned,   18);
  expect("possible = 40",     r.possible, 40);
  expect("count_missing = 1", r.count_missing, 1);
  expect("letter = F",        r.letter_grade, "F");
}

section("Absent — excluded from calculation");
{
  // 18/20 graded + absent → grade stays 18/20 = 90%
  const r = calculatePointsGrade([
    g("a1", 20, 18, "graded"),
    g("a2", 20, null, "absent"),
  ], SCALE);
  approx("percentage = 90", r.percentage, 90);
  expect("count_absent = 1", r.count_absent, 1);
}

section("Incomplete — excluded from calculation");
{
  const r = calculatePointsGrade([
    g("a1", 20, 18, "graded"),
    g("a2", 50, null, "incomplete"),
  ], SCALE);
  approx("percentage = 90", r.percentage, 90);
  expect("count_incomplete = 1", r.count_incomplete, 1);
}

section("Not graded status — excluded");
{
  const r = calculatePointsGrade([
    g("a1", 20, 18, "graded"),
    g("a2", 50, null, "not_graded"),
  ], SCALE);
  approx("percentage = 90", r.percentage, 90);
  expect("count_not_graded = 1", r.count_not_graded, 1);
}

section("Assignment is_graded=false — always excluded");
{
  const r = calculatePointsGrade([
    g("a1", 20, 18, "graded"),
    g("a2", 100, 0, "graded", "homework", false),  // is_graded=false
  ], SCALE);
  approx("percentage = 90", r.percentage, 90);
  expect("possible = 20 (ungraded assignment excluded)", r.possible, 20);
}

// ═════════════════════════════════════════════════════════════════════════════
// EXTRA CREDIT
// ═════════════════════════════════════════════════════════════════════════════

section("Extra credit — points_earned > points_possible");
{
  // 110/100 = 110%
  const r = calculatePointsGrade([g("a1", 100, 110, "graded")], SCALE);
  approx("percentage = 110", r.percentage, 110);
  expect("letter = A+",       r.letter_grade, "A+");
  expect("earned = 110",      r.earned, 110);
  expect("possible = 100",    r.possible, 100);
}

// ═════════════════════════════════════════════════════════════════════════════
// NO GRADE STATE
// ═════════════════════════════════════════════════════════════════════════════

section("No grade — zero included possible points");
{
  // All excused → possible = 0 → no_grade, NOT F
  const r = calculatePointsGrade([
    g("a1", 20, null, "excused"),
    g("a2", 50, null, "excused"),
  ], SCALE);
  expect("state = no_grade",      r.state,        "no_grade");
  expect("percentage = null",     r.percentage,   null);
  expect("letter_grade = null",   r.letter_grade, null);
}

{
  // Empty gradebook — no assignments yet
  const r = calculatePointsGrade([], SCALE);
  expect("state = no_grade (empty)", r.state, "no_grade");
  expect("percentage = null",        r.percentage, null);
}

// ═════════════════════════════════════════════════════════════════════════════
// SEMESTER CALCULATION — unequal points
// ═════════════════════════════════════════════════════════════════════════════

section("Semester — unequal quarter points (spec example)");
{
  // Q1: 450/500, Q2: 100/200 → Semester: 550/700 = 78.571...
  const q1 = calculatePointsGrade([g("a1", 500, 450, "graded")], SCALE);
  const q2 = calculatePointsGrade([g("a2", 200, 100, "graded")], SCALE);

  // Verify quarters individually
  approx("Q1 = 90%", q1.percentage, 90);
  approx("Q2 = 50%", q2.percentage, 50);

  const sem = calculateSemesterGrade([q1, q2], ["Q1", "Q2"], SCALE);
  approx("Semester ≈ 78.571 (NOT 70)",  sem.percentage, 78.571);
  expect("Semester state = graded",      sem.state, "graded");
  expect("quarters_included = 2",        sem.quarters_included, 2);
  expect("quarters_without_data = 0",    sem.quarters_without_data, 0);
  expect("letter = C+",                  sem.letter_grade, "C+");
}

section("Semester — one quarter has no data");
{
  const q1 = calculatePointsGrade([g("a1", 500, 450, "graded")], SCALE);
  const q2 = calculatePointsGrade([], SCALE); // no assignments yet

  const sem = calculateSemesterGrade([q1, q2], ["Q1", "Q2"], SCALE);
  expect("state = partial",           sem.state, "partial");
  expect("quarters_included = 1",     sem.quarters_included, 1);
  expect("quarters_without_data = 1", sem.quarters_without_data, 1);
  approx("percentage = 90 (Q1 only)", sem.percentage, 90);
}

section("Semester — both quarters have no data");
{
  const q1 = calculatePointsGrade([], SCALE);
  const q2 = calculatePointsGrade([], SCALE);
  const sem = calculateSemesterGrade([q1, q2], ["Q1", "Q2"], SCALE);
  expect("state = no_grade", sem.state, "no_grade");
  expect("percentage = null", sem.percentage, null);
}

// ═════════════════════════════════════════════════════════════════════════════
// YEAR-TO-DATE
// ═════════════════════════════════════════════════════════════════════════════

section("Year-to-date — all quarters");
{
  const q1 = calculatePointsGrade([g("a1", 500, 450, "graded")], SCALE);
  const q2 = calculatePointsGrade([g("a2", 200, 100, "graded")], SCALE);
  const q3 = calculatePointsGrade([g("a3", 300, 270, "graded")], SCALE);
  const q4 = calculatePointsGrade([], SCALE); // not started yet

  const ytd = calculateYTDGrade([
    { result: q1, name: "Q1" },
    { result: q2, name: "Q2" },
    { result: q3, name: "Q3" },
    { result: q4, name: "Q4" },
  ], SCALE);

  // 450+100+270 = 820 / 500+200+300 = 1000 = 82%
  approx("YTD percentage = 82", ytd.percentage, 82);
  expect("state = partial",         ytd.state, "partial");
  expect("periods_included",        ytd.periods_included, ["Q1","Q2","Q3"]);
  expect("letter = B-",             ytd.letter_grade, "B-");
}

// ═════════════════════════════════════════════════════════════════════════════
// WEIGHTED GRADING
// ═════════════════════════════════════════════════════════════════════════════

section("Weighted grading — all categories active");
{
  // Homework 20%, Tests 80%
  // Homework: 18/20 = 90%; Tests: 80/100 = 80%
  // Weighted: 0.2*90 + 0.8*80 = 18 + 64 = 82%
  const grades: GradeInput[] = [
    g("a1", 20,  18, "graded", "homework"),
    g("a2", 100, 80, "graded", "test"),
  ];
  const r = calculateWeightedGrade(grades, { homework: 20, test: 80 }, SCALE);
  approx("weighted = 82%",          r.percentage, 82);
  expect("letter = B-",             r.letter_grade, "B-");
  expect("all_categories_active",   r.all_categories_active, true);
  expect("active_weight_sum = 100", r.active_weight_sum, 100);
}

section("Weighted grading — empty category (live-grade normalization)");
{
  // Homework 20%, Tests 80%
  // Only Homework graded: 18/20 = 90%
  // Tests: no graded assignments → active weight = 20 only
  // Live grade = normalized: Homework at 100% weight = 90%
  const grades: GradeInput[] = [
    g("a1", 20, 18, "graded", "homework"),
    // no test assignments
  ];
  const r = calculateWeightedGrade(grades, { homework: 20, test: 80 }, SCALE);
  approx("live grade = 90% (test category excluded)", r.percentage, 90);
  expect("all_categories_active = false",  r.all_categories_active, false);
  expect("active_weight_sum = 20",         r.active_weight_sum, 20);
  expect("letter = A-",                    r.letter_grade, "A-");
}

section("Weighted grading — no categories active");
{
  const r = calculateWeightedGrade([], { homework: 20, test: 80 }, SCALE);
  expect("state = no_grade", r.state, "no_grade");
  expect("percentage = null", r.percentage, null);
}

// ═════════════════════════════════════════════════════════════════════════════
// GRADE SCALE BOUNDARIES
// ═════════════════════════════════════════════════════════════════════════════

section("Grade scale boundaries — exact thresholds");
const boundaries: Array<[number, string]> = [
  [97, "A+"], [96.99, "A"], [93, "A"], [92.99, "A-"], [90, "A-"],
  [89.99, "B+"], [87, "B+"], [82.99, "B-"], [80, "B-"],
  [79.99, "C+"], [76.99, "C"], [73, "C"], [72.99, "C-"], [70, "C-"],
  [69.99, "D+"], [66.99, "D"], [63, "D"], [62.99, "D-"], [60, "D-"],
  [59.99, "F"], [0, "F"],
];
for (const [pct, expected] of boundaries) {
  expect(`${pct}% → ${expected}`, lookupLetterGrade(pct, SCALE), expected);
}

// ═════════════════════════════════════════════════════════════════════════════
// FORMAT PERCENTAGE
// ═════════════════════════════════════════════════════════════════════════════

section("formatPercentage");
expect("91.176... → '91.18%'", formatPercentage(91.17647, 2), "91.18%");
expect("null → null",          formatPercentage(null),        null);
expect("100 → '100.00%'",      formatPercentage(100),         "100.00%");
expect("0 → '0.00%'",          formatPercentage(0),           "0.00%");

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("FAIL");
  process.exit(1);
} else {
  console.log("PASS — all grading calculator tests passed");
  process.exit(0);
}
