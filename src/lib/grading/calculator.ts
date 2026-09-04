// Grading calculation engine — pure functions, no DB calls, no side effects.
// This is the single source of truth for all grade math.
// Report cards, gradebook UI, student profiles, and dashboards must all call these.
//
// CALCULATION RULES:
//   graded      → points_earned / points_possible included in totals
//   missing     → 0 / points_possible (counts against student)
//   excused     → excluded from both earned and possible
//   absent      → excluded (teacher must resolve before it affects grade)
//   incomplete  → excluded (teacher must resolve)
//   not_graded  → excluded permanently
//   is_graded=false on assignment → excluded regardless of status
//
// ROUNDING:
//   Raw math uses full numeric precision.
//   Round only at display time via formatPercentage().
//   Never round intermediate values before final aggregation.
//
// SEMESTER AGGREGATION:
//   Aggregate raw points from child quarters — never average percentages.
//   Q1: 450/500, Q2: 100/200 → Semester: 550/700 = 78.571...% (NOT 70%)

import type {
  GradeInput,
  GradeScaleLevel,
  GradeState,
  QuarterGradeResult,
  WeightedGradeResult,
  CategoryResult,
  SemesterGradeResult,
  YTDGradeResult,
  CategoryWeights,
  AssignmentCategory,
} from './types';

// ── Letter grade lookup ───────────────────────────────────────────────────────
// Algorithm: sort scale by min_pct DESC, return first level where pct >= min_pct.
// max_pct is display-only and is NOT used for lookup.
// Scores above 100% (extra credit) correctly return the highest bracket.
// Returns null if scale is empty or pct is null.

export function lookupLetterGrade(
  pct: number | null,
  scale: GradeScaleLevel[]
): string | null {
  if (pct === null || scale.length === 0) return null;
  const sorted = [...scale].sort((a, b) => b.min_pct - a.min_pct);
  for (const level of sorted) {
    if (pct >= level.min_pct) return level.letter;
  }
  return sorted[sorted.length - 1]?.letter ?? null; // fallback to lowest
}

// ── Display formatting ────────────────────────────────────────────────────────

export function formatPercentage(pct: number | null, decimals = 2): string | null {
  if (pct === null) return null;
  return pct.toFixed(decimals) + '%';
}

// ── Points-based quarter/period calculation ───────────────────────────────────
// Used for both points-based courses and as the sub-calculator for weighted courses.
// Pass only the grades for one grading period (one quarter).

export function calculatePointsGrade(
  grades: GradeInput[],
  scale: GradeScaleLevel[]
): QuarterGradeResult {
  let earned   = 0;
  let possible = 0;
  let count_graded     = 0;
  let count_missing    = 0;
  let count_excused    = 0;
  let count_absent     = 0;
  let count_incomplete = 0;
  let count_not_graded = 0;

  for (const g of grades) {
    // Assignment marked is_graded=false → always excluded
    if (!g.is_graded) { count_not_graded++; continue; }

    switch (g.grade_status) {
      case 'graded':
        earned   += g.points_earned ?? 0;
        possible += g.points_possible;
        count_graded++;
        break;
      case 'missing':
        // 0 earned against full possible — counts against student
        possible += g.points_possible;
        count_missing++;
        break;
      case 'excused':
        // Excluded from both — does not affect percentage
        count_excused++;
        break;
      case 'absent':
        count_absent++;
        break;
      case 'incomplete':
        count_incomplete++;
        break;
      case 'not_graded':
        count_not_graded++;
        break;
    }
  }

  const state: GradeState = possible === 0 ? 'no_grade' : 'graded';
  const percentage = possible > 0 ? (earned / possible) * 100 : null;

  return {
    state,
    earned,
    possible,
    percentage,
    display_percentage: formatPercentage(percentage),
    letter_grade:       lookupLetterGrade(percentage, scale),
    count_graded,
    count_missing,
    count_excused,
    count_absent,
    count_incomplete,
    count_not_graded,
  };
}

// ── Weighted-category grade calculation ───────────────────────────────────────
// For courses where each category has a configured weight (0–100, sum = 100).
//
// Live-grade behavior for empty categories:
//   If a configured category has zero graded assignments, it is temporarily excluded.
//   Weights for active categories are renormalized to sum to 100% for the live grade.
//   Metadata exposes which categories are inactive so UI can surface a warning.
//   This prevents penalizing a student for a test category with no tests yet.
//
// Example: Homework 20%, Tests 80%. Only Homework graded.
//   Active weight = 20. Normalized: Homework = 100% of live grade.
//   Live grade = Homework%. all_categories_active = false.

