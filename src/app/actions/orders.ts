"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import type {
  StoreItem, OrderRow, OrderItemRow,
  CreateOrderInput, AddOrderItemInput, VoidOrderItemInput,
  CreateStoreItemInput, UpdateStoreItemInput,
  OrderPayment, FinanceSettings, IssueInvoiceInput, RecordPaymentInput,
} from "./orders-constants";
import type { ActionResult } from "@/types/actions";

// ── Auth guards ────────────────────────────────────────────────────────────

async function assertOrdersView() {
  const [user, orgId] = await Promise.all([getUser(), getActiveOrgId()]);
  if (!user || !orgId) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_finance_view_access", { org_id: orgId });
  if (!data) throw new Error("Finance access required");
  return { user, orgId, supabase };
}

async function assertOrdersManage() {
  const [user, orgId] = await Promise.all([getUser(), getActiveOrgId()]);
  if (!user || !orgId) throw new Error("Not authenticated");
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_finance_manage_access", { org_id: orgId });
  if (!data) throw new Error("Finance manage access required");
  return { user, orgId, supabase };
}

// ── Item catalog ──────────────────────────────────────────────────────────

export async function getCatalogItems(): Promise<ActionResult<StoreItem[]>> {
  try {
    const { orgId, supabase } = await assertOrdersView();
    const { data, error } = await supabase
      .from("store_items")
      .select("*")
      .eq("organization_id", orgId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return { success: true, data: (data ?? []) as StoreItem[] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function createCatalogItem(input: CreateStoreItemInput): Promise<ActionResult<StoreItem>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();
    const { data, error } = await supabase
      .from("store_items")
      .insert({
        organization_id:  orgId,
        name:             input.name.trim(),
        description:      input.description?.trim() ?? null,
        category:         input.category,
        unit_price_cents: input.unit_price_cents,
        available_sizes:  input.available_sizes ?? null,
        sort_order:       input.sort_order ?? 0,
        created_by:       user.id,
        is_active:        true,
      })
      .select()
      .single();
    if (error) throw error;
    await logAudit({ action: "store_item.create", target_type: "store_items", target_id: data.id, org_id: orgId });
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: data as StoreItem };
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as any)?.message ?? String(e);
    return { success: false, error: msg };
  }
}

export async function updateCatalogItem(input: UpdateStoreItemInput): Promise<ActionResult<StoreItem>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();
    const updates: Record<string, unknown> = { updated_by: user.id };
    if (input.name             !== undefined) updates.name             = input.name.trim();
    if (input.description      !== undefined) updates.description      = input.description?.trim() ?? null;
    if (input.category         !== undefined) updates.category         = input.category;
    if (input.unit_price_cents !== undefined) updates.unit_price_cents = input.unit_price_cents;
    if (input.available_sizes  !== undefined) updates.available_sizes  = input.available_sizes;
    if (input.is_active        !== undefined) updates.is_active        = input.is_active;
    if (input.sort_order       !== undefined) updates.sort_order       = input.sort_order;

    const { data, error } = await supabase
      .from("store_items")
      .update(updates)
      .eq("id", input.id)
      .eq("organization_id", orgId)
      .select()
      .single();
    if (error) throw error;
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: data as StoreItem };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Orders ────────────────────────────────────────────────────────────────

