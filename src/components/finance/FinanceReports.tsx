"use client";

import { useState, useEffect } from "react";
import { DollarSign, TrendingDown, AlertCircle, BarChart2, Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getARSummary, getPaymentSourceReport, getPastDueReport,
  PAYMENT_SOURCE_LABELS,
  type SchoolYear, type ARSummary, type PaymentSourceRow, type ARStudentRow,
} from "@/app/actions/finance";

// ── Helpers ───────────────────────────────────────────────────────────────

function currency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function pct(n: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    paid_in_full:   "Paid",
    current:        "Current",
    due_soon:       "Due Soon",
    past_due:       "Past Due",
    not_configured: "—",
  };
  return map[s] ?? s;
}

function statusCls(s: string) {
  const map: Record<string, string> = {
    paid_in_full: "text-emerald-700",
    current:      "text-sc-teal-700",
    due_soon:     "text-sc-gold-700",
    past_due:     "text-sc-rose-700 font-semibold",
  };
  return map[s] ?? "text-sc-gray";
}

function exportCSV(rows: ARStudentRow[], filename: string) {
  const headers = ["Student", "Grade", "Total Charged", "Total Paid", "Balance Due", "Past Due", "Status"];
  const lines = rows.map((r) => [
    r.student_name, r.grade_level ?? "", r.total_charged, r.total_paid, r.balance_due, r.past_due, statusLabel(r.finance_status),
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── AR Summary Table ──────────────────────────────────────────────────────

function ARTable({ summary }: { summary: ARSummary }) {
  return (
    <div className="space-y-4">
      {/* Totals row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Charged",     value: currency(summary.total_charged)     },
          { label: "Total Collected",   value: currency(summary.total_collected)   },
          { label: "Total Outstanding", value: currency(summary.total_outstanding), warn: summary.total_outstanding > 0 },
          { label: "Total Past Due",    value: currency(summary.total_past_due),    warn: summary.total_past_due > 0 },
        ].map(({ label, value, warn }) => (
          <div key={label} className={cn("rounded-xl border p-4", warn ? "border-sc-rose-200 bg-sc-rose-50" : "border-sc-gray-100 bg-white")}>
            <p className="text-label-sm text-sc-gray">{label}</p>
            <p className={cn("text-xl font-bold mt-1", warn ? "text-sc-rose-700" : "text-sc-navy")}>{value}</p>
          </div>
        ))}
      </div>

      {/* Student table */}
      {summary.students.length === 0 ? (
        <p className="text-center py-8 text-sc-gray">No charges found for this school year.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-sc-gray-100">
          <table className="min-w-full text-body-md">
            <thead className="bg-sc-gray-100/60">
              <tr>
                {["Student", "Grade", "Charged", "Paid", "Balance", "Past Due", "Status"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-label-sm text-sc-gray font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sc-gray-100">
              {summary.students.map((s) => (
                <tr key={s.student_id} className="hover:bg-sc-gray-100/30">
                  <td className="px-4 py-3 font-medium text-sc-navy">{s.student_name}</td>
                  <td className="px-4 py-3 text-sc-gray">{s.grade_level ?? "—"}</td>
                  <td className="px-4 py-3">{currency(s.total_charged)}</td>
                  <td className="px-4 py-3 text-emerald-700">{currency(s.total_paid)}</td>
                  <td className="px-4 py-3 font-medium">{currency(s.balance_due)}</td>
                  <td className="px-4 py-3">{s.past_due > 0 ? <span className="text-sc-rose-700 font-semibold">{currency(s.past_due)}</span> : "—"}</td>
                  <td className={cn("px-4 py-3", statusCls(s.finance_status))}>{statusLabel(s.finance_status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Payment Source Report ─────────────────────────────────────────────────

function PaymentSourceTable({ rows, totalCollected }: { rows: PaymentSourceRow[]; totalCollected: number }) {
  if (rows.length === 0) return <p className="text-center py-8 text-sc-gray">No payments recorded for this period.</p>;

  return (
    <div className="overflow-x-auto rounded-xl border border-sc-gray-100">
      <table className="min-w-full text-body-md">
        <thead className="bg-sc-gray-100/60">
          <tr>
            {["Source", "Payments", "Total", "% of Collections"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-label-sm text-sc-gray font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sc-gray-100">
          {rows.map((r) => (
            <tr key={r.payment_source} className="hover:bg-sc-gray-100/30">
              <td className="px-4 py-3 font-medium text-sc-navy">{PAYMENT_SOURCE_LABELS[r.payment_source]}</td>
              <td className="px-4 py-3 text-sc-gray">{r.payment_count}</td>
              <td className="px-4 py-3 text-emerald-700 font-medium">{currency(r.total_amount)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-sc-gray-100 rounded-full h-1.5 max-w-[80px]">
                    <div
                      className="bg-sc-teal h-1.5 rounded-full"
                      style={{ width: totalCollected > 0 ? `${Math.round((r.total_amount / totalCollected) * 100)}%` : "0%" }}
                    />
                  </div>
                  <span className="text-sc-gray text-xs">{pct(r.total_amount, totalCollected)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Past Due Report ───────────────────────────────────────────────────────

function PastDueTable({ rows }: { rows: ARStudentRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="text-center py-12">
        <DollarSign className="size-8 mx-auto mb-3 text-emerald-600" />
        <p className="text-sc-navy font-medium">No past-due balances</p>
        <p className="text-body-md text-sc-gray mt-1">All students are current for this school year.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-sc-gray-100">
      <table className="min-w-full text-body-md">
        <thead className="bg-sc-rose-50">
          <tr>
            {["Student", "Grade", "Total Balance", "Past Due"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-label-sm text-sc-rose-700 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sc-gray-100">
          {rows.map((s) => (
            <tr key={s.student_id} className="hover:bg-sc-rose-50/50">
              <td className="px-4 py-3 font-medium text-sc-navy">{s.student_name}</td>
              <td className="px-4 py-3 text-sc-gray">{s.grade_level ?? "—"}</td>
              <td className="px-4 py-3">{currency(s.balance_due)}</td>
              <td className="px-4 py-3 font-bold text-sc-rose-700">{currency(s.past_due)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

type ReportTab = "ar" | "source" | "past_due";

interface FinanceReportsProps {
  orgId: string;
  canManage: boolean;
  initialSchoolYears?: SchoolYear[];
}

export function FinanceReports({ orgId, canManage: _canManage, initialSchoolYears = [] }: FinanceReportsProps) {
  const [years] = useState<SchoolYear[]>(initialSchoolYears);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(
    initialSchoolYears.find((y) => y.is_current)?.id ?? initialSchoolYears[0]?.id ?? null
  );
  const [activeTab, setActiveTab] = useState<ReportTab>("ar");
  const [loading, setLoading] = useState(false);

  const [arSummary,      setArSummary]      = useState<ARSummary | null>(null);
  const [sourceRows,     setSourceRows]     = useState<PaymentSourceRow[]>([]);
  const [pastDueRows,    setPastDueRows]    = useState<ARStudentRow[]>([]);

  useEffect(() => {
    if (!selectedYearId) return;
    setLoading(true);
    Promise.all([
      getARSummary(selectedYearId, orgId),
      getPaymentSourceReport(selectedYearId, orgId),
      getPastDueReport(selectedYearId, orgId),
    ]).then(([ar, src, pd]) => {
      setArSummary(ar);
      setSourceRows(src);
      setPastDueRows(pd);
      setLoading(false);
    });
  }, [selectedYearId, orgId]);

  const tabs: { id: ReportTab; label: string; Icon: React.ElementType }[] = [
    { id: "ar",       label: "AR Summary",    Icon: BarChart2      },
    { id: "source",   label: "Payment Source", Icon: DollarSign    },
    { id: "past_due", label: "Past Due",       Icon: AlertCircle   },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-heading-1 text-sc-navy">Finance Reports</h1>
          <p className="text-body-md text-sc-gray mt-0.5">Accounts receivable, payment sources, and past-due balances.</p>
        </div>

        <div className="flex items-center gap-2">
          {years.length > 0 && (
            <select
              className="border border-sc-gray-200 rounded-lg px-3 py-1.5 text-body-md"
              value={selectedYearId ?? ""}
              onChange={(e) => setSelectedYearId(e.target.value)}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.label}</option>
              ))}
            </select>
          )}

          {activeTab === "ar" && arSummary && arSummary.students.length > 0 && (
            <button
              onClick={() => exportCSV(arSummary.students, `ar-summary-${years.find((y) => y.id === selectedYearId)?.label ?? ""}.csv`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sc-gray-200 text-sc-navy text-label-sm hover:bg-sc-gray-100"
            >
              <Download className="size-3.5" /> Export CSV
            </button>
          )}

          {activeTab === "past_due" && pastDueRows.length > 0 && (
            <button
              onClick={() => exportCSV(pastDueRows, `past-due-${years.find((y) => y.id === selectedYearId)?.label ?? ""}.csv`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sc-gray-200 text-sc-navy text-label-sm hover:bg-sc-gray-100"
            >
              <Download className="size-3.5" /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-sc-gray-200 gap-0">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-3 text-label-sm font-medium border-b-2 transition-all",
              activeTab === id
                ? "border-sc-teal text-sc-teal"
                : "border-transparent text-sc-gray hover:text-sc-navy"
            )}
          >
            <Icon className="size-3.5" />
            {label}
            {id === "past_due" && pastDueRows.length > 0 && (
              <span className="bg-sc-rose-700 text-white text-xs px-1.5 py-0.5 rounded-full">{pastDueRows.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 text-sc-gray animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === "ar"       && arSummary   && <ARTable summary={arSummary} />}
          {activeTab === "source"   && <PaymentSourceTable rows={sourceRows} totalCollected={arSummary?.total_collected ?? 0} />}
          {activeTab === "past_due" && <PastDueTable rows={pastDueRows} />}
        </>
      )}
    </div>
  );
}
