// Compliance constants — NOT a "use server" file.
// All exports are plain values (no async functions).

export const REQUIREMENT_TYPES = [
  "background_screening",
  "child_safety_training",
  "cpr_certification",
  "first_aid_certification",
  "mandated_reporter_training",
  "volunteer_orientation",
  "staff_handbook_acknowledgment",
  "confidentiality_agreement",
  "emergency_procedures_training",
  "other",
] as const;

export type RequirementType = typeof REQUIREMENT_TYPES[number];

export const REQUIREMENT_LABELS: Record<RequirementType, string> = {
  background_screening:          "Background Screening",
  child_safety_training:         "Child Safety Training",
  cpr_certification:             "CPR Certification",
  first_aid_certification:       "First Aid Certification",
  mandated_reporter_training:    "Mandated Reporter Training",
  volunteer_orientation:         "Volunteer Orientation",
  staff_handbook_acknowledgment: "Staff Handbook Acknowledgment",
  confidentiality_agreement:     "Confidentiality Agreement",
  emergency_procedures_training: "Emergency Procedures Training",
  other:                         "Other / Custom",
};

export const VERIFICATION_STATUSES = [
  "not_started",
  "pending",
  "current",
  "expiring_soon",
  "expired",
  "waived",
  "not_required",
] as const;

export type VerificationStatus = typeof VERIFICATION_STATUSES[number];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  not_started:   "Not Started",
  pending:       "Pending",
  current:       "Current",
  expiring_soon: "Expiring Soon",
  expired:       "Expired",
  waived:        "Waived",
  not_required:  "Not Required",
};

/** Calculate the display status from dates. Call in both UI and server. */
export function calcDisplayStatus(record: {
  verification_status: VerificationStatus;
  expiration_date: string | null;
  completion_date: string | null;
}): VerificationStatus {
  if (
    record.verification_status === "waived" ||
    record.verification_status === "not_required"
  ) {
    return record.verification_status;
  }
  if (!record.completion_date && record.verification_status === "not_started") {
    return "not_started";
  }
  if (record.expiration_date) {
    const today = new Date();
    const exp   = new Date(record.expiration_date);
    const daysUntil = (exp.getTime() - today.getTime()) / 86400000;
    if (daysUntil < 0) return "expired";
    if (daysUntil <= 30) return "expiring_soon";
  }
  if (record.verification_status === "pending") return "pending";
  if (record.verification_status === "current" || record.completion_date) return "current";
  return record.verification_status;
}

/** Default required compliance items by staff_type. */
export const DEFAULT_REQUIREMENTS: Record<string, RequirementType[]> = {
  staff: [
    "background_screening",
    "child_safety_training",
    "cpr_certification",
    "first_aid_certification",
    "staff_handbook_acknowledgment",
    "confidentiality_agreement",
    "emergency_procedures_training",
  ],
  contractor: [
    "background_screening",
    "child_safety_training",
    "confidentiality_agreement",
    "emergency_procedures_training",
  ],
  volunteer: [
    "background_screening",
    "child_safety_training",
    "volunteer_orientation",
    "confidentiality_agreement",
    "emergency_procedures_training",
  ],
};

export const STATUS_BADGE_CFG: Record<VerificationStatus, { cls: string; label: string }> = {
  not_started:   { cls: "bg-sc-gray-100 text-sc-gray border-sc-gray-200",       label: "Not Started"   },
  pending:       { cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",    label: "Pending"       },
  current:       { cls: "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",    label: "Current"       },
  expiring_soon: { cls: "bg-sc-gold-100 text-sc-gold-800 border-sc-gold-300",   label: "Expiring Soon" },
  expired:       { cls: "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200",    label: "Expired"       },
  waived:        { cls: "bg-sc-navy/5 text-sc-navy border-sc-navy/10",           label: "Waived"        },
  not_required:  { cls: "bg-sc-gray-50 text-sc-gray-400 border-sc-gray-100",    label: "Not Required"  },
};
