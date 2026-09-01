"use server";

/**
 * Student Finance Management — server actions.
 *
 * Security model:
 *   - has_finance_view_access: full_admin, platform_admin, can_view_finances, can_manage_finances
 *   - has_finance_manage_access: full_admin, platform_admin, can_manage_finances
 *   - Enforced in both RLS (DB layer) and application guards (defense-in-depth)
 *   - All mutations call logAudit()
 *
 * Balance calculation (never stored):
 *   effective_amount = original_amount + sum(adjustments where status=active)
 *   paid_toward     = sum(payment_allocations for this charge where payment.status=active)
 *   charge_balance  = effective_amount - paid_toward
 */

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import { resolveProfileId } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

// ── Types ─────────────────────────────────────────────────────────────────

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
  effective_amount:   number;  // original + adjustments (computed)
  paid_amount:        number;  // sum of valid allocations (computed)
  balance:            number;  // effective - paid
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

// ── Auth guards ───────────────────────────────────────────────────────────

const FINANCE_MANAGE_ROLES = new Set(["full_admin", "platform_admin"]);

async function assertFinanceView() {
  const [user, orgId, role] = await Promise.all([getUser(), getActiveOrgId(), getActiveRole()]);
  if (!user || !orgId) return { ok: false as const, error: "Not authenticated." };

  if (FINANCE_MANAGE_ROLES.has(role ?? "")) {
    return { ok: true as const, user, orgId, role: role! };
  }
  // Check explicit permission
  const supabase = await createClient();
  const profileId = await resolveProfileId(user.id);
  const { data: mem } = await supabase
    .from("organization_members")
    .select("can_view_finances, can_manage_finances, role")
    .eq("profile_id", profileId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const memData = mem as unknown as { can_view_finances: boolean; can_manage_finances: boolean } | null;
  if (!memData || (!memData.can_view_finances && !memData.can_manage_finances)) {
    return { ok: false as const, error: "Finance access required." };
  }
  return { ok: true as const, user, orgId, role: role! };
}

async function assertFinanceManage() {
  const [user, orgId, role] = await Promise.all([getUser(), getActiveOrgId(), getActiveRole()]);
  if (!user || !orgId) return { ok: false as const, error: "Not authenticated." };

  if (FINANCE_MANAGE_ROLES.has(role ?? "")) {
    return { ok: true as const, user, orgId, role: role! };
  }
  const supabase = await createClient();
  const profileId = await resolveProfileId(user.id);
  const { data: mem } = await supabase
    .from("organization_members")
    .select("can_manage_finances")
    .eq("profile_id", profileId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const memData2 = mem as unknown as { can_manage_finances: boolean } | null;
  if (!memData2?.can_manage_finances) {
    return { ok: false as const, error: "Finance management access required." };
  }
  return { ok: true as const, user, orgId, role: role! };
}

// ── School years ──────────────────────────────────────────────────────────

export async function getSchoolYears(): Promise<SchoolYear[]> {
  const auth = await assertFinanceView();
  if (!auth.ok) {
    console.error("[finance.getSchoolYears] assertFinanceView failed:", auth.error);
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_years")
    .select("id, label, start_date, end_date, is_current")
    .eq("organization_id", auth.orgId)
    .order("start_date", { ascending: false });

  if (error) console.error("[finance.getSchoolYears] query error:", error.message, "orgId:", auth.orgId);
  if (!error && (!data || data.length === 0)) console.error("[finance.getSchoolYears] 0 rows for orgId:", auth.orgId);

  return ((data ?? []) as unknown as SchoolYear[]);
}

export async function getCurrentSchoolYear(): Promise<SchoolYear | null> {
  const years = await getSchoolYears();
  return years.find((y) => y.is_current) ?? years[0] ?? null;
}

// ── Charges ───────────────────────────────────────────────────────────────

export async function addCharge(payload: {
  studentId:          string;
  schoolYearId:       string;
  chargeType:         ChargeType;
  description:        string;
  amount:             number;
  dueDate:            string | null;
  planType:           PlanType;
  installmentNumber:  number | null;
  notes:              string | null;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await assertFinanceManage();
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = await createClient();
  const profileId = await resolveProfileId(auth.user.id);

  const { data, error } = await supabase
    .from("student_charges")
    .insert({
      organization_id:    auth.orgId,
      student_id:         payload.studentId,
      school_year_id:     payload.schoolYearId,
      charge_type:        payload.chargeType,
      description:        payload.description,
      original_amount:    payload.amount,
      due_date:           payload.dueDate || null,
      plan_type:          payload.planType || null,
      installment_number: payload.installmentNumber || null,
      notes:              payload.notes || null,
      created_by:         profileId,
      updated_by:         profileId,
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to add charge." };
  await logAudit({
    organization_id: auth.orgId,
    actor_id:        auth.user.id,
    action:          "student_charge.create",
    resource_type:   "student_charge",
    resource_id:     (data as unknown as { id: string }).id,
    metadata: { charge_type: payload.chargeType, amount: payload.amount, student_id: payload.studentId },
  });
  revalidatePath(`/dashboard/students/${payload.studentId}`);
  return { success: true, id: (data as unknown as { id: string }).id };
}

export async function voidCharge(chargeId: string, reason: string): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await assertFinanceManage();
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = await createClient();
  const profileId = await resolveProfileId(auth.user.id);

  // Verify it belongs to this org
  const { data: charge } = await supabase
    .from("student_charges")
    .select("student_id, organization_id, status")
    .eq("id", chargeId)
    .eq("organization_id", auth.orgId)
    .single();

  if (!charge) return { success: false, error: "Charge not found." };
  if ((charge as unknown as { status: string }).status === "voided") return { success: false, error: "Already voided." };

  const { error } = await supabase
    .from("student_charges")
    .update({ status: "voided", void_reason: reason, voided_by: profileId, voided_at: new Date().toISOString() } as never)
    .eq("id", chargeId);

  if (error) return { success: false, error: error.message };
  await logAudit({ organization_id: auth.orgId, actor_id: auth.user.id, action: "student_charge.void", resource_type: "student_charge", resource_id: chargeId, metadata: { reason } });
  revalidatePath(`/dashboard/students/${(charge as unknown as { student_id: string }).student_id}`);
  return { success: true };
}

export async function updateCharge(chargeId: string, payload: {
  description?: string;
  amount?:      number;
  dueDate?:     string | null;
  notes?:       string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await assertFinanceManage();
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = await createClient();
  const profileId = await resolveProfileId(auth.user.id);

  const { data: charge } = await supabase
    .from("student_charges")
    .select("student_id")
    .eq("id", chargeId)
    .eq("organization_id", auth.orgId)
    .single();
  if (!charge) return { success: false, error: "Charge not found." };

  const update: Record<string, unknown> = { updated_by: profileId };
  if (payload.description !== undefined) update.description     = payload.description;
  if (payload.amount      !== undefined) update.original_amount = payload.amount;
  if (payload.dueDate     !== undefined) update.due_date        = payload.dueDate || null;
  if (payload.notes       !== undefined) update.notes           = payload.notes || null;

  const { error } = await supabase.from("student_charges").update(update as never).eq("id", chargeId);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/dashboard/students/${(charge as unknown as { student_id: string }).student_id}`);
  return { success: true };
}

// ── Adjustments ───────────────────────────────────────────────────────────

export async function addAdjustment(payload: {
  chargeId:       string;
  adjustmentType: AdjustmentType;
  amount:         number;     // negative = reduction
  description:    string;
  notes:          string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await assertFinanceManage();
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = await createClient();
  const profileId = await resolveProfileId(auth.user.id);

  // Verify charge belongs to this org
  const { data: charge } = await supabase
    .from("student_charges")
    .select("student_id")
    .eq("id", payload.chargeId)
    .eq("organization_id", auth.orgId)
    .single();
  if (!charge) return { success: false, error: "Charge not found." };

  const { error } = await supabase
    .from("charge_adjustments")
    .insert({
      organization_id:  auth.orgId,
      charge_id:        payload.chargeId,
      adjustment_type:  payload.adjustmentType,
      amount:           payload.amount,
      description:      payload.description,
      notes:            payload.notes || null,
      created_by:       profileId,
    } as never);

  if (error) return { success: false, error: error.message };
  await logAudit({ organization_id: auth.orgId, actor_id: auth.user.id, action: "charge_adjustment.create", resource_type: "student_charge", resource_id: payload.chargeId, metadata: { type: payload.adjustmentType, amount: payload.amount } });
  revalidatePath(`/dashboard/students/${(charge as unknown as { student_id: string }).student_id}`);
  return { success: true };
}

export async function voidAdjustment(adjustmentId: string, reason: string): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await assertFinanceManage();
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = await createClient();
  const profileId = await resolveProfileId(auth.user.id);

  const { error } = await supabase
    .from("charge_adjustments")
    .update({ status: "voided", void_reason: reason, voided_by: profileId, voided_at: new Date().toISOString() } as never)
    .eq("id", adjustmentId)
    .eq("organization_id", auth.orgId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Payments ──────────────────────────────────────────────────────────────

export interface PaymentWithAllocations {
  studentId:      string;
  schoolYearId:   string;
  paymentDate:    string;
  amount:         number;
  paymentSource:  PaymentSource;
  referenceNumber: string | null;
  notes:          string | null;
  allocations:    { chargeId: string; amount: number }[];
}

export async function recordPayment(payload: PaymentWithAllocations): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await assertFinanceManage();
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = await createClient();
  const profileId = await resolveProfileId(auth.user.id);

  // Validate allocation total ≤ payment amount
  const allocTotal = payload.allocations.reduce((s, a) => s + a.amount, 0);
  if (allocTotal > payload.amount + 0.01) {
    return { success: false, error: "Allocated amount exceeds payment amount." };
  }

  // Insert payment
  const { data: payment, error: payErr } = await supabase
    .from("student_payments")
    .insert({
      organization_id:  auth.orgId,
      student_id:       payload.studentId,
      school_year_id:   payload.schoolYearId,
      payment_date:     payload.paymentDate,
      amount:           payload.amount,
      payment_source:   payload.paymentSource,
      reference_number: payload.referenceNumber || null,
      notes:            payload.notes || null,
      created_by:       profileId,
      updated_by:       profileId,
    } as never)
    .select("id")
    .single();

  if (payErr || !payment) return { success: false, error: payErr?.message ?? "Failed to record payment." };
  const paymentId = (payment as unknown as { id: string }).id;

  // Insert allocations
  if (payload.allocations.length > 0) {
    const allocRows = payload.allocations
      .filter((a) => a.amount > 0)
      .map((a) => ({ payment_id: paymentId, charge_id: a.chargeId, amount: a.amount, created_by: profileId }));

    const { error: allocErr } = await supabase.from("payment_allocations").insert(allocRows as never);
    if (allocErr) return { success: false, error: allocErr.message };
  }

  await logAudit({ organization_id: auth.orgId, actor_id: auth.user.id, action: "student_payment.create", resource_type: "student_payment", resource_id: paymentId, metadata: { amount: payload.amount, source: payload.paymentSource, student_id: payload.studentId } });
  revalidatePath(`/dashboard/students/${payload.studentId}`);
  revalidatePath("/dashboard/reports");
  return { success: true, id: paymentId };
}

export async function voidPayment(paymentId: string, reason: string): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await assertFinanceManage();
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = await createClient();
  const profileId = await resolveProfileId(auth.user.id);

  const { data: payment } = await supabase
    .from("student_payments")
    .select("student_id, status")
    .eq("id", paymentId)
    .eq("organization_id", auth.orgId)
    .single();

  if (!payment) return { success: false, error: "Payment not found." };
  if ((payment as unknown as { status: string }).status === "voided") return { success: false, error: "Already voided." };

  const { error } = await supabase
    .from("student_payments")
    .update({ status: "voided", void_reason: reason, voided_by: profileId, voided_at: new Date().toISOString() } as never)
    .eq("id", paymentId);

  if (error) return { success: false, error: error.message };
  await logAudit({ organization_id: auth.orgId, actor_id: auth.user.id, action: "student_payment.void", resource_type: "student_payment", resource_id: paymentId, metadata: { reason } });
  revalidatePath(`/dashboard/students/${(payment as unknown as { student_id: string }).student_id}`);
  return { success: true };
}

// ── Finance summary (core calculation) ───────────────────────────────────

function fmt(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function getStudentFinanceSummary(
  studentId: string,
  schoolYearId: string,
): Promise<StudentFinanceSummary | null> {
  const auth = await assertFinanceView();
  if (!auth.ok) return null;

  const supabase = await createClient();

  // Fetch school year
  const { data: year } = await supabase
    .from("school_years")
    .select("id, label, start_date, end_date, is_current")
    .eq("id", schoolYearId)
    .eq("organization_id", auth.orgId)
    .single();
  if (!year) return null;

  // Fetch charges
  const { data: rawCharges } = await supabase
    .from("student_charges")
    .select("id, charge_type, description, original_amount, due_date, plan_type, installment_number, status, notes, created_at, created_by")
    .eq("student_id", studentId)
    .eq("school_year_id", schoolYearId)
    .eq("organization_id", auth.orgId)
    .order("created_at");

  // Fetch adjustments for these charges
  const chargeIds = ((rawCharges ?? []) as unknown as { id: string }[]).map((c) => c.id);
  let rawAdjustments: unknown[] = [];
  if (chargeIds.length > 0) {
    const { data } = await supabase
      .from("charge_adjustments")
      .select("id, charge_id, adjustment_type, amount, description, notes, status, created_at, created_by")
      .in("charge_id", chargeIds)
      .eq("organization_id", auth.orgId);
    rawAdjustments = (data ?? []) as unknown[];
  }

  // Fetch payment allocations for these charges
  let rawAllocations: unknown[] = [];
  if (chargeIds.length > 0) {
    const { data } = await supabase
      .from("payment_allocations")
      .select("id, charge_id, amount, payment_id")
      .in("charge_id", chargeIds);
    rawAllocations = (data ?? []) as unknown[];
  }

  // Fetch payments (to check status and for UI display)
  const { data: rawPayments } = await supabase
    .from("student_payments")
    .select("id, payment_date, amount, payment_source, reference_number, notes, status, created_at, created_by")
    .eq("student_id", studentId)
    .eq("school_year_id", schoolYearId)
    .eq("organization_id", auth.orgId)
    .order("payment_date", { ascending: false });

  // Build set of voided payment IDs
  const voidedPaymentIds = new Set(
    ((rawPayments ?? []) as unknown as { id: string; status: string }[])
      .filter((p) => p.status === "voided")
      .map((p) => p.id)
  );

  // Map adjustments by charge_id
  type RawAdj = { id: string; charge_id: string; adjustment_type: string; amount: number; description: string; notes: string | null; status: string; created_at: string; created_by: string | null };
  const adjByCharge = new Map<string, RawAdj[]>();
  for (const adj of rawAdjustments as RawAdj[]) {
    if (!adjByCharge.has(adj.charge_id)) adjByCharge.set(adj.charge_id, []);
    adjByCharge.get(adj.charge_id)!.push(adj);
  }

  // Map allocations by charge_id (only active payments)
  type RawAlloc = { id: string; charge_id: string; amount: number; payment_id: string };
  const paidByCharge = new Map<string, number>();
  for (const alloc of rawAllocations as RawAlloc[]) {
    if (!voidedPaymentIds.has(alloc.payment_id)) {
      paidByCharge.set(alloc.charge_id, (paidByCharge.get(alloc.charge_id) ?? 0) + alloc.amount);
    }
  }

  type RawCharge = { id: string; charge_type: string; description: string; original_amount: number; due_date: string | null; plan_type: string | null; installment_number: number | null; status: string; notes: string | null; created_at: string; created_by: string | null };

  const today = new Date().toISOString().split("T")[0];

  // Build charge objects
  const charges: StudentCharge[] = ((rawCharges ?? []) as unknown as RawCharge[]).map((c) => {
    const adjs = adjByCharge.get(c.id) ?? [];
    const adjSum = adjs.filter((a) => a.status === "active").reduce((s, a) => s + a.amount, 0);
    const effectiveAmount = fmt(c.original_amount + adjSum);
    const paidAmount = fmt(paidByCharge.get(c.id) ?? 0);
    const balance = fmt(effectiveAmount - paidAmount);

    return {
      id:                 c.id,
      student_id:         studentId,
      school_year_id:     schoolYearId,
      charge_type:        c.charge_type as ChargeType,
      description:        c.description,
      original_amount:    c.original_amount,
      effective_amount:   effectiveAmount,
      paid_amount:        paidAmount,
      balance:            balance,
      due_date:           c.due_date,
      plan_type:          (c.plan_type ?? null) as PlanType,
      installment_number: c.installment_number,
      status:             c.status as ChargeStatus,
      notes:              c.notes,
      adjustments: adjs.map((a) => ({
        id:              a.id,
        charge_id:       a.charge_id,
        adjustment_type: a.adjustment_type as AdjustmentType,
        amount:          a.amount,
        description:     a.description,
        notes:           a.notes,
        status:          a.status as ChargeStatus,
        created_by_name: null,
        created_at:      a.created_at,
      })),
      created_by_name: null,
      created_at:      c.created_at,
    };
  });

  // Fetch payment allocations for the payments display
  const paymentIds = ((rawPayments ?? []) as unknown as { id: string }[]).map((p) => p.id);
  let paymentAllocMap = new Map<string, PaymentAllocationRow[]>();
  if (paymentIds.length > 0) {
    const { data: pa } = await supabase
      .from("payment_allocations")
      .select("id, payment_id, charge_id, amount")
      .in("payment_id", paymentIds);
    for (const a of (pa ?? []) as unknown as { id: string; payment_id: string; charge_id: string; amount: number }[]) {
      if (!paymentAllocMap.has(a.payment_id)) paymentAllocMap.set(a.payment_id, []);
      const charge = charges.find((c) => c.id === a.charge_id);
      paymentAllocMap.get(a.payment_id)!.push({
        id:                 a.id,
        charge_id:          a.charge_id,
        amount:             a.amount,
        charge_description: charge?.description ?? "Unlinked",
        charge_type:        charge?.charge_type ?? "other_fee",
      });
    }
  }

  type RawPayment = { id: string; payment_date: string; amount: number; payment_source: string; reference_number: string | null; notes: string | null; status: string; created_at: string; created_by: string | null };

  const payments: PaymentRecord[] = ((rawPayments ?? []) as unknown as RawPayment[]).map((p) => ({
    id:               p.id,
    student_id:       studentId,
    school_year_id:   schoolYearId,
    payment_date:     p.payment_date,
    amount:           p.amount,
    payment_source:   p.payment_source as PaymentSource,
    reference_number: p.reference_number,
    notes:            p.notes,
    status:           p.status as ChargeStatus,
    allocations:      paymentAllocMap.get(p.id) ?? [],
    created_by_name:  null,
    created_at:       p.created_at,
  }));

  // Calculate totals (active charges only)
  const activeCharges = charges.filter((c) => c.status === "active");
  const totalCharged  = fmt(activeCharges.reduce((s, c) => s + c.effective_amount, 0));
  const totalPaid     = fmt(activeCharges.reduce((s, c) => s + c.paid_amount, 0));
  const balanceDue    = fmt(totalCharged - totalPaid);

  // Past due: active charges where due_date < today and balance > 0
  const pastDue = fmt(activeCharges
    .filter((c) => c.due_date && c.due_date < today && c.balance > 0)
    .reduce((s, c) => s + c.balance, 0));

  // Next due: earliest future charge with balance > 0
  const upcoming = activeCharges
    .filter((c) => c.due_date && c.due_date >= today && c.balance > 0)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

  const nextDueAmount = upcoming[0]?.balance ?? null;
  const nextDueDate   = upcoming[0]?.due_date ?? null;

  // Finance status
  let finance_status: StudentFinanceSummary["finance_status"] = "not_configured";
  if (activeCharges.length > 0) {
    if (pastDue > 0) {
      finance_status = "past_due";
    } else if (balanceDue <= 0) {
      finance_status = "paid_in_full";
    } else if (nextDueDate) {
      const daysUntilDue = (new Date(nextDueDate).getTime() - new Date(today).getTime()) / 86400000;
      finance_status = daysUntilDue <= 14 ? "due_soon" : "current";
    } else {
      finance_status = "current";
    }
  }

  return {
    school_year:     year as unknown as SchoolYear,
    total_charged:   totalCharged,
    total_paid:      totalPaid,
    balance_due:     balanceDue,
    past_due:        pastDue,
    next_due_amount: nextDueAmount,
    next_due_date:   nextDueDate,
    finance_status,
    charges,
    payments,
  };
}

// ── Finance permission check for UI ──────────────────────────────────────

export async function checkFinanceAccess(): Promise<{ canView: boolean; canManage: boolean }> {
  const [user, orgId, role] = await Promise.all([getUser(), getActiveOrgId(), getActiveRole()]);
  if (!user || !orgId) return { canView: false, canManage: false };

  if (FINANCE_MANAGE_ROLES.has(role ?? "")) return { canView: true, canManage: true };

  const supabase = await createClient();
  const profileId = await resolveProfileId(user.id);
  const { data: mem } = await supabase
    .from("organization_members")
    .select("can_view_finances, can_manage_finances")
    .eq("profile_id", profileId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const memData = mem as unknown as { can_view_finances: boolean; can_manage_finances: boolean } | null;
  return {
    canView:   !!(memData?.can_view_finances || memData?.can_manage_finances),
    canManage: !!memData?.can_manage_finances,
  };
}

// ── Finance reports ───────────────────────────────────────────────────────

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

export async function getARSummary(schoolYearId: string): Promise<ARSummary | null> {
  const auth = await assertFinanceView();
  if (!auth.ok) return null;

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // Get all active charges for the school year
  const { data: charges } = await supabase
    .from("student_charges")
    .select("id, student_id, original_amount, due_date")
    .eq("organization_id", auth.orgId)
    .eq("school_year_id", schoolYearId)
    .eq("status", "active");

  if (!charges || charges.length === 0) {
    return { total_charged: 0, total_collected: 0, total_outstanding: 0, total_past_due: 0, students: [] };
  }

  type RawCharge = { id: string; student_id: string; original_amount: number; due_date: string | null };
  const chargeList = charges as unknown as RawCharge[];
  const chargeIds = chargeList.map((c) => c.id);

  // Get adjustments
  const { data: adjs } = await supabase
    .from("charge_adjustments")
    .select("charge_id, amount")
    .in("charge_id", chargeIds)
    .eq("status", "active");

  // Get all allocations (payments not voided)
  const { data: allocs } = await supabase
    .from("payment_allocations")
    .select("charge_id, amount, payment_id")
    .in("charge_id", chargeIds);

  // Get voided payment IDs
  const paymentIds = Array.from(new Set(((allocs ?? []) as unknown as { payment_id: string }[]).map((a) => a.payment_id)));
  let voidedPIds = new Set<string>();
  if (paymentIds.length > 0) {
    const { data: vp } = await supabase
      .from("student_payments")
      .select("id")
      .in("id", paymentIds)
      .eq("status", "voided");
    voidedPIds = new Set(((vp ?? []) as unknown as { id: string }[]).map((p) => p.id));
  }

  // Get student names
  const studentIds = Array.from(new Set(chargeList.map((c) => c.student_id)));
  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name, preferred_name, grade_level")
    .in("id", studentIds);

  type Student = { id: string; first_name: string; last_name: string; preferred_name: string | null; grade_level: string | null };
  const studentMap = new Map<string, Student>();
  for (const s of (students ?? []) as unknown as Student[]) studentMap.set(s.id, s);

  type RawAdj = { charge_id: string; amount: number };
  const adjSumByCharge = new Map<string, number>();
  for (const a of (adjs ?? []) as unknown as RawAdj[]) {
    adjSumByCharge.set(a.charge_id, (adjSumByCharge.get(a.charge_id) ?? 0) + a.amount);
  }

  type RawAlloc = { charge_id: string; amount: number; payment_id: string };
  const paidByCharge = new Map<string, number>();
  for (const a of (allocs ?? []) as unknown as RawAlloc[]) {
    if (!voidedPIds.has(a.payment_id)) {
      paidByCharge.set(a.charge_id, (paidByCharge.get(a.charge_id) ?? 0) + a.amount);
    }
  }

  // Roll up by student
  const byStudent = new Map<string, { charged: number; paid: number; pastDue: number }>();
  for (const c of chargeList) {
    const adj = adjSumByCharge.get(c.id) ?? 0;
    const eff = c.original_amount + adj;
    const paid = paidByCharge.get(c.id) ?? 0;
    const balance = eff - paid;
    const isPastDue = !!c.due_date && c.due_date < today && balance > 0;

    if (!byStudent.has(c.student_id)) byStudent.set(c.student_id, { charged: 0, paid: 0, pastDue: 0 });
    const row = byStudent.get(c.student_id)!;
    row.charged  += eff;
    row.paid     += paid;
    if (isPastDue) row.pastDue += balance;
  }

  const rows: ARStudentRow[] = [];
  for (const [sid, totals] of Array.from(byStudent.entries())) {
    const s = studentMap.get(sid);
    const name = s ? (s.preferred_name ? `${s.preferred_name} ${s.last_name}` : `${s.first_name} ${s.last_name}`) : "Unknown";
    const balance = fmt(totals.charged - totals.paid);
    const pastDue = fmt(totals.pastDue);
    let status = "not_configured";
    if (totals.charged > 0) {
      if (pastDue > 0) status = "past_due";
      else if (balance <= 0) status = "paid_in_full";
      else status = "current";
    }
    rows.push({
      student_id:     sid,
      student_name:   name,
      grade_level:    s?.grade_level ?? null,
      total_charged:  fmt(totals.charged),
      total_paid:     fmt(totals.paid),
      balance_due:    balance,
      past_due:       pastDue,
      finance_status: status,
    });
  }

  rows.sort((a, b) => b.balance_due - a.balance_due);

  const totalCharged   = fmt(rows.reduce((s, r) => s + r.total_charged, 0));
  const totalCollected = fmt(rows.reduce((s, r) => s + r.total_paid, 0));

  return {
    total_charged:     totalCharged,
    total_collected:   totalCollected,
    total_outstanding: fmt(totalCharged - totalCollected),
    total_past_due:    fmt(rows.reduce((s, r) => s + r.past_due, 0)),
    students:          rows,
  };
}

export async function getPaymentSourceReport(schoolYearId: string): Promise<PaymentSourceRow[]> {
  const auth = await assertFinanceView();
  if (!auth.ok) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("student_payments")
    .select("payment_source, amount")
    .eq("organization_id", auth.orgId)
    .eq("school_year_id", schoolYearId)
    .eq("status", "active");

  const bySource = new Map<string, { total: number; count: number }>();
  for (const p of (data ?? []) as unknown as { payment_source: string; amount: number }[]) {
    if (!bySource.has(p.payment_source)) bySource.set(p.payment_source, { total: 0, count: 0 });
    const row = bySource.get(p.payment_source)!;
    row.total += p.amount;
    row.count += 1;
  }

  return Array.from(bySource.entries())
    .map(([source, { total, count }]) => ({
      payment_source: source as PaymentSource,
      total_amount:   fmt(total),
      payment_count:  count,
    }))
    .sort((a, b) => b.total_amount - a.total_amount);
}

export async function getPastDueReport(schoolYearId: string): Promise<ARStudentRow[]> {
  const summary = await getARSummary(schoolYearId);
  if (!summary) return [];
  return summary.students.filter((s) => s.past_due > 0).sort((a, b) => b.past_due - a.past_due);
}