export function calculateWeightedGrade(
  grades: GradeInput[],
  categoryWeights: CategoryWeights,
  scale: GradeScaleLevel[]
): WeightedGradeResult {
  // Group grades by category
  const byCategory = new Map<AssignmentCategory, GradeInput[]>();
  for (const g of grades) {
    const arr = byCategory.get(g.category) ?? [];
    arr.push(g);
    byCategory.set(g.category, arr);
  }

  const categoryResults: CategoryResult[] = [];
  let activeWeightSum = 0;

  for (const [cat, weight] of Object.entries(categoryWeights) as [AssignmentCategory, number][]) {
    if (weight <= 0) continue;
    const catGrades = byCategory.get(cat) ?? [];
    const catResult = calculatePointsGrade(catGrades, scale);
    const isActive  = catResult.state === 'graded';

    categoryResults.push({
      category:   cat,
      weight,
      earned:     catResult.earned,
      possible:   catResult.possible,
      percentage: catResult.percentage,
      is_active:  isActive,
    });

    if (isActive) activeWeightSum += weight;
  }

  const allCategoriesActive = categoryResults.every(c => c.is_active);

  // Calculate weighted percentage using only active categories, renormalized
  let weightedPct: number | null = null;
  if (activeWeightSum > 0) {
    let sum = 0;
    for (const c of categoryResults) {
      if (!c.is_active || c.percentage === null) continue;
      const normalizedWeight = (c.weight / activeWeightSum) * 100;
      sum += (c.percentage / 100) * normalizedWeight;
    }
    weightedPct = sum;
  }

  const state: GradeState = weightedPct === null ? 'no_grade' : 'graded';

  // Aggregate raw counts for summary
  let count_graded = 0, count_missing = 0, count_excused = 0;
  let count_absent = 0, count_incomplete = 0, count_not_graded = 0;
  for (const g of grades) {
    if (!g.is_graded) { count_not_graded++; continue; }
    switch (g.grade_status) {
      case 'graded':     count_graded++;     break;
      case 'missing':    count_missing++;    break;
      case 'excused':    count_excused++;    break;
      case 'absent':     count_absent++;     break;
      case 'incomplete': count_incomplete++; break;
      case 'not_graded': count_not_graded++; break;
    }
  }

  return {
    state,
    earned:              0,    // not meaningful for weighted; use category breakdown
    possible:            0,
    percentage:          weightedPct,
    display_percentage:  formatPercentage(weightedPct),
    letter_grade:        lookupLetterGrade(weightedPct, scale),
    count_graded,
    count_missing,
    count_excused,
    count_absent,
    count_incomplete,
    count_not_graded,
    categories:           categoryResults,
    active_weight_sum:    activeWeightSum,
    all_categories_active: allCategoriesActive,
  };
}

// ── Semester calculation ──────────────────────────────────────────────────────
// Aggregates raw points from two quarter results.
// NEVER averages quarter percentages — always uses raw earned/possible totals.
// If one quarter has no data (possible=0), it is excluded but flagged in metadata.

export function calculateSemesterGrade(
  quarters: QuarterGradeResult[],
  quarterNames: string[],
  scale: GradeScaleLevel[]
): SemesterGradeResult {
  let earned   = 0;
  let possible = 0;
  let includedCount      = 0;
  let withoutDataCount   = 0;

  for (const q of quarters) {
    if (q.state === 'no_grade') {
      withoutDataCount++;
    } else {
      earned   += q.earned;
      possible += q.possible;
      includedCount++;
    }
  }

  const state: GradeState =
    possible === 0 ? 'no_grade' :
    withoutDataCount > 0 ? 'partial' :
    'graded';

  const percentage = possible > 0 ? (earned / possible) * 100 : null;

  return {
    state,
    earned,
    possible,
    percentage,
    display_percentage:    formatPercentage(percentage),
    letter_grade:          lookupLetterGrade(percentage, scale),
    quarters_included:     includedCount,
    quarters_without_data: withoutDataCount,
  };
}

// ── Year-to-date calculation ──────────────────────────────────────────────────
// Aggregates raw points across all quarters in the school year.
// Uses same raw-points approach as semester — never averages period percentages.

export function calculateYTDGrade(
  quarters: Array<{ result: QuarterGradeResult; name: string }>,
  scale: GradeScaleLevel[]
): YTDGradeResult {
  let earned   = 0;
  let possible = 0;
  const periodsIncluded: string[] = [];

  for (const { result, name } of quarters) {
    if (result.state !== 'no_grade') {
      earned   += result.earned;
      possible += result.possible;
      periodsIncluded.push(name);
    }
  }

  const state: GradeState =
    possible === 0 ? 'no_grade' :
    periodsIncluded.length < quarters.length ? 'partial' :
    'graded';

  const percentage = possible > 0 ? (earned / possible) * 100 : null;

  return {
    state,
    earned,
    possible,
    percentage,
    display_percentage: formatPercentage(percentage),
    letter_grade:       lookupLetterGrade(percentage, scale),
    periods_included:   periodsIncluded,
  };
}
