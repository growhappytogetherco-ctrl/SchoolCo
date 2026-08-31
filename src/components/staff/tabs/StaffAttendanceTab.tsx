"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CalendarCheck, Plus, Pencil, Trash2, CheckCircle,
  Clock, LogIn, LogOut, RefreshCw,
} from "lucide-react";
import {
  getStaffAttendanceHistory, getStaffAttendanceSummary,
  addStaffAttendanceRecord, updateStaffAttendanceRecord, deleteStaffAttendanceRecord,
  type StaffAttendanceHistoryRecord, type StaffAttendanceSummary,
} from "@/app/actions/staffAttendance";
import { formatAttendanceTime, toEasternISO } from "@/lib/format-attendance-time";
import { cn } from "@/lib/utils";

interface Props {
  staffRosterId: string;
  isFullAdmin:   boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function fmtMinutes(min: number | null): string {
  if (min === null || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
}

function isoToHHMM(iso: string | null): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const h = parseInt(parts.find((p) => p.type === "hour")!.value) % 24;
  const m = parts.find((p) => p.type === "minute")!.value;
  return `${String(h).padStart(2, "0")}:${m}`;
}

const inputCls = "w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white";

// ── Summary cards ─────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: StaffAttendanceSummary }) {
  const STATUS_CFG = {
    checked_in:      { label: "Checked In",       cls: "bg-sc-teal  text-white",            Icon: LogIn  },
    checked_out:     { label: "Checked Out",       cls: "bg-sc-navy text-white",             Icon: LogOut },
    not_checked_in:  { label: "Not Checked In",    cls: "bg-sc-gray-200 text-sc-gray",       Icon: Clock  },
  }[summary.current_status];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4">
        <p className="text-label-sm text-sc-gray">Days Present</p>
        <p className="text-3xl font-bold text-sc-navy tabular-nums mt-1">{summary.days_present}</p>
        <p className="text-label-sm text-sc-gray-400 mt-0.5">This school year</p>
      </div>
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4">
        <p className="text-label-sm text-sc-gray">Total Hours</p>
        <p className="text-3xl font-bold text-sc-navy tabular-nums mt-1">
          {Math.floor(summary.total_minutes / 60)}h
        </p>
        <p className="text-label-sm text-sc-gray-400 mt-0.5">This school year</p>
      </div>
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4">
        <p className="text-label-sm text-sc-gray">Check-In Today</p>
        <p className="text-xl font-semibold text-sc-navy mt-1">
          {formatAttendanceTime(summary.check_in_at_today)}
        </p>
        <p className="text-label-sm text-sc-gray-400 mt-0.5">
          {summary.check_out_at_today ? `Out ${formatAttendanceTime(summary.check_out_at_today)}` : "Still on site"}
        </p>
      </div>
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 flex flex-col justify-between">
        <p className="text-label-sm text-sc-gray">Current Status</p>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-sm font-semibold mt-2 self-start", STATUS_CFG.cls)}>
          <STATUS_CFG.Icon className="size-3.5" />
          {STATUS_CFG.label}
        </span>
      </div>
    </div>
  );
}

// ── Add/Edit form ─────────────────────────────────────────────────────────

interface RecordFormProps {
  staffRosterId: string;
  existing?:     StaffAttendanceHistoryRecord;
  onDone:        () => void;
  onCancel:      () => void;
}

