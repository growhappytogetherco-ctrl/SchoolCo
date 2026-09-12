"use server";

// Parent-portal finance data access.
// Read-only. Guardians can only see charges/payments for students they are
// actively linked to. No write actions are exposed here.

import { createClient, getUser, getActiveOrgId, resolveProfileId } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";

export interface ParentChargeRow {
  id:               string;
  charge_type:      string;
  description:      string;
  original_amount:  number;
  effective_amount: number;
  paid_amount:      number;
  balance:          number;
  due_date:         string | null;
  plan_type:        string | null;
  status:           string;
}

export interface ParentPaymentRow {
  id:               string;
  payment_date:     string;
  amount:           number;
  payment_source:   string;
  reference_number: string | null;
  status:           string;
}

export interface ParentFinanceSummary {
  school_year_label: string;
  total_charged:     number;
  total_paid:        number;
  balance_due:       number;
  past_due:          number;
  finance_status:    "current" | "past_due" | "paid_in_full" | "due_soon" | "not_configured";
  charges:           ParentChargeRow[];
  payments:          ParentPaymentRow[];
}

export interface ChildFinanceResult {
  child_id:     string;
  child_name:   string;
  grade_level:  string | null;
  summaries:    ParentFinanceSummary[];  // one per school year, newest first
}

function fmt(n: number) { return Math.round(n * 100) / 100; }

