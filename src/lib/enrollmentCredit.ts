/**
 * Enrollment-level HS credit resolution helpers (Stage E.4.1).
 *
 * All resolution uses nullish coalescing (??) NOT logical OR (||).
 * Explicit false on the enrollment must remain false even when section default is true.
 */

export type EnrollmentCreditSource = {
  counts_toward_high_school_credit: boolean | null;
  credits_attempted:                number | null;
  course_level:                     string | null;
  grading_period_id?:               string | null;
  grading_period_name?:             string | null;
};

export type SectionCreditSource = {
  counts_toward_high_school_credit: boolean | null | undefined;
  credits_attempted:                number | null | undefined;
  course_level:                     string | null | undefined;
};

export type EffectiveCredit = {
  countsTowardHsCredit: boolean;
  creditsAttempted:     number | null;
  courseLevel:          string | null;
  /** Semester name from grading_periods.name, or null if not configured. Never "Full Year" from null. */
  termLabel:            string | null;
  /** true when the enrollment has an explicit override on that field */
  isHsCreditOverridden:    boolean;
  isCreditAmtOverridden:   boolean;
  isCourseLevelOverridden: boolean;
};

export function resolveEffectiveCredit(
  enr: EnrollmentCreditSource,
  section: SectionCreditSource,
): EffectiveCredit {
  const countsTowardHsCredit =
    enr.counts_toward_high_school_credit ??
    section.counts_toward_high_school_credit ??
    false;

  const creditsAttempted =
    enr.credits_attempted ??
    section.credits_attempted ??
    null;

  const courseLevel =
    enr.course_level ??
    section.course_level ??
    null;

  // termLabel: only from an explicit grading_period_id. null means "not specified."
  const termLabel =
    enr.grading_period_id != null
      ? (enr.grading_period_name ?? null)
      : null;

  return {
    countsTowardHsCredit,
    creditsAttempted,
    courseLevel,
    termLabel,
    isHsCreditOverridden:    enr.counts_toward_high_school_credit !== null,
    isCreditAmtOverridden:   enr.credits_attempted !== null,
    isCourseLevelOverridden: enr.course_level !== null,
  };
}
