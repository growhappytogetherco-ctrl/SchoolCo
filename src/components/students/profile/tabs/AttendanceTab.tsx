"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle, X, Clock, AlertTriangle, TrendingUp, ShieldAlert, ChevronDown } from "lucide-react";
import { getStudentAttendanceData } from "@/app/actions/profileData";
import { correctAttendanceRecord, type CorrectionAction } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";

interface Props { studentId: string; isAdmin?: boolean; }

type AttData = Awaited<ReturnType<typeof getStudentAttendanceData>>;

const STATUS_CFG: Record<string, { label: string; cls: string; dot: string }> = {
  present:         { label: "Present",        cls: "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",  dot: "bg-sc-teal" },
  absent:          { label: "Absent",          cls: "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200",  dot: "bg-sc-rose" },
  tardy:           { label: "Tardy",           cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",  dot: "bg-sc-gold" },
  excused:         { label: "Excused",         cls: "bg-sc-navy-50 text-sc-navy border-sc-navy-200",       dot: "bg-sc-navy" },
  early_dismissal: { label: "Early Dismissal", cls: "bg-sc-gray-50 text-sc-gray border-sc-gray-200",       dot: "bg-sc-gray" },
  checked_in:      { label: "Present",         cls: "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",  dot: "bg-sc-teal" },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CorrectionMenu({ recordId, hasCkIn, hasCkOut, onCorrected }: {
  recordId: string; hasCkIn: boolean; hasCkOut: boolean; onCorrected: () => void;
}) {
  const [open, setOpen]             = useState(false);
  const [isPending, startTransition] = useTransition();
  const [note, setNote]             = useState("");
  const [pendingAction, setPendingAction] = useState<CorrectionAction | null>(null);

  function doCorrection(action: CorrectionAction) {
    startTransition(async () => {
      await correctAttendanceRecord(recordId, action, note || undefined);
      setOpen(false);
      setNote("");
      setPendingAction(null);
      onCorrected();
    });
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg border border-sc-gray-200 px-2 py-1 text-label-sm text-sc-gray hover:bg-sc-gray-50 transition-colors">
        <ShieldAlert className="size-3.5 text-sc-rose-500" /> Fix
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-xl border border-sc-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="p-2 space-y-1">
            {hasCkOut && (
              <button onClick={() => setPendingAction("undo_checkout")}
                className="w-full text-left rounded-lg px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-50">
                Undo checkout (restore to checked-in)
              </button>
            )}
            {hasCkIn && !hasCkOut && (
              <button onClick={() => setPendingAction("undo_checkin")}
                className="w-full text-left rounded-lg px-3 py-2 text-label-sm text-sc-rose-700 hover:bg-sc-rose-50">
                Remove check-in entirely
              </button>
            )}
            <button onClick={() => setPendingAction("mark_absent")}
              className="w-full text-left rounded-lg px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-50">
              Mark as Absent
            </button>
            <button onClick={() => setPendingAction("mark_excused")}
              className="w-full text-left rounded-lg px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-50">
              Mark as Excused
            </button>
            <button onClick={() => setPendingAction("mark_present")}
              className="w-full text-left rounded-lg px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-50">
              Mark as Present
            </button>
          </div>
          {pendingAction && (
            <div className="border-t border-sc-gray-100 p-2 space-y-2">
              <input value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Reason (optional)"
                className="w-full rounded-lg border border-sc-gray-200 px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-teal" />
              <div className="flex gap-2">
                <button onClick={() => doCorrection(pendingAction)} disabled={isPending}
                  className="flex-1 rounded-lg bg-sc-navy px-2 py-1.5 text-white text-label-sm font-medium disabled:opacity-60">
                  {isPending ? "Saving…" : "Confirm"}
                </button>
                <button onClick={() => { setPendingAction(null); setOpen(false); }}
                  className="rounded-lg border border-sc-gray-200 px-2 py-1.5 text-sc-gray text-label-sm">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AttendanceTab({ studentId, isAdmin = false }: Props) {
  const [data, setData] = useState<AttData>(null);
  const [loading, setLoading] = useState(true);

  function reload() {
    setLoading(true);
    getStudentAttendanceData(studentId).then((d) => {
      setData(d);
      setLoading(false);
    });
  }

  useEffect(() => {
    getStudentAttendanceData(studentId).then((d) => {
      setData(d);
      setLoading(false);
    });
  }, [studentId]);

  if (loading) return <AttSkeleton />;
  if (!data)   return <p className="text-body-md text-sc-gray">Could not load attendance data.</p>;

  const { stats, records } = data;
  const pctColor = stats.percentage >= 95 ? "text-sc-teal"
    : stats.percentage >= 85 ? "text-sc-gold" : "text-sc-rose";

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Attendance Rate", value: `${stats.percentage}%`, color: pctColor, big: true },
          { label: "Days Present",    value: String(stats.present),  color: "text-sc-teal" },
          { label: "Absences",        value: String(stats.absent),   color: "text-sc-rose" },
          { label: "Late Arrivals",   value: String(stats.tardy),    color: "text-sc-gold" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 text-center">
            <p className={cn("font-serif font-bold", s.big ? "text-display-2" : "text-heading-1", s.color)}>
              {s.value}
            </p>
            <p className="text-label-sm text-sc-gray mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Attendance rate bar */}
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
            <TrendingUp className="size-4 text-sc-teal" /> Attendance Rate
          </h2>
          <span className={cn("text-heading-2 font-serif font-bold", pctColor)}>{stats.percentage}%</span>
        </div>
        <div className="h-3 rounded-full bg-sc-gray-100 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500",
              stats.percentage >= 95 ? "bg-sc-teal" : stats.percentage >= 85 ? "bg-sc-gold" : "bg-sc-rose"
            )}
            style={{ width: `${stats.percentage}%` }}
          />
        </div>
        <p className="text-label-sm text-sc-gray">
          {stats.percentage >= 95
            ? "Excellent attendance — keep it up!"
            : stats.percentage >= 85
            ? "Good attendance. Aim for 95% or higher."
            : "Attendance needs improvement. Please follow up with the family."}
        </p>
      </div>

      {/* Records list */}
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-sc-gray-100 flex items-center justify-between">
          <h2 className="font-serif text-heading-3 text-sc-navy">Attendance History</h2>
          <span className="text-label-sm text-sc-gray">{records.length} days this year</span>
        </div>

        {records.length === 0 ? (
          <p className="p-5 text-body-md text-sc-gray">No attendance records this school year.</p>
        ) : (
          <div className="divide-y divide-sc-gray-100">
            {records.map((r) => {
              const cfg = STATUS_CFG[r.status] ?? STATUS_CFG.present;
              return (
                <div key={r.id} className="flex items-center gap-4 px-5 py-3">
                  {/* Date */}
                  <div className="w-32 shrink-0">
                    <p className="text-label-md text-sc-navy font-medium">{fmtDate(r.date)}</p>
                  </div>

                  {/* Status chip */}
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium shrink-0", cfg.cls)}>
                    {cfg.label}
                  </span>

                  {/* Check in / out times */}
                  <div className="flex gap-4 text-label-sm text-sc-gray ml-auto">
                    <span className="hidden sm:block">In: {fmtTime(r.check_in_at)}</span>
                    <span className="hidden sm:block">Out: {fmtTime(r.check_out_at)}</span>
                  </div>

                  {/* Flags */}
                  <div className="flex gap-1 shrink-0">
                    {r.is_late && (
                      <span title="Late arrival" className="rounded-full bg-sc-gold-50 border border-sc-gold-200 px-1.5 py-0.5 text-label-sm text-sc-gold-700">Late</span>
                    )}
                    {r.is_early_pickup && (
                      <span title="Early pickup" className="rounded-full bg-sc-navy-50 border border-sc-navy-200 px-1.5 py-0.5 text-label-sm text-sc-navy">Early</span>
                    )}
                  </div>

                  {/* Admin correction */}
                  {isAdmin && (
                    <CorrectionMenu
                      recordId={r.id}
                      hasCkIn={!!r.check_in_at}
                      hasCkOut={!!r.check_out_at}
                      onCorrected={reload}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AttSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1,2,3,4].map((i) => (
          <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 h-24 animate-pulse" />
        ))}
      </div>
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 h-32 animate-pulse" />
    </div>
  );
}