async function verifyGuardianship(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
  studentId: string,
  orgId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("guardianships")
    .select("id")
    .eq("profile_id", profileId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  return !!data;
}

export async function getMyChildrenFinance(): Promise<ActionResult<ChildFinanceResult[]>> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const supabase = await createClient();
  const profileId = await resolveProfileId(user.id);

  // Fetch guardian-linked children
  const { data: guardianships } = await supabase
    .from("guardianships")
    .select("student_id, students(id, first_name, last_name, preferred_name, grade_level, enrollment_status, archived_at)")
    .eq("profile_id", profileId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("archived_at", null);

  if (!guardianships || guardianships.length === 0) {
    return { success: true, data: [] };
  }

  type RawStudent = { id: string; first_name: string; last_name: string; preferred_name: string | null; grade_level: string | null; enrollment_status: string; archived_at: string | null };

  const children = (guardianships as any[])
    .map((g) => g.students as RawStudent | null)
    .filter((s): s is RawStudent => !!s && s.archived_at === null && s.enrollment_status !== "withdrawn");

  if (children.length === 0) return { success: true, data: [] };

  const studentIds = children.map((c) => c.id);

  // School years with charges for these students
  const { data: yearRows } = await supabase
    .from("school_years")
    .select("id, label, start_date, end_date, is_current")
    .eq("organization_id", orgId)
    .order("start_date", { ascending: false });

  const years = (yearRows ?? []) as { id: string; label: string; is_current: boolean }[];
  if (years.length === 0) return { success: true, data: [] };

  const yearIds = years.map((y) => y.id);

  // Fetch all charges for guardian's students in one query (RLS enforces guardian scope)
  const { data: rawCharges } = await supabase
    .from("student_charges")
    .select("id, student_id, school_year_id, charge_type, description, original_amount, due_date, plan_type, status, notes")
    .in("student_id", studentIds)
    .in("school_year_id", yearIds)
    .eq("organization_id", orgId)
    .order("created_at");

  const chargeList = (rawCharges ?? []) as any[];
  const chargeIds = chargeList.map((c) => c.id);

  // Adjustments for those charges
  let adjList: any[] = [];
  if (chargeIds.length > 0) {
    const { data } = await supabase
      .from("charge_adjustments")
      .select("id, charge_id, amount, status")
      .in("charge_id", chargeIds);
    adjList = (data ?? []) as any[];
  }

  // Allocations for those charges
  let allocList: any[] = [];
  if (chargeIds.length > 0) {
    const { data } = await supabase
      .from("payment_allocations")
      .select("charge_id, amount, payment_id")
      .in("charge_id", chargeIds);
    allocList = (data ?? []) as any[];
  }

  // Payments for those students
  const { data: rawPayments } = await supabase
    .from("student_payments")
    .select("id, student_id, school_year_id, payment_date, amount, payment_source, reference_number, status")
    .in("student_id", studentIds)
    .in("school_year_id", yearIds)
    .eq("organization_id", orgId)
    .order("payment_date", { ascending: false });

  const paymentList = (rawPayments ?? []) as any[];

  // Build adj sum map
  const adjByCharge = new Map<string, number>();
  for (const a of adjList) {
    if (a.status === "active") {
      adjByCharge.set(a.charge_id, (adjByCharge.get(a.charge_id) ?? 0) + a.amount);
    }
  }

  // Build voided payment set
  const voidedPaymentIds = new Set(paymentList.filter((p) => p.status === "voided").map((p) => p.id));

  // Build paid-per-charge map (only non-voided payment allocations)
  const paidByCharge = new Map<string, number>();
  for (const a of allocList) {
    if (!voidedPaymentIds.has(a.payment_id)) {
      paidByCharge.set(a.charge_id, (paidByCharge.get(a.charge_id) ?? 0) + a.amount);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  const results: ChildFinanceResult[] = children.map((child) => {
    const childCharges = chargeList.filter((c) => c.student_id === child.id);
    const childPayments = paymentList.filter((p) => p.student_id === child.id);

    const yearSummaries: ParentFinanceSummary[] = years
      .map((year) => {
        const yCharges = childCharges.filter((c) => c.school_year_id === year.id);
        const yPayments = childPayments.filter((p) => p.school_year_id === year.id);

        if (yCharges.length === 0 && yPayments.length === 0) return null;

        const charges: ParentChargeRow[] = yCharges.map((c) => {
          const adj = adjByCharge.get(c.id) ?? 0;
          const eff = fmt(c.original_amount + adj);
          const paid = fmt(paidByCharge.get(c.id) ?? 0);
          return {
            id:               c.id,
            charge_type:      c.charge_type,
            description:      c.description,
            original_amount:  c.original_amount,
            effective_amount: eff,
            paid_amount:      paid,
            balance:          fmt(eff - paid),
            due_date:         c.due_date,
            plan_type:        c.plan_type,
            status:           c.status,
          };
        });

        const payments: ParentPaymentRow[] = yPayments.map((p) => ({
          id:               p.id,
          payment_date:     p.payment_date,
          amount:           p.amount,
          payment_source:   p.payment_source,
          reference_number: p.reference_number,
          status:           p.status,
        }));

        const activeCharges = charges.filter((c) => c.status === "active");
        const totalCharged  = fmt(activeCharges.reduce((s, c) => s + c.effective_amount, 0));
        const totalPaid     = fmt(activeCharges.reduce((s, c) => s + c.paid_amount, 0));
        const balanceDue    = fmt(totalCharged - totalPaid);
        const pastDue = fmt(activeCharges
          .filter((c) => c.due_date && c.due_date < today && c.balance > 0)
          .reduce((s, c) => s + c.balance, 0));

        const upcoming = activeCharges
          .filter((c) => c.due_date && c.due_date >= today && c.balance > 0)
          .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));

        let finance_status: ParentFinanceSummary["finance_status"] = "not_configured";
        if (activeCharges.length > 0) {
          if (pastDue > 0) finance_status = "past_due";
          else if (balanceDue <= 0) finance_status = "paid_in_full";
          else if (upcoming[0]?.due_date) {
            const days = (new Date(upcoming[0].due_date).getTime() - new Date(today).getTime()) / 86400000;
            finance_status = days <= 14 ? "due_soon" : "current";
          } else {
            finance_status = "current";
          }
        }

        return { school_year_label: year.label, total_charged: totalCharged, total_paid: totalPaid, balance_due: balanceDue, past_due: pastDue, finance_status, charges, payments };
      })
      .filter((s): s is ParentFinanceSummary => s !== null);

    return {
      child_id:    child.id,
      child_name:  child.preferred_name ? `${child.preferred_name} ${child.last_name}` : `${child.first_name} ${child.last_name}`,
      grade_level: child.grade_level,
      summaries:   yearSummaries,
    };
  });

  return { success: true, data: results.filter((r) => r.summaries.length > 0) };
}
