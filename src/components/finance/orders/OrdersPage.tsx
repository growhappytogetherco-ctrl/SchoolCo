"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, BookOpen, Search, Loader2, Package, X, Pencil, Check, FileText, Send, Download, Truck, AlertCircle, RefreshCw, Trash2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_LABELS, FULFILLMENT_STATUS_LABELS,
  type StoreItem, type OrderRow, type OrderItemRow, type OrderStatus,
} from "@/app/actions/orders-constants";
import { getOrdersForOrg, getCatalogItems, updateOrderItem, voidOrderItem, sendInvoiceEmail, getInvoicePdfBase64, updateFulfillmentStatus, deleteOrder, voidOrder } from "@/app/actions/orders";
import { ItemCatalogModal } from "./ItemCatalogModal";
import { CreateOrderModal } from "./CreateOrderModal";
import { IssueInvoiceModal } from "./IssueInvoiceModal";
import { PaymentPanel } from "./PaymentPanel";

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function statusBadge(status: OrderStatus) {
  const cls: Record<OrderStatus, string> = {
    draft:     "bg-sc-gray-100 text-sc-gray",
    invoiced:  "bg-sc-gold-50 text-sc-gold-700 border border-sc-gold-300",
    partial:   "bg-blue-50 text-blue-700 border border-blue-200",
    paid:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
    cancelled: "bg-sc-rose-50 text-sc-rose-700 border border-sc-rose-200",
    voided:    "bg-sc-gray-100 text-sc-gray border border-sc-gray-200 line-through",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cls[status])}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

function fulfillmentBadge(status: string) {
  if (status === "fulfilled") return <span className="text-xs text-emerald-700">● Fulfilled</span>;
  if (status === "partial")   return <span className="text-xs text-sc-gold-700">◑ Partial</span>;
  return null;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all",      label: "All Orders" },
  { value: "draft",    label: "Drafts" },
  { value: "invoiced", label: "Invoiced" },
  { value: "partial",  label: "Partial" },
  { value: "paid",     label: "Paid" },
  { value: "cancelled",label: "Cancelled" },
  { value: "voided",   label: "Voided" },
];

interface EditingItem {
  id: string;
  quantity: number;
  size: string;
  student_id: string | null;
  saving: boolean;
}

interface Props {
  canManage: boolean;
}

