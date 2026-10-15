"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  DollarSign as _DollarSign, TrendingDown, AlertCircle, Clock,
  Search, ChevronRight, Loader2, ArrowUpRight, ArrowDownRight,
  ReceiptText, Users, BadgeDollarSign, GraduationCap, ChevronDown, ChevronUp, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getFinanceDashboardSummary, getRecentLedgerActivity, getARSummary, getFamilyOverview,
  type FinanceDashboardSummary, type LedgerActivity, type FamilyOverviewRow,
} from "@/app/actions/finance";
import { type SchoolYear, type ARStudentRow } from "@/app/actions/finance-constants";

// ── Helpers ───────────────────────────────────────────────────────────────

function currency(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ENTRY_TYPE_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType; sign: "+" | "-" }> = {
  charge_posted:      { label: "Charge",       color: "text-sc-navy",     Icon: ReceiptText,    sign: "-" },
  charge_voided:      { label: "Charge Void",  color: "text-sc-gray",     Icon: ReceiptText,    sign: "+" },
  payment_received:   { label: "Payment",      color: "text-emerald-700", Icon: ArrowDownRight, sign: "+" },
  payment_voided:     { label: "Pmnt Void",    color: "text-sc-rose-700", Icon: ArrowUpRight,   sign: "-" },
  adjustment_applied: { label: "Adjustment",   color: "text-sc-gold-700", Icon: TrendingDown,   sign: "+" },
};

function statusBadge(s: string) {
  const map: Record<string, string> = {
    paid_in_full:   "bg-emerald-50 text-emerald-700",
    current:        "bg-sc-teal/10 text-sc-teal-700",
    due_soon:       "bg-sc-gold-50 text-sc-gold-700",
    past_due:       "bg-sc-rose-50 text-sc-rose-700 font-semibold",
    not_configured: "bg-sc-gray-100 text-sc-gray",
  };
  const labels: Record<string, string> = {
    paid_in_full: "Paid", current: "Current", due_soon: "Due Soon",
    past_due: "Past Due", not_configured: "—",
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-label-sm", map[s] ?? "bg-sc-gray-100 text-sc-gray")}>
      {labels[s] ?? s}
    </span>
  );
}

// ── Overview cards ────────────────────────────────────────────────────────

