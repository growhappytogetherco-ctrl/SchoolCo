"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, X, Plus, Minus, User, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ITEM_CATEGORY_LABELS,
  type StoreItem, type OrderItemRow,
} from "@/app/actions/orders-constants";
import {
  createOrder, addOrderItem, getActiveStudentsForOrg, getStudentsForFamily,
} from "@/app/actions/orders";

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

interface BillingAccount {
  id:    string;
  name:  string;
  email: string | null;
}

interface StudentSearchResult {
  id:           string;
  display_name: string;
  grade_level:  string | null;
  accounts:     BillingAccount[];
}

interface PendingItem {
  key:              string;
  store_item_id?:   string;
  item_name:        string;
  size:             string | null;
  quantity:         number;
  unit_price_cents: number;
  student_id:       string | null;
  student_name:     string | null;
}

interface SiblingStudent {
  id:          string;
  full_name:   string;
  grade_level: string | null;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  catalog:   StoreItem[];
  onCreated: (orderId: string) => void;
}

export function CreateOrderModal({ open, onClose, catalog, onCreated }: Props) {
  const [allStudents,    setAllStudents]   = useState<StudentSearchResult[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [search,         setSearch]        = useState("");
  const [dropdownOpen,   setDropdownOpen]  = useState(false);
  const [selected,       setSelected]      = useState<StudentSearchResult | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<BillingAccount | null>(null);
  const [siblings,       setSiblings]      = useState<SiblingStudent[]>([]);
  const [items,          setItems]         = useState<PendingItem[]>([]);
  const [notes,          setNotes]         = useState("");
  const [saving,         setSaving]        = useState(false);
  const [error,          setError]         = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all active enrolled students on open
  useEffect(() => {
    if (!open) {
      setAllStudents([]); setSearch(""); setDropdownOpen(false); setSelected(null);
      setSelectedAccount(null); setSiblings([]); setItems([]); setNotes(""); setError(null);
      return;
    }
    setLoadingStudents(true);
    getActiveStudentsForOrg().then(r => {
      setAllStudents(r.success ? r.data : []);
      setLoadingStudents(false);
    });
  }, [open]);

  // Filtered student list for the dropdown
  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return allStudents;
    return allStudents.filter(s =>
      s.display_name.toLowerCase().includes(term) ||
      (s.grade_level ?? "").toLowerCase().includes(term)
    );
  }, [allStudents, search]);

  async function selectStudent(s: StudentSearchResult) {
    setSelected(s);
    setSearch(s.display_name);
    setDropdownOpen(false);
    setItems([]);
    // Auto-select if only one account; otherwise require explicit selection
    const autoAccount = s.accounts.length === 1 ? s.accounts[0] : null;
    setSelectedAccount(autoAccount);
    // Load siblings for the auto-selected account
    if (autoAccount) {
      const r = await getStudentsForFamily(autoAccount.id);
      setSiblings(r.success ? r.data : [{ id: s.id, full_name: s.display_name, grade_level: s.grade_level }]);
    } else {
      setSiblings([{ id: s.id, full_name: s.display_name, grade_level: s.grade_level }]);
    }
  }

  async function handleAccountSelect(acct: BillingAccount) {
    setSelectedAccount(acct);
    setItems([]);
    const r = await getStudentsForFamily(acct.id);
    setSiblings(r.success ? r.data : selected ? [{ id: selected.id, full_name: selected.display_name, grade_level: selected.grade_level }] : []);
  }

  function clearSelection() {
    setSelected(null);
    setSelectedAccount(null);
    setSearch("");
    setSiblings([]);
    setItems([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function addItem(catalogItem: StoreItem) {
    setItems(prev => [...prev, {
      key:              crypto.randomUUID(),
      store_item_id:    catalogItem.id,
      item_name:        catalogItem.name,
      size:             catalogItem.available_sizes?.[0] ?? null,
      quantity:         1,
      unit_price_cents: catalogItem.unit_price_cents,
      student_id:       selected?.id ?? null,
      student_name:     selected?.display_name ?? null,
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
    if (!selectedAccount) {
      setError("Select a billing account first");
      return;
    }
    if (items.length === 0) { setError("Add at least one item"); return; }
    setError(null);
    setSaving(true);
    try {
      const orderResult = await createOrder({
        family_account_id: selectedAccount.id,
        notes: notes || undefined,
      });
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

        {/* Step 1: Student selection */}
        <div className="space-y-2">
          <Label>Select Student</Label>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray pointer-events-none" />
            <Input
              ref={inputRef}
              className="pl-9 pr-9"
              placeholder={loadingStudents ? "Loading students…" : "Search by student name or grade…"}
              value={search}
              disabled={loadingStudents}
              onChange={e => { setSearch(e.target.value); if (!selected) setDropdownOpen(true); }}
              onFocus={() => { if (!selected) setDropdownOpen(true); }}
            />
            {loadingStudents && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-sc-gray" />
            )}
            {selected && !loadingStudents && (
              <button
                onClick={clearSelection}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-sc-gray hover:text-sc-navy"
                title="Clear selection"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Dropdown list */}
          {dropdownOpen && !selected && filteredStudents.length > 0 && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
              <div className="relative z-20 rounded-xl border border-sc-gray-100 bg-white divide-y divide-sc-gray-100 shadow-card max-h-64 overflow-y-auto">
                {filteredStudents.map(s => (
                  <button
                    key={s.id}
                    onClick={() => selectStudent(s)}
                    className="w-full text-left px-4 py-2.5 hover:bg-sc-gray-100/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sc-navy font-medium text-body-md">{s.display_name}</span>
                      {s.grade_level && (
                        <span className="text-xs text-sc-gray bg-sc-gray-100 rounded px-1.5 py-0.5 shrink-0">
                          {s.grade_level}
                        </span>
                      )}
                    </div>
                    <div className="text-sc-gray text-label-sm mt-0.5">
                      {s.accounts.length === 0
                        ? <span className="text-sc-rose-700">No billing account linked</span>
                        : s.accounts.length === 1
                          ? `Billing: ${s.accounts[0].name}`
                          : `${s.accounts.length} billing accounts`
                      }
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {dropdownOpen && !selected && !loadingStudents && filteredStudents.length === 0 && search.trim() && (
            <p className="text-sc-gray text-label-sm px-1">No enrolled students match "{search}"</p>
          )}

          {/* Selected student card + billing account picker */}
          {selected && (
            <div className="rounded-xl border border-sc-teal/30 bg-sc-teal/5 px-4 py-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-sc-navy">
                  {selected.display_name}
                  {selected.grade_level && (
                    <span className="ml-2 text-xs text-sc-gray font-normal">{selected.grade_level}</span>
                  )}
                </div>
              </div>

              {selected.accounts.length === 0 ? (
                <div className="flex items-center gap-1.5 text-label-sm text-sc-rose-700">
                  <AlertCircle className="size-3.5 shrink-0" />
                  No billing account linked. Contact admin before creating an order.
                </div>
              ) : selected.accounts.length === 1 ? (
                <div className="text-label-sm text-sc-gray">
                  <span className="font-medium text-sc-teal-700">Billing: </span>
                  {selected.accounts[0].name}
                  {selected.accounts[0].email && <span> · {selected.accounts[0].email}</span>}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-label-sm">Bill to</Label>
                  <div className="grid gap-1.5">
                    {selected.accounts.map(acct => (
                      <button
                        key={acct.id}
                        type="button"
                        onClick={() => handleAccountSelect(acct)}
                        className={cn(
                          "text-left rounded-lg border px-3 py-2 text-label-sm transition-colors",
                          selectedAccount?.id === acct.id
                            ? "border-sc-teal bg-sc-teal/10 text-sc-teal-700 font-medium"
                            : "border-sc-gray-200 bg-white text-sc-navy hover:border-sc-teal/50"
                        )}
                      >
                        {acct.name}
                        {acct.email && <span className="ml-2 text-sc-gray font-normal">{acct.email}</span>}
                      </button>
                    ))}
                  </div>
                  {!selectedAccount && (
                    <p className="text-label-sm text-sc-rose-700">Select a billing account to continue</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Item selection (only if student + billing account are resolved) */}
        {selected && selectedAccount && (
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
                            <button
                              key={item.id}
                              onClick={() => addItem(item)}
                              className="text-left rounded-xl border border-sc-gray-100 bg-white p-3 hover:border-sc-teal/50 hover:bg-sc-teal/5 transition-colors"
                            >
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

                        {/* Student assignment — siblings from same family */}
                        {siblings.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <User className="size-3.5 text-sc-gray" />
                            <select
                              value={item.student_id ?? ""}
                              onChange={e => {
                                const s = siblings.find(st => st.id === e.target.value);
                                updateItem(item.key, {
                                  student_id:   e.target.value || null,
                                  student_name: s?.full_name ?? null,
                                });
                              }}
                              className="border border-sc-gray-200 rounded-lg px-2 py-1 text-label-sm"
                            >
                              <option value="">Family order</option>
                              {siblings.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.full_name}{s.grade_level ? ` (${s.grade_level})` : ""}
                                </option>
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
              <Textarea
                id="order-notes"
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Internal notes about this order…"
              />
            </div>
          </>
        )}

        {error && <p className="text-sc-rose-700 text-label-sm">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t border-sc-gray-100">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !selectedAccount || items.length === 0}
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
