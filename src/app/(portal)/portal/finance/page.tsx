import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DollarSign, AlertTriangle, CheckCircle, Clock, ChevronDown, Info } from "lucide-react";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getMyChildrenFinance } from "@/app/actions/parentFinance";
import type { ParentFinanceSummary, ParentChargeRow, ParentPaymentRow } from "@/app/actions/parentFinance";

export const metadata: Metadata = { title: "Finance" };

const CHARGE_TYPE_LABELS: Record<string, string> = {
  tuition:        "Tuition",
  enrollment_fee: "Enrollment Fee",
  ua_fee:         "UA Fee",
  other_fee:      "Fee",
};

const PAYMENT_SOURCE_LABELS: Record<string, string> = {
  parent_payment: "Family Payment",
  step_up_pep:    "Step Up for Students (PEP)",
  step_up_ua:     "Step Up for Students (UA)",
  aaa:            "AAA Scholarship",
  scholarship:    "Scholarship",
  cash:           "Cash",
  check:          "Check",
  card_external:  "Card",
  other:          "Other",
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusChip({ status }: { status: ParentFinanceSummary["finance_status"] }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    paid_in_full:    { label: "Paid in Full",  className: "bg-sc-teal-50 border-sc-teal-200 text-sc-teal-700",      icon: <CheckCircle className="size-3.5" /> },
    current:         { label: "Current",        className: "bg-sc-teal-50 border-sc-teal-200 text-sc-teal-700",      icon: <CheckCircle className="size-3.5" /> },
    due_soon:        { label: "Due Soon",        className: "bg-sc-gold-50 border-sc-gold-200 text-sc-gold-700",     icon: <Clock className="size-3.5" /> },
    past_due:        { label: "Past Due",        className: "bg-sc-rose-50 border-sc-rose-200 text-sc-rose-700",     icon: <AlertTriangle className="size-3.5" /> },
    not_configured:  { label: "No Charges",      className: "bg-sc-gray-100 border-sc-gray-200 text-sc-gray",        icon: <Info className="size-3.5" /> },
  };
  const cfg = map[status] ?? map.not_configured;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label-sm font-medium ${cfg.className}`}>
      {cfg.icon}{cfg.label}
    </span>
  );
}

function ChargesTable({ charges }: { charges: ParentChargeRow[] }) {
  if (charges.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-label-sm">
        <thead>
          <tr className="border-b border-sc-gray-100">
            <th className="text-left py-2 pr-4 font-medium text-sc-gray">Description</th>
            <th className="text-right py-2 pr-4 font-medium text-sc-gray hidden sm:table-cell">Amount</th>
            <th className="text-right py-2 pr-4 font-medium text-sc-gray hidden sm:table-cell">Paid</th>
            <th className="text-right py-2 pr-4 font-medium text-sc-gray">Balance</th>
            <th className="text-left py-2 font-medium text-sc-gray hidden md:table-cell">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sc-gray-100">
          {charges.map((c) => (
            <tr key={c.id} className={c.status === "voided" ? "opacity-40 line-through" : ""}>
              <td className="py-2 pr-4 text-sc-navy">
                <p>{c.description}</p>
                <p className="text-sc-gray-400 text-xs">{CHARGE_TYPE_LABELS[c.charge_type] ?? c.charge_type}</p>
              </td>
              <td className="py-2 pr-4 text-right text-sc-navy font-mono hidden sm:table-cell">{fmtMoney(c.effective_amount)}</td>
              <td className="py-2 pr-4 text-right text-sc-teal-700 font-mono hidden sm:table-cell">{fmtMoney(c.paid_amount)}</td>
              <td className={`py-2 pr-4 text-right font-mono font-semibold ${c.balance > 0 ? "text-sc-navy" : "text-sc-teal-700"}`}>
                {fmtMoney(c.balance)}
              </td>
              <td className="py-2 text-sc-gray hidden md:table-cell">{fmtDate(c.due_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsTable({ payments }: { payments: ParentPaymentRow[] }) {
  if (payments.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-label-sm">
        <thead>
          <tr className="border-b border-sc-gray-100">
            <th className="text-left py-2 pr-4 font-medium text-sc-gray">Date</th>
            <th className="text-left py-2 pr-4 font-medium text-sc-gray">Source</th>
            <th className="text-right py-2 font-medium text-sc-gray">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sc-gray-100">
          {payments.filter((p) => p.status !== "voided").map((p) => (
            <tr key={p.id}>
              <td className="py-2 pr-4 text-sc-gray">{fmtDate(p.payment_date)}</td>
              <td className="py-2 pr-4 text-sc-navy">{PAYMENT_SOURCE_LABELS[p.payment_source] ?? p.payment_source}</td>
              <td className="py-2 text-right text-sc-teal-700 font-mono font-semibold">{fmtMoney(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FinanceYearSection({ summary }: { summary: ParentFinanceSummary }) {
  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
      {/* Year header / summary */}
      <div className="px-5 py-4 border-b border-sc-gray-100 bg-sc-cream/40">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-serif text-heading-3 text-sc-navy">{summary.school_year_label}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-label-sm text-sc-gray">Balance: <span className="font-semibold text-sc-navy">{fmtMoney(summary.balance_due)}</span></span>
              {summary.past_due > 0 && (
                <span className="text-label-sm text-sc-rose font-medium">Past due: {fmtMoney(summary.past_due)}</span>
              )}
            </div>
          </div>
          <StatusChip status={summary.finance_status} />
        </div>

        {/* Totals bar */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: "Total Charged", value: fmtMoney(summary.total_charged), color: "text-sc-navy" },
            { label: "Total Paid",    value: fmtMoney(summary.total_paid),    color: "text-sc-teal-700" },
            { label: "Balance Due",   value: fmtMoney(summary.balance_due),   color: summary.balance_due > 0 ? "text-sc-navy font-semibold" : "text-sc-teal-700 font-semibold" },
          ].map(({ label, value, color }) => (
            <div key={label} className="text-center">
              <p className="text-label-sm text-sc-gray-400 uppercase tracking-wide text-xs">{label}</p>
              <p className={`text-label-md font-mono mt-0.5 ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Charges */}
      {summary.charges.length > 0 && (
        <div className="px-5 py-4 border-b border-sc-gray-100">
          <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3">Charges</p>
          <ChargesTable charges={summary.charges} />
        </div>
      )}

      {/* Payment history */}
      {summary.payments.filter((p) => p.status !== "voided").length > 0 && (
        <div className="px-5 py-4">
          <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3">Payment History</p>
          <PaymentsTable payments={summary.payments} />
        </div>
      )}
    </div>
  );
}