function RecordForm({ staffRosterId, existing, onDone, onCancel }: RecordFormProps) {
  const today = new Date().toISOString().split("T")[0];
  const [isPending, start] = useTransition();
  const [error, setError]  = useState<string | null>(null);

  const [date,   setDate]   = useState(existing?.date ?? today);
  const [ciHHMM, setCi]     = useState(isoToHHMM(existing?.check_in_at ?? null));
  const [coHHMM, setCo]     = useState(isoToHHMM(existing?.check_out_at ?? null));
  const [notes,  setNotes]  = useState(existing?.notes ?? "");

  async function handleSave() {
    setError(null);
    const check_in_at  = ciHHMM ? toEasternISO(date, ciHHMM) : null;
    const check_out_at = coHHMM ? toEasternISO(date, coHHMM) : null;
    if (check_out_at && check_in_at && check_out_at < check_in_at) {
      setError("Check-out must be after check-in."); return;
    }

    start(async () => {
      let res;
      if (existing) {
        res = await updateStaffAttendanceRecord(existing.id, {
          date, check_in_at, check_out_at,
          check_in_method: existing.check_in_method ?? "manual",
          check_out_method: check_out_at ? (existing.check_out_method ?? "manual") : null,
          notes: notes.trim() || null,
        });
      } else {
        res = await addStaffAttendanceRecord(staffRosterId, {
          date,
          check_in_at,
          check_out_at,
          check_in_method: "manual",
          check_out_method: check_out_at ? "manual" : null,
          notes: notes.trim() || null,
        });
      }
      if (!res.success) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div className="rounded-2xl border border-sc-teal/30 bg-sc-teal-50 p-5 space-y-4">
      <h3 className="text-label-md font-semibold text-sc-navy">
        {existing ? "Edit Attendance Record" : "Add Attendance Record"}
      </h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="text-label-sm font-medium text-sc-navy block mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            max={today} className={inputCls} />
        </div>
        <div>
          <label className="text-label-sm font-medium text-sc-navy block mb-1">Check-In Time</label>
          <input type="time" value={ciHHMM} onChange={(e) => setCi(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="text-label-sm font-medium text-sc-navy block mb-1">Check-Out Time</label>
          <input type="time" value={coHHMM} onChange={(e) => setCo(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className="text-label-sm font-medium text-sc-navy block mb-1">Notes (optional)</label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Reason for manual entry…" className={inputCls} />
      </div>
      {error && <p className="text-label-sm text-sc-rose">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={isPending}
          className="flex items-center gap-1.5 rounded-xl bg-sc-teal px-4 py-2 text-white text-label-md font-semibold hover:bg-sc-teal-700 transition-colors disabled:opacity-50">
          {isPending ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
          {isPending ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="rounded-xl border border-sc-gray-200 px-4 py-2 text-label-md text-sc-gray hover:bg-sc-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────

function DeleteConfirm({ record, onDone, onCancel }: {
  record: StaffAttendanceHistoryRecord; onDone: () => void; onCancel: () => void;
}) {
  const [isPending, start] = useTransition();
  const [error, setError]  = useState<string | null>(null);

  function handleDelete() {
    start(async () => {
      const res = await deleteStaffAttendanceRecord(record.id);
      if (!res.success) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div className="rounded-2xl border border-sc-rose-200 bg-sc-rose-50 p-4 flex items-center justify-between gap-4">
      <p className="text-label-sm text-sc-rose-700">
        Delete attendance record for <strong>{fmtDate(record.date)}</strong>? This cannot be undone.
      </p>
      {error && <p className="text-label-sm text-sc-rose">{error}</p>}
      <div className="flex gap-2 shrink-0">
        <button onClick={handleDelete} disabled={isPending}
          className="rounded-xl bg-sc-rose px-3 py-1.5 text-white text-label-sm font-semibold hover:bg-sc-rose-700 disabled:opacity-50">
          {isPending ? "Deleting…" : "Delete"}
        </button>
        <button onClick={onCancel} className="rounded-xl border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-gray hover:bg-white">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function StaffAttendanceTab({ staffRosterId, isFullAdmin }: Props) {
  const [history, setHistory]   = useState<StaffAttendanceHistoryRecord[]>([]);
  const [summary, setSummary]   = useState<StaffAttendanceSummary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [editing, setEditing]   = useState<StaffAttendanceHistoryRecord | null>(null);
  const [deleting, setDeleting] = useState<StaffAttendanceHistoryRecord | null>(null);

  async function load() {
    setLoading(true);
    const [h, s] = await Promise.all([
      getStaffAttendanceHistory(staffRosterId),
      getStaffAttendanceSummary(staffRosterId),
    ]);
    setHistory(h);
    setSummary(s);
    setLoading(false);
  }

  useEffect(() => { load(); }, [staffRosterId]);

  function handleDone() {
    setShowAdd(false);
    setEditing(null);
    setDeleting(null);
    load();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary */}
      {summary && !loading && <SummaryCards summary={summary} />}
      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[1,2,3,4].map((i) => <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white h-24 animate-pulse" />)}
        </div>
      )}

      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
          <CalendarCheck className="size-5 text-sc-teal" />
          Attendance History
          <span className="text-label-sm font-normal text-sc-gray-400 ml-1">— current school year</span>
        </h2>
        {isFullAdmin && !showAdd && !editing && (
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-xl bg-sc-teal px-4 py-2 text-white text-label-sm font-semibold hover:bg-sc-teal-700 transition-colors">
            <Plus className="size-4" /> Add Record
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <RecordForm staffRosterId={staffRosterId} onDone={handleDone} onCancel={() => setShowAdd(false)} />
      )}

      {/* History table */}
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sc-gray animate-pulse">Loading…</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center">
            <CalendarCheck className="size-10 text-sc-gray-200 mx-auto mb-2" />
            <p className="text-label-md text-sc-gray">No attendance records for this school year.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-sc-gray-100 bg-sc-gray-50">
                  <th className="px-5 py-3 text-label-sm font-semibold text-sc-gray">Date</th>
                  <th className="px-5 py-3 text-label-sm font-semibold text-sc-gray">Check In</th>
                  <th className="px-5 py-3 text-label-sm font-semibold text-sc-gray">Check Out</th>
                  <th className="px-5 py-3 text-label-sm font-semibold text-sc-gray">Total</th>
                  <th className="px-5 py-3 text-label-sm font-semibold text-sc-gray">Method</th>
                  {isFullAdmin && <th className="px-5 py-3 text-label-sm font-semibold text-sc-gray" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-sc-gray-100">
                {history.map((record) => {
                  const isEditing  = editing?.id === record.id;
                  const isDeleting = deleting?.id === record.id;
                  const method = record.check_in_method ?? "qr";
                  return (
                    <tr key={record.id}>
                      <td colSpan={isEditing || isDeleting ? 6 : 1}
                        className={isEditing || isDeleting ? "px-5 py-3" : "px-5 py-3 text-label-md text-sc-navy font-medium"}>
                        {isEditing ? (
                          <RecordForm staffRosterId={staffRosterId} existing={record}
                            onDone={handleDone} onCancel={() => setEditing(null)} />
                        ) : isDeleting ? (
                          <DeleteConfirm record={record} onDone={handleDone} onCancel={() => setDeleting(null)} />
                        ) : (
                          fmtDate(record.date)
                        )}
                      </td>
                      {!isEditing && !isDeleting && (
                        <>
                          <td className="px-5 py-3 text-label-md text-sc-navy">
                            {formatAttendanceTime(record.check_in_at)}
                          </td>
                          <td className="px-5 py-3 text-label-md text-sc-navy">
                            {formatAttendanceTime(record.check_out_at)}
                          </td>
                          <td className="px-5 py-3 text-label-md text-sc-navy tabular-nums">
                            {fmtMinutes(record.minutes_present)}
                          </td>
                          <td className="px-5 py-3">
                            <span className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              method === "qr"
                                ? "bg-sc-teal-50 text-sc-teal-700"
                                : "bg-sc-gray-100 text-sc-gray"
                            )}>
                              {method === "qr" ? "QR Badge" : "Manual"}
                            </span>
                          </td>
                          {isFullAdmin && (
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-1.5 justify-end">
                                <button onClick={() => { setEditing(record); setShowAdd(false); setDeleting(null); }}
                                  className="p-1.5 rounded-lg text-sc-gray hover:text-sc-navy hover:bg-sc-gray-50 transition-colors">
                                  <Pencil className="size-3.5" />
                                </button>
                                <button onClick={() => { setDeleting(record); setEditing(null); setShowAdd(false); }}
                                  className="p-1.5 rounded-lg text-sc-gray hover:text-sc-rose hover:bg-sc-rose-50 transition-colors">
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
