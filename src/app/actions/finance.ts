"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { resolveProfileId } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export type {
  ChargeType, PlanType, ChargeStatus, PaymentSource, AdjustmentType,
  SchoolYear, ChargeAdjustment, PaymentAllocationRow, PaymentRecord,
  StudentCharge, StudentFinanceSummary, ARStudentRow, ARSummary, PaymentSourceRow,
  PaymentWithAllocations,
} from "./finance-constants";

import type {
  ChargeType, PlanType, ChargeStatus, PaymentSource, AdjustmentType,
  SchoolYear, ChargeAdjustment, PaymentAllocationRow, PaymentRecord,
  StudentCharge, StudentFinanceSummary, ARStudentRow, ARSummary, PaymentSourceRow,
  PaymentWithAllocations,
} from "./finance-constants";

// ── Auth guards ───────────────────────────────────────────────────────────
//
// These accept orgId as an explicit parameter because sc_active_org cookies
// are not reliably readable when server actions are called from client
// components. getUser() works (reads Supabase auth tokens); our custom
// cookies do not. The caller passes orgId from their server-component context.
//
// Finance access is ALWAYS explicit — no role grants it automatically.
// can_view_finances = true  → read-only
// can_manage_finances = true → full read+write

async function assertFinanceView(orgId: string) {
  const user = await getUser();
  if (!user || !orgId) return { ok: false as const, error: "Not authenticated." };

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
  if (!memData) return { ok: false as const, error: "Not a member of this organization." };

  const hasAccess = memData.can_view_finances || memData.can_manage_finances;
  if (!hasAccess) return { ok: false as const, error: "Finance access required." };

  return { ok: true as const, user, orgId };
}