export async function createOrder(input: CreateOrderInput): Promise<ActionResult<{ id: string }>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    // Verify family account belongs to this org
    const { data: acct, error: acctErr } = await supabase
      .from("family_finance_accounts")
      .select("id, account_name")
      .eq("id", input.family_account_id)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .maybeSingle();
    if (acctErr) throw acctErr;
    if (!acct) throw new Error("Family account not found");

    const { data, error } = await supabase
      .from("orders")
      .insert({
        organization_id:   orgId,
        family_account_id: input.family_account_id,
        order_status:      "draft",
        fulfillment_status: "pending",
        notes:             input.notes?.trim() ?? null,
        created_by:        user.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    await logAudit({ action: "order.create", target_type: "orders", target_id: data.id, org_id: orgId });
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function addOrderItem(input: AddOrderItemInput): Promise<ActionResult<{ id: string; subtotal_cents: number }>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    // Verify order is draft and belongs to this org
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_status")
      .eq("id", input.order_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) throw new Error("Order not found");
    if (order.order_status !== "draft") throw new Error("Cannot add items to a non-draft order");

    const { data, error } = await supabase
      .from("order_items")
      .insert({
        order_id:         input.order_id,
        organization_id:  orgId,
        store_item_id:    input.store_item_id ?? null,
        item_name:        input.item_name.trim(),
        size:             input.size ?? null,
        quantity:         input.quantity,
        unit_price_cents: input.unit_price_cents,
        student_id:       input.student_id ?? null,
        is_voided:        false,
        created_by:       user.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Compute new subtotal
    const { data: subtotalData } = await supabase.rpc("get_order_subtotal", { p_order_id: input.order_id });
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: { id: data.id, subtotal_cents: subtotalData ?? 0 } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function voidOrderItem(input: VoidOrderItemInput): Promise<ActionResult<{ subtotal_cents: number }>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    // Verify the item belongs to an order in this org
    const { data: item, error: itemErr } = await supabase
      .from("order_items")
      .select("id, order_id, is_voided, orders!inner(organization_id, order_status)")
      .eq("id", input.order_item_id)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item) throw new Error("Order item not found");
    const orderOrg = (item as any).orders?.organization_id;
    if (orderOrg !== orgId) throw new Error("Order item not found");
    if ((item as any).is_voided) throw new Error("Item is already voided");

    const { error } = await supabase
      .from("order_items")
      .update({
        is_voided:   true,
        voided_at:   new Date().toISOString(),
        voided_by:   user.id,
        void_reason: input.reason?.trim() ?? null,
      })
      .eq("id", input.order_item_id);
    if (error) throw error;

    const { data: subtotalData } = await supabase.rpc("get_order_subtotal", { p_order_id: item.order_id });
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: { subtotal_cents: subtotalData ?? 0 } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function cancelOrder(orderId: string, reason: string): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_status")
      .eq("id", orderId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) throw new Error("Order not found");
    if (order.order_status === "paid") throw new Error("Cannot cancel a fully paid order");
    if (order.order_status === "cancelled") throw new Error("Order is already cancelled");

    const { error } = await supabase
      .from("orders")
      .update({
        order_status:  "cancelled",
        cancelled_at:  new Date().toISOString(),
        cancelled_by:  user.id,
        cancel_reason: reason.trim(),
        updated_by:    user.id,
      })
      .eq("id", orderId);
    if (error) throw error;

    await logAudit({ action: "order.cancel", target_type: "orders", target_id: orderId, org_id: orgId, details: { reason } });
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Delete / Void ────────────────────────────────────────────────────────

/**
 * Hard-delete a DRAFT order with no payments.
 * Only allowed when order_status = 'draft' and no payment records exist.
 */
export async function deleteOrder(orderId: string): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_status, invoice_number")
      .eq("id", orderId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) throw new Error("Order not found");
    if ((order as any).order_status !== "draft") {
      throw new Error("Only draft orders can be deleted. Use Void Invoice for issued invoices.");
    }

    // Safety: block delete if any payment records exist
    const { count } = await supabase
      .from("order_payments")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    if ((count ?? 0) > 0) {
      throw new Error("This order has payment records and cannot be deleted. Reverse all payments first.");
    }

    const { error } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId)
      .eq("organization_id", orgId);
    if (error) throw error;

    await logAudit({ action: "order.delete", target_type: "orders", target_id: orderId, org_id: orgId });
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Void an issued invoice (invoiced/partial/paid) with no payment history.
 * Sets order_status = 'voided'. Preserves all records; number is never reused.
 */
export async function voidOrder(orderId: string, reason: string): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_status, invoice_number")
      .eq("id", orderId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) throw new Error("Order not found");

    const status = (order as any).order_status;
    if (status === "voided") throw new Error("Invoice is already voided.");
    if (status === "cancelled") throw new Error("Cancelled orders cannot be voided.");
    if (status === "draft") throw new Error("Draft orders should be deleted, not voided.");

    // Block if any non-reversed payments exist
    const { data: payments } = await supabase
      .from("order_payments")
      .select("id, status")
      .eq("order_id", orderId);
    const activePayments = (payments ?? []).filter((p: any) => p.status !== "reversed");
    if (activePayments.length > 0) {
      throw new Error(
        `This invoice has ${activePayments.length} active payment(s). ` +
        "Reverse all payments before voiding, then try again."
      );
    }

    const { error } = await supabase
      .from("orders")
      .update({
        order_status: "voided",
        voided_at:    new Date().toISOString(),
        voided_by:    user.id,
        void_reason:  reason.trim() || null,
        updated_by:   user.id,
      })
      .eq("id", orderId);
    if (error) throw error;

    await logAudit({
      action: "order.void",
      target_type: "orders",
      target_id: orderId,
      org_id: orgId,
      details: { reason, invoice_number: (order as any).invoice_number },
    });
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Queries ───────────────────────────────────────────────────────────────

export async function getOrdersForOrg(filters?: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<OrderRow[]>> {
  try {
    const { orgId, supabase } = await assertOrdersView();

    let q = supabase
      .from("orders")
      .select(`
        id, organization_id, family_account_id, order_status, fulfillment_status,
        invoice_number, invoiced_at, due_date, invoice_sent_at, invoice_sent_count,
        billing_recipient_id, billing_recipient_name, billing_recipient_email,
        cancelled_at, cancel_reason, fulfilled_at, notes, created_at,
        family_finance_accounts!inner(account_name, profiles!family_finance_accounts_profile_id_fkey(full_name, email)),
        created_by_profile:profiles!orders_created_by_fkey(full_name),
        order_items(id, item_name, size, quantity, unit_price_cents, line_total_cents, student_id, is_voided,
          voided_at, void_reason, created_at,
          students!order_items_student_id_fkey(first_name, last_name)),
        order_payments(id, amount_cents, payment_method, payment_date, status, reference_number,
          created_by, verified_by)
      `)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (filters?.status && filters.status !== "all") {
      q = q.eq("order_status", filters.status as any);
    }

    if (filters?.limit)  q = q.limit(filters.limit);
    if (filters?.offset) q = q.range(filters.offset, (filters.offset ?? 0) + (filters.limit ?? 50) - 1);

    const { data, error } = await q;
    if (error) throw error;

    const rows: OrderRow[] = (data ?? []).map((o: any) => {
      const items: OrderItemRow[] = (o.order_items ?? []).map((i: any) => ({
        id:               i.id,
        order_id:         o.id,
        store_item_id:    i.store_item_id ?? null,
        item_name:        i.item_name,
        size:             i.size,
        quantity:         i.quantity,
        unit_price_cents: i.unit_price_cents,
        line_total_cents: i.line_total_cents,
        student_id:       i.student_id,
        student_name:     i.students ? `${i.students.first_name} ${i.students.last_name}`.trim() : null,
        is_voided:        i.is_voided,
        voided_at:        i.voided_at ?? null,
        void_reason:      i.void_reason ?? null,
        created_at:       i.created_at,
      }));

      const activeItems   = items.filter(i => !i.is_voided);
      const subtotal      = activeItems.reduce((s, i) => s + i.line_total_cents, 0);
      const fam           = o.family_finance_accounts;
      const profile       = fam?.profiles;

      // Only verified payments reduce the balance; pending and reversed do not
      const paid = (o.order_payments ?? [])
        .filter((p: any) => p.status === "verified")
        .reduce((s: number, p: any) => s + (p.amount_cents ?? 0), 0);

      return {
        id:                 o.id,
        organization_id:    o.organization_id,
        family_account_id:  o.family_account_id,
        family_name:        fam?.account_name ?? profile?.full_name ?? "Unknown Family",
        guardian_email:     profile?.email ?? null,
        order_status:       o.order_status,
        fulfillment_status: o.fulfillment_status,
        invoice_number:     o.invoice_number,
        invoice_date:       o.invoiced_at ? o.invoiced_at.slice(0, 10) : null,
        due_date:           o.due_date,
        invoice_sent_at:    o.invoice_sent_at,
        invoice_sent_count: o.invoice_sent_count ?? 0,
        invoice_sent_to:    o.billing_recipient_email ?? null,
        billing_recipient_name:  o.billing_recipient_name ?? null,
        billing_recipient_email: o.billing_recipient_email ?? null,
        billing_recipient_id:    o.billing_recipient_id ?? null,
        cancelled_at:       o.cancelled_at,
        cancel_reason:      o.cancel_reason,
        fulfilled_at:       o.fulfilled_at,
        notes:              o.notes,
        subtotal_cents:     subtotal,
        amount_paid_cents:  paid,
        balance_cents:      subtotal - paid,
        item_count:         activeItems.length,
        items,
        created_at:         o.created_at,
        created_by_name:    o.created_by_profile?.full_name ?? null,
      };
    });

    // Client-side search filter (name, invoice number)
    if (filters?.search) {
      const q2 = filters.search.toLowerCase();
      return { success: true, data: rows.filter(r =>
        r.family_name.toLowerCase().includes(q2) ||
        (r.invoice_number ?? "").toLowerCase().includes(q2)
      )};
    }

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getOrder(orderId: string): Promise<ActionResult<OrderRow>> {
  try {
    const { orgId } = await assertOrdersView();
    const result = await getOrdersForOrg({ limit: 1 });
    if (!result.success) throw new Error(result.error);
    // Re-use full query but filter to single order
    const { supabase } = await assertOrdersView();
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id, organization_id, family_account_id, order_status, fulfillment_status,
        invoice_number, invoice_date, due_date, invoice_sent_at, invoice_sent_to,
        cancelled_at, cancel_reason, fulfilled_at, notes, created_at,
        family_finance_accounts!inner(account_name, profiles!family_finance_accounts_profile_id_fkey(full_name, email)),
        created_by_profile:profiles!orders_created_by_fkey(full_name),
        order_items(id, item_name, size, quantity, unit_price_cents, line_total_cents, student_id, is_voided, voided_at, void_reason, created_at,
          students!order_items_student_id_fkey(first_name, last_name))
      `)
      .eq("id", orderId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Order not found");

    const o: any = data;
    const items: OrderItemRow[] = (o.order_items ?? []).map((i: any) => ({
      id:               i.id,
      order_id:         o.id,
      store_item_id:    i.store_item_id ?? null,
      item_name:        i.item_name,
      size:             i.size,
      quantity:         i.quantity,
      unit_price_cents: i.unit_price_cents,
      line_total_cents: i.line_total_cents,
      student_id:       i.student_id,
      student_name:     i.students ? `${i.students.first_name} ${i.students.last_name}`.trim() : null,
      is_voided:        i.is_voided,
      voided_at:        i.voided_at ?? null,
      void_reason:      i.void_reason ?? null,
      created_at:       i.created_at,
    }));

    const activeItems = items.filter(i => !i.is_voided);
    const subtotal    = activeItems.reduce((s, i) => s + i.line_total_cents, 0);
    const fam         = o.family_finance_accounts;
    const profile     = fam?.profiles;

    return {
      success: true,
      data: {
        id:                o.id,
        organization_id:   o.organization_id,
        family_account_id: o.family_account_id,
        family_name:       fam?.account_name ?? profile?.full_name ?? "Unknown Family",
        guardian_email:    profile?.email ?? null,
        order_status:      o.order_status,
        fulfillment_status: o.fulfillment_status,
        invoice_number:    o.invoice_number,
        invoice_date:      o.invoice_date,
        due_date:          o.due_date,
        invoice_sent_at:   o.invoice_sent_at,
        invoice_sent_count: o.invoice_sent_count ?? 0,
        invoice_sent_to:   o.invoice_sent_to,
        cancelled_at:      o.cancelled_at,
        cancel_reason:     o.cancel_reason,
        fulfilled_at:      o.fulfilled_at,
        notes:             o.notes,
        subtotal_cents:    subtotal,
        amount_paid_cents: 0,
        balance_cents:     subtotal,
        item_count:        activeItems.length,
        items,
        created_at:        o.created_at,
        created_by_name:   o.created_by_profile?.full_name ?? null,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Enrolled students for order creation dropdown ─────────────────────────
// Deliberately returns ONLY student data — no billing queries.
// Billing contacts are fetched separately after student selection.

export async function getEnrolledStudents(): Promise<ActionResult<Array<{
  id:           string;
  display_name: string;
  grade_level:  string | null;
}>>> {
  try {
    const { orgId, supabase } = await assertOrdersView();
    const { data, error } = await supabase
      .from("students")
      .select("id, first_name, last_name, grade_level")
      .eq("organization_id", orgId)
      .eq("enrollment_status", "enrolled")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });
    if (error) throw error;
    return {
      success: true,
      data: (data ?? []).map((s: any) => ({
        id:           s.id,
        display_name: `${s.first_name} ${s.last_name}`.trim(),
        grade_level:  s.grade_level ?? null,
      })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as any)?.message ?? String(e);
    return { success: false, error: msg };
  }
}

// ── Billing contacts for a student ───────────────────────────────────────
// Join path: students → guardianships (student_id) → family_finance_accounts (profile_id)
// students.family_id → families (demographic table), NOT family_finance_accounts.
// Uses !family_finance_accounts_profile_id_fkey to disambiguate multiple FKs to profiles.

export async function getBillingContactsForStudent(studentId: string): Promise<ActionResult<Array<{
  account_id:          string;
  account_name:        string;
  email:               string | null;
  has_portal_login:    boolean;   // has active parent role in org_members
}>>> {
  try {
    const { orgId, supabase } = await assertOrdersView();

    // Guardianships for this student
    const { data: guards, error: gErr } = await supabase
      .from("guardianships")
      .select("profile_id")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (gErr) throw gErr;
    if (!guards || guards.length === 0) return { success: true, data: [] };

    const profileIds = Array.from(new Set((guards ?? []).map((g: any) => g.profile_id as string)));

    // Billing accounts — disambiguate FK with explicit hint
    const { data: accounts, error: aErr } = await supabase
      .from("family_finance_accounts")
      .select("id, account_name, profile_id, profiles!family_finance_accounts_profile_id_fkey(email)")
      .in("profile_id", profileIds)
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (aErr) throw aErr;

    // Active parent portal logins — which profile_ids have a parent org_member entry
    const { data: members } = await supabase
      .from("organization_members")
      .select("profile_id")
      .in("profile_id", profileIds)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .eq("role", "parent");
    const parentProfileIds = new Set((members ?? []).map((m: any) => m.profile_id as string));

    // Sort: portal logins first
    const result = (accounts ?? []).map((a: any) => ({
      account_id:       a.id,
      account_name:     a.account_name,
      email:            (a as any).profiles?.email ?? null,
      has_portal_login: parentProfileIds.has(a.profile_id),
    })).sort((a, b) => Number(b.has_portal_login) - Number(a.has_portal_login));

    return { success: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as any)?.message ?? String(e);
    return { success: false, error: msg };
  }
}

// ── Family account search (legacy — kept for direct family lookup if needed) ──

export async function searchFamilyAccounts(search: string): Promise<ActionResult<Array<{
  id: string;
  account_name: string;
  guardian_email: string | null;
  student_names: string[];
}>>> {
  try {
    const { orgId, supabase } = await assertOrdersManage();
    const term = search.trim().toLowerCase();
    if (!term) return { success: true, data: [] };

    // Query family accounts with profile. Students joined via family_id (not full_name column).
    const { data, error } = await supabase
      .from("family_finance_accounts")
      .select(`
        id, account_name,
        profiles(full_name, email),
        students!students_family_id_fkey(id, first_name, last_name)
      `)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .limit(200);
    if (error) throw error;

    const matched = (data ?? []).filter((a: any) => {
      const acctName      = (a.account_name ?? "").toLowerCase();
      const guardianName  = (a.profiles?.full_name ?? "").toLowerCase();
      const guardianEmail = (a.profiles?.email ?? "").toLowerCase();
      const studentNames: string[] = (a.students ?? [])
        .map((s: any) => `${s.first_name ?? ""} ${s.last_name ?? ""}`.toLowerCase());

      return (
        acctName.includes(term)     ||
        guardianName.includes(term) ||
        guardianEmail.includes(term)||
        studentNames.some(s => s.includes(term))
      );
    }).slice(0, 20);

    return {
      success: true,
      data: matched.map((a: any) => ({
        id:             a.id,
        account_name:   a.account_name ?? a.profiles?.full_name ?? "Unknown",
        guardian_email: a.profiles?.email ?? null,
        student_names:  (a.students ?? []).map((s: any) => `${s.first_name} ${s.last_name}`.trim()),
      })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as any)?.message ?? String(e);
    return { success: false, error: msg };
  }
}

// ── Update a draft order item (qty, size, or student assignment) ──────────

export async function updateOrderItem(input: {
  order_item_id: string;
  quantity?:     number;
  size?:         string | null;
  student_id?:   string | null;
}): Promise<ActionResult<{ subtotal_cents: number }>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    // Fetch item + its order to verify org ownership and draft status
    const { data: item, error: itemErr } = await supabase
      .from("order_items")
      .select("id, order_id, is_voided, orders!inner(organization_id, order_status)")
      .eq("id", input.order_item_id)
      .maybeSingle();
    if (itemErr) throw itemErr;
    if (!item) throw new Error("Order item not found");

    const orderOrg    = (item as any).orders?.organization_id;
    const orderStatus = (item as any).orders?.order_status;
    if (orderOrg !== orgId)        throw new Error("Order item not found");
    if ((item as any).is_voided)   throw new Error("Cannot edit a voided item");
    if (orderStatus !== "draft")   throw new Error("Items can only be edited on draft orders");

    if (input.quantity !== undefined && input.quantity < 1) {
      throw new Error("Quantity must be at least 1");
    }

    const updates: Record<string, unknown> = {};
    if (input.quantity  !== undefined) updates.quantity   = input.quantity;
    if (input.size      !== undefined) updates.size        = input.size;
    if (input.student_id !== undefined) updates.student_id = input.student_id;

    if (Object.keys(updates).length === 0) {
      throw new Error("No fields to update");
    }

    const { error } = await supabase
      .from("order_items")
      .update(updates)
      .eq("id", input.order_item_id);
    if (error) throw error;

    const { data: subtotalData } = await supabase.rpc("get_order_subtotal", { p_order_id: item.order_id });
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: { subtotal_cents: subtotalData ?? 0 } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Students for a family (for per-item student assignment) ───────────────

export async function getStudentsForFamily(familyAccountId: string): Promise<ActionResult<Array<{
  id: string;
  full_name: string;
  grade_level: string | null;
}>>> {
  try {
    const { orgId, supabase } = await assertOrdersView();

    // familyAccountId is a family_finance_accounts.id.
    // Path: family_finance_accounts → profile_id → guardianships → students
    const { data: acct, error: aErr } = await supabase
      .from("family_finance_accounts")
      .select("profile_id")
      .eq("id", familyAccountId)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .maybeSingle();
    if (aErr) throw aErr;
    if (!acct) return { success: true, data: [] };

    const { data: guardianships, error: gErr } = await supabase
      .from("guardianships")
      .select("student_id")
      .eq("profile_id", (acct as any).profile_id)
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (gErr) throw gErr;

    const studentIds = (guardianships ?? []).map((g: any) => g.student_id);
    if (studentIds.length === 0) return { success: true, data: [] };

    const { data, error } = await supabase
      .from("students")
      .select("id, first_name, last_name, grade_level")
      .in("id", studentIds)
      .eq("organization_id", orgId)
      .eq("enrollment_status", "enrolled")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });
    if (error) throw error;

    return {
      success: true,
      data: (data ?? []).map((s: any) => ({
        id:          s.id,
        full_name:   `${s.first_name} ${s.last_name}`.trim(),
        grade_level: s.grade_level ?? null,
      })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : (e as any)?.message ?? String(e);
    return { success: false, error: msg };
  }
}

// ── Phase 2: Finance Settings ─────────────────────────────────────────────

export async function getFinanceSettings(): Promise<ActionResult<FinanceSettings>> {
  try {
    const { orgId, supabase } = await assertOrdersView();
    const { data, error } = await supabase
      .from("finance_settings")
      .select("organization_id, zelle_enabled, manual_payments_enabled, zelle_recipient, zelle_type, check_payee, cash_instructions, invoice_due_days, invoice_footer_text")
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) throw error;
    // If no row exists yet, return defaults
    return {
      success: true,
      data: (data ?? {
        organization_id:      orgId,
        zelle_enabled:        false,
        manual_payments_enabled: true,
        zelle_recipient:      null,
        zelle_type:           "phone",
        check_payee:          null,
        cash_instructions:    null,
        invoice_due_days:     30,
        invoice_footer_text:  null,
      }) as FinanceSettings,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function updateFinanceSettings(input: Partial<FinanceSettings>): Promise<ActionResult<void>> {
  try {
    const { orgId, supabase } = await assertOrdersManage();
    const updates: Record<string, unknown> = {};
    const allowed = ["zelle_enabled","manual_payments_enabled","zelle_recipient","zelle_type","check_payee","cash_instructions","invoice_due_days","invoice_footer_text"] as const;
    for (const k of allowed) {
      if (k in input) updates[k] = (input as any)[k];
    }
    const { error } = await supabase
      .from("finance_settings")
      .upsert({ organization_id: orgId, ...updates })
      .eq("organization_id", orgId);
    if (error) throw error;
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Phase 2: Issue Invoice ────────────────────────────────────────────────

export async function issueInvoice(input: IssueInvoiceInput): Promise<ActionResult<{ invoice_number: string; due_date: string }>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    // Verify order: must be draft, belong to org, have items
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_status, invoice_number")
      .eq("id", input.order_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) throw new Error("Order not found");
    if ((order as any).order_status !== "draft") throw new Error("Only draft orders can be invoiced");

    // Verify at least one active item exists
    const { count } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("order_id", input.order_id)
      .eq("is_voided", false);
    if (!count || count < 1) throw new Error("Cannot invoice an order with no items");

    // Fetch settings for due_date calculation
    const { data: settings } = await supabase
      .from("finance_settings")
      .select("invoice_due_days")
      .eq("organization_id", orgId)
      .maybeSingle();
    const dueDays = (settings as any)?.invoice_due_days ?? 30;

    // Calculate due date
    const dueDate = input.due_date_override ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() + dueDays);
      return d.toISOString().slice(0, 10);
    })();

    // Generate invoice number atomically
    const { data: invNum, error: invErr } = await supabase.rpc("generate_invoice_number", { p_org_id: orgId });
    if (invErr) throw invErr;

    // Update order to invoiced
    const { error: updateErr } = await supabase
      .from("orders")
      .update({
        order_status:            "invoiced",
        invoice_number:          invNum,
        invoiced_at:             new Date().toISOString(),
        due_date:                dueDate,
        billing_recipient_id:    input.billing_recipient_id,
        billing_recipient_name:  input.billing_recipient_name,
        billing_recipient_email: input.billing_recipient_email,
        updated_by:              user.id,
      })
      .eq("id", input.order_id)
      .eq("order_status", "draft"); // Optimistic concurrency: only update if still draft
    if (updateErr) throw updateErr;

    await logAudit({
      action: "order.invoice",
      target_type: "orders",
      target_id: input.order_id,
      org_id: orgId,
      details: { invoice_number: invNum, billing_email: input.billing_recipient_email },
    });
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: { invoice_number: invNum as string, due_date: dueDate } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Phase 2: Generate + Send Invoice Email ────────────────────────────────

export async function sendInvoiceEmail(orderId: string): Promise<ActionResult<{ email_id: string }>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    // Fetch full order
    const orderResult = await getOrder(orderId);
    if (!orderResult.success) throw new Error(orderResult.error);
    const order = orderResult.data;

    if (!["invoiced", "partial"].includes(order.order_status)) {
      throw new Error("Can only send email for invoiced orders");
    }
    if (!order.billing_recipient_email) throw new Error("No billing email on this order");
    if (!order.invoice_number) throw new Error("No invoice number — issue the invoice first");

    // Duplicate-send guard: check last send within 60 seconds
    const { data: recentLog } = await supabase
      .from("order_email_log")
      .select("created_at")
      .eq("order_id", orderId)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentLog) {
      const age = Date.now() - new Date((recentLog as any).created_at).getTime();
      if (age < 60_000) throw new Error("Invoice was just sent. Please wait before sending again.");
    }

    // Fetch finance settings for payment instructions
    const settingsResult = await getFinanceSettings();
    if (!settingsResult.success) throw new Error("Could not load payment settings");
    const settings = settingsResult.data;

    // Format dates
    const invoiceDate = order.invoice_date
      ? new Date(order.invoice_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const dueDate = order.due_date
      ? new Date(order.due_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "Upon receipt";

    // Fetch org name
    const { data: org } = await supabase
      .from("organizations")
      .select("name, short_name")
      .eq("id", orgId)
      .maybeSingle();
    const orgName = (org as any)?.name ?? "Rising Leaders Academy";

    // Fetch staff name
    const { data: staffProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const staffName = (staffProfile as any)?.full_name ?? "Staff";

    // Build line items for PDF
    const pdfItems = order.items
      .filter(i => !i.is_voided)
      .map(i => ({
        item_name:        i.item_name,
        size:             i.size,
        student_name:     i.student_name,
        quantity:         i.quantity,
        unit_price_cents: i.unit_price_cents,
        line_total_cents: i.line_total_cents,
      }));

    // Generate PDF
    const { generateInvoicePdf } = await import("@/lib/invoice-pdf");
    const pdfBytes = await generateInvoicePdf({
      invoice_number:          order.invoice_number,
      invoice_date:            invoiceDate,
      due_date:                dueDate,
      family_name:             order.family_name,
      billing_recipient_name:  order.billing_recipient_name ?? order.family_name,
      billing_recipient_email: order.billing_recipient_email,
      items:                   pdfItems,
      subtotal_cents:          order.subtotal_cents,
      paid_cents:              order.amount_paid_cents,
      zelle_recipient:         settings.zelle_recipient ?? "321-795-9724",
      zelle_type:              settings.zelle_type ?? "phone",
      check_payee:             settings.check_payee ?? "Healing Through Christ Foundation",
      cash_instructions:       settings.cash_instructions ?? "Submit payment to the RLA front office in a labeled envelope. Include the student's name and invoice number.",
      invoice_footer_text:     settings.invoice_footer_text ?? undefined,
    });

    // Email delivery is disabled until live Resend delivery is verified.
    // Set ORDERS_EMAIL_ENABLED=true in Vercel env to re-enable.
    if (!process.env.ORDERS_EMAIL_ENABLED) {
      await supabase.from("order_email_log").insert({
        order_id:        orderId,
        organization_id: orgId,
        recipient_email: order.billing_recipient_email,
        resend_id:       null,
        status:          "failed",
        error_message:   "Email delivery not yet enabled for this environment",
        sent_by:         user.id,
      });
      throw new Error("Invoice email delivery is not yet enabled. The PDF can still be downloaded and shared manually.");
    }

    // Send email
    const { sendInvoiceEmail: sendEmail } = await import("@/lib/email/invoice-email");
    const emailResult = await sendEmail({
      to:                     order.billing_recipient_email,
      recipientName:          order.billing_recipient_name ?? order.family_name,
      familyName:             order.family_name,
      invoiceNumber:          order.invoice_number,
      invoiceDate,
      dueDate,
      subtotalCents:          order.subtotal_cents,
      balanceCents:           order.balance_cents,
      itemCount:              pdfItems.length,
      orgName,
      zelleRecipient:         settings.zelle_recipient ?? "321-795-9724",
      zelleType:              settings.zelle_type ?? "phone",
      checkPayee:             settings.check_payee ?? "Healing Through Christ Foundation",
      cashInstructions:       settings.cash_instructions ?? "Submit payment to the RLA front office in a labeled envelope. Include the student's name and invoice number.",
      pdfBytes,
      staffName,
    });

    // Log email attempt
    await supabase.from("order_email_log").insert({
      order_id:        orderId,
      organization_id: orgId,
      recipient_email: order.billing_recipient_email,
      resend_id:       emailResult.id ?? null,
      status:          emailResult.error ? "failed" : "sent",
      error_message:   emailResult.error ?? null,
      sent_by:         user.id,
    });

    if (emailResult.error) throw new Error(`Email failed: ${emailResult.error}`);

    // Update sent timestamp and increment send count
    const currentCount = order.invoice_sent_count ?? 0;
    await supabase
      .from("orders")
      .update({
        invoice_sent_at:    new Date().toISOString(),
        invoice_sent_count: currentCount + 1,
        updated_by:         user.id,
      })
      .eq("id", orderId);

    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: { email_id: emailResult.id ?? "sent" } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Phase 2: Download Invoice PDF (returns base64) ────────────────────────

export async function getInvoicePdfBase64(orderId: string): Promise<ActionResult<{ base64: string; filename: string }>> {
  try {
    const { orgId, supabase } = await assertOrdersView();

    const orderResult = await getOrder(orderId);
    if (!orderResult.success) throw new Error(orderResult.error);
    const order = orderResult.data;

    if (!order.invoice_number) throw new Error("No invoice number — issue the invoice first");

    const settingsResult = await getFinanceSettings();
    if (!settingsResult.success) throw new Error("Could not load payment settings");
    const settings = settingsResult.data;

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();

    const invoiceDate = order.invoice_date
      ? new Date(order.invoice_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const dueDate = order.due_date
      ? new Date(order.due_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "Upon receipt";

    const { generateInvoicePdf } = await import("@/lib/invoice-pdf");
    const pdfBytes = await generateInvoicePdf({
      invoice_number:          order.invoice_number,
      invoice_date:            invoiceDate,
      due_date:                dueDate,
      family_name:             order.family_name,
      billing_recipient_name:  order.billing_recipient_name ?? order.family_name,
      billing_recipient_email: order.billing_recipient_email ?? "",
      items:                   order.items.filter(i => !i.is_voided).map(i => ({
        item_name: i.item_name, size: i.size, student_name: i.student_name,
        quantity: i.quantity, unit_price_cents: i.unit_price_cents, line_total_cents: i.line_total_cents,
      })),
      subtotal_cents:    order.subtotal_cents,
      paid_cents:        order.amount_paid_cents,
      zelle_recipient:   settings.zelle_recipient ?? "321-795-9724",
      zelle_type:        settings.zelle_type ?? "phone",
      check_payee:       settings.check_payee ?? "Healing Through Christ Foundation",
      cash_instructions: settings.cash_instructions ?? "Submit payment to the RLA front office in a labeled envelope. Include the student's name and invoice number.",
      invoice_footer_text: settings.invoice_footer_text ?? undefined,
    });

    const base64 = Buffer.from(pdfBytes).toString("base64");
    return {
      success: true,
      data: {
        base64,
        filename: `Invoice-${order.invoice_number}.pdf`,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Phase 2: Payments ─────────────────────────────────────────────────────

export async function recordPayment(input: RecordPaymentInput): Promise<ActionResult<OrderPayment>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    // Verify order exists, belongs to org, and is invoiced/partial
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_status, subtotal_cents:order_items(line_total_cents, is_voided)")
      .eq("id", input.order_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) throw new Error("Order not found");
    const status = (order as any).order_status;
    if (!["invoiced", "partial", "paid"].includes(status)) {
      throw new Error("Payments can only be recorded on invoiced orders");
    }

    if (input.amount_cents < 1) throw new Error("Payment amount must be positive");

    const insertStatus = input.initial_status ?? "pending";
    const now = new Date().toISOString();

    const { data: payment, error: payErr } = await supabase
      .from("order_payments")
      .insert({
        organization_id:  orgId,
        order_id:         input.order_id,
        amount_cents:     input.amount_cents,
        payment_method:   input.payment_method,
        payment_date:     input.payment_date,
        reference_number: input.reference_number?.trim() ?? null,
        notes:            input.notes?.trim() ?? null,
        status:           insertStatus,
        created_by:       user.id,
        ...(insertStatus === "verified" ? { verified_by: user.id, verified_at: now } : {}),
      })
      .select("*")
      .single();
    if (payErr) {
      // Surface the overpayment guard message cleanly
      const msg = payErr.message ?? "";
      if (msg.includes("exceed")) throw new Error(msg.split("ERROR:").pop()?.trim() ?? msg);
      throw payErr;
    }

    // Update order status based on new verified paid total
    const { data: paidData } = await supabase.rpc("get_order_paid_cents", { p_order_id: input.order_id });
    const { data: subtotalData } = await supabase.rpc("get_order_subtotal", { p_order_id: input.order_id });
    const paid     = paidData ?? 0;
    const subtotal = subtotalData ?? 0;
    const newStatus = paid <= 0 ? "invoiced" : paid >= subtotal ? "paid" : "partial";

    await supabase
      .from("orders")
      .update({ order_status: newStatus, updated_by: user.id })
      .eq("id", input.order_id);

    await logAudit({
      action: "order.payment.record",
      target_type: "order_payments",
      target_id: payment.id,
      org_id: orgId,
      details: { amount_cents: input.amount_cents, method: input.payment_method },
    });

    revalidatePath("/dashboard/finance/orders");
    return {
      success: true,
      data: {
        ...payment,
        created_by_name:  null,
        verified_by_name: null,
      } as OrderPayment,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function verifyPayment(paymentId: string): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    const { data: pmt, error } = await supabase
      .from("order_payments")
      .select("id, status, organization_id, order_id")
      .eq("id", paymentId)
      .maybeSingle();
    if (error) throw error;
    if (!pmt || (pmt as any).organization_id !== orgId) throw new Error("Payment not found");
    if ((pmt as any).status !== "pending") throw new Error("Only pending payments can be verified");

    const { error: upErr } = await supabase
      .from("order_payments")
      .update({ status: "verified", verified_by: user.id, verified_at: new Date().toISOString() })
      .eq("id", paymentId);
    if (upErr) throw upErr;

    // Recalculate order status now that this payment is verified
    const { data: paidData }     = await supabase.rpc("get_order_paid_cents", { p_order_id: (pmt as any).order_id });
    const { data: subtotalData } = await supabase.rpc("get_order_subtotal",   { p_order_id: (pmt as any).order_id });
    const paid     = paidData     ?? 0;
    const subtotal = subtotalData ?? 0;
    const newStatus = paid <= 0 ? "invoiced" : paid >= subtotal ? "paid" : "partial";
    await supabase
      .from("orders")
      .update({ order_status: newStatus, updated_by: user.id })
      .eq("id", (pmt as any).order_id);

    await logAudit({
      action: "order.payment.verify",
      target_type: "order_payments",
      target_id: paymentId,
      org_id: orgId,
    });
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function reversePayment(paymentId: string, reason: string): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    const { data: pmt, error } = await supabase
      .from("order_payments")
      .select("id, status, organization_id, order_id, amount_cents")
      .eq("id", paymentId)
      .maybeSingle();
    if (error) throw error;
    if (!pmt || (pmt as any).organization_id !== orgId) throw new Error("Payment not found");
    if ((pmt as any).status === "reversed") throw new Error("Payment is already reversed");

    const { error: upErr } = await supabase
      .from("order_payments")
      .update({
        status:          "reversed",
        reversed_by:     user.id,
        reversed_at:     new Date().toISOString(),
        reversal_reason: reason.trim(),
      })
      .eq("id", paymentId);
    if (upErr) throw upErr;

    // Recalculate order status after reversal
    const { data: paidData }    = await supabase.rpc("get_order_paid_cents",  { p_order_id: (pmt as any).order_id });
    const { data: subtotalData }= await supabase.rpc("get_order_subtotal",    { p_order_id: (pmt as any).order_id });
    const paid     = paidData     ?? 0;
    const subtotal = subtotalData ?? 0;
    const newStatus = paid <= 0 ? "invoiced" : paid < subtotal ? "partial" : "paid";

    await supabase
      .from("orders")
      .update({ order_status: newStatus, updated_by: user.id })
      .eq("id", (pmt as any).order_id);

    await logAudit({
      action: "order.payment.reverse",
      target_type: "order_payments",
      target_id: paymentId,
      org_id: orgId,
      details: { reason },
    });
    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getOrderPayments(orderId: string): Promise<ActionResult<OrderPayment[]>> {
  try {
    const { orgId, supabase } = await assertOrdersView();

    // Note: created_by and verified_by reference auth.users(id), NOT profiles(id).
    // Do not attempt profiles!order_payments_*_fkey joins — those FKs do not exist
    // and PostgREST will reject the entire query, returning zero rows silently.
    const { data, error } = await supabase
      .from("order_payments")
      .select("id, order_id, organization_id, amount_cents, payment_method, payment_date, reference_number, notes, status, verified_by, verified_at, reversed_at, reversal_reason, created_by, created_at")
      .eq("order_id", orderId)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    return {
      success: true,
      data: (data ?? []).map((p: any) => ({
        ...p,
        created_by_name:  null,
        verified_by_name: null,
      })) as OrderPayment[],
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Phase 2: Fulfillment update ────────────────────────────────────────────

export async function updateFulfillmentStatus(
  orderId: string,
  status: "pending" | "partial" | "fulfilled"
): Promise<ActionResult<void>> {
  try {
    const { user, orgId, supabase } = await assertOrdersManage();

    const { data: order } = await supabase
      .from("orders")
      .select("id, order_status")
      .eq("id", orderId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!order) throw new Error("Order not found");
    if ((order as any).order_status === "cancelled") throw new Error("Cannot update fulfillment on a cancelled order");

    const { error } = await supabase
      .from("orders")
      .update({
        fulfillment_status: status,
        fulfilled_at:       status === "fulfilled" ? new Date().toISOString() : null,
        updated_by:         user.id,
      })
      .eq("id", orderId);
    if (error) throw error;

    revalidatePath("/dashboard/finance/orders");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
