"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { DollarSign, Plus, Receipt, ChevronDown, ChevronUp, AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getStudentFinanceSummary, addCharge, recordPayment,
  voidCharge, voidPayment, addAdjustment,
  CHARGE_TYPE_LABELS, PAYMENT_SOURCE_LABELS, ADJUSTMENT_TYPE_LABELS,
  type StudentFinanceSummary, type SchoolYear, type StudentCharge,
  type PaymentRecord, type ChargeType, type PaymentSource, type AdjustmentType,
  type PlanType,
} from "@/app/actions/finance";

// ── Helpers ───────────────────────────────────────────────────────────────

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid_in_full:    { label: "Paid in Full",    cls: "bg-emerald-50 text-emerald-700" },
    current:         { label: "Current",         cls: "bg-sc-teal/10 text-sc-teal-700" },
    due_soon:        { label: "Due Soon",         cls: "bg-sc-gold-50 text-sc-gold-700" },
    past_due:        { label: "Past Due",         cls: "bg-sc-rose-50 text-sc-rose-700" },
    not_configured:  { label: "Not Configured",  cls: "bg-sc-gray-100 text-sc-gray" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-sc-gray-100 text-sc-gray" };
  return <span className={cn("px-2 py-0.5 rounded-full text-label-sm font-medium", cls)}>{label}</span>;
}

// ── Add Charge Modal ──────────────────────────────────────────────────────

