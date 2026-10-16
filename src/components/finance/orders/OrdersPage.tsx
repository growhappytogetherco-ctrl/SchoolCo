"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, BookOpen, Search, Filter, Loader2, Package, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ORDER_STATUS_LABELS, FULFILLMENT_STATUS_LABELS,
  type StoreItem, type OrderRow, type OrderStatus,
} from "@/app/actions/orders-constants";
import { getOrdersForOrg, getCatalogItems } from "@/app/actions/orders";
import { ItemCatalogModal } from "./ItemCatalogModal";
import { CreateOrderModal } from "./CreateOrderModal";

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
];

interface Props {
  canManage: boolean;
}

export function OrdersPage({ canManage }: Props) {
  const [orders,         setOrders]        = useState<OrderRow[]>([]);
  const [catalog,        setCatalog]       = useState<StoreItem[]>([]);
  const [loading,        setLoading]       = useState(true);
  const [statusFilter,   setStatusFilter]  = useState("all");
  const [search,         setSearch]        = useState("");
  const [showCatalog,    setShowCatalog]   = useState(false);
  const [showCreate,     setShowCreate]    = useState(false);
  const [expandedId,     setExpandedId]    = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [ordersRes, catalogRes] = await Promise.all([
      getOrdersForOrg({ status: statusFilter, search: search || undefined, limit: 100 }),
      getCatalogItems(),
    ]);
    if (ordersRes.success)  setOrders(ordersRes.data);
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
                                    {["Item", "Size", "Student", "Qty", "Unit Price", "Line Total"].map(h => (
                                      <th key={h} className="px-3 py-2 text-left text-label-sm text-sc-gray font-medium">{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-sc-gray-100">
                                  {order.items.filter(i => !i.is_voided).map(item => (
                                    <tr key={item.id} className="text-body-md">
                                      <td className="px-3 py-2 text-sc-navy">{item.item_name}</td>
                                      <td className="px-3 py-2 text-sc-gray">{item.size ?? "—"}</td>
                                      <td className="px-3 py-2 text-sc-gray">{item.student_name ?? "Family"}</td>
                                      <td className="px-3 py-2 text-sc-navy">{item.quantity}</td>
                                      <td className="px-3 py-2 tabular-nums">{currency(item.unit_price_cents)}</td>
                                      <td className="px-3 py-2 tabular-nums font-medium text-sc-navy">{currency(item.line_total_cents)}</td>
                                    </tr>
                                  ))}
                                  {order.items.filter(i => i.is_voided).map(item => (
                                    <tr key={item.id} className="opacity-40 text-body-md">
                                      <td className="px-3 py-2 line-through text-sc-gray" colSpan={5}>{item.item_name} — voided</td>
                                      <td className="px-3 py-2 line-through text-sc-gray tabular-nums">{currency(item.line_total_cents)}</td>
                                    </tr>
                                  ))}
                                  <tr className="bg-sc-gray-100/40 font-semibold">
                                    <td colSpan={5} className="px-3 py-2 text-right text-sc-navy">Order Total</td>
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

                            {/* Actions placeholder for Phase 2 */}
                            {canManage && order.order_status === "draft" && (
                              <div className="flex gap-2 pt-1">
                                <span className="text-label-sm text-sc-gray italic">Invoice, payment, and fulfillment actions coming in Phase 2.</span>
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
    </div>
  );
}
