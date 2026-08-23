"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle, X, Clock, AlertTriangle, TrendingUp, ShieldAlert, ChevronDown } from "lucide-react";
import { getStudentAttendanceData } from "@/app/actions/profileData";
import { correctAttendanceFull, resetAttendanceDay } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";
import { formatAttendanceTime, toEasternISO } from "@/lib/format-attendance-time";

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
  // d is YYYY-MM-DD (date-only, no timezone). Append T12:00:00 so it parses as midday
  // and avoids off-by-one from UTC midnight interpretation.
  return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const fmtTime = formatAttendanceTime;

function isoToEasternHHMM(iso: string | null): string {
  if (!iso) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const h = parseInt(parts.find((p) => p.type === "hour")!.value) % 24;
    const m = parts.find((p) => p.type === "minute")!.value;
    return `${String(h).padStart(2, "0")}:${m}`;
  } catch { return ""; }
}

type MenuMode = "closed" | "menu" | "edit" | "reset_confirm";

function CorrectionMenu({
  recordId, date, checkInAt, checkOutAt,
  status: initStatus, isLate: initIsLate, isEarlyPickup: initIsEP, notes: initNotes,
  onCorrected,
}: {
  recordId: string;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string;
  isLate: boolean;
  isEarlyPickup: boolean;
  notes: string | null;
  onCorrected: () => void;
}) {
  const [mode, setMode]               = useState<MenuMode>("closed");
  const [isPending, startTransition]  = useTransition();
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [editStatus, setEditStatus]   = useState(initStatus);
  const [editIsLate, setEditIsLate]   = useState(initIsLate);
  const [editIsEP, setEditIsEP]       = useState(initIsEP);
  const [editNotes, setEditNotes]     = useState(initNotes ?? "");
  const [adminNote, setAdminNote]     = useState("");
  const ciRef = useRef<HTMLInputElement>(null);
  const coRef = useRef<HTMLInputElement>(null);

  // Pre-populate time inputs when edit panel mounts
  useEffect(() => {
    if (mode !== "edit") return;
    if (ciRef.current) ciRef.current.value = isoToEasternHHMM(checkInAt);
    if (coRef.current) coRef.current.value = isoToEasternHHMM(checkOutAt);
  }, [mode, checkInAt, checkOutAt]);

  function openEdit() {
    setEditStatus(initStatus);
    setEditIsLate(initIsLate);
    setEditIsEP(initIsEP);
    setEditNotes(initNotes ?? "");
    setAdminNote("");
    setSaveError(null);
    setMode("edit");
  }

  function doSaveCorrection() {
    setSaveError(null);
    startTransition(async () => {
      const ciVal = ciRef.current?.value ?? "";
      const coVal = coRef.current?.value ?? "";
      const result = await correctAttendanceFull({
        recordId,
        status:          editStatus,
        checkInAt:       ciVal ? toEasternISO(date, ciVal) : null,
        checkOutAt:      coVal ? toEasternISO(date, coVal) : null,
        isLate:          editIsLate,
        isEarlyPickup:   editIsEP,
        notes:           editNotes || null,
        adminNote:       adminNote || undefined,
      });
      if (!result.success) { setSaveError(result.error ?? "Failed to save."); return; }
      setMode("closed");
      onCorrected();
    });
  }

  function doReset() {
    setSaveError(null);
    startTransition(async () => {
      const result = await resetAttendanceDay(recordId, adminNote || undefined);
      if (!result.success) { setSaveError(result.error ?? "Failed to reset."); return; }
      setMode("closed");
      onCorrected();
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMode((m) => m === "closed" ? "menu" : "closed")}
        className="flex items-center gap-1 rounded-lg border border-sc-gray-200 px-2 py-1 text-label-sm text-sc-gray hover:bg-sc-gray-50 transition-colors"
      >
        <ShieldAlert className="size-3.5 text-sc-rose-500" /> Fix
        <ChevronDown className={cn("size-3 transition-transform", mode !== "closed" && "rotate-180")} />
      </button>

      {mode === "menu" && (
        <div className="absolute right-0 top-full mt-1 z-20 w-52 rounded-xl border border-sc-gray-200 bg-white shadow-lg p-2 space-y-1">
          <button onClick={openEdit}
            className="w-full text-left rounded-lg px-3 py-2 text-label-sm text-sc-teal-700 hover:bg-sc-teal-50 font-medium">
            Correct This Record
          </button>
          <button onClick={() => { setAdminNote(""); setSaveError(null); setMode("reset_confirm"); }}
            className="w-full text-left rounded-lg px-3 py-2 text-label-sm text-sc-rose-700 hover:bg-sc-rose-50">
            Reset Attendance For This Day
          </button>
        </div>
      )}

      {mode === "edit" && (
        <div className="absolute right-0 top-full mt-1 z-20 w-96 rounded-xl border border-sc-gray-200 bg-white shadow-lg">
          <div className="px-4 py-3 border-b border-sc-gray-100">
            <p className="text-label-md font-semibold text-sc-navy">Correct Attendance</p>
            <p className="text-label-sm text-sc-gray">{fmtDate(date)}</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-navy">Status</label>
              <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                className="w-full rounded-lg border border-sc-gray-200 px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-teal">
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="tardy">Tardy</option>
                <option value="excused">Excused</option>
                <option value="checked_in">Checked In</option>
                <option value="early_dismissal">Early Dismissal</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-label-sm font-medium text-sc-navy">Check-In (Eastern)</label>
                <input ref={ciRef} type="time"
                  className="w-full rounded-lg border border-sc-gray-200 px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-teal" />
              </div>
              <div className="space-y-1">
                <label className="text-label-sm font-medium text-sc-navy">Check-Out (Eastern)</label>
                <input ref={coRef} type="time"
                  className="w-full rounded-lg border border-sc-gray-200 px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-teal" />
              </div>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-label-sm text-sc-navy cursor-pointer">
                <input type="checkbox" checked={editIsLate} onChange={(e) => setEditIsLate(e.target.checked)} className="rounded" />
                Late
              </label>
              <label className="flex items-center gap-1.5 text-label-sm text-sc-navy cursor-pointer">
                <input type="checkbox" checked={editIsEP} onChange={(e) => setEditIsEP(e.target.checked)} className="rounded" />
                Early Pickup
              </label>
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-navy">Notes</label>
              <textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Optional notes"
                className="w-full rounded-lg border border-sc-gray-200 px-2 py-1.5 text-label-sm resize-none focus:outline-none focus:ring-1 focus:ring-sc-teal" />
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-navy">Correction Reason</label>
              <input type="text" value={adminNote} onChange={(e) => setAdminNote(e.target.value)}
                placeholder="Why is this being corrected?"
                className="w-full rounded-lg border border-sc-gray-200 px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-teal" />
            </div>
            {saveError && <p className="text-label-sm text-sc-rose-700">{saveError}</p>}
            <div className="flex gap-2">
              <button onClick={doSaveCorrection} disabled={isPending}
                className="flex-1 rounded-lg bg-sc-teal px-3 py-2 text-white text-label-sm font-medium disabled:opacity-60">
                {isPending ? "Saving…" : "Save Correction"}
              </button>
              <button onClick={() => setMode("closed")}
                className="rounded-lg border border-sc-gray-200 px-3 py-2 text-sc-gray text-label-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === "reset_confirm" && (
        <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-xl border border-sc-rose-200 bg-white shadow-lg p-4 space-y-3">
          <p className="text-label-md font-semibold text-sc-rose-700">Reset Attendance?</p>
          <p className="text-label-sm text-sc-gray">
            Deletes all attendance data for {fmtDate(date)}. The student returns to "Not Recorded"
            and can be checked in again normally.
          </p>
          <input type="text" value={adminNote} onChange={(e) => setAdminNote(e.target.value)}
            placeholder="Reason for reset (optional)"
            className="w-full rounded-lg border border-sc-gray-200 px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-rose" />
          {saveError && <p className="text-label-sm text-sc-rose-700">{saveError}</p>}
          <div className="flex gap-2">
            <button onClick={doReset} disabled={isPending}
              className="flex-1 rounded-lg bg-sc-rose px-3 py-2 text-white text-label-sm font-medium disabled:opacity-60">
              {isPending ? "Resetting…" : "Confirm Reset"}
            </button>
            <button onClick={() => setMode("closed")}
              className="rounded-lg border border-sc-gray-200 px-3 py-2 text-sc-gray text-label-sm">
              Cancel
            </button>
          </div>
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

      {/* Records list — no overflow-hidden so CorrectionMenu dropdown isn't clipped */}
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card">
        <div className="px-5 py-4 border-b border-sc-gray-100 flex items-center justify-between rounded-t-2xl">
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
                <div key={r.id} className="px-5 py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Date */}
                    <div className="w-28 shrink-0">
                      <p className="text-label-md text-sc-navy font-medium">{fmtDate(r.date)}</p>
                    </div>

                    {/* Status chip */}
                    <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium shrink-0", cfg.cls)}>
                      {cfg.label}
                      {r.is_late && " · Late"}
                      {r.is_early_pickup && " · Early Pickup"}
                    </span>

                    {/* Times — always visible */}
                    <div className="flex gap-3 text-label-sm ml-auto shrink-0">
                      <span className={cn("font-medium", r.check_in_at ? "text-sc-navy" : "text-sc-gray-400")}>
                        In: {fmtTime(r.check_in_at)}
                      </span>
                      <span className={cn("font-medium", r.check_out_at ? "text-sc-navy" : "text-sc-gray-400")}>
                        Out: {fmtTime(r.check_out_at)}
                      </span>
                    </div>

                    {/* Admin correction */}
                    {isAdmin && (
                      <CorrectionMenu
                        recordId={r.id}
                        date={r.date}
                        checkInAt={r.check_in_at}
                        checkOutAt={r.check_out_at}
                        status={r.status}
                        isLate={r.is_late ?? false}
                        isEarlyPickup={r.is_early_pickup ?? false}
                        notes={r.notes ?? null}
                        onCorrected={reload}
                      />
                    )}
                  </div>
                  {/* Notes on second line if present */}
                  {r.notes && (
                    <p className="mt-1 text-label-sm text-sc-gray italic ml-28">{r.notes}</p>
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