function OverviewCards({ summary }: { summary: FinanceDashboardSummary }) {
  const cards = [
    {
      label: "Total Billed",
      value: currency(summary.gross_charged_cents),
      sub:   `${summary.active_charge_count} charges · ${summary.student_count} students`,
      Icon:  BadgeDollarSign,
      color: "text-sc-navy",
      bg:    "bg-white border-sc-gray-100",
    },
    {
      label: "Total Collected",
      value: currency(summary.total_collected_cents),
      sub:   `${currency(summary.scholarship_cents)} scholarships · ${currency(summary.parent_payment_cents)} direct`,
      Icon:  TrendingUp,
      color: "text-emerald-700",
      bg:    "bg-white border-sc-gray-100",
    },
    {
      label: "Outstanding",
      value: currency(summary.outstanding_cents),
      sub:   `After ${currency(summary.total_adjusted_cents)} adjustments`,
      Icon:  Clock,
      color: summary.outstanding_cents > 0 ? "text-sc-gold-700" : "text-emerald-700",
      bg:    summary.outstanding_cents > 0 ? "bg-sc-gold-50 border-sc-gold-300" : "bg-white border-sc-gray-100",
    },
    {
      label: "Past Due",
      value: currency(summary.past_due_cents),
      sub:   summary.past_due_cents > 0 ? "Balances past their due date" : "No past-due balances",
      Icon:  AlertCircle,
      color: summary.past_due_cents > 0 ? "text-sc-rose-700" : "text-emerald-700",
      bg:    summary.past_due_cents > 0 ? "bg-sc-rose-50 border-sc-rose-200" : "bg-white border-sc-gray-100",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {cards.map(({ label, value, sub, Icon, color, bg }) => (
          <div key={label} className={cn("rounded-2xl border p-4 sm:p-5 shadow-card", bg)}>
            <div className="flex items-start justify-between mb-2">
              <p className="text-label-sm text-sc-gray">{label}</p>
              <Icon className={cn("size-4 mt-0.5 flex-shrink-0", color)} />
            </div>
            <p className={cn("text-xl sm:text-2xl font-bold", color)}>{value}</p>
            <p className="text-xs text-sc-gray mt-1 leading-tight">{sub}</p>
          </div>
        ))}
      </div>

      {/* Scholarship breakdown */}
      {(summary.step_up_pep_cents > 0 || summary.step_up_ua_cents > 0 || summary.other_scholarship_cents > 0) && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="size-4 text-sc-navy" />
            <h3 className="text-label-md font-semibold text-sc-navy">Scholarship Payments Received</h3>
            <span className="text-label-sm text-sc-gray ml-auto">{currency(summary.scholarship_cents)} total</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {summary.step_up_pep_cents > 0 && (
              <div className="rounded-xl bg-sc-gold-50 border border-sc-gold-300 p-3">
                <p className="text-label-sm text-sc-gold-700 font-medium">Step Up PEP</p>
                <p className="text-lg font-bold text-sc-gold-800 mt-0.5">{currency(summary.step_up_pep_cents)}</p>
              </div>
            )}
            {summary.step_up_ua_cents > 0 && (
              <div className="rounded-xl bg-sc-gold-50 border border-sc-gold-300 p-3">
                <p className="text-label-sm text-sc-gold-700 font-medium">Step Up UA</p>
                <p className="text-lg font-bold text-sc-gold-800 mt-0.5">{currency(summary.step_up_ua_cents)}</p>
              </div>
            )}
            {summary.other_scholarship_cents > 0 && (
              <div className="rounded-xl bg-sc-gold-50 border border-sc-gold-300 p-3">
                <p className="text-label-sm text-sc-gold-700 font-medium">Other Scholarships</p>
                <p className="text-lg font-bold text-sc-gold-800 mt-0.5">{currency(summary.other_scholarship_cents)}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Student AR Table ──────────────────────────────────────────────────────

function StudentARTable({
  rows,
  loading,
  search,
  onSearch,
}: {
  rows: ARStudentRow[];
  loading: boolean;
  search: string;
  onSearch: (s: string) => void;
}) {
  const filtered = search.trim()
    ? rows.filter((r) => r.student_name.toLowerCase().includes(search.toLowerCase()))
    : rows;

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card">
      <div className="p-4 sm:p-5 border-b border-sc-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <GraduationCap className="size-4 text-sc-navy" />
          <h2 className="text-label-md font-semibold text-sc-navy">Student Accounts</h2>
          {rows.length > 0 && (
            <span className="text-xs text-sc-gray bg-sc-gray-100 px-2 py-0.5 rounded-full">{rows.length}</span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-sc-gray pointer-events-none" />
          <input
            type="search"
            placeholder="Search students…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-sc-gray-200 rounded-lg text-body-md w-44 sm:w-64 focus:outline-none focus:ring-1 focus:ring-sc-teal"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 text-sc-gray animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center py-10 text-sc-gray text-body-md">
          {search ? "No students match your search." : "No charges for this school year."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-body-md">
            <thead className="bg-sc-gray-100/50">
              <tr>
                {["Student", "Grade", "Charged", "Paid", "Balance", "Status", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-label-sm text-sc-gray font-medium whitespace-nowrap first:pl-5 last:pr-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-sc-gray-100">
              {filtered.map((s) => (
                <tr key={s.student_id} className="hover:bg-sc-gray-100/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-sc-navy first:pl-5">{s.student_name}</td>
                  <td className="px-4 py-3 text-sc-gray">{s.grade_level ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{currency(s.total_charged * 100)}</td>
                  <td className="px-4 py-3 tabular-nums text-emerald-700">{currency(s.total_paid * 100)}</td>
                  <td className={cn("px-4 py-3 tabular-nums font-medium", s.balance_due > 0 ? "text-sc-navy" : "text-sc-gray")}>
                    {currency(s.balance_due * 100)}
                  </td>
                  <td className="px-4 py-3">{statusBadge(s.finance_status)}</td>
                  <td className="px-4 py-3 last:pr-5">
                    <Link
                      href={`/dashboard/students/${s.student_id}?tab=finance`}
                      className="flex items-center gap-1 text-sc-teal text-label-sm hover:underline whitespace-nowrap"
                    >
                      View <ChevronRight className="size-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Family Overview ───────────────────────────────────────────────────────

function FamilyOverview({ rows, loading }: { rows: FamilyOverviewRow[]; loading: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (label: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card">
      <div className="p-4 sm:p-5 border-b border-sc-gray-100 flex items-center gap-2 flex-wrap">
        <Users className="size-4 text-sc-navy flex-shrink-0" />
        <h2 className="text-label-md font-semibold text-sc-navy">Family Overview</h2>
        <span className="text-xs text-sc-gray ml-1">(student balances grouped for reference — not duplicated)</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-5 text-sc-gray animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center py-8 text-sc-gray text-body-md">No family data for this school year.</p>
      ) : (
        <div className="divide-y divide-sc-gray-100">
          {rows.map((fam) => {
            const open = expanded.has(fam.family_label);
            return (
              <div key={fam.family_label}>
                <button
                  onClick={() => toggle(fam.family_label)}
                  className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-sc-gray-100/30 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-label-sm font-semibold text-sc-navy">{fam.family_label}</span>
                      <span className="text-xs text-sc-gray">{fam.student_count} student{fam.student_count !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="text-right mr-2">
                    <p className={cn("text-label-sm font-semibold tabular-nums", fam.balance_cents > 0 ? "text-sc-navy" : "text-emerald-700")}>
                      {currency(fam.balance_cents)}
                    </p>
                    <p className="text-xs text-sc-gray">balance</p>
                  </div>
                  {open ? <ChevronUp className="size-4 text-sc-gray flex-shrink-0" /> : <ChevronDown className="size-4 text-sc-gray flex-shrink-0" />}
                </button>

                {open && (
                  <div className="px-4 sm:px-5 pb-3 space-y-1">
                    {fam.students.map((s) => (
                      <div key={s.student_id} className="flex items-center gap-3 py-1.5 pl-4 border-l-2 border-sc-gray-100">
                        <Link
                          href={`/dashboard/students/${s.student_id}?tab=finance`}
                          className="flex-1 text-body-md text-sc-navy hover:text-sc-teal hover:underline truncate"
                        >
                          {s.student_name}
                        </Link>
                        <span className="text-xs text-sc-gray tabular-nums">{currency(s.charged_cents)} billed</span>
                        <span className="text-xs text-emerald-700 tabular-nums">{currency(s.paid_cents)} paid</span>
                        <span className={cn("text-xs font-medium tabular-nums", s.balance_cents > 0 ? "text-sc-navy" : "text-sc-gray")}>
                          {currency(s.balance_cents)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Recent Activity ───────────────────────────────────────────────────────

function RecentActivity({ rows, loading }: { rows: LedgerActivity[]; loading: boolean }) {
  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card">
      <div className="p-4 sm:p-5 border-b border-sc-gray-100 flex items-center gap-2">
        <Clock className="size-4 text-sc-navy" />
        <h2 className="text-label-md font-semibold text-sc-navy">Recent Activity</h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 text-sc-gray animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-center py-10 text-sc-gray text-body-md">No recent financial activity.</p>
      ) : (
        <div className="divide-y divide-sc-gray-100">
          {rows.map((r) => {
            const cfg = ENTRY_TYPE_CONFIG[r.entry_type] ?? { label: r.entry_type, color: "text-sc-navy", Icon: ReceiptText, sign: "+" as const };
            const { Icon } = cfg;
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-sc-gray-100/30 transition-colors">
                <div className={cn("size-8 rounded-full flex items-center justify-center flex-shrink-0 bg-sc-gray-100", cfg.color)}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-label-sm font-medium", cfg.color)}>{cfg.label}</span>
                    {r.student_id && r.student_name && (
                      <Link
                        href={`/dashboard/students/${r.student_id}?tab=finance`}
                        className="text-body-md text-sc-gray hover:text-sc-teal truncate"
                      >
                        {r.student_name}
                      </Link>
                    )}
                  </div>
                  <p className="text-xs text-sc-gray truncate">{r.description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={cn("text-label-sm font-semibold tabular-nums", cfg.color)}>
                    {cfg.sign}{currency(r.amount_cents)}
                  </p>
                  <p className="text-xs text-sc-gray">{fmtDate(r.posted_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── View tabs ─────────────────────────────────────────────────────────────

type View = "students" | "families";

// ── Main component ────────────────────────────────────────────────────────

interface FinanceDashboardProps {
  orgId:       string;
  canManage:   boolean;
  schoolYears: SchoolYear[];
}

export function FinanceDashboard({ orgId, canManage: _canManage, schoolYears }: FinanceDashboardProps) {
  const currentYear = schoolYears.find((y) => y.is_current) ?? schoolYears[0] ?? null;
  const [selectedYearId, setSelectedYearId] = useState<string | null>(currentYear?.id ?? null);
  const [activeView, setActiveView] = useState<View>("students");

  const [summary,         setSummary]         = useState<FinanceDashboardSummary | null>(null);
  const [arRows,          setArRows]          = useState<ARStudentRow[]>([]);
  const [familyRows,      setFamilyRows]      = useState<FamilyOverviewRow[]>([]);
  const [activity,        setActivity]        = useState<LedgerActivity[]>([]);
  const [loadingSummary,  setLoadingSummary]  = useState(true);
  const [loadingAR,       setLoadingAR]       = useState(true);
  const [loadingFamilies, setLoadingFamilies] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoadingSummary(true);
    getFinanceDashboardSummary(orgId, selectedYearId).then((s) => { setSummary(s); setLoadingSummary(false); });
  }, [orgId, selectedYearId]);

  useEffect(() => {
    setLoadingActivity(true);
    getRecentLedgerActivity(orgId, 30).then((rows) => { setActivity(rows); setLoadingActivity(false); });
  }, [orgId]);

  const loadYearData = useCallback(async (yearId: string) => {
    setLoadingAR(true);
    setLoadingFamilies(true);
    setSearch("");
    const [ar, fam] = await Promise.all([
      getARSummary(yearId, orgId),
      getFamilyOverview(orgId, yearId),
    ]);
    setArRows(ar?.students ?? []);
    setFamilyRows(fam);
    setLoadingAR(false);
    setLoadingFamilies(false);
  }, [orgId]);

  useEffect(() => {
    if (selectedYearId) loadYearData(selectedYearId);
  }, [selectedYearId, loadYearData]);

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-heading-1 text-sc-navy">Finance</h1>
          <p className="text-body-md text-sc-gray mt-0.5">Accounts receivable, payments, and student balances.</p>
        </div>
        <Link
          href="/dashboard/reports"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-sc-gray-200 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors"
        >
          <ReceiptText className="size-4" /> Detailed Reports
        </Link>
      </div>

      {/* Overview cards + scholarship breakdown */}
      {loadingSummary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 h-28 animate-pulse bg-sc-gray-100/40" />
          ))}
        </div>
      ) : summary ? (
        <OverviewCards summary={summary} />
      ) : null}

      {/* Year selector + view tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <select
          className="border border-sc-gray-200 rounded-lg px-3 py-1.5 text-body-md bg-white"
          value={selectedYearId ?? ""}
          onChange={(e) => setSelectedYearId(e.target.value)}
        >
          {schoolYears.map((y) => (
            <option key={y.id} value={y.id}>
              {y.label}{y.is_current ? " (Current)" : ""}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 bg-sc-gray-100 rounded-xl p-1">
          {(["students", "families"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-label-sm font-medium transition-colors capitalize",
                activeView === v ? "bg-white text-sc-navy shadow-sm" : "text-sc-gray hover:text-sc-navy"
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Main content + recent activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
        <div className="xl:col-span-2">
          {activeView === "students" ? (
            <StudentARTable
              rows={arRows}
              loading={loadingAR}
              search={search}
              onSearch={setSearch}
            />
          ) : (
            <FamilyOverview rows={familyRows} loading={loadingFamilies} />
          )}
        </div>
        <div className="xl:col-span-1">
          <RecentActivity rows={activity} loading={loadingActivity} />
        </div>
      </div>
    </div>
  );
}
