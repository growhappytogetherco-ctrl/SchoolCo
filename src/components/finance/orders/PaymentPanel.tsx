"use client";

import { useState, useEffect, useCallback } from "react";
import { DollarSign, Plus, Check, RotateCcw, Loader2, ChevronDown, ChevronUp, Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  PAYMENT_METHOD_LABELS,
  type OrderPayment, type PaymentMethod, type PaymentStatus, type OrderRow,
} from "@/app/actions/orders-constants";
import { getOrderPayments, recordPayment, verifyPayment, reversePayment } from "@/app/actions/orders";

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_BADGE: Record<PaymentStatus, string> = {
  pending:  "bg-sc-gold-50 text-sc-gold-700 border border-sc-gold-300",
  verified: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  reversed: "bg-sc-rose-50 text-sc-rose-700 border border-sc-rose-200 line-through opacity-60",
};

interface Props {
  order: OrderRow;
  canManage: boolean;
  onPaymentRecorded: () => void;
}

export function PaymentPanel({ order, canManage, onPaymentRecorded }: Props) {
  const [payments,    setPayments]   = useState<OrderPayment[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [showForm,    setShowForm]   = useState(false);
  const [saving,      setSaving]     = useState(false);
  const [error,       setError]      = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [reverseId,   setReverseId]  = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState("");

  // New payment form state
  const [amount,        setAmount]       = useState("");
  const [method,        setMethod]       = useState<PaymentMethod>("zelle");
  const [payDate,       setPayDate]      = useState(new Date().toISOString().slice(0, 10));
  const [refNum,        setRefNum]       = useState("");
  const [notes,         setNotes]        = useState("");
  const [initialStatus, setInitialStatus] = useState<"pending" | "verified">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await getOrderPayments(order.id);
    if (res.success) setPayments(res.data);
    setLoading(false);
  }, [order.id]);

  useEffect(() => { load(); }, [load]);

  async function handleRecord() {
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!amount || isNaN(amountCents) || amountCents < 1) {
      setError("Enter a valid payment amount."); return;
    }
    setSaving(true);
    setError(null);
    const res = await recordPayment({
      order_id:         order.id,
      amount_cents:     amountCents,
      payment_method:   method,
      payment_date:     payDate,
      reference_number: refNum || undefined,
      notes:            notes || undefined,
      initial_status:   initialStatus,
    });
    if (res.success) {
      setAmount(""); setRefNum(""); setNotes(""); setShowForm(false);
      await load();
      onPaymentRecorded();
    } else {
      setError(res.error ?? "Failed to record payment.");
    }
    setSaving(false);
  }

  async function handleVerify(paymentId: string) {
    setVerifyingId(paymentId);
    const res = await verifyPayment(paymentId);
    setVerifyingId(null);
    if (res.success) { await load(); onPaymentRecorded(); }
    else setError(res.error ?? "Failed to verify payment.");
  }

  async function handleReverse() {
    if (!reverseId || !reverseReason.trim()) return;
    const res = await reversePayment(reverseId, reverseReason);
    if (res.success) { setReverseId(null); setReverseReason(""); await load(); onPaymentRecorded(); }
    else setError(res.error ?? "Failed to reverse payment.");
  }

  // Only verified payments reduce the balance
  const verifiedCents = payments
    .filter(p => p.status === "verified")
    .reduce((s, p) => s + p.amount_cents, 0);
  const pendingCents = payments
    .filter(p => p.status === "pending")
    .reduce((s, p) => s + p.amount_cents, 0);
  const balance = order.subtotal_cents - verifiedCents;

  const hasPending = pendingCents > 0;
  const canAddPayment = canManage && !["cancelled"].includes(order.order_status);

  return (
    <div className="space-y-4">
      {/* Balance summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Invoice Total", value: order.subtotal_cents, cls: "text-sc-navy" },
          { label: "Verified Paid", value: verifiedCents,        cls: "text-emerald-700" },
          { label: "Balance Due",   value: balance,              cls: balance > 0 ? "text-sc-rose-700 font-bold" : "text-emerald-700 font-bold" },
        ].map(item => (
          <div key={item.label} className="rounded-xl bg-sc-gray-100/50 p-3 text-center">
            <p className="text-label-sm text-sc-gray mb-1">{item.label}</p>
            <p className={cn("text-body-md tabular-nums", item.cls)}>{currency(item.value)}</p>
          </div>
        ))}
      </div>

      {/* Pending payment notice */}
      {hasPending && (
        <div className="flex items-start gap-2 rounded-xl border border-sc-gold-300 bg-sc-gold-50 px-3 py-2.5">
          <Clock className="size-4 text-sc-gold-700 mt-0.5 shrink-0" />
          <div>
            <p className="text-label-sm font-medium text-sc-gold-800">
              Payment Pending — {currency(pendingCents)}
            </p>
            <p className="text-label-sm text-sc-gold-700 mt-0.5">
              Pending payments are not counted toward the balance until verified by staff.
            </p>
          </div>
        </div>
      )}

      {/* Payment history */}
      {loading ? (
        <div className="flex items-center gap-2 text-sc-gray text-body-md py-2">
          <Loader2 className="size-4 animate-spin" /> Loading payments…
        </div>
      ) : payments.length === 0 ? (
        <p className="text-body-md text-sc-gray italic">No payments recorded yet.</p>
      ) : (
        <div className="rounded-xl border border-sc-gray-100 overflow-hidden">
          <table className="min-w-full text-body-md">
            <thead className="bg-sc-gray-100/60">
              <tr>
                {["Date", "Method", "Amount", "Ref #", "Status", ...(canManage ? ["Actions"] : [])].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-label-sm text-sc-gray font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sc-gray-100">
              {payments.map(p => (
                <tr key={p.id} className={cn("text-body-md", p.status === "reversed" && "opacity-50")}>
                  <td className="px-3 py-2 text-sc-gray whitespace-nowrap">{formatDate(p.payment_date)}</td>
                  <td className="px-3 py-2">{PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}</td>
                  <td className="px-3 py-2 tabular-nums font-medium text-sc-navy">{currency(p.amount_cents)}</td>
                  <td className="px-3 py-2 text-sc-gray text-label-sm">{p.reference_number ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={cn("text-label-sm rounded-full px-2 py-0.5", STATUS_BADGE[p.status])}>
                      {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                    </span>
                    {p.status === "verified" && p.verified_by_name && (
                      <span className="ml-1 text-label-sm text-sc-gray">by {p.verified_by_name}</span>
                    )}
                    {p.status === "reversed" && p.reversal_reason && (
                      <span className="ml-1 text-label-sm text-sc-gray">({p.reversal_reason})</span>
                    )}
                    {p.notes && p.status !== "reversed" && (
                      <span className="ml-1 text-label-sm text-sc-gray italic">{p.notes}</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {p.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-label-sm border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400 gap-1"
                              onClick={() => handleVerify(p.id)}
                              disabled={verifyingId === p.id}
                            >
                              {verifyingId === p.id
                                ? <Loader2 className="size-3 animate-spin" />
                                : <ShieldCheck className="size-3" />}
                              Verify
                            </Button>
                            <button
                              onClick={() => { setReverseId(p.id); setReverseReason(""); }}
                              className="p-1 rounded text-sc-gray hover:text-sc-rose hover:bg-sc-rose-50"
                              title="Reverse payment"
                            >
                              <RotateCcw className="size-3.5" />
                            </button>
                          </>
                        )}
                        {p.status === "verified" && (
                          <button
                            onClick={() => { setReverseId(p.id); setReverseReason(""); }}
                            className="p-1 rounded text-sc-gray hover:text-sc-rose hover:bg-sc-rose-50"
                            title="Reverse payment"
                          >
                            <RotateCcw className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Global error display */}
      {error && (
        <p className="text-sc-rose-700 text-body-md bg-sc-rose-50 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Reverse confirmation */}
      {reverseId && (
        <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 p-4 space-y-3">
          <p className="text-body-md text-sc-rose-700 font-medium">Reverse this payment?</p>
          <Input
            placeholder="Reason for reversal (required)"
            value={reverseReason}
            onChange={e => setReverseReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-sc-rose-700 hover:bg-sc-rose text-white"
              onClick={handleReverse}
              disabled={!reverseReason.trim()}
            >
              Reverse
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReverseId(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Record payment form */}
      {canAddPayment && (
        <div>
          <button
            onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-2 text-sc-teal font-medium text-body-md hover:text-sc-teal-700"
          >
            <Plus className="size-4" />
            Record Payment
            {showForm ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>

          {showForm && (
            <div className="mt-3 rounded-xl border border-sc-gray-100 p-4 space-y-4 bg-white">
              {/* Status selector */}
              <div className="space-y-1.5">
                <label className="text-label-sm text-sc-gray">Payment Status</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setInitialStatus("pending")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-label-sm border transition-colors",
                      initialStatus === "pending"
                        ? "bg-sc-gold-50 text-sc-gold-800 border-sc-gold-300"
                        : "bg-white text-sc-gray border-sc-gray-200 hover:border-sc-gold-300"
                    )}
                  >
                    <Clock className="size-3.5" />
                    Pending — awaiting confirmation
                  </button>
                  <button
                    onClick={() => setInitialStatus("verified")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-label-sm border transition-colors",
                      initialStatus === "verified"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : "bg-white text-sc-gray border-sc-gray-200 hover:border-emerald-300"
                    )}
                  >
                    <ShieldCheck className="size-3.5" />
                    Verified — already received
                  </button>
                </div>
                {initialStatus === "pending" && (
                  <p className="text-label-sm text-sc-gray">
                    Pending payments appear in the transaction log but do not reduce the balance until verified.
                  </p>
                )}
                {initialStatus === "verified" && (
                  <p className="text-label-sm text-emerald-700">
                    Verified payments immediately reduce the balance and update the order status.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-label-sm text-sc-gray">Amount</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray" />
                    <Input
                      className="pl-8"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-label-sm text-sc-gray">Date Received</label>
                  <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-label-sm text-sc-gray">Payment Method</label>
                <div className="flex gap-2 flex-wrap">
                  {(["zelle", "cash", "check", "other"] as PaymentMethod[]).map(m => (
                    <button
                      key={m}
                      onClick={() => setMethod(m)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-label-sm border transition-colors",
                        method === m
                          ? "bg-sc-navy text-white border-sc-navy"
                          : "bg-white text-sc-gray border-sc-gray-200 hover:border-sc-navy/30"
                      )}
                    >
                      {PAYMENT_METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-label-sm text-sc-gray">
                    {method === "check" ? "Check #" : method === "zelle" ? "Confirmation Code" : "Reference #"}
                    {" "}<span className="font-normal">(optional)</span>
                  </label>
                  <Input
                    placeholder="Optional reference"
                    value={refNum}
                    onChange={e => setRefNum(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-label-sm text-sc-gray">Notes <span className="font-normal">(optional)</span></label>
                  <Input placeholder="Internal note" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>

              {error && (
                <p className="text-sc-rose-700 text-body-md bg-sc-rose-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2">
                <Button
                  size="sm"
                  className={cn(
                    "text-white",
                    initialStatus === "verified"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-sc-teal hover:bg-sc-teal-700"
                  )}
                  onClick={handleRecord}
                  disabled={saving || !amount}
                >
                  {saving
                    ? <><Loader2 className="size-4 mr-1.5 animate-spin" /> Saving…</>
                    : initialStatus === "verified"
                      ? <><ShieldCheck className="size-4 mr-1.5" /> Record & Verify</>
                      : "Record Payment"
                  }
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setError(null); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {balance <= 0 && order.order_status === "paid" && (
        <div className="flex items-center gap-2 text-emerald-700 text-body-md font-medium">
          <Check className="size-4" /> Paid in full
        </div>
      )}
    </div>
  );
}