export default async function PortalFinancePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const result = await getMyChildrenFinance();
  const children = result.success ? result.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Finance</h1>
        <p className="text-body-md text-sc-gray mt-1">Account balances and payment history for your family.</p>
      </div>

      <div className="rounded-xl border border-sc-gray-100 bg-sc-cream/50 px-4 py-3 flex items-start gap-2">
        <Info className="size-4 text-sc-gray-400 shrink-0 mt-0.5" />
        <p className="text-label-sm text-sc-gray">
          This is a read-only view of your account. To discuss charges or payment arrangements, contact the school office directly.
        </p>
      </div>

      {children.length === 0 ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 p-10 text-center">
          <DollarSign className="size-10 text-sc-gray-300 mx-auto mb-3" />
          <p className="font-serif text-xl text-sc-navy mb-1">No financial records</p>
          <p className="text-body-md text-sc-gray">No charges or payments have been recorded yet. Contact your school if you believe this is incorrect.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {children.map((child) => (
            <section key={child.child_id} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sc-teal text-white font-serif text-sm font-semibold shrink-0">
                  {child.child_name.charAt(0)}
                </div>
                <div>
                  <h2 className="font-serif text-heading-2 text-sc-navy">{child.child_name}</h2>
                  {child.grade_level && <p className="text-label-sm text-sc-gray">{child.grade_level}</p>}
                </div>
              </div>
              {child.summaries.map((summary) => (
                <FinanceYearSection key={summary.school_year_label} summary={summary} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
