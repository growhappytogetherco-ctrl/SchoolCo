import type { StudentGraduationRequirement, ManualCredit } from "@/app/actions/graduationPlan";

type CreditEntry = {
  student_requirement_id: string | null;
  entry_status: string | null;
  course_record: {
    credits_earned: number | null;
    verification_status: string;
    completion_status: string;
    counts_toward_high_school_credit: boolean;
  } | null;
  manual_credits: Pick<ManualCredit, "credits_claimed" | "verification_status" | "duplicate_status" | "reconciled_course_record_id">[];
};

function isEligibleCourseRecord(cr: CreditEntry["course_record"], entryStatus: string | null): boolean {
  return (
    entryStatus === "completed" &&
    cr !== null &&
    cr.verification_status === "verified" &&
    cr.completion_status === "completed" &&
    cr.counts_toward_high_school_credit === true &&
    (cr.credits_earned ?? 0) > 0
  );
}

function isEligibleManualCredit(mc: CreditEntry["manual_credits"][number]): boolean {
  return (
    mc.verification_status === "verified" &&
    mc.duplicate_status === "confirmed_unique" &&
    mc.reconciled_course_record_id === null
  );
}

export type CreditTotals = {
  measure_a: number;
  measure_b: number;
  completion_pct: number;
  by_requirement: Record<string, { earned: number; required: number; pct: number }>;
};

// Measure A = all eligible verified credits (classified + unclassified)
// Measure B = verified credits applied to requirements (capped per requirement)
export function computeCreditTotals(
  requirements: StudentGraduationRequirement[],
  entries: CreditEntry[]
): CreditTotals {
  let measureA = 0;
  for (const entry of entries) {
    if (isEligibleCourseRecord(entry.course_record, entry.entry_status)) {
      measureA += entry.course_record!.credits_earned ?? 0;
    }
    for (const mc of entry.manual_credits) {
      if (isEligibleManualCredit(mc)) measureA += mc.credits_claimed;
    }
  }

  const totalRequired = requirements.reduce((sum, r) => sum + Number(r.credits_required), 0);
  const byReq: Record<string, { earned: number; required: number; pct: number }> = {};

  for (const req of requirements) {
    byReq[req.id] = { earned: 0, required: Number(req.credits_required), pct: 0 };
  }

  for (const entry of entries) {
    if (!entry.student_requirement_id) continue;
    const reqSlot = byReq[entry.student_requirement_id];
    if (!reqSlot) continue;

    if (isEligibleCourseRecord(entry.course_record, entry.entry_status)) {
      reqSlot.earned += entry.course_record!.credits_earned ?? 0;
    }
    for (const mc of entry.manual_credits) {
      if (isEligibleManualCredit(mc)) reqSlot.earned += mc.credits_claimed;
    }
  }

  let measureB = 0;
  for (const reqId of Object.keys(byReq)) {
    const slot = byReq[reqId];
    const capped = Math.min(slot.earned, slot.required);
    measureB += capped;
    slot.pct = slot.required > 0 ? Math.min(100, Math.round((capped / slot.required) * 100)) : 0;
  }

  const completionPct = totalRequired > 0 ? Math.min(100, Math.round((measureB / totalRequired) * 100)) : 0;

  return { measure_a: measureA, measure_b: measureB, completion_pct: completionPct, by_requirement: byReq };
}
