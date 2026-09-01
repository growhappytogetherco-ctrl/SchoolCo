// Shared finance constants and types — NOT a "use server" file.
// Import from here in client components; import from finance.ts in server actions only.

export type ChargeType = "tuition" | "enrollment_fee" | "ua_fee" | "other_fee";
export type PlanType   = "annual" | "semester" | "quarterly" | "monthly" | "custom" | null;
export type ChargeStatus = "active" | "voided";

export type PaymentSource =
  | "parent_payment" | "step_up_pep" | "step_up_ua" | "aaa"
  | "scholarship" | "cash" | "check" | "card_external" | "other";

export type AdjustmentType = "credit" | "discount" | "scholarship" | "waiver" | "other";

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  tuition:        "Tuition",
  enrollment_fee: "Enrollment Fee",
  ua_fee:         "UA Fee",
  other_fee:      "Other Fee",
};

export const PAYMENT_SOURCE_LABELS: Record<PaymentSource, string> = {
  parent_payment: "Parent Payment",
  step_up_pep:    "Step Up / PEP",
  step_up_ua:     "Step Up / UA",
  aaa:            "AAA",
  scholarship:    "Scholarship",
  cash:           "Cash",
  check:          "Check",
  card_external:  "Card / External",
  other:          "Other",
};

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  credit:      "Credit",
  discount:    "Discount",
  scholarship: "Scholarship",
  waiver:      "Fee Waiver",
  other:       "Other Adjustment",
};

export interface SchoolYear {
  id:         string;
  label:      string;
  start_date: string;
  end_date:   string;
  is_current: boolean;
}

export interface ChargeAdjustment {
  id:              string;
  charge_id:       string;
  adjustment_type: AdjustmentType;
  amount:          number;
  description:     string;
  notes:           string | null;
  status:          ChargeStatus;
  created_by_name: string | null;
  created_at:      string;
}

export interface PaymentAllocationRow {
  id:         string;
  charge_id:  string;
  amount:     number;
  charge_description: string;
  charge_type:        ChargeType;
}

export interface PaymentRecord {
  id:              string;
  student_id:      string;
  school_year_id:  string;
  payment_date:    string;
  amount:          number;
  payment_source:  PaymentSource;
  reference_number: string | null;
  notes:           string | null;
  status:          ChargeStatus;
  allocations:     PaymentAllocationRow[];
  created_by_name: string | null;
  created_at:      string;
}

export interface StudentCharge {
  id:                 string;
  student_id:         string;
  school_year_id:     string;
  charge_type:        ChargeType;
  description:        string;
  original_amount:    number;
  effective_amount:   number;
  paid_amount:        number;
  balance:            number;
  due_date:           string | null;
  plan_type:          PlanType;
  installment_number: number | null;
  status:             ChargeStatus;
  notes:              string | null;
  adjustments:        ChargeAdjustment[];
  created_by_name:    string | null;
  created_at:         string;
}

export interface StudentFinanceSummary {
  school_year:         SchoolYear;
  total_charged:       number;
  total_paid:          number;
  balance_due:         number;
  past_due:            number;
  next_due_amount:     number | null;
  next_due_date:       string | null;
  finance_status:      "paid_in_full" | "current" | "due_soon" | "past_due" | "not_configured";
  charges:             StudentCharge[];
  payments:            PaymentRecord[];
}

export interface ARStudentRow {
  student_id:    string;
  student_name:  string;
  grade_level:   string | null;
  total_charged: number;
  total_paid:    number;
  balance_due:   number;
  past_due:      number;
  finance_status: string;
}

export interface ARSummary {
  total_charged:     number;
  total_collected:   number;
  total_outstanding: number;
  total_past_due:    number;
  students:          ARStudentRow[];
}

export interface PaymentSourceRow {
  payment_source: PaymentSource;
  total_amount:   number;
  payment_count:  number;
}

export interface PaymentWithAllocations {
  orgId:          string;
  studentId:      string;
  schoolYearId:   string;
  paymentDate:    string;
  amount:         number;
  paymentSource:  PaymentSource;
  referenceNumber: string | null;
  notes:          string | null;
  allocations:    { chargeId: string; amount: number }[];
}
