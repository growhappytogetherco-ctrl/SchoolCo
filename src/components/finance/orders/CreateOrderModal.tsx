"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, X, Plus, Minus, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ITEM_CATEGORY_LABELS,
  type StoreItem, type OrderItemRow,
} from "@/app/actions/orders-constants";
import {
  createOrder, addOrderItem, searchFamilyAccounts, getStudentsForFamily,
} from "@/app/actions/orders";

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

interface FamilyResult {
  id:             string;
  account_name:   string;
  guardian_email: string | null;
  student_names:  string[];
}

interface StudentOption {
  id:          string;
  full_name:   string;
  grade_level: string | null;
}

interface PendingItem {
  key:             string;  // client-only unique key
  store_item_id?:  string;
  item_name:       string;
  size:            string | null;
  quantity:        number;
  unit_price_cents: number;
  student_id:      string | null;
  student_name:    string | null;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  catalog:   StoreItem[];
  onCreated: (orderId: string) => void;
}

export function CreateOrderModal({ open, onClose, catalog, onCreated }: Props) {
  const [step,        setStep]       = useState<"family" | "items">("family");
  const [search,      setSearch]     = useState("");
  const [results,     setResults]    = useState<FamilyResult[]>([]);
  const [searching,   setSearching]  = useState(false);
  const [selected,    setSelected]   = useState<FamilyResult | null>(null);
  const [students,    setStudents]   = useState<StudentOption[]>([]);
  const [items,       setItems]      = useState<PendingItem[]>([]);
  const [notes,       setNotes]      = useState("");
  const [saving,      setSaving]     = useState(false);
  const [error,       setError]      = useState<string | null>(null);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("family"); setSearch(""); setResults([]); setSelected(null);
      setStudents([]); setItems([]); setNotes(""); setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      const r = await searchFamilyAccounts(search);
      setResults(r.success ? r.data : []);
      setSearching(false);
    }, 300);
  }, [search]);

  async function selectFamily(f: FamilyResult) {
    setSelected(f);
    setSearch(f.account_name);
    setResults([]);
    const r = await getStudentsForFamily(f.id);
    setStudents(r.success ? r.data : []);
  }

  function addItem(catalogItem: StoreItem) {
    setItems(prev => [...prev, {
      key:             crypto.randomUUID(),
      store_item_id:   catalogItem.id,
      item_name:       catalogItem.name,
      size:            catalogItem.available_sizes?.[0] ?? null,
      quantity:        1,
      unit_price_cents: catalogItem.unit_price_cents,
      student_id:      null,
      student_name:    null,
    }]);
  }

  function updateItem(key: string, patch: Partial<PendingItem>) {
    setItems(prev => prev.map(i => i.key === key ? { ...i, ...patch } : i));
  }

  function removeItem(key: string) {
    setItems(prev => prev.filter(i => i.key !== key));
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price_cents, 0);

  async function handleSubmit() {
    if (!selected) { setError("Select a family first"); return; }
    if (items.length === 0) { setError("Add at least one item"); return; }
    setError(null);
    setSaving(true);
    try {
      const orderResult = await createOrder({ family_account_id: selected.id, notes: notes || undefined });
      if (!orderResult.success) { setError(orderResult.error); return; }
      const orderId = orderResult.data.id;

      for (const item of items) {
        const r = await addOrderItem({
          order_id:         orderId,
          store_item_id:    item.store_item_id,
          item_name:        item.item_name,
          size:             item.size,
          quantity:         item.quantity,
          unit_price_cents: item.unit_price_cents,
          student_id:       item.student_id,
        });
        if (!r.success) { setError(`Failed to add item "${item.item_name}": ${r.error}`); return; }
      }

      onCreated(orderId);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const activeCatalog = catalog.filter(i => i.is_active);
  const categorized   = Object.keys(ITEM_CATEGORY_LABELS) as Array<keyof typeof ITEM_CATEGORY_LABELS>;

  return (
    <Dialog open={open} onOpenChange={() => !saving && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sc-navy">New Order</DialogTitle>
        </DialogHeader>

        {/* Step 1: Family selection */}
        <div className="space-y-2">
          <Label>Family / Billing Recipient</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray" />
            <Input
              className="pl-9 pr-9"
              placeholder="Search by family name…"
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null); }}
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-sc-gray" />}
            {selected && !searching && (
              <button onClick={() => { setSelected(null); setSearch(""); setStudents([]); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sc-gray hover:text-sc-navy">
                <X className="size-4" />
              </button>
            )}
          </div>
          {results.length > 0 && !selected && (
            <div className="rounded-xl border border-sc-gray-100 bg-white divide-y divide-sc-gray-100 shadow-card">
              {results.map(f => (
                <button key={f.id} onClick={() => selectFamily(f)}
                  className="w-full text-left px-4 py-3 hover:bg-sc-gray-100/50 transition-colors">
                  <div className="text-sc-navy font-medium text-body-md">{f.account_name}</div>
                  <div className="text-sc-gray text-label-sm">
                    {f.guardian_email && <span>{f.guardian_email} · </span>}
                    {f.student_names.length > 0 && <span>{f.student_names.join(", ")}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {selected && (
            <div className="rounded-xl border border-sc-teal/30 bg-sc-teal/5 px-4 py-3">
              <div className="font-medium text-sc-navy">{selected.account_name}</div>
              {selected.guardian_email && <div className="text-label-sm text-sc-gray">{selected.guardian_email}</div>}
              {selected.student_names.length > 0 && (
                <div className="text-label-sm text-sc-gray mt-0.5">Students: {selected.student_names.join(", ")}</div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Item selection */}
        {selected && (
          <>
            <div className="border-t border-sc-gray-100 pt-4 space-y-4">
              <h3 className="text-label-md font-semibold text-sc-navy">Add Items from Catalog</h3>

              {activeCatalog.length === 0 ? (
                <p className="text-sc-gray text-body-md">No active catalog items. Add items to the catalog first.</p>
              ) : (
                <div className="space-y-2">
                  {categorized
                    .filter(cat => activeCatalog.some(i => i.category === cat))
                    .map(cat => (
                      <div key={cat}>
                        <div className="text-label-sm text-sc-gray mb-1">{ITEM_CATEGORY_LABELS[cat]}</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {activeCatalog.filter(i => i.category === cat).map(item => (
                            <button key={item.id} onClick={() => addItem(item)}
                              className="text-left rounded-xl border border-sc-gray-100 bg-white p-3 hover:border-sc-teal/50 hover:bg-sc-teal/5 transition-colors">
                              <div className="text-sc-navy font-medium text-label-sm leading-snug">{item.name}</div>
                              <div className="text-sc-teal font-semibold text-label-sm mt-0.5">{currency(item.unit_price_cents)}</div>
                              {item.available_sizes && <div className="text-xs text-sc-gray mt-0.5">Sizes available</div>}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Pending items */}
            {items.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-label-md font-semibold text-sc-navy">Order Items</h3>
                {items.map(item => {
                  const catalogItem = catalog.find(c => c.id === item.store_item_id);
                  const hasSizes    = catalogItem?.available_sizes && catalogItem.available_sizes.length > 0;
                  return (
                    <div key={item.key} className="rounded-xl border border-sc-gray-100 bg-white p-3 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-sc-navy text-body-md">{item.item_name}</div>
                          <div className="text-sc-gray text-label-sm">{currency(item.unit_price_cents)} each</div>
                        </div>
                        <button onClick={() => removeItem(item.key)} className="text-sc-gray hover:text-sc-rose-700 p-1">
                          <X className="size-4" />
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-3 items-center">
                        {/* Qty */}
                        <div className="flex items-center gap-1.5">
                          <button type="button"
                            onClick={() => item.quantity > 1 && updateItem(item.key, { quantity: item.quantity - 1 })}
                            className="size-7 rounded-lg border border-sc-gray-200 flex items-center justify-center hover:bg-sc-gray-100">
                            <Minus className="size-3" />
                          </button>
                          <span className="w-6 text-center text-sc-navy font-medium text-body-md">{item.quantity}</span>
                          <button type="button"
                            onClick={() => updateItem(item.key, { quantity: item.quantity + 1 })}
                            className="size-7 rounded-lg border border-sc-gray-200 flex items-center justify-center hover:bg-sc-gray-100">
                            <Plus className="size-3" />
                          </button>
                        </div>

                        {/* Size */}
                        {hasSizes && (
                          <select
                            value={item.size ?? ""}
                            onChange={e => updateItem(item.key, { size: e.target.value || null })}
                            className="border border-sc-gray-200 rounded-lg px-2 py-1 text-label-sm"
                          >
                            <option value="">Size…</option>
                            {catalogItem!.available_sizes!.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        )}

                        {/* Student */}
                        {students.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <User className="size-3.5 text-sc-gray" />
                            <select
                              value={item.student_id ?? ""}
                              onChange={e => {
                                const s = students.find(st => st.id === e.target.value);
                                updateItem(item.key, { student_id: e.target.value || null, student_name: s?.full_name ?? null });
                              }}
                              className="border border-sc-gray-200 rounded-lg px-2 py-1 text-label-sm"
                            >
                              <option value="">Family order</option>
                              {students.map(s => (
                                <option key={s.id} value={s.id}>{s.full_name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        <span className="ml-auto text-sc-navy font-semibold text-body-md tabular-nums">
                          {currency(item.quantity * item.unit_price_cents)}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {/* Subtotal */}
                <div className="flex justify-between px-3 py-2 rounded-xl bg-sc-navy/5 border border-sc-navy/10">
                  <span className="font-semibold text-sc-navy text-body-md">Order Total</span>
                  <span className="tabular-nums font-bold text-sc-navy text-base">{currency(subtotal)}</span>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="order-notes">Notes <span className="text-sc-gray font-normal">(optional)</span></Label>
              <Textarea id="order-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Internal notes about this order…" />
            </div>
          </>
        )}

        {error && <p className="text-sc-rose-700 text-label-sm">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-sc-gray-100">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !selected || items.length === 0}
            className="bg-sc-teal hover:bg-sc-teal-700 text-white"
          >
            {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            Save Draft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
