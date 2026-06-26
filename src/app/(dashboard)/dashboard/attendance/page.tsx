"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { QrCode, Users, ClipboardList, RefreshCw } from "lucide-react";
import { getTodayAttendance } from "@/app/actions/attendance";
import type { StudentAttendanceRow } from "@/app/actions/attendance";
import { AttendanceList } from "@/components/attendance/AttendanceList";
import { cn } from "@/lib/utils";

type Tab = "today" | "manual";

export default function AttendancePage() {
  const [tab, setTab]           = useState<Tab>("today");
  const [rows, setRows]         = useState<StudentAttendanceRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getTodayAttendance();
    setRows(data);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  const refreshTime = lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const checkedIn  = rows.filter((r) => r.record?.check_in_at && !r.record?.check_out_at).length;
  const absent     = rows.filter((r) => r.record?.status === "absent").length;
  const lateCount  = rows.filter((r) => r.record?.is_late).length;

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-display-2 text-sc-navy">Attendance</h1>
          <p className="text-body-md text-sc-gray mt-0.5">{today}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-gray hover:bg-sc-cream transition-colors"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            {loading ? "Loading…" : `Updated ${refreshTime}`}
          </button>

          {/* Primary CTA — Scan QR */}
          <Link
            href="/dashboard/attendance/scan"
            className="flex items-center gap-2 rounded-lg bg-sc-teal px-4 py-2 text-white text-label-md font-medium hover:bg-sc-teal-600 transition-colors shadow-sm"
          >
            <QrCode className="size-4" />
            Scan QR Badge
          </Link>
        </div>
      </div>

      {/* ── Quick stat chips ─────────────────────────────────── */}
      {!loading && (
        <div className="flex flex-wrap gap-2">
          <StatChip label="On Campus" value={checkedIn} color="teal" />
          <StatChip label="Absent" value={absent} color="rose" />
          <StatChip label="Late" value={lateCount} color="gold" />
          <StatChip label="Total Enrolled" value={rows.length} color="gray" />
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl border border-sc-gray-100 bg-sc-cream/60 p-1">
        <TabBtn active={tab === "today"} icon={<Users className="size-4" />} label="Today's List" onClick={() => setTab("today")} />
        <TabBtn active={tab === "manual"} icon={<ClipboardList className="size-4" />} label="Manual Entry" onClick={() => setTab("manual")} />
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-sc-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <AttendanceList rows={rows} onUpdate={load} />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatChip({ label, value, color }: { label: string; value: number; color: "teal" | "rose" | "gold" | "gray" }) {
  const cls = {
    teal: "bg-sc-teal-50 border-sc-teal-200 text-sc-teal-700",
    rose: "bg-sc-rose-50 border-sc-rose-200 text-sc-rose-700",
    gold: "bg-sc-gold-50 border-sc-gold-200 text-sc-gold-700",
    gray: "bg-sc-gray-50 border-sc-gray-200 text-sc-gray-600",
  }[color];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-label-sm font-medium", cls)}>
      <span className="font-bold">{value}</span> {label}
    </span>
  );
}

function TabBtn({ active, icon, label, onClick }: {
  active: boolean; icon: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-label-md font-medium transition-all",
        active
          ? "bg-white text-sc-navy shadow-sm"
          : "text-sc-gray hover:text-sc-navy"
      )}
    >
      {icon}{label}
    </button>
  );
}