export function OrdersPage({ canManage }: Props) {
  const [orders,         setOrders]        = useState<OrderRow[]>([]);
  const [catalog,        setCatalog]       = useState<StoreItem[]>([]);
  const [loading,        setLoading]       = useState(true);
  const [loadError,      setLoadError]     = useState<string | null>(null);
  const [statusFilter,   setStatusFilter]  = useState("all");
  const [search,         setSearch]        = useState("");
  const [showCatalog,    setShowCatalog]   = useState(false);
  const [showCreate,     setShowCreate]    = useState(false);
  const [expandedId,     setExpandedId]    = useState<string | null>(null);
  const [editingItem,    setEditingItem]   = useState<EditingItem | null>(null);
  const [invoicingOrder, setInvoicingOrder] = useState<OrderRow | null>(null);
  const [sendingEmail,   setSendingEmail]  = useState<string | null>(null);
  const [downloading,    setDownloading]   = useState<string | null>(null);
  const [deleteDialog,   setDeleteDialog]  = useState<OrderRow | null>(null);
  const [voidDialog,     setVoidDialog]    = useState<OrderRow | null>(null);
  const [voidReason,     setVoidReason]    = useState("");
  const [dialogWorking,  setDialogWorking] = useState(false);
  const [dialogError,    setDialogError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [ordersRes, catalogRes] = await Promise.all([
      getOrdersForOrg({ status: statusFilter, search: search || undefined, limit: 100 }),
      getCatalogItems(),
    ]);
    if (!ordersRes.success) {
      setLoadError(ordersRes.error ?? "Failed to load orders. Please try again.");
    } else {
      setOrders(ordersRes.data);
    }
    if (catalogRes.success) setCatalog(catalogRes.data);
    setLoading(false);
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  function handleCatalogSaved(item: StoreItem) {
    setCatalog(prev => {
      const idx = prev.findIndex(i => i.id === item.id);
      return idx >= 0 ? prev.map((i, n) => n === idx ? item : i) : [...prev, item];
    });
  }

  function handleOrderCreated(orderId: string) {
    load();
    setExpandedId(orderId);
  }

  function startEditing(item: OrderItemRow) {
    setEditingItem({
      id: item.id,
      quantity: item.quantity,
      size: item.size ?? "",
      student_id: item.student_id ?? null,
      saving: false,
    });
  }

  async function saveEdit() {
    if (!editingItem) return;
    setEditingItem(prev => prev ? { ...prev, saving: true } : null);
    const res = await updateOrderItem({
      order_item_id: editingItem.id,
      quantity: editingItem.quantity,
      size: editingItem.size || null,
      student_id: editingItem.student_id || null,
    });
    if (res.success) {
      await load();
      setEditingItem(null);
    } else {
      setEditingItem(prev => prev ? { ...prev, saving: false } : null);
      alert(res.error ?? "Failed to save changes.");
    }
  }

  async function handleVoidItem(itemId: string) {
    if (!confirm("Void this item? It will remain on the order as voided.")) return;
    const res = await voidOrderItem({ order_item_id: itemId, reason: "Corrected by staff" });
    if (res.success) {
      await load();
    } else {
      alert(res.error ?? "Failed to void item.");
    }
  }

  async function handleSendEmail(orderId: string) {
    setSendingEmail(orderId);
    const res = await sendInvoiceEmail(orderId);
    setSendingEmail(null);
    if (res.success) {
      alert("Invoice email sent successfully.");
      await load();
    } else {
      alert(res.error ?? "Failed to send email.");
    }
  }

  async function handleDownloadPdf(orderId: string, invoiceNumber: string) {
    setDownloading(orderId);
    const res = await getInvoicePdfBase64(orderId);
    setDownloading(null);
    if (!res.success) { alert(res.error ?? "Failed to generate PDF."); return; }
    // Trigger browser download
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${res.data.base64}`;
    link.download = res.data.filename;
    link.click();
  }

  async function handleFulfillment(orderId: string, current: string) {
    const next = current === "pending" ? "partial" : current === "partial" ? "fulfilled" : "pending";
    const label = next === "fulfilled" ? "Mark as Fulfilled" : next === "partial" ? "Mark as Partially Fulfilled" : "Reset to Pending";
    if (!confirm(`${label}?`)) return;
    const res = await updateFulfillmentStatus(orderId, next as any);
    if (res.success) await load();
    else alert(res.error ?? "Failed to update fulfillment.");
  }

  async function handleDelete() {
    if (!deleteDialog) return;
    setDialogWorking(true);
    setDialogError(null);
    const res = await deleteOrder(deleteDialog.id);
    setDialogWorking(false);
    if (res.success) {
      setDeleteDialog(null);
      await load();
    } else {
      setDialogError(res.error ?? "Failed to delete order.");
    }
  }

  async function handleVoid() {
    if (!voidDialog) return;
    setDialogWorking(true);
    setDialogError(null);
    const res = await voidOrder(voidDialog.id, voidReason);
    setDialogWorking(false);
    if (res.success) {
      setVoidDialog(null);
      setVoidReason("");
      await load();
    } else {
      setDialogError(res.error ?? "Failed to void invoice.");
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-heading-1 text-sc-navy">Orders &amp; Invoices</h1>
          <p className="text-body-md text-sc-gray mt-0.5">Manage merchandise orders, field trips, and uniforms.</p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCatalog(true)}>
              <BookOpen className="size-4 mr-1.5" /> Item Catalog
            </Button>
            <Button size="sm" className="bg-sc-teal hover:bg-sc-teal-700 text-white" onClick={() => setShowCreate(true)}>
              <Plus className="size-4 mr-1.5" /> New Order
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray" />
          <Input
            className="pl-9 w-56"
            placeholder="Search family or invoice…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-sc-gray hover:text-sc-navy">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          {STATUS_FILTER_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-label-sm border transition-colors",
                statusFilter === opt.value
                  ? "bg-sc-navy text-white border-sc-navy"
                  : "bg-white text-sc-gray border-sc-gray-200 hover:border-sc-navy/30"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Order list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 text-sc-gray animate-spin" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <AlertCircle className="size-10 text-sc-rose" />
          <p className="text-sc-navy font-medium">Could not load orders</p>
          <p className="text-body-md text-sc-gray max-w-md text-center">{loadError}</p>
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="size-4 mr-1.5" /> Retry
          </Button>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Package className="size-10 mx-auto text-sc-gray-200" />
          <p className="text-sc-navy font-medium">No orders found</p>
          <p className="text-body-md text-sc-gray">
            {search || statusFilter !== "all"
              ? "Try adjusting the filters."
              : "Create your first order to get started."}
          </p>
          {canManage && statusFilter === "all" && !search && (
            <Button size="sm" className="bg-sc-teal hover:bg-sc-teal-700 text-white mt-2" onClick={() => setShowCreate(true)}>
              <Plus className="size-4 mr-1.5" /> New Order
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-body-md">
              <thead className="bg-sc-gray-100/60 border-b border-sc-gray-100">
                <tr>
                  {["Family", "Items", "Total", "Status", "Fulfillment", "Date", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-label-sm text-sc-gray font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sc-gray-100">
                {orders.map(order => (
                  <>
                    <tr
                      key={order.id}
                      className={cn("hover:bg-sc-gray-100/30 cursor-pointer transition-colors", expandedId === order.id && "bg-sc-gray-100/20")}
                      onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-sc-navy">{order.family_name}</div>
                        {order.invoice_number && (
                          <div className="text-label-sm text-sc-gray">{order.invoice_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sc-gray">{order.item_count}</td>
                      <td className="px-4 py-3 font-medium text-sc-navy tabular-nums">{currency(order.subtotal_cents)}</td>
                      <td className="px-4 py-3">{statusBadge(order.order_status)}</td>
                      <td className="px-4 py-3">{fulfillmentBadge(order.fulfillment_status)}</td>
                      <td className="px-4 py-3 text-sc-gray whitespace-nowrap">{formatDate(order.created_at)}</td>
                      <td className="px-4 py-3 text-sc-gray text-label-sm">
                        {expandedId === order.id ? "▲" : "▼"}
                      </td>
                    </tr>

                    {expandedId === order.id && (
                      <tr key={`${order.id}-detail`}>
                        <td colSpan={7} className="px-4 py-4 bg-sc-gray-100/10">
                          <div className="space-y-3">
                            {/* Line items */}
                            <div className="rounded-xl border border-sc-gray-100 overflow-hidden">
                              <table className="min-w-full text-body-md">
                                <thead className="bg-sc-gray-100/60">
                                  <tr>
                                    {["Item", "Size", "Student", "Qty", "Unit Price", "Line Total",
                                      ...(canManage && order.order_status === "draft" ? [""] : [])
                                    ].map(h => (
                                      <th key={h} className="px-3 py-2 text-left text-label-sm text-sc-gray font-medium">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-sc-gray-100">
                                  {order.items.filter(i => !i.is_voided).map(item => {
                                    const isEditing = editingItem?.id === item.id;
                                    const isDraft = canManage && order.order_status === "draft";
                                    return (
                                      <tr key={item.id} className={cn("text-body-md", isEditing && "bg-sc-gold-50/40")}>
                                        <td className="px-3 py-2 text-sc-navy">{item.item_name}</td>

                                        {/* Size */}
                                        <td className="px-3 py-2 text-sc-gray">
                                          {isEditing ? (
                                            <Input
                                              className="h-7 w-20 text-xs"
                                              value={editingItem.size}
                                              onChange={e => setEditingItem(prev => prev ? { ...prev, size: e.target.value } : null)}
                                              placeholder="e.g. M"
                                            />
                                          ) : (item.size ?? "—")}
                                        </td>

                                        {/* Student */}
                                        <td className="px-3 py-2 text-sc-gray">
                                          {isEditing ? (
                                            <span className="text-label-sm text-sc-gray italic">{item.student_name ?? "Family"}</span>
                                          ) : (item.student_name ?? "Family")}
                                        </td>

                                        {/* Qty */}
                                        <td className="px-3 py-2 text-sc-navy">
                                          {isEditing ? (
                                            <div className="flex items-center gap-1">
                                              <button
                                                className="w-6 h-6 rounded border border-sc-gray-200 text-sc-gray hover:border-sc-navy flex items-center justify-center text-sm"
                                                onClick={() => setEditingItem(prev => prev ? { ...prev, quantity: Math.max(1, prev.quantity - 1) } : null)}
                                              >−</button>
                                              <span className="w-6 text-center font-medium">{editingItem.quantity}</span>
                                              <button
                                                className="w-6 h-6 rounded border border-sc-gray-200 text-sc-gray hover:border-sc-navy flex items-center justify-center text-sm"
                                                onClick={() => setEditingItem(prev => prev ? { ...prev, quantity: prev.quantity + 1 } : null)}
                                              >+</button>
                                            </div>
                                          ) : item.quantity}
                                        </td>

                                        <td className="px-3 py-2 tabular-nums">{currency(item.unit_price_cents)}</td>
                                        <td className="px-3 py-2 tabular-nums font-medium text-sc-navy">
                                          {isEditing
                                            ? currency(editingItem.quantity * item.unit_price_cents)
                                            : currency(item.line_total_cents)}
                                        </td>

                                        {isDraft && (
                                          <td className="px-3 py-2">
                                            {isEditing ? (
                                              <div className="flex items-center gap-1">
                                                <button
                                                  onClick={saveEdit}
                                                  disabled={editingItem.saving}
                                                  className="flex items-center gap-1 px-2 py-1 rounded bg-sc-teal text-white text-xs hover:bg-sc-teal-700 disabled:opacity-50"
                                                >
                                                  <Check className="size-3" /> Save
                                                </button>
                                                <button
                                                  onClick={() => setEditingItem(null)}
                                                  className="px-2 py-1 rounded border border-sc-gray-200 text-sc-gray text-xs hover:border-sc-navy"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            ) : (
                                              <div className="flex items-center gap-1">
                                                <button
                                                  onClick={() => startEditing(item)}
                                                  className="p-1 rounded text-sc-gray hover:text-sc-navy hover:bg-sc-gray-100"
                                                  title="Edit item"
                                                >
                                                  <Pencil className="size-3.5" />
                                                </button>
                                                <button
                                                  onClick={() => handleVoidItem(item.id)}
                                                  className="p-1 rounded text-sc-gray hover:text-sc-rose hover:bg-sc-rose-50"
                                                  title="Void item"
                                                >
                                                  <X className="size-3.5" />
                                                </button>
                                              </div>
                                            )}
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}
                                  {order.items.filter(i => i.is_voided).map(item => (
                                    <tr key={item.id} className="opacity-40 text-body-md">
                                      <td className="px-3 py-2 line-through text-sc-gray" colSpan={canManage && order.order_status === "draft" ? 6 : 5}>{item.item_name} — voided</td>
                                      <td className="px-3 py-2 line-through text-sc-gray tabular-nums">{currency(item.line_total_cents)}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-sc-gray-100/40 font-semibold">
                                    <td colSpan={canManage && order.order_status === "draft" ? 6 : 5} className="px-3 py-2 text-right text-sc-navy">Order Total</td>
                                    <td className="px-3 py-2 tabular-nums text-sc-navy">{currency(order.subtotal_cents)}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {order.notes && (
                              <p className="text-label-sm text-sc-gray">Notes: {order.notes}</p>
                            )}
                            {order.created_by_name && (
                              <p className="text-label-sm text-sc-gray">Created by {order.created_by_name} on {formatDate(order.created_at)}</p>
                            )}

                            {/* Phase 2: Invoice & payment actions */}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {canManage && order.order_status === "draft" && (
                                <>
                                  <Button
                                    size="sm"
                                    className="bg-sc-teal hover:bg-sc-teal-700 text-white"
                                    onClick={() => setInvoicingOrder(order)}
                                  >
                                    <FileText className="size-4 mr-1.5" /> Issue Invoice
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-sc-rose-200 text-sc-rose-700 hover:bg-sc-rose-50"
                                    onClick={() => { setDeleteDialog(order); setDialogError(null); }}
                                  >
                                    <Trash2 className="size-4 mr-1.5" /> Delete Draft
                                  </Button>
                                </>
                              )}
                              {["invoiced","partial","paid"].includes(order.order_status) && (
                                <>
                                  {canManage && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={sendingEmail === order.id}
                                      onClick={() => handleSendEmail(order.id)}
                                    >
                                      {sendingEmail === order.id
                                        ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> Sending…</>
                                        : <><Send className="size-4 mr-1.5" /> Email Invoice</>}
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={downloading === order.id}
                                    onClick={() => handleDownloadPdf(order.id, order.invoice_number!)}
                                  >
                                    {downloading === order.id
                                      ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> Generating…</>
                                      : <><Download className="size-4 mr-1.5" /> Download PDF</>}
                                  </Button>
                                  {canManage && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleFulfillment(order.id, order.fulfillment_status)}
                                    >
                                      <Truck className="size-4 mr-1.5" />
                                      {order.fulfillment_status === "pending"   ? "Mark Partially Fulfilled" :
                                       order.fulfillment_status === "partial"   ? "Mark Fulfilled" :
                                       "Reset Fulfillment"}
                                    </Button>
                                  )}
                                  {canManage && order.order_status !== "paid" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-sc-rose-200 text-sc-rose-700 hover:bg-sc-rose-50"
                                      onClick={() => { setVoidDialog(order); setVoidReason(""); setDialogError(null); }}
                                    >
                                      <Ban className="size-4 mr-1.5" /> Void Invoice
                                    </Button>
                                  )}
                                </>
                              )}
                              {order.invoice_sent_at && (
                                <span className="text-label-sm text-sc-gray self-center">
                                  Last sent: {new Date(order.invoice_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                  {order.billing_recipient_email ? ` → ${order.billing_recipient_email}` : ""}
                                </span>
                              )}
                            </div>

                            {/* Phase 2: Payment panel for invoiced orders */}
                            {["invoiced","partial","paid"].includes(order.order_status) && (
                              <div className="rounded-xl border border-sc-gray-100 bg-white p-4">
                                <p className="text-label-sm text-sc-gray font-medium mb-3 uppercase tracking-wide">Payments</p>
                                <PaymentPanel
                                  order={order}
                                  canManage={canManage}
                                  onPaymentRecorded={load}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <ItemCatalogModal
        open={showCatalog}
        onClose={() => setShowCatalog(false)}
        items={catalog}
        onSaved={handleCatalogSaved}
      />
      <CreateOrderModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        catalog={catalog}
        onCreated={handleOrderCreated}
      />
      {invoicingOrder && (
        <IssueInvoiceModal
          order={invoicingOrder}
          onClose={() => setInvoicingOrder(null)}
          onIssued={(invNum) => {
            setInvoicingOrder(null);
            load();
          }}
        />
      )}

      {/* Delete Draft dialog */}
      {deleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-sc-rose-50 p-2 shrink-0">
                <Trash2 className="size-5 text-sc-rose-700" />
              </div>
              <div>
                <h2 className="text-heading-1 text-sc-navy">Delete Draft Order?</h2>
                <p className="text-body-md text-sc-gray mt-1">
                  This will permanently delete the draft order for{" "}
                  <strong>{deleteDialog.family_name}</strong>
                  {deleteDialog.invoice_number ? ` (${deleteDialog.invoice_number})` : ""}.
                  This cannot be undone.
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 space-y-1">
              <p className="text-label-sm text-sc-rose-700 font-medium">
                {deleteDialog.item_count} item{deleteDialog.item_count !== 1 ? "s" : ""} — {currency(deleteDialog.subtotal_cents)}
              </p>
              <p className="text-label-sm text-sc-rose-700">Only drafts with no payment records can be deleted.</p>
            </div>
            {dialogError && (
              <p className="text-sc-rose-700 text-body-md bg-sc-rose-50 rounded-lg px-3 py-2">{dialogError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setDeleteDialog(null)} disabled={dialogWorking}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-sc-rose-700 hover:bg-sc-rose text-white"
                onClick={handleDelete}
                disabled={dialogWorking}
              >
                {dialogWorking ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> Deleting…</> : "Delete Draft"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Void Invoice dialog */}
      {voidDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-sc-gold-50 p-2 shrink-0">
                <Ban className="size-5 text-sc-gold-700" />
              </div>
              <div>
                <h2 className="text-heading-1 text-sc-navy">Void Invoice?</h2>
                <p className="text-body-md text-sc-gray mt-1">
                  This will void invoice <strong>{voidDialog.invoice_number}</strong> for{" "}
                  <strong>{voidDialog.family_name}</strong>.
                </p>
              </div>
            </div>
            <div className="rounded-xl bg-sc-gold-50 border border-sc-gold-300 px-4 py-3 space-y-1 text-label-sm text-sc-gold-800">
              <p className="font-medium">Invoice total: {currency(voidDialog.subtotal_cents)}</p>
              <p>Voided invoices are excluded from outstanding balances. The invoice number is never reused. All records are preserved.</p>
              <p>If there are active payments, you must reverse them first before voiding.</p>
            </div>
            <div className="space-y-1">
              <label className="text-label-sm text-sc-gray">Reason for voiding <span className="font-normal">(optional)</span></label>
              <Input
                placeholder="e.g. Entered by mistake, duplicate order"
                value={voidReason}
                onChange={e => setVoidReason(e.target.value)}
              />
            </div>
            {dialogError && (
              <p className="text-sc-rose-700 text-body-md bg-sc-rose-50 rounded-lg px-3 py-2">{dialogError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setVoidDialog(null)} disabled={dialogWorking}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-sc-gold-700 hover:bg-sc-gold-800 text-white"
                onClick={handleVoid}
                disabled={dialogWorking}
              >
                {dialogWorking ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> Voiding…</> : "Void Invoice"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
