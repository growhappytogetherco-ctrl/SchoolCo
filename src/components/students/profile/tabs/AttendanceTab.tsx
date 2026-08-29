"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle, X, Clock, AlertTriangle, TrendingUp, Pencil, Trash2 } from "lucide-react";
import { getStudentAttendanceData } from "@/app/actions/profileData";
import { editAttendanceRecord, deleteAttendanceRecord } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";
import { formatAttendanceTime, toEasternISO } from "@/lib/format-attendance-time";

interface Props { studentId: string; isFullAdmin?: boolean; }

type AttData = Awaited<ReturnType<typeof getStudentAttendanceData>>;

const STATUS_CFG: Record<string, { label: string; cls: string; dot: string }> = {
  present:         { label: "Present",        cls: "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",  dot: "bg-sc-teal" },
  absent:          { label: "Absent",          cls: "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200",  dot: "bg-sc-rose" },
  tardy:           { label: "Tardy",           cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",  dot: "bg-sc-gold" },
  excused:         { label: "Excused",         cls: "bg-sc-navy-50 text-sc-navy border-sc-navy-200",       dot: "bg-sc-navy" },
  early_dismissal: { label: "Early Dismissal", cls: "bg-sc-gray-50 text-sc-gray border-sc-gray-200",       dot: "bg-sc-gray" },
  checked_in:      { label: "Present",         cls: "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",  dot: "bg-sc-teal" },
};

const STATUS_OPTIONS = [
  { value: "present",          label: "Present" },
  { value: "absent",           label: "Absent" },
  { value: "tardy",            label: "Tardy" },
  { value: "excused",          label: "Excused" },
  { value: "checked_in",       label: "Checked In" },
  { value: "early_dismissal",  label: "Early Dismissal / Pickup" },
];

function fmtDate(d: string) {
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

// ── RecordActions — Full Admin only: Edit + Delete ─────────────────────────
// Rendered inline (no absolute positioning). Edit panel expands below the row.

type ActionMode = "closed" | "edit" | "delete_confirm";

function RecordActions({
  recordId, date, checkInAt, checkOutAt,
  status: initStatus, isLate: initIsLate, isEarlyPickup: initIsEP, notes: initNotes,
  onChanged,
}: {
  recordId:      string;
  date:          string;
  checkInAt:     string | null;
  checkOutAt:    string | null;
  status:        string;
  isLate:        boolean;
  isEarlyPickup: boolean;
  notes:         string | null;
  onChanged:     () => void;
}) {
  const [mode, setMode]              = useState<ActionMode>("closed");
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  // Edit state
  const [editStatus, setEditStatus]  = useState(initStatus);
  const [editDate,   setEditDate]    = useState(date);
  const [editIsLate, setEditIsLate]  = useState(initIsLate);
  const [editIsEP,   setEditIsEP]    = useState(initIsEP);
  const [editNotes,  setEditNotes]   = useState(initNotes ?? "");
  const [editReason, setEditReason]  = useState("");
  const [deleteReason, setDeleteReason] = useState("");

  const ciRef = useRef<HTMLInputElement>(null);
  const coRef = useRef<HTMLInputElement>(null);

  // Pre-populate time inputs when edit panel opens
  useEffect(() => {
    if (mode !== "edit") return;
    if (ciRef.current) ciRef.current.value = isoToEasternHHMM(checkInAt);
    if (coRef.current) coRef.current.value = isoToEasternHHMM(checkOutAt);
  }, [mode, checkInAt, checkOutAt]);

  function openEdit() {
    setEditStatus(initStatus);
    setEditDate(date);
    setEditIsLate(initIsLate);
    setEditIsEP(initIsEP);
    setEditNotes(initNotes ?? "");
    setEditReason("");
    setError(null);
    setMode("edit");
  }

  function doEdit() {
    setError(null);
    startTransition(async () => {
      const ciVal = ciRef.current?.value ?? "";
      const coVal = coRef.current?.value ?? "";
      const result = await editAttendanceRecord({
        recordId,
        date:          editDate,
        status:        editStatus,
        checkInAt:     ciVal ? toEasternISO(editDate, ciVal) : null,
        checkOutAt:    coVal ? toEasternISO(editDate, coVal) : null,
        isLate:        editIsLate,
        isEarlyPickup: editIsEP,
        notes:         editNotes || null,
        reason:        editReason || undefined,
      });
      if (!result.success) { setError(result.error ?? "Save failed."); return; }
      setMode("closed");
      onChanged();
    });
  }

  function doDelete() {
    if (!deleteReason.trim()) { setError("Please enter a reason for deletion."); return; }
    setError(null);
    startTransition(async () => {
      const result = await deleteAttendanceRecord(recordId, deleteReason.trim());
      if (!result.success) { setError(result.error ?? "Delete failed."); return; }
      setMode("closed");
      onChanged();
    });
  }

  const cancel = () => { setMode("closed"); setError(null); };

  return (
    <>
      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={openEdit}
          className={cn(
            "flex items-center gap-1 rounded-lg border px-2 py-1 text-label-sm transition-colors",
            mode === "edit"
              ? "border-sc-teal bg-sc-teal-50 text-sc-teal-700"
              : "border-sc-gray-200 text-sc-gray hover:bg-sc-gray-50"
          )}
          title="Edit this attendance record"
        >
          <Pencil className="size-3" /> Edit
        </button>
        <button
          onClick={() => { setDeleteReason(""); setError(null); setMode("delete_confirm"); }}
          className={cn(
            "flex items-center gap-1 rounded-lg border px-2 py-1 text-label-sm transition-colors",
            mode === "delete_confirm"
              ? "border-sc-rose-200 bg-sc-rose-50 text-sc-rose-700"
              : "border-sc-gray-200 text-sc-gray hover:bg-sc-rose-50 hover:text-sc-rose-700 hover:border-sc-rose-200"
          )}
          title="Permanently delete this attendance record"
        >
          <Trash2 className="size-3" /> Delete
        </button>
        {mode !== "closed" && (
          <button onClick={cancel} className="rounded-lg border border-sc-gray-200 px-1.5 py-1 text-sc-gray hover:bg-sc-gray-50" title="Cancel">
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* ── Edit panel ──────────────────────────────────────────────────── */}
      {mode === "edit" && (
        <div className="mt-3 w-full rounded-xl border border-sc-teal-200 bg-sc-teal-50/30 p-4 space-y-3">
          <p className="text-label-sm font-semibold text-sc-navy">Edit Attendance Record</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-navy">Date</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full rounded-lg border border-sc-gray-200 bg-white px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-teal"
              />
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-navy">Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="w-full rounded-lg border border-sc-gray-200 bg-white px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-teal"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-navy flex items-center gap-1">
                <Clock className="size-3 text-sc-gray-400" /> Check-In (Eastern)
              </label>
              <input
                ref={ciRef}
                type="time"
                step="60"
                className="w-full rounded-lg border border-sc-gray-200 bg-white px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-teal"
              />
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-medium text-sc-navy flex items-center gap-1">
                <Clock className="size-3 text-sc-gray-400" /> Check-Out (Eastern)
              </label>
              <input
                ref={coRef}
                type="time"
                step="60"
                className="w-full rounded-lg border border-sc-gray-200 bg-white px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-teal"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-label-sm text-sc-navy cursor-pointer">
              <input type="checkbox" checked={editIsLate} onChange={(e) => setEditIsLate(e.target.checked)} className="rounded" />
              Late Arrival
            </label>
            <label className="flex items-center gap-1.5 text-label-sm text-sc-navy cursor-pointer">
              <input type="checkbox" checked={editIsEP} onChange={(e) => setEditIsEP(e.target.checked)} className="rounded" />
              Early Pickup
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-label-sm font-medium text-sc-navy">Notes</label>
            <textarea
              rows={2}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Optional notes"
              className="w-full rounded-lg border border-sc-gray-200 bg-white px-2 py-1.5 text-label-sm resize-none focus:outline-none focus:ring-1 focus:ring-sc-teal"
            />
          </div>

          <div className="space-y-1">
            <label className="text-label-sm font-medium text-sc-navy">Reason for edit</label>
            <input
              type="text"
              value={editReason}
              onChange={(e) => setEditReason(e.target.value)}
              placeholder="Why is this being changed? (optional)"
              className="w-full rounded-lg border border-sc-gray-200 bg-white px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-teal"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-sc-rose-200 bg-sc-rose-50 px-3 py-2 text-label-sm text-sc-rose-700 font-medium">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={doEdit}
              disabled={isPending}
              className="flex-1 rounded-lg bg-sc-teal px-3 py-2 text-white text-label-sm font-semibold disabled:opacity-60 hover:bg-sc-teal-700 transition-colors"
            >
              {isPending ? "Saving…" : "Save Changes"}
            </button>
            <button
              onClick={cancel}
              className="rounded-lg border border-sc-gray-200 bg-white px-3 py-2 text-sc-gray text-label-sm hover:bg-sc-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      {mode === "delete_confirm" && (
        <div className="mt-3 w-full rounded-xl border border-sc-rose-200 bg-sc-rose-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 text-sc-rose-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-label-md font-semibold text-sc-rose-700">Delete this attendance record?</p>
              <p className="text-label-sm text-sc-gray mt-1">
                This will permanently remove the attendance record for{" "}
                <span className="font-medium text-sc-navy">{fmtDate(date)}</span>.
                This action cannot be undone.
              </p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-label-sm font-medium text-sc-rose-700">
              Reason for deletion <span className="text-sc-rose-500">*</span>
            </label>
            <input
              type="text"
              value={deleteReason}
              onChange={(e) => { setDeleteReason(e.target.value); setError(null); }}
              placeholder="Why is this record being deleted?"
              className="w-full rounded-lg border border-sc-rose-200 bg-white px-2 py-1.5 text-label-sm focus:outline-none focus:ring-1 focus:ring-sc-rose"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-sc-rose-300 bg-white px-3 py-2 text-label-sm text-sc-rose-700 font-medium">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={doDelete}
              disabled={isPending}
              className="flex-1 rounded-lg bg-sc-rose px-3 py-2 text-white text-label-sm font-semibold disabled:opacity-60 hover:bg-sc-rose-700 transition-colors"
            >
              {isPending ? "Deleting…" : "Delete Attendance"}
            </button>
            <button
              onClick={cancel}
              className="rounded-lg border border-sc-gray-200 bg-white px-3 py-2 text-sc-gray text-label-sm hover:bg-sc-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ── AttendanceTab ─────────────────────────────────────────────────────────

export function AttendanceTab({ studentId, isFullAdmin = false }: Props) {
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
                    <div className="flex gap-3 text-label-sm shrink-0">
                      <span className={cn("font-medium", r.check_in_at ? "text-sc-navy" : "text-sc-gray-400")}>
                        In: {fmtTime(r.check_in_at)}
                      </span>
                      <span className={cn("font-medium", r.check_out_at ? "text-sc-navy" : "text-sc-gray-400")}>
                        Out: {fmtTime(r.check_out_at)}
                      </span>
                    </div>

                    {/* Full Admin: Edit + Delete */}
                    {isFullAdmin && (
                      <div className="ml-auto">
                        <RecordActions
                          recordId={r.id}
                          date={r.date}
                          checkInAt={r.check_in_at}
                          checkOutAt={r.check_out_at}
                          status={r.status}
                          isLate={r.is_late ?? false}
                          isEarlyPickup={r.is_early_pickup ?? false}
                          notes={r.notes ?? null}
                          onChanged={reload}
                        />
                      </div>
                    )}
                  </div>

                  {/* Expanded edit/delete panel renders inside the row */}
                  {r.notes && !isFullAdmin && (
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
