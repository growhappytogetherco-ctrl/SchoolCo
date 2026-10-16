"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import type {
  StoreItem, OrderRow, OrderItemRow,
  CreateOrderInput, AddOrderItemInput, VoidOrderItemInput,
  CreateStoreItemInput, UpdateStoreItemInput,
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
    return { success: false, error: String(e) };
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
        invoice_number, invoice_date, due_date, invoice_sent_at, invoice_sent_to,
        cancelled_at, cancel_reason, fulfilled_at, notes, created_at,
        family_finance_accounts!inner(account_name, profiles!inner(full_name, email)),
        created_by_profile:profiles!orders_created_by_fkey(full_name),
        order_items(id, item_name, size, quantity, unit_price_cents, line_total_cents, student_id, is_voided,
          students!order_items_student_id_fkey(full_name))
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
        student_name:     i.students?.full_name ?? null,
        is_voided:        i.is_voided,
        voided_at:        i.voided_at ?? null,
        void_reason:      i.void_reason ?? null,
        created_at:       i.created_at,
      }));

      const activeItems   = items.filter(i => !i.is_voided);
      const subtotal      = activeItems.reduce((s, i) => s + i.line_total_cents, 0);
      const fam           = o.family_finance_accounts;
      const profile       = fam?.profiles;

      return {
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
        invoice_sent_to:   o.invoice_sent_to,
        cancelled_at:      o.cancelled_at,
        cancel_reason:     o.cancel_reason,
        fulfilled_at:      o.fulfilled_at,
        notes:             o.notes,
        subtotal_cents:    subtotal,
        amount_paid_cents: 0,  // Phase 2: populated from order_payments
        balance_cents:     subtotal,
        item_count:        activeItems.length,
        items,
        created_at:        o.created_at,
        created_by_name:   o.created_by_profile?.full_name ?? null,
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
        family_finance_accounts!inner(account_name, profiles!inner(full_name, email)),
        created_by_profile:profiles!orders_created_by_fkey(full_name),
        order_items(id, item_name, size, quantity, unit_price_cents, line_total_cents, student_id, is_voided, voided_at, void_reason, created_at,
          students!order_items_student_id_fkey(full_name))
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
      student_name:     i.students?.full_name ?? null,
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

// ── Family account search (for order creation modal) ──────────────────────

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

    // Step 1: Get all active family accounts with guardian profile + students
    const { data, error } = await supabase
      .from("family_finance_accounts")
      .select(`
        id, account_name,
        profiles!inner(full_name, email),
        guardianships(
          status, archived_at,
          students!inner(id, full_name)
        )
      `)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .limit(200);
    if (error) throw error;

    // Step 2: Filter client-side across account_name, guardian name/email, student names
    // Deduplicates naturally since we start from family_finance_accounts
    const matched = (data ?? []).filter((a: any) => {
      const acctName      = (a.account_name ?? "").toLowerCase();
      const guardianName  = (a.profiles?.full_name ?? "").toLowerCase();
      const guardianEmail = (a.profiles?.email ?? "").toLowerCase();
      const activeStudents: string[] = (a.guardianships ?? [])
        .filter((g: any) => g.status === "active" && !g.archived_at)
        .map((g: any) => (g.students?.full_name ?? "").toLowerCase());

      return (
        acctName.includes(term)      ||
        guardianName.includes(term)  ||
        guardianEmail.includes(term) ||
        activeStudents.some(s => s.includes(term))
      );
    }).slice(0, 20);

    return {
      success: true,
      data: matched.map((a: any) => ({
        id:             a.id,
        account_name:   a.account_name ?? a.profiles?.full_name ?? "Unknown",
        guardian_email: a.profiles?.email ?? null,
        student_names:  (a.guardianships ?? [])
          .filter((g: any) => g.status === "active" && !g.archived_at)
          .map((g: any) => g.students?.full_name)
          .filter(Boolean),
      })),
    };
  } catch (e) {
    return { success: false, error: String(e) };
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
    const { data: acct } = await supabase
      .from("family_finance_accounts")
      .select("profile_id")
      .eq("id", familyAccountId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!acct) throw new Error("Family account not found");

    const { data, error } = await supabase
      .from("guardianships")
      .select("students!inner(id, full_name, grade_level)")
      .eq("profile_id", (acct as any).profile_id)
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (error) throw error;

    return {
      success: true,
      data: (data ?? [])
        .map((g: any) => g.students)
        .filter(Boolean)
        .map((s: any) => ({ id: s.id, full_name: s.full_name, grade_level: s.grade_level ?? null })),
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
