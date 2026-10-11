/**
 * Shared grading-period default-selection logic.
 *
 * Priority order (never auto-selects Full Year or Semester as a quarter substitute):
 *   1. The quarter whose date range contains today.
 *   2. The most recently ended quarter (for inter-quarter gaps like Oct 10–11).
 *   3. The earliest upcoming quarter (before school starts).
 *   4. The first quarter in sequence order (ultimate fallback).
 */
export interface PeriodRow {
  id:                  string;
  period_type:         string;
  is_assignment_period: boolean;
  start_date:          string; // "YYYY-MM-DD"
  end_date:            string; // "YYYY-MM-DD"
  sequence?:           number;
}

/**
 * Returns the default period ID for gradebook display given a list of
 * assignment-entry periods and today's date string.
 *
 * Never returns a Full Year or Semester period as a default unless no
 * quarter-type period exists at all.
 */
export function resolveDefaultPeriodId(
  periods: PeriodRow[],
  todayStr: string,
): string | null {
  if (!periods.length) return null;

  // Prefer quarter-type periods for default selection.
  // Fall back to any is_assignment_period period only if no quarters exist.
  const quarters = periods.filter(p => p.period_type === "quarter");
  const candidates = quarters.length > 0 ? quarters : periods;

  // 1. Active quarter: today falls within the period
  const active = candidates.find(
    p => todayStr >= p.start_date && todayStr <= p.end_date,
  );
  if (active) return active.id;

  // 2. Most recently ended quarter: end_date < today
  const past = candidates
    .filter(p => p.end_date < todayStr)
    .sort((a, b) => b.end_date.localeCompare(a.end_date));
  if (past.length) return past[0].id;

  // 3. Earliest upcoming quarter: start_date > today
  const upcoming = candidates
    .filter(p => p.start_date > todayStr)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (upcoming.length) return upcoming[0].id;

  // 4. Fallback: first in sequence
  return candidates[0].id;
}
