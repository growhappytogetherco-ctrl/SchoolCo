"use client";

import { useState } from "react";
import { X, FileText, Loader2, User, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { OrderRow } from "@/app/actions/orders-constants";
import { issueInvoice } from "@/app/actions/orders";

interface Props {
  order: OrderRow;
  onClose: () => void;
  onIssued: (invoiceNumber: string) => void;
}

export function IssueInvoiceModal({ order, onClose, onIssued }: Props) {
  const defaultRecipientName  = order.billing_recipient_name  ?? order.family_name;
  const defaultRecipientEmail = order.billing_recipient_email ?? order.guardian_email ?? "";

  const [recipientName,  setRecipientName]  = useState(defaultRecipientName);
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail);
  const [dueDateOverride, setDueDateOverride] = useState("");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const activeItems = order.items.filter(i => !i.is_voided);

  function currency(cents: number) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  }

  async function handleIssue() {
    if (!recipientEmail.trim()) { setError("Billing email is required."); return; }
    if (!recipientName.trim())  { setError("Billing recipient name is required."); return; }
    setSaving(true);
    setError(null);

    const res = await issueInvoice({
      order_id:                order.id,
      billing_recipient_id:    order.billing_recipient_id ?? null,
      billing_recipient_name:  recipientName.trim(),
      billing_recipient_email: recipientEmail.trim(),
      due_date_override:       dueDateOverride || undefined,
    });

    if (res.success) {
      onIssued(res.data.invoice_number);
    } else {
      setError(res.error ?? "Failed to issue invoice.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-sc-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sc-teal/10 flex items-center justify-center">
              <FileText className="size-5 text-sc-teal" />
            </div>
            <div>
              <h2 className="text-heading-1 text-sc-navy">Issue Invoice</h2>
              <p className="text-label-sm text-sc-gray">{order.family_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-sc-gray hover:text-sc-navy hover:bg-sc-gray-100">
            <X className="size-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Order summary */}
          <div className="rounded-xl bg-sc-gray-100/50 p-4 space-y-2">
            <p className="text-label-sm text-sc-gray uppercase tracking-wide">Order Summary</p>
            {activeItems.map(item => (
              <div key={item.id} className="flex justify-between text-body-md">
                <span className="text-sc-navy">
                  {item.item_name}{item.size ? ` (${item.size})` : ""} × {item.quantity}
                  {item.student_name ? <span className="text-sc-gray ml-1">— {item.student_name}</span> : null}
                </span>
                <span className="tabular-nums font-medium">{currency(item.line_total_cents)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold text-sc-navy pt-2 border-t border-sc-gray-200">
              <span>Total</span>
              <span className="tabular-nums">{currency(order.subtotal_cents)}</span>
            </div>
          </div>

          {/* Billing recipient */}
          <div className="space-y-3">
            <p className="text-label-sm text-sc-gray font-medium">Billing Recipient</p>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray" />
              <Input
                className="pl-9"
                placeholder="Full name"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray" />
              <Input
                className="pl-9"
                type="email"
                placeholder="Email address"
                value={recipientEmail}
                onChange={e => setRecipientEmail(e.target.value)}
              />
            </div>
          </div>

          {/* Optional due date override */}
          <div className="space-y-1">
            <label className="text-label-sm text-sc-gray font-medium">Due Date <span className="font-normal">(optional — defaults to 30 days)</span></label>
            <Input
              type="date"
              value={dueDateOverride}
              onChange={e => setDueDateOverride(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
          </div>

          {error && (
            <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-sc-rose-700 text-body-md">
              {error}
            </div>
          )}

          <p className="text-label-sm text-sc-gray italic">
            Issuing the invoice locks item details and generates a unique invoice number.
            You can send the PDF to the billing recipient after issuance.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sc-gray-100">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="bg-sc-teal hover:bg-sc-teal-700 text-white"
            onClick={handleIssue}
            disabled={saving || !recipientEmail.trim()}
          >
            {saving ? <><Loader2 className="size-4 mr-2 animate-spin" /> Issuing…</> : "Issue Invoice"}
          </Button>
        </div>
      </div>
    </div>
  );
}
