"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Pencil, EyeOff, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ITEM_CATEGORY_LABELS, COMMON_SIZES,
  type StoreItem, type ItemCategory,
  type CreateStoreItemInput, type UpdateStoreItemInput,
} from "@/app/actions/orders-constants";
import { createCatalogItem, updateCatalogItem } from "@/app/actions/orders";

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

interface Props {
  open:     boolean;
  onClose:  () => void;
  items:    StoreItem[];
  onSaved:  (item: StoreItem) => void;
}

type FormState = {
  name:             string;
  description:      string;
  category:         ItemCategory;
  price:            string;           // dollar string, converted to cents on submit
  sizes:            string[];
  customSizeInput:  string;
};

const EMPTY: FormState = {
  name: "", description: "", category: "other", price: "", sizes: [], customSizeInput: "",
};

export function ItemCatalogModal({ open, onClose, items, onSaved }: Props) {
  const [editing, setEditing]   = useState<StoreItem | null>(null);
  const [form,    setForm]      = useState<FormState>(EMPTY);
  const [saving,  setSaving]    = useState(false);
  const [error,   setError]     = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setShowForm(true);
  }

  function openEdit(item: StoreItem) {
    setEditing(item);
    setForm({
      name:            item.name,
      description:     item.description ?? "",
      category:        item.category,
      price:           (item.unit_price_cents / 100).toFixed(2),
      sizes:           item.available_sizes ?? [],
      customSizeInput: "",
    });
    setError(null);
    setShowForm(true);
  }

  function toggleSize(s: string) {
    setForm(f => ({
      ...f,
      sizes: f.sizes.includes(s) ? f.sizes.filter(x => x !== s) : [...f.sizes, s],
    }));
  }

  function addCustomSize() {
    const s = form.customSizeInput.trim().toUpperCase();
    if (s && !form.sizes.includes(s)) {
      setForm(f => ({ ...f, sizes: [...f.sizes, s], customSizeInput: "" }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const priceCents = Math.round(parseFloat(form.price) * 100);
    if (isNaN(priceCents) || priceCents < 0) { setError("Enter a valid price"); return; }
    if (!form.name.trim()) { setError("Name is required"); return; }

    setSaving(true);
    try {
      if (editing) {
        const input: UpdateStoreItemInput = {
          id:               editing.id,
          name:             form.name,
          description:      form.description || undefined,
          category:         form.category,
          unit_price_cents: priceCents,
          available_sizes:  form.sizes.length > 0 ? form.sizes : null,
        };
        const result = await updateCatalogItem(input);
        if (!result.success) { setError(result.error); return; }
        onSaved(result.data);
      } else {
        const input: CreateStoreItemInput = {
          name:             form.name,
          description:      form.description || undefined,
          category:         form.category,
          unit_price_cents: priceCents,
          available_sizes:  form.sizes.length > 0 ? form.sizes : null,
        };
        const result = await createCatalogItem(input);
        if (!result.success) { setError(result.error ?? "Failed to save item"); return; }
        onSaved(result.data);
      }
      // Reset form so the next item starts fresh
      setForm(EMPTY);
      setEditing(null);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: StoreItem) {
    await updateCatalogItem({ id: item.id, is_active: !item.is_active });
    onSaved({ ...item, is_active: !item.is_active });
  }

  const activeItems   = items.filter(i => i.is_active);
  const inactiveItems = items.filter(i => !i.is_active);

  return (
    <Dialog open={open} onOpenChange={() => { onClose(); setShowForm(false); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sc-navy">Item Catalog</DialogTitle>
        </DialogHeader>

        {/* Item list */}
        {!showForm && (
          <div className="space-y-3">
            <Button onClick={openCreate} size="sm" className="bg-sc-teal hover:bg-sc-teal-700 text-white w-full">
              <Plus className="size-4 mr-1.5" /> Add Item
            </Button>

            {activeItems.length === 0 && inactiveItems.length === 0 && (
              <p className="text-center py-6 text-sc-gray text-body-md">No items yet. Add your first item to the catalog.</p>
            )}

            {activeItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-sc-gray-100 bg-white p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sc-navy font-medium text-body-md truncate">{item.name}</span>
                    <span className="text-xs text-sc-gray bg-sc-gray-100 rounded px-1.5 py-0.5">{ITEM_CATEGORY_LABELS[item.category]}</span>
                  </div>
                  <div className="text-sc-gray text-label-sm mt-0.5">
                    {currency(item.unit_price_cents)}
                    {item.available_sizes && item.available_sizes.length > 0 && (
                      <span className="ml-2">· Sizes: {item.available_sizes.join(", ")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => openEdit(item)} className="p-1.5 rounded hover:bg-sc-gray-100 text-sc-gray">
                    <Pencil className="size-3.5" />
                  </button>
                  <button onClick={() => toggleActive(item)} className="p-1.5 rounded hover:bg-sc-gray-100 text-sc-gray" title="Deactivate">
                    <EyeOff className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {inactiveItems.length > 0 && (
              <details className="text-sm text-sc-gray">
                <summary className="cursor-pointer select-none">Inactive items ({inactiveItems.length})</summary>
                <div className="mt-2 space-y-2">
                  {inactiveItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl border border-sc-gray-100 bg-sc-gray-100/40 p-3 opacity-60">
                      <div className="flex-1 min-w-0">
                        <span className="text-sc-navy text-body-md line-through">{item.name}</span>
                        <div className="text-label-sm text-sc-gray">{currency(item.unit_price_cents)}</div>
                      </div>
                      <button onClick={() => toggleActive(item)} className="p-1.5 rounded hover:bg-white text-sc-teal" title="Reactivate">
                        <Eye className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Add / Edit form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className="text-label-md font-semibold text-sc-navy">{editing ? "Edit Item" : "New Item"}</h3>

            <div className="space-y-1.5">
              <Label htmlFor="item-name">Item Name</Label>
              <Input id="item-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Field Trip T-Shirt" required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="item-category">Category</Label>
                <select
                  id="item-category"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value as ItemCategory }))}
                  className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
                >
                  {Object.entries(ITEM_CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="item-price">Unit Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sc-gray">$</span>
                  <Input
                    id="item-price"
                    className="pl-7"
                    value={form.price}
                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-desc">Description <span className="text-sc-gray font-normal">(optional)</span></Label>
              <Textarea id="item-desc" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="space-y-2">
              <Label>Available Sizes <span className="text-sc-gray font-normal">(leave empty if no size needed)</span></Label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_SIZES.map(s => (
                  <button
                    key={s} type="button"
                    onClick={() => toggleSize(s)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-label-sm border transition-colors",
                      form.sizes.includes(s)
                        ? "bg-sc-teal text-white border-sc-teal"
                        : "bg-white text-sc-gray border-sc-gray-200 hover:border-sc-teal"
                    )}
                  >{s}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={form.customSizeInput}
                  onChange={e => setForm(f => ({ ...f, customSizeInput: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomSize(); }}}
                  placeholder="Custom size…"
                  className="text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={addCustomSize}>Add</Button>
              </div>
              {form.sizes.length > 0 && (
                <p className="text-label-sm text-sc-gray">Selected: {form.sizes.join(", ")}</p>
              )}
            </div>

            {error && <p className="text-sc-rose-700 text-label-sm">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Back</Button>
              <Button type="submit" disabled={saving} className="bg-sc-teal hover:bg-sc-teal-700 text-white">
                {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                {editing ? "Save Changes" : "Add Item"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