async function assertFinanceManage(orgId: string) {
  const user = await getUser();
  if (!user || !orgId) return { ok: false as const, error: "Not authenticated." };

  const supabase = await createClient();
  const profileId = await resolveProfileId(user.id);
  const { data: mem } = await supabase
    .from("organization_members")
    .select("can_manage_finances")
    .eq("profile_id", profileId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const memData = mem as unknown as { can_manage_finances: boolean } | null;
  if (!memData) return { ok: false as const, error: "Not a member of this organization." };

  if (!memData.can_manage_finances) return { ok: false as const, error: "Finance management access required." };

  return { ok: true as const, user, orgId };
}

// ── School years ──────────────────────────────────────────────────────────

export async function getSchoolYears(orgId: string): Promise<SchoolYear[]> {
  const auth = await assertFinanceView(orgId);
  if (!auth.ok) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("school_years")
    .select("id, label, start_date, end_date, is_current")
    .eq("organization_id", orgId)
    .order("start_date", { ascending: false });

  return ((data ?? []) as unknown as SchoolYear[]);
}

export async function getCurrentSchoolYear(orgId: string): Promise<SchoolYear | null> {
  const years = await getSchoolYears(orgId);
  return years.find((y) => y.is_current) ?? years[0] ?? null;
}

// ── Charges ───────────────────────────────────────────────────────────────

export async function addCharge(payload: {
  orgId:              string;
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
  const auth = await assertFinanceManage(payload.orgId);
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = await createClient();
  const profileId = await resolveProfileId(auth.user.id);

  const { data, error } = await supabase
    .from("student_charges")
    .insert({
      organization_id:       auth.orgId,
      student_id:            payload.studentId,
      school_year_id:        payload.schoolYearId,
      charge_type:           payload.chargeType,
      description:           payload.description,
      original_amount:       payload.amount,
      original_amount_cents: Math.round(payload.amount * 100),
      due_date:              payload.dueDate || null,
      plan_type:             payload.planType || null,
      installment_number:    payload.installmentNumber || null,
      notes:                 payload.notes || null,
      created_by:            profileId,
      updated_by:            profileId,
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

export async function voidCharge(chargeId: string, reason: string, orgId: string): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await assertFinanceManage(orgId);
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
  orgId:        string;
  description?: string;
  amount?:      number;
  dueDate?:     string | null;
  notes?:       string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await assertFinanceManage(payload.orgId);
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
  if (payload.description !== undefined) update.description             = payload.description;
  if (payload.amount      !== undefined) {
    update.original_amount       = payload.amount;
    update.original_amount_cents = Math.round(payload.amount * 100);
  }
  if (payload.dueDate     !== undefined) update.due_date        = payload.dueDate || null;
  if (payload.notes       !== undefined) update.notes           = payload.notes || null;

  const { error } = await supabase.from("student_charges").update(update as never).eq("id", chargeId);
  if (error) return { success: false, error: error.message };
  revalidatePath(`/dashboard/students/${(charge as unknown as { student_id: string }).student_id}`);
  return { success: true };
}

// ── Adjustments ───────────────────────────────────────────────────────────

export async function addAdjustment(payload: {
  orgId:          string;
  chargeId:       string;
  adjustmentType: AdjustmentType;
  amount:         number;     // negative = reduction
  description:    string;
  notes:          string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await assertFinanceManage(payload.orgId);
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
      amount_cents:     Math.round(payload.amount * 100),
      description:      payload.description,
      notes:            payload.notes || null,
      created_by:       profileId,
    } as never);

  if (error) return { success: false, error: error.message };
  await logAudit({ organization_id: auth.orgId, actor_id: auth.user.id, action: "charge_adjustment.create", resource_type: "student_charge", resource_id: payload.chargeId, metadata: { type: payload.adjustmentType, amount: payload.amount } });
  revalidatePath(`/dashboard/students/${(charge as unknown as { student_id: string }).student_id}`);
  return { success: true };
}

export async function voidAdjustment(adjustmentId: string, reason: string, orgId: string): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await assertFinanceManage(orgId);
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

export async function recordPayment(payload: PaymentWithAllocations): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const auth = await assertFinanceManage(payload.orgId);
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = await createClient();
  const profileId = await resolveProfileId(auth.user.id);

  // Validate allocation total ≤ payment amount
  const allocTotal = payload.allocations.reduce((s, a) => s + a.amount, 0);
  if (allocTotal > payload.amount + 0.005) {
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
      amount_cents:     Math.round(payload.amount * 100),
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
      .map((a) => ({ payment_id: paymentId, charge_id: a.chargeId, amount: a.amount, amount_cents: Math.round(a.amount * 100), created_by: profileId }));

    const { error: allocErr } = await supabase.from("payment_allocations").insert(allocRows as never);
    if (allocErr) return { success: false, error: allocErr.message };
  }

  await logAudit({ organization_id: auth.orgId, actor_id: auth.user.id, action: "student_payment.create", resource_type: "student_payment", resource_id: paymentId, metadata: { amount: payload.amount, source: payload.paymentSource, student_id: payload.studentId } });
  revalidatePath(`/dashboard/students/${payload.studentId}`);
  revalidatePath("/dashboard/reports");
  return { success: true, id: paymentId };
}

export async function voidPayment(paymentId: string, reason: string, orgId: string): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await assertFinanceManage(orgId);
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


export async function getStudentFinanceSummary(
  studentId: string,
  schoolYearId: string,
  orgId: string,
): Promise<StudentFinanceSummary | null> {
  const auth = await assertFinanceView(orgId);
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
    .select("id, charge_type, description, original_amount_cents, due_date, plan_type, installment_number, status, notes, created_at, created_by")
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
      .select("id, charge_id, adjustment_type, amount_cents, description, notes, status, created_at, created_by")
      .in("charge_id", chargeIds)
      .eq("organization_id", auth.orgId);
    rawAdjustments = (data ?? []) as unknown[];
  }

  // Fetch payment allocations for these charges
  let rawAllocations: unknown[] = [];
  if (chargeIds.length > 0) {
    const { data } = await supabase
      .from("payment_allocations")
      .select("id, charge_id, amount_cents, payment_id")
      .in("charge_id", chargeIds);
    rawAllocations = (data ?? []) as unknown[];
  }

  // Fetch payments (to check status and for UI display)
  const { data: rawPayments } = await supabase
    .from("student_payments")
    .select("id, payment_date, amount_cents, payment_source, reference_number, notes, status, created_at, created_by")
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
  type RawAdj = { id: string; charge_id: string; adjustment_type: string; amount_cents: number; description: string; notes: string | null; status: string; created_at: string; created_by: string | null };
  const adjByCharge = new Map<string, RawAdj[]>();
  for (const adj of rawAdjustments as RawAdj[]) {
    if (!adjByCharge.has(adj.charge_id)) adjByCharge.set(adj.charge_id, []);
    adjByCharge.get(adj.charge_id)!.push(adj);
  }

  // Map allocations by charge_id (only active payments)
  type RawAlloc = { id: string; charge_id: string; amount_cents: number; payment_id: string };
  const paidByCharge = new Map<string, number>();
  for (const alloc of rawAllocations as RawAlloc[]) {
    if (!voidedPaymentIds.has(alloc.payment_id)) {
      paidByCharge.set(alloc.charge_id, (paidByCharge.get(alloc.charge_id) ?? 0) + alloc.amount_cents);
    }
  }

  type RawCharge = { id: string; charge_type: string; description: string; original_amount_cents: number; due_date: string | null; plan_type: string | null; installment_number: number | null; status: string; notes: string | null; created_at: string; created_by: string | null };

  const today = new Date().toISOString().split("T")[0];

  // Build charge objects
  const charges: StudentCharge[] = ((rawCharges ?? []) as unknown as RawCharge[]).map((c) => {
    const adjs = adjByCharge.get(c.id) ?? [];
    const adjSumCents = adjs.filter((a) => a.status === "active").reduce((s, a) => s + a.amount_cents, 0);
    const effectiveCents = c.original_amount_cents + adjSumCents;
    const paidCents      = paidByCharge.get(c.id) ?? 0;
    const balanceCents   = effectiveCents - paidCents;
    // Convert cents → dollars at the display boundary
    const effectiveAmount = effectiveCents / 100;
    const paidAmount      = paidCents / 100;
    const balance         = balanceCents / 100;

    return {
      id:                 c.id,
      student_id:         studentId,
      school_year_id:     schoolYearId,
      charge_type:        c.charge_type as ChargeType,
      description:        c.description,
      original_amount:    c.original_amount_cents / 100,
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
        amount:          a.amount_cents / 100,
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
      .select("id, payment_id, charge_id, amount_cents")
      .in("payment_id", paymentIds);
    for (const a of (pa ?? []) as unknown as { id: string; payment_id: string; charge_id: string; amount_cents: number }[]) {
      if (!paymentAllocMap.has(a.payment_id)) paymentAllocMap.set(a.payment_id, []);
      const charge = charges.find((c) => c.id === a.charge_id);
      paymentAllocMap.get(a.payment_id)!.push({
        id:                 a.id,
        charge_id:          a.charge_id,
        amount:             a.amount_cents / 100,
        charge_description: charge?.description ?? "Unlinked",
        charge_type:        charge?.charge_type ?? "other_fee",
      });
    }
  }

  type RawPayment = { id: string; payment_date: string; amount_cents: number; payment_source: string; reference_number: string | null; notes: string | null; status: string; created_at: string; created_by: string | null };

  const payments: PaymentRecord[] = ((rawPayments ?? []) as unknown as RawPayment[]).map((p) => ({
    id:               p.id,
    student_id:       studentId,
    school_year_id:   schoolYearId,
    payment_date:     p.payment_date,
    amount:           p.amount_cents / 100,
    payment_source:   p.payment_source as PaymentSource,
    reference_number: p.reference_number,
    notes:            p.notes,
    status:           p.status as ChargeStatus,
    allocations:      paymentAllocMap.get(p.id) ?? [],
    created_by_name:  null,
    created_at:       p.created_at,
  }));

  // Calculate totals (active charges only) — all values in dollars (cents / 100 already applied above)
  const activeCharges = charges.filter((c) => c.status === "active");
  const totalCharged  = Math.round(activeCharges.reduce((s, c) => s + c.effective_amount, 0) * 100) / 100;
  const totalPaid     = Math.round(activeCharges.reduce((s, c) => s + c.paid_amount, 0) * 100) / 100;
  const balanceDue    = Math.round((totalCharged - totalPaid) * 100) / 100;

  // Past due: active charges where due_date < today and balance > 0
  const pastDue = Math.round(activeCharges
    .filter((c) => c.due_date && c.due_date < today && c.balance > 0)
    .reduce((s, c) => s + c.balance, 0) * 100) / 100;

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
  const [user, orgId] = await Promise.all([getUser(), getActiveOrgId()]);
  if (!user || !orgId) return { canView: false, canManage: false };

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

export async function getARSummary(schoolYearId: string, orgId: string): Promise<ARSummary | null> {
  const auth = await assertFinanceView(orgId);
  if (!auth.ok) return null;

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // Get all active charges for the school year
  const { data: charges } = await supabase
    .from("student_charges")
    .select("id, student_id, original_amount_cents, due_date")
    .eq("organization_id", auth.orgId)
    .eq("school_year_id", schoolYearId)
    .eq("status", "active");

  if (!charges || charges.length === 0) {
    return { total_gross_charged: 0, total_adjusted: 0, total_charged: 0, total_collected: 0, total_outstanding: 0, total_past_due: 0, students: [] };
  }

  type RawCharge = { id: string; student_id: string; original_amount_cents: number; due_date: string | null };
  const chargeList = charges as unknown as RawCharge[];
  const chargeIds = chargeList.map((c) => c.id);

  // Get adjustments
  const { data: adjs } = await supabase
    .from("charge_adjustments")
    .select("charge_id, amount_cents")
    .in("charge_id", chargeIds)
    .eq("status", "active");

  // Get all allocations (payments not voided)
  const { data: allocs } = await supabase
    .from("payment_allocations")
    .select("charge_id, amount_cents, payment_id")
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

  // All amounts in integer cents for calculation; convert to dollars on return
  type RawAdj = { charge_id: string; amount_cents: number };
  const adjSumByCharge = new Map<string, number>();
  for (const a of (adjs ?? []) as unknown as RawAdj[]) {
    adjSumByCharge.set(a.charge_id, (adjSumByCharge.get(a.charge_id) ?? 0) + a.amount_cents);
  }

  type RawAlloc = { charge_id: string; amount_cents: number; payment_id: string };
  const paidByCharge = new Map<string, number>();
  for (const a of (allocs ?? []) as unknown as RawAlloc[]) {
    if (!voidedPIds.has(a.payment_id)) {
      paidByCharge.set(a.charge_id, (paidByCharge.get(a.charge_id) ?? 0) + a.amount_cents);
    }
  }

  // Roll up by student (all in cents)
  const byStudent = new Map<string, { chargedCents: number; paidCents: number; pastDueCents: number }>();
  for (const c of chargeList) {
    const adjCents = adjSumByCharge.get(c.id) ?? 0;
    const effCents = c.original_amount_cents + adjCents;
    const paidCents = paidByCharge.get(c.id) ?? 0;
    const balanceCents = effCents - paidCents;
    const isPastDue = !!c.due_date && c.due_date < today && balanceCents > 0;

    if (!byStudent.has(c.student_id)) byStudent.set(c.student_id, { chargedCents: 0, paidCents: 0, pastDueCents: 0 });
    const row = byStudent.get(c.student_id)!;
    row.chargedCents  += effCents;
    row.paidCents     += paidCents;
    if (isPastDue) row.pastDueCents += balanceCents;
  }

  const rows: ARStudentRow[] = [];
  for (const [sid, totals] of Array.from(byStudent.entries())) {
    const s = studentMap.get(sid);
    const name = s ? `${s.first_name} ${s.last_name}` : "Unknown";
    const balance = (totals.chargedCents - totals.paidCents) / 100;
    const pastDue = totals.pastDueCents / 100;
    let status = "not_configured";
    if (totals.chargedCents > 0) {
      if (pastDue > 0) status = "past_due";
      else if (balance <= 0) status = "paid_in_full";
      else status = "current";
    }
    rows.push({
      student_id:     sid,
      student_name:   name,
      grade_level:    s?.grade_level ?? null,
      total_charged:  totals.chargedCents / 100,
      total_paid:     totals.paidCents / 100,
      balance_due:    balance,
      past_due:       pastDue,
      finance_status: status,
    });
  }

  rows.sort((a, b) => b.balance_due - a.balance_due);

  const totalGrossCents  = chargeList.reduce((s, c) => s + c.original_amount_cents, 0);
  const totalAdjCents    = Array.from(adjSumByCharge.values()).reduce((s, v) => s + v, 0); // negative
  const totalCharged     = rows.reduce((s, r) => s + r.total_charged, 0);
  const totalCollected   = rows.reduce((s, r) => s + r.total_paid, 0);

  return {
    total_gross_charged: totalGrossCents / 100,
    total_adjusted:      Math.abs(totalAdjCents) / 100,
    total_charged:       totalCharged,
    total_collected:     totalCollected,
    total_outstanding:   totalCharged - totalCollected,
    total_past_due:      rows.reduce((s, r) => s + r.past_due, 0),
    students:            rows,
  };
}

export async function getPaymentSourceReport(schoolYearId: string, orgId: string): Promise<PaymentSourceRow[]> {
  const auth = await assertFinanceView(orgId);
  if (!auth.ok) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("student_payments")
    .select("payment_source, amount_cents")
    .eq("organization_id", auth.orgId)
    .eq("school_year_id", schoolYearId)
    .eq("status", "active");

  const bySource = new Map<string, { totalCents: number; count: number }>();
  for (const p of (data ?? []) as unknown as { payment_source: string; amount_cents: number }[]) {
    if (!bySource.has(p.payment_source)) bySource.set(p.payment_source, { totalCents: 0, count: 0 });
    const row = bySource.get(p.payment_source)!;
    row.totalCents += p.amount_cents;
    row.count += 1;
  }

  return Array.from(bySource.entries())
    .map(([source, { totalCents, count }]) => ({
      payment_source: source as PaymentSource,
      total_amount:   totalCents / 100,
      payment_count:  count,
    }))
    .sort((a, b) => b.total_amount - a.total_amount);
}

export async function getPastDueReport(schoolYearId: string, orgId: string): Promise<ARStudentRow[]> {
  const summary = await getARSummary(schoolYearId, orgId);
  if (!summary) return [];
  return summary.students.filter((s) => s.past_due > 0).sort((a, b) => b.past_due - a.past_due);
}

// ── Finance dashboard summary (overview totals across all school years) ───

export interface FinanceDashboardSummary {
  gross_charged_cents:    number;
  total_collected_cents:  number;
  total_adjusted_cents:   number;
  outstanding_cents:      number;
  past_due_cents:         number;
  scholarship_cents:      number;
  step_up_pep_cents:      number;
  step_up_ua_cents:       number;
  other_scholarship_cents: number;
  parent_payment_cents:   number;
  active_charge_count:    number;
  student_count:          number;
  current_school_year_id: string | null;
}

export async function getFinanceDashboardSummary(
  orgId: string,
  schoolYearId?: string | null,
): Promise<FinanceDashboardSummary | null> {
  const auth = await assertFinanceView(orgId);
  if (!auth.ok) return null;

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // Resolve school year: use provided ID or fall back to current year
  let resolvedYearId: string | null = schoolYearId ?? null;
  if (!resolvedYearId) {
    const { data: syData } = await supabase
      .from("school_years")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_current", true)
      .maybeSingle();
    resolvedYearId = (syData as any)?.id ?? null;
  }
  const currentYearId = resolvedYearId;

  // Active charges for the selected school year only
  let chargesQuery = supabase
    .from("student_charges")
    .select("id, student_id, original_amount_cents")
    .eq("organization_id", orgId)
    .eq("status", "active");
  if (resolvedYearId) chargesQuery = chargesQuery.eq("school_year_id", resolvedYearId);

  const { data: charges } = await chargesQuery;

  const chargeList = (charges ?? []) as { id: string; student_id: string; original_amount_cents: number }[];
  const chargeIds = chargeList.map((c) => c.id);
  const grossCents = chargeList.reduce((s, c) => s + c.original_amount_cents, 0);
  const uniqueStudents = new Set(chargeList.map((c) => c.student_id)).size;

  // Adjustments on this year's charges only
  let adjCents = 0;
  if (chargeIds.length > 0) {
    const { data: adjs } = await supabase
      .from("charge_adjustments")
      .select("amount_cents")
      .in("charge_id", chargeIds)
      .eq("status", "active");
    adjCents = ((adjs ?? []) as { amount_cents: number }[]).reduce((s, a) => s + a.amount_cents, 0);
  }

  // Payments for the selected school year (non-voided)
  // school_year_id on student_payments reflects which academic year a payment applies to,
  // regardless of calendar date received.
  let paymentsQuery = supabase
    .from("student_payments")
    .select("amount_cents, payment_source, status")
    .eq("organization_id", orgId)
    .neq("status", "voided");
  if (resolvedYearId) paymentsQuery = paymentsQuery.eq("school_year_id", resolvedYearId);

  const { data: payments } = await paymentsQuery;

  const payList = (payments ?? []) as { amount_cents: number; payment_source: string; status: string }[];
  const collectedCents = payList.reduce((s, p) => s + p.amount_cents, 0);

  const SCHOLARSHIP_SOURCES = new Set(["scholarship", "step_up_pep", "step_up_ua", "aaa"]);
  const scholarshipCents = payList.filter((p) => SCHOLARSHIP_SOURCES.has(p.payment_source)).reduce((s, p) => s + p.amount_cents, 0);
  const stepUpPepCents    = payList.filter((p) => p.payment_source === "step_up_pep").reduce((s, p) => s + p.amount_cents, 0);
  const stepUpUaCents     = payList.filter((p) => p.payment_source === "step_up_ua").reduce((s, p) => s + p.amount_cents, 0);
  const otherScholCents   = payList.filter((p) => SCHOLARSHIP_SOURCES.has(p.payment_source) && p.payment_source !== "step_up_pep" && p.payment_source !== "step_up_ua").reduce((s, p) => s + p.amount_cents, 0);
  const parentPayCents    = payList.filter((p) => p.payment_source === "parent_payment" || p.payment_source === "cash" || p.payment_source === "check" || p.payment_source === "online").reduce((s, p) => s + p.amount_cents, 0);

  // Outstanding and past-due: use allocations per charge
  let outstandingCents = 0;
  let pastDueCents = 0;
  if (chargeIds.length > 0) {
    const { data: allocs } = await supabase
      .from("payment_allocations")
      .select("charge_id, amount_cents, payment_id");

    // voided payment IDs
    const { data: voidedPayments } = await supabase
      .from("student_payments")
      .select("id")
      .eq("organization_id", orgId)
      .eq("status", "voided");
    const voidedIds = new Set(((voidedPayments ?? []) as { id: string }[]).map((p) => p.id));

    const { data: adjByCharge } = await supabase
      .from("charge_adjustments")
      .select("charge_id, amount_cents")
      .in("charge_id", chargeIds)
      .eq("status", "active");

    const adjMap = new Map<string, number>();
    for (const a of (adjByCharge ?? []) as { charge_id: string; amount_cents: number }[]) {
      adjMap.set(a.charge_id, (adjMap.get(a.charge_id) ?? 0) + a.amount_cents);
    }

    const paidMap = new Map<string, number>();
    for (const a of (allocs ?? []) as { charge_id: string; amount_cents: number; payment_id: string }[]) {
      if (!voidedIds.has(a.payment_id)) {
        paidMap.set(a.charge_id, (paidMap.get(a.charge_id) ?? 0) + a.amount_cents);
      }
    }

    const chargeMap = new Map(chargeList.map((c) => [c.id, c]));
    const { data: chargeDueDates } = await supabase
      .from("student_charges")
      .select("id, due_date")
      .in("id", chargeIds);
    const dueDateMap = new Map(((chargeDueDates ?? []) as { id: string; due_date: string | null }[]).map((c) => [c.id, c.due_date]));

    for (const [id] of Array.from(chargeMap)) {
      const charge = chargeMap.get(id)!;
      const adjC = adjMap.get(id) ?? 0;
      const effC = charge.original_amount_cents + adjC;
      const paidC = paidMap.get(id) ?? 0;
      const balC = effC - paidC;
      if (balC > 0) {
        outstandingCents += balC;
        const due = dueDateMap.get(id);
        if (due && due < today) pastDueCents += balC;
      }
    }
  }

  return {
    gross_charged_cents:     grossCents,
    total_collected_cents:   collectedCents,
    total_adjusted_cents:    Math.abs(adjCents),
    outstanding_cents:       outstandingCents,
    past_due_cents:          pastDueCents,
    scholarship_cents:       scholarshipCents,
    step_up_pep_cents:       stepUpPepCents,
    step_up_ua_cents:        stepUpUaCents,
    other_scholarship_cents: otherScholCents,
    parent_payment_cents:    parentPayCents,
    active_charge_count:     chargeList.length,
    student_count:           uniqueStudents,
    current_school_year_id:  currentYearId,
  };
}

// ── Recent ledger activity ─────────────────────────────────────────────────

export interface LedgerActivity {
  id:           string;
  posted_at:    string;
  entry_type:   string;
  amount_cents: number;
  description:  string;
  student_name: string | null;
  student_id:   string | null;
}

export async function getRecentLedgerActivity(orgId: string, limit = 25): Promise<LedgerActivity[]> {
  const auth = await assertFinanceView(orgId);
  if (!auth.ok) return [];

  const supabase = await createClient();

  const { data } = await supabase
    .from("finance_ledger")
    .select("id, posted_at, entry_type, debit_cents, credit_cents, description, student_id")
    .eq("organization_id", orgId)
    .order("posted_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as {
    id: string; posted_at: string; entry_type: string;
    debit_cents: number; credit_cents: number;
    description: string; student_id: string | null;
  }[];

  if (rows.length === 0) return [];

  // Fetch student names
  const studentIds = Array.from(new Set(rows.map((r) => r.student_id).filter(Boolean))) as string[];
  const nameMap = new Map<string, string>();
  if (studentIds.length > 0) {
    const { data: students } = await supabase
      .from("students")
      .select("id, first_name, last_name")
      .in("id", studentIds);
    for (const s of (students ?? []) as { id: string; first_name: string; last_name: string }[]) {
      nameMap.set(s.id, `${s.first_name} ${s.last_name}`);
    }
  }

  return rows.map((r) => ({
    id:           r.id,
    posted_at:    r.posted_at,
    entry_type:   r.entry_type,
    amount_cents: r.credit_cents > 0 ? r.credit_cents : r.debit_cents,
    description:  r.description,
    student_name: r.student_id ? (nameMap.get(r.student_id) ?? null) : null,
    student_id:   r.student_id,
  }));
}

// ── Family financial overview ─────────────────────────────────────────────
// Groups student balances by family (guardian relationships).
// Each student's balance is counted ONCE — families are informational groupings
// only and do not represent legal financial responsibility.

export interface FamilyOverviewRow {
  family_label:   string;
  student_count:  number;
  total_charged_cents: number;
  total_paid_cents:    number;
  balance_cents:       number;
  students: {
    student_id:   string;
    student_name: string;
    charged_cents: number;
    paid_cents:    number;
    balance_cents: number;
  }[];
}

export async function getFamilyOverview(
  orgId: string,
  schoolYearId: string
): Promise<FamilyOverviewRow[]> {
  const auth = await assertFinanceView(orgId);
  if (!auth.ok) return [];

  const supabase = await createClient();

  // 1. Charges for this school year
  const { data: chargesRaw } = await supabase
    .from("student_charges")
    .select("id, student_id, original_amount_cents")
    .eq("organization_id", orgId)
    .eq("school_year_id", schoolYearId)
    .eq("status", "active");
  const charges = (chargesRaw ?? []) as { id: string; student_id: string; original_amount_cents: number }[];
  if (charges.length === 0) return [];

  const chargeIds = charges.map((c) => c.id);

  // Aggregate gross per student
  const grossByStudent = new Map<string, number>();
  for (const c of charges) {
    grossByStudent.set(c.student_id, (grossByStudent.get(c.student_id) ?? 0) + c.original_amount_cents);
  }

  // Adjustments per charge → per student
  const { data: adjsRaw } = await supabase
    .from("charge_adjustments")
    .select("charge_id, amount_cents")
    .in("charge_id", chargeIds)
    .eq("status", "active");

  const adjByCharge = new Map<string, number>();
  for (const a of (adjsRaw ?? []) as { charge_id: string; amount_cents: number }[]) {
    adjByCharge.set(a.charge_id, (adjByCharge.get(a.charge_id) ?? 0) + a.amount_cents);
  }

  const effectiveByStudent = new Map<string, number>();
  for (const c of charges) {
    const adj = adjByCharge.get(c.id) ?? 0;
    effectiveByStudent.set(c.student_id, (effectiveByStudent.get(c.student_id) ?? 0) + c.original_amount_cents + adj);
  }

  // Allocations → paid per charge → per student
  const { data: allocsRaw } = await supabase
    .from("payment_allocations")
    .select("charge_id, amount_cents, payment_id")
    .in("charge_id", chargeIds);

  const { data: voidedRaw } = await supabase
    .from("student_payments")
    .select("id")
    .eq("organization_id", orgId)
    .neq("status", "voided")
    .in("id", ((allocsRaw ?? []) as { payment_id: string }[]).map((a) => a.payment_id));

  const validPaymentIds = new Set(((voidedRaw ?? []) as { id: string }[]).map((p) => p.id));
  const paidByStudent = new Map<string, number>();
  for (const a of (allocsRaw ?? []) as { charge_id: string; amount_cents: number; payment_id: string }[]) {
    if (!validPaymentIds.has(a.payment_id)) continue;
    const charge = charges.find((c) => c.id === a.charge_id);
    if (!charge) continue;
    paidByStudent.set(charge.student_id, (paidByStudent.get(charge.student_id) ?? 0) + a.amount_cents);
  }

  // 2. Student names
  const studentIds = Array.from(grossByStudent.keys());
  const { data: studentsRaw } = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .in("id", studentIds);
  const nameMap = new Map<string, string>();
  for (const s of (studentsRaw ?? []) as { id: string; first_name: string; last_name: string }[]) {
    nameMap.set(s.id, `${s.first_name} ${s.last_name}`);
  }

  // 3. Guardian relationships — group students by shared guardians
  // A "family" is the set of students sharing at least one guardian.
  const { data: guardRaw } = await supabase
    .from("guardianships")
    .select("profile_id, student_id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .in("student_id", studentIds);
  const guardships = (guardRaw ?? []) as { profile_id: string; student_id: string }[];

  // Guardian profile names
  const guardianProfileIds = Array.from(new Set(guardships.map((g) => g.profile_id)));
  const { data: guardProfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", guardianProfileIds);
  const guardNameMap = new Map<string, string>();
  for (const p of (guardProfiles ?? []) as { id: string; full_name: string | null }[]) {
    if (p.full_name) guardNameMap.set(p.id, p.full_name);
  }

  // Build family groupings using union-find (disjoint set) on students sharing a guardian
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p !== x) { parent.set(x, find(p)); }
    return parent.get(x)!;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Union students sharing a guardian
  const guardianToStudents = new Map<string, string[]>();
  for (const g of guardships) {
    const list = guardianToStudents.get(g.profile_id) ?? [];
    list.push(g.student_id);
    guardianToStudents.set(g.profile_id, list);
  }
  for (const students of Array.from(guardianToStudents.values())) {
    for (let i = 1; i < students.length; i++) union(students[0], students[i]);
  }

  // Ensure all students without guardians get their own root
  for (const sid of studentIds) find(sid);

  // Group students by root
  const familyMap = new Map<string, string[]>();
  for (const sid of studentIds) {
    const root = find(sid);
    const group = familyMap.get(root) ?? [];
    group.push(sid);
    familyMap.set(root, group);
  }

  // Build family labels: "LastName Family" from guardians, or student name if no guardians
  const result: FamilyOverviewRow[] = [];
  for (const [root, members] of Array.from(familyMap)) {
    // Find guardian profile IDs for any student in this family
    const familyGuardians = guardships.filter((g) => members.includes(g.student_id));
    const uniqueGuardians = Array.from(new Set(familyGuardians.map((g) => g.profile_id)));

    let familyLabel: string;
    if (uniqueGuardians.length > 0) {
      // Pick first guardian name, extract last name
      const gName = guardNameMap.get(uniqueGuardians[0]) ?? "";
      const lastName = gName.split(" ").pop() ?? gName;
      familyLabel = lastName ? `${lastName} Family` : "Family";
    } else {
      // No guardian — label by student last name
      const sName = nameMap.get(members[0]) ?? "Student";
      const lastName = sName.split(" ").pop() ?? sName;
      familyLabel = lastName ? `${lastName} Family` : "Unlinked Student";
    }

    const studentRows = members.map((sid) => {
      const charged = effectiveByStudent.get(sid) ?? 0;
      const paid    = paidByStudent.get(sid)     ?? 0;
      return {
        student_id:    sid,
        student_name:  nameMap.get(sid) ?? sid,
        charged_cents: charged,
        paid_cents:    paid,
        balance_cents: charged - paid,
      };
    }).sort((a, b) => a.student_name.localeCompare(b.student_name));

    const totalCharged = studentRows.reduce((n, s) => n + s.charged_cents, 0);
    const totalPaid    = studentRows.reduce((n, s) => n + s.paid_cents,    0);

    result.push({
      family_label:        familyLabel,
      student_count:       members.length,
      total_charged_cents: totalCharged,
      total_paid_cents:    totalPaid,
      balance_cents:       totalCharged - totalPaid,
      students:            studentRows,
    });
  }

  return result.sort((a, b) => a.family_label.localeCompare(b.family_label));
}
