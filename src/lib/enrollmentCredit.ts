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
  /** Section-level term default (FK → grading_periods). Null = not specified. */
  grading_period_id?:               string | null;
  grading_period_name?:             string | null;
};

export type EffectiveCredit = {
  countsTowardHsCredit: boolean;
  creditsAttempted:     number | null;
  courseLevel:          string | null;
  /** Period name from grading_periods, resolved via enrollment ?? section ?? null.
   *  Null = not specified at either level. Never "Full Year" from null. */
  termLabel:            string | null;
  /** Resolved grading_period_id (enrollment ?? section ?? null). */
  effectiveGradingPeriodId: string | null;
  /** true when the enrollment has an explicit override on that field */
  isHsCreditOverridden:    boolean;
  isCreditAmtOverridden:   boolean;
  isCourseLevelOverridden: boolean;
  isTermOverridden:        boolean;
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

  // Term: enrollment explicit override ?? section default ?? null
  // Explicit null on enrollment = "not specified at enrollment level, fall through to section"
  // Use ?? (not ||) so explicit false/empty string on enrollment is preserved
  const effectiveGradingPeriodId =
    enr.grading_period_id != null
      ? enr.grading_period_id
      : (section.grading_period_id ?? null);

  const termLabel =
    effectiveGradingPeriodId != null
      ? (enr.grading_period_id != null
          ? (enr.grading_period_name ?? null)
          : (section.grading_period_name ?? null))
      : null;

  return {
    countsTowardHsCredit,
    creditsAttempted,
    courseLevel,
    termLabel,
    effectiveGradingPeriodId,
    isHsCreditOverridden:    enr.counts_toward_high_school_credit !== null,
    isCreditAmtOverridden:   enr.credits_attempted !== null,
    isCourseLevelOverridden: enr.course_level !== null,
    isTermOverridden:        enr.grading_period_id != null,
  };
}