interface AddChargeModalProps {
  orgId: string;
  schoolYearId: string;
  studentId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddChargeModal({ orgId, schoolYearId, studentId, onClose, onSuccess }: AddChargeModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    chargeType:        "tuition" as ChargeType,
    description:       "",
    amount:            "",
    dueDate:           "",
    planType:          "" as PlanType | "",
    installmentNumber: "",
    notes:             "",
  });

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { setError("Enter a valid amount."); return; }
    if (!form.description.trim()) { setError("Description is required."); return; }

    startTransition(async () => {
      const res = await addCharge({
        orgId,
        studentId,
        schoolYearId,
        chargeType:         form.chargeType,
        description:        form.description.trim(),
        amount,
        dueDate:            form.dueDate || null,
        planType:           (form.planType as PlanType) || null,
        installmentNumber:  form.installmentNumber ? parseInt(form.installmentNumber) : null,
        notes:              form.notes.trim() || null,
      });
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <h2 className="text-heading-1 text-sc-navy">Add Charge</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-label-sm text-sc-gray block mb-1">Charge Type</label>
            <select
              className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
              value={form.chargeType}
              onChange={(e) => {
                const ct = e.target.value as ChargeType;
                set("chargeType", ct);
                if (!form.description) set("description", CHARGE_TYPE_LABELS[ct]);
              }}
            >
              {Object.entries(CHARGE_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-label-sm text-sc-gray block mb-1">Description</label>
            <input
              required
              className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. Tuition 2026-2027"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-label-sm text-sc-gray block mb-1">Amount ($)</label>
              <input
                required type="number" min="0" step="0.01"
                className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="6800.00"
              />
            </div>
            <div>
              <label className="text-label-sm text-sc-gray block mb-1">Due Date</label>
              <input
                type="date"
                className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-label-sm text-sc-gray block mb-1">Plan Type (optional)</label>
              <select
                className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
                value={form.planType ?? ""}
                onChange={(e) => set("planType", e.target.value)}
              >
                <option value="">None</option>
                {(["annual","semester","quarterly","monthly","custom"] as PlanType[]).map((p) => (
                  <option key={p!} value={p!}>{p!.charAt(0).toUpperCase()+p!.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-label-sm text-sc-gray block mb-1">Installment #</label>
              <input
                type="number" min="1"
                className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
                value={form.installmentNumber}
                onChange={(e) => set("installmentNumber", e.target.value)}
                placeholder="1"
              />
            </div>
          </div>

          <div>
            <label className="text-label-sm text-sc-gray block mb-1">Notes (optional)</label>
            <textarea
              className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-sc-rose-700">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-sc-gray-200 text-sc-navy text-label-md"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={isPending}
              className="flex-1 px-4 py-2 rounded-lg bg-sc-navy text-white text-label-md disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Add Charge"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Record Payment Modal ──────────────────────────────────────────────────

interface RecordPaymentModalProps {
  orgId: string;
  schoolYearId: string;
  studentId: string;
  charges: StudentCharge[];
  onClose: () => void;
  onSuccess: () => void;
}

function RecordPaymentModal({ orgId, schoolYearId, studentId, charges, onClose, onSuccess }: RecordPaymentModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const activeCharges = charges.filter((c) => c.status === "active" && c.balance > 0);

  const [form, setForm] = useState({
    paymentDate:     new Date().toISOString().split("T")[0],
    amount:          "",
    paymentSource:   "parent_payment" as PaymentSource,
    referenceNumber: "",
    notes:           "",
    allocations:     Object.fromEntries(activeCharges.map((c) => [c.id, ""])) as Record<string, string>,
  });

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  const totalAmount = parseFloat(form.amount) || 0;
  const totalAllocated = Object.values(form.allocations).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (totalAmount <= 0) { setError("Enter a valid payment amount."); return; }
    if (totalAllocated > totalAmount + 0.01) { setError("Allocations exceed payment amount."); return; }

    startTransition(async () => {
      const res = await recordPayment({
        orgId,
        studentId,
        schoolYearId,
        paymentDate:     form.paymentDate,
        amount:          totalAmount,
        paymentSource:   form.paymentSource,
        referenceNumber: form.referenceNumber.trim() || null,
        notes:           form.notes.trim() || null,
        allocations: Object.entries(form.allocations)
          .map(([chargeId, val]) => ({ chargeId, amount: parseFloat(val) || 0 }))
          .filter((a) => a.amount > 0),
      });
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl p-6 space-y-4 my-8">
        <h2 className="text-heading-1 text-sc-navy">Record Payment</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-label-sm text-sc-gray block mb-1">Payment Date</label>
              <input
                required type="date"
                className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
                value={form.paymentDate}
                onChange={(e) => set("paymentDate", e.target.value)}
              />
            </div>
            <div>
              <label className="text-label-sm text-sc-gray block mb-1">Amount ($)</label>
              <input
                required type="number" min="0.01" step="0.01"
                className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-label-sm text-sc-gray block mb-1">Payment Source</label>
            <select
              className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
              value={form.paymentSource}
              onChange={(e) => set("paymentSource", e.target.value)}
            >
              {Object.entries(PAYMENT_SOURCE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-label-sm text-sc-gray block mb-1">Reference # (optional)</label>
            <input
              className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
              value={form.referenceNumber}
              onChange={(e) => set("referenceNumber", e.target.value)}
              placeholder="Check #, transaction ID, etc."
            />
          </div>

          {activeCharges.length > 0 && (
            <div>
              <label className="text-label-sm text-sc-gray block mb-2">Allocate to Charges (optional)</label>
              <div className="space-y-2 border border-sc-gray-100 rounded-lg p-3">
                {activeCharges.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-label-sm text-sc-navy truncate">{c.description}</p>
                      <p className="text-xs text-sc-gray">Balance: {currency(c.balance)}</p>
                    </div>
                    <input
                      type="number" min="0" step="0.01" max={c.balance}
                      className="w-24 border border-sc-gray-200 rounded px-2 py-1 text-body-md text-right"
                      value={form.allocations[c.id] ?? ""}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        allocations: { ...f.allocations, [c.id]: e.target.value },
                      }))}
                      placeholder="0.00"
                    />
                  </div>
                ))}
                <div className="flex justify-between pt-1 border-t border-sc-gray-100">
                  <span className="text-label-sm text-sc-gray">Allocated</span>
                  <span className={cn("text-label-sm font-medium", totalAllocated > totalAmount + 0.01 ? "text-sc-rose-700" : "text-sc-navy")}>
                    {currency(totalAllocated)} / {currency(totalAmount || 0)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-label-sm text-sc-gray block mb-1">Notes (optional)</label>
            <textarea
              className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-sc-rose-700">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-sc-gray-200 text-sc-navy text-label-md"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={isPending}
              className="flex-1 px-4 py-2 rounded-lg bg-sc-teal text-white text-label-md disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Record Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Adjustment Modal ──────────────────────────────────────────────────────

interface AdjustmentModalProps {
  orgId: string;
  charge: StudentCharge;
  onClose: () => void;
  onSuccess: () => void;
}

function AdjustmentModal({ orgId, charge, onClose, onSuccess }: AdjustmentModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    adjustmentType: "discount" as AdjustmentType,
    amount:         "",
    description:    "",
    notes:          "",
  });

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount === 0) { setError("Enter a valid adjustment amount."); return; }
    startTransition(async () => {
      const res = await addAdjustment({
        orgId,
        chargeId:       charge.id,
        adjustmentType: form.adjustmentType,
        amount:         -Math.abs(amount), // adjustments reduce balance
        description:    form.description.trim() || ADJUSTMENT_TYPE_LABELS[form.adjustmentType],
        notes:          form.notes.trim() || null,
      });
      if (res.success) { onSuccess(); onClose(); }
      else setError(res.error);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <h2 className="text-heading-1 text-sc-navy">Add Adjustment</h2>
        <p className="text-body-md text-sc-gray">For: {charge.description}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-label-sm text-sc-gray block mb-1">Adjustment Type</label>
            <select
              className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
              value={form.adjustmentType}
              onChange={(e) => set("adjustmentType", e.target.value)}
            >
              {Object.entries(ADJUSTMENT_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-label-sm text-sc-gray block mb-1">Reduction Amount ($)</label>
            <input
              required type="number" min="0.01" step="0.01"
              className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="Amount to subtract from charge"
            />
          </div>

          <div>
            <label className="text-label-sm text-sc-gray block mb-1">Description</label>
            <input
              className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. Scholarship award 2026"
            />
          </div>

          <div>
            <label className="text-label-sm text-sc-gray block mb-1">Notes (optional)</label>
            <textarea
              className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-sc-rose-700">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-sc-gray-200 text-sc-navy text-label-md">Cancel</button>
            <button type="submit" disabled={isPending} className="flex-1 px-4 py-2 rounded-lg bg-sc-gold-600 text-white text-label-md disabled:opacity-60">
              {isPending ? "Saving…" : "Apply Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Void Confirm Modal ────────────────────────────────────────────────────

interface VoidModalProps {
  label: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isPending: boolean;
}

function VoidConfirmModal({ label, onConfirm, onClose, isPending }: VoidModalProps) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <h2 className="text-heading-1 text-sc-rose-700">Void {label}</h2>
        <p className="text-body-md text-sc-gray">This action creates an audit trail and cannot be undone. A reason is required.</p>
        <textarea
          className="w-full border border-sc-gray-200 rounded-lg px-3 py-2 text-body-md"
          rows={3}
          placeholder="Reason for voiding…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-sc-gray-200 text-sc-navy text-label-md">Cancel</button>
          <button
            type="button"
            disabled={!reason.trim() || isPending}
            onClick={() => onConfirm(reason.trim())}
            className="flex-1 px-4 py-2 rounded-lg bg-sc-rose-700 text-white text-label-md disabled:opacity-60"
          >
            {isPending ? "Voiding…" : "Void"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Charge Row ────────────────────────────────────────────────────────────

interface ChargeRowProps {
  orgId: string;
  charge: StudentCharge;
  canManage: boolean;
  onRefresh: () => void;
}

function ChargeRow({ orgId, charge, canManage, onRefresh }: ChargeRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [adjModal, setAdjModal] = useState(false);
  const [voidModal, setVoidModal] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isVoided = charge.status === "voided";

  function handleVoid(reason: string) {
    startTransition(async () => {
      await voidCharge(charge.id, reason, orgId);
      onRefresh();
      setVoidModal(false);
    });
  }

  return (
    <div className={cn("border rounded-xl overflow-hidden", isVoided ? "opacity-50 border-sc-gray-100" : "border-sc-gray-200")}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-sc-gray-100/40"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-label-md font-medium text-sc-navy">{charge.description}</span>
            <span className="text-xs text-sc-gray bg-sc-gray-100 px-1.5 py-0.5 rounded">
              {CHARGE_TYPE_LABELS[charge.charge_type]}
            </span>
            {isVoided && <span className="text-xs text-sc-rose-700 bg-sc-rose-50 px-1.5 py-0.5 rounded">Voided</span>}
            {charge.plan_type && charge.installment_number && (
              <span className="text-xs text-sc-gray">#{charge.installment_number}</span>
            )}
          </div>
          <div className="flex gap-4 mt-0.5 text-label-sm text-sc-gray">
            <span>Charged: {currency(charge.effective_amount)}</span>
            <span>Paid: {currency(charge.paid_amount)}</span>
            {!isVoided && <span className={cn("font-medium", charge.balance > 0 ? "text-sc-navy" : "text-emerald-700")}>
              Balance: {currency(charge.balance)}
            </span>}
            {charge.due_date && <span>Due: {fmtDate(charge.due_date)}</span>}
          </div>
        </div>
        {expanded ? <ChevronUp className="size-4 text-sc-gray shrink-0" /> : <ChevronDown className="size-4 text-sc-gray shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-sc-gray-100 bg-sc-gray-100/20 px-4 py-3 space-y-3">
          {charge.adjustments.length > 0 && (
            <div>
              <p className="text-label-sm text-sc-gray mb-1">Adjustments</p>
              <div className="space-y-1">
                {charge.adjustments.map((a) => (
                  <div key={a.id} className={cn("flex justify-between text-body-md", a.status === "voided" && "opacity-40 line-through")}>
                    <span className="text-sc-navy">{a.description} <span className="text-sc-gray text-xs">({ADJUSTMENT_TYPE_LABELS[a.adjustment_type]})</span></span>
                    <span className="text-emerald-700">{currency(Math.abs(a.amount))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {charge.notes && <p className="text-body-md text-sc-gray italic">{charge.notes}</p>}

          {canManage && !isVoided && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={(e) => { e.stopPropagation(); setAdjModal(true); }}
                className="px-3 py-1.5 rounded-lg border border-sc-gold-300 text-sc-gold-700 text-label-sm hover:bg-sc-gold-50"
              >
                + Adjustment
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setVoidModal(true); }}
                className="px-3 py-1.5 rounded-lg border border-sc-rose-200 text-sc-rose-700 text-label-sm hover:bg-sc-rose-50"
              >
                Void
              </button>
            </div>
          )}
        </div>
      )}

      {adjModal  && <AdjustmentModal  orgId={orgId} charge={charge} onClose={() => setAdjModal(false)}  onSuccess={onRefresh} />}
      {voidModal && <VoidConfirmModal label="Charge" onConfirm={handleVoid} onClose={() => setVoidModal(false)} isPending={isPending} />}
    </div>
  );
}

// ── Payment Row ───────────────────────────────────────────────────────────

interface PaymentRowProps {
  orgId: string;
  payment: PaymentRecord;
  canManage: boolean;
  onRefresh: () => void;
}

function PaymentRow({ orgId, payment, canManage, onRefresh }: PaymentRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [voidModal, setVoidModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isVoided = payment.status === "voided";

  function handleVoid(reason: string) {
    startTransition(async () => {
      await voidPayment(payment.id, reason, orgId);
      onRefresh();
      setVoidModal(false);
    });
  }

  return (
    <div className={cn("border rounded-xl overflow-hidden", isVoided ? "opacity-50 border-sc-gray-100" : "border-sc-gray-200")}>
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-sc-gray-100/40"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-label-md font-medium text-sc-navy">{currency(payment.amount)}</span>
            <span className="text-xs text-sc-gray bg-sc-gray-100 px-1.5 py-0.5 rounded">
              {PAYMENT_SOURCE_LABELS[payment.payment_source]}
            </span>
            {isVoided && <span className="text-xs text-sc-rose-700 bg-sc-rose-50 px-1.5 py-0.5 rounded">Voided</span>}
          </div>
          <p className="text-label-sm text-sc-gray mt-0.5">
            {fmtDate(payment.payment_date)}
            {payment.reference_number && ` · Ref: ${payment.reference_number}`}
          </p>
        </div>
        {expanded ? <ChevronUp className="size-4 text-sc-gray shrink-0" /> : <ChevronDown className="size-4 text-sc-gray shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-sc-gray-100 bg-sc-gray-100/20 px-4 py-3 space-y-2">
          {payment.allocations.length > 0 && (
            <div>
              <p className="text-label-sm text-sc-gray mb-1">Applied to</p>
              <div className="space-y-1">
                {payment.allocations.map((a) => (
                  <div key={a.id} className="flex justify-between text-body-md">
                    <span className="text-sc-navy truncate">{a.charge_description}</span>
                    <span className="text-sc-teal-700 shrink-0 ml-2">{currency(a.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {payment.notes && <p className="text-body-md text-sc-gray italic">{payment.notes}</p>}
          {payment.created_by_name && (
            <p className="text-xs text-sc-gray">Recorded by {payment.created_by_name}</p>
          )}
          {canManage && !isVoided && (
            <button
              onClick={() => setVoidModal(true)}
              className="px-3 py-1.5 rounded-lg border border-sc-rose-200 text-sc-rose-700 text-label-sm hover:bg-sc-rose-50"
            >
              Void Payment
            </button>
          )}
        </div>
      )}

      {voidModal && <VoidConfirmModal label="Payment" onConfirm={handleVoid} onClose={() => setVoidModal(false)} isPending={isPending} />}
    </div>
  );
}

// ── Summary Cards ─────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", warn ? "border-sc-rose-200 bg-sc-rose-50" : "border-sc-gray-100 bg-white")}>
      <p className="text-label-sm text-sc-gray">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", warn ? "text-sc-rose-700" : "text-sc-navy")}>{value}</p>
      {sub && <p className="text-label-sm text-sc-gray mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main Finance Tab ──────────────────────────────────────────────────────

interface FinanceTabProps {
  orgId: string;
  studentId: string;
  canManage: boolean;
  initialSchoolYears?: SchoolYear[];
}

export function FinanceTab({ orgId, studentId, canManage, initialSchoolYears = [] }: FinanceTabProps) {
  const [years] = useState<SchoolYear[]>(initialSchoolYears);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(
    initialSchoolYears.find((y) => y.is_current)?.id ?? initialSchoolYears[0]?.id ?? null
  );
  const [summary, setSummary] = useState<StudentFinanceSummary | null>(null);
  const [loading, setLoading] = useState(selectedYearId !== null);
  const [addChargeOpen, setAddChargeOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function refresh() { setRefreshKey((k) => k + 1); }

  useEffect(() => {
    if (!selectedYearId) return;
    setLoading(true);
    getStudentFinanceSummary(studentId, selectedYearId, orgId)
      .then((s) => { setSummary(s); })
      .catch((err) => { console.error("[FinanceTab]", err); setSummary(null); })
      .finally(() => setLoading(false));
  }, [studentId, selectedYearId, refreshKey]);

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 text-sc-gray animate-spin" />
      </div>
    );
  }

  if (!selectedYearId || years.length === 0) {
    return (
      <div className="text-center py-12 text-sc-gray">
        <DollarSign className="size-8 mx-auto mb-3 opacity-30" />
        <p>No school years configured.</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="text-center py-12 text-sc-gray">
        <AlertCircle className="size-8 mx-auto mb-3 opacity-30" />
        <p>Finance data unavailable.</p>
      </div>
    );
  }

  const statusIcon = {
    paid_in_full:   <CheckCircle2 className="size-4 text-emerald-600" />,
    current:        <CheckCircle2 className="size-4 text-sc-teal-700" />,
    due_soon:       <Clock className="size-4 text-sc-gold-600" />,
    past_due:       <AlertCircle className="size-4 text-sc-rose-700" />,
    not_configured: <DollarSign className="size-4 text-sc-gray" />,
  }[summary.finance_status] ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {statusIcon}
          <StatusBadge status={summary.finance_status} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="border border-sc-gray-200 rounded-lg px-3 py-1.5 text-body-md"
            value={selectedYearId}
            onChange={(e) => setSelectedYearId(e.target.value)}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.label}</option>
            ))}
          </select>

          {canManage && (
            <>
              <button
                onClick={() => setAddChargeOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sc-navy text-white text-label-sm"
              >
                <Plus className="size-3.5" /> Add Charge
              </button>
              <button
                onClick={() => setRecordPaymentOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sc-teal text-white text-label-sm"
              >
                <Receipt className="size-3.5" /> Record Payment
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total Charged"  value={currency(summary.total_charged)} />
        <SummaryCard label="Total Paid"     value={currency(summary.total_paid)} />
        <SummaryCard
          label="Balance Due"
          value={currency(summary.balance_due)}
          warn={summary.balance_due > 0}
        />
        {summary.past_due > 0 ? (
          <SummaryCard label="Past Due" value={currency(summary.past_due)} warn />
        ) : summary.next_due_date ? (
          <SummaryCard label="Next Due" value={currency(summary.next_due_amount ?? 0)} sub={fmtDate(summary.next_due_date)} />
        ) : (
          <SummaryCard label="Next Due" value="—" />
        )}
      </div>

      {/* Charges */}
      <div>
        <h3 className="text-label-md font-semibold text-sc-navy mb-3">
          Charges {summary.charges.length > 0 && `(${summary.charges.length})`}
        </h3>
        {summary.charges.length === 0 ? (
          <div className="text-center py-8 text-sc-gray border border-dashed border-sc-gray-200 rounded-xl">
            <p className="text-body-md">No charges for this school year.</p>
            {canManage && (
              <button
                onClick={() => setAddChargeOpen(true)}
                className="mt-3 px-4 py-2 rounded-lg bg-sc-navy text-white text-label-sm"
              >
                Add First Charge
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {summary.charges.map((c) => (
              <ChargeRow key={c.id} orgId={orgId} charge={c} canManage={canManage} onRefresh={refresh} />
            ))}
          </div>
        )}
      </div>

      {/* Payments */}
      <div>
        <h3 className="text-label-md font-semibold text-sc-navy mb-3">
          Payment History {summary.payments.length > 0 && `(${summary.payments.length})`}
        </h3>
        {summary.payments.length === 0 ? (
          <p className="text-body-md text-sc-gray text-center py-6">No payments recorded.</p>
        ) : (
          <div className="space-y-2">
            {summary.payments.map((p) => (
              <PaymentRow key={p.id} orgId={orgId} payment={p} canManage={canManage} onRefresh={refresh} />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {addChargeOpen && selectedYearId && (
        <AddChargeModal
          orgId={orgId}
          schoolYearId={selectedYearId}
          studentId={studentId}
          onClose={() => setAddChargeOpen(false)}
          onSuccess={refresh}
        />
      )}
      {recordPaymentOpen && selectedYearId && (
        <RecordPaymentModal
          orgId={orgId}
          schoolYearId={selectedYearId}
          studentId={studentId}
          charges={summary.charges}
          onClose={() => setRecordPaymentOpen(false)}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
