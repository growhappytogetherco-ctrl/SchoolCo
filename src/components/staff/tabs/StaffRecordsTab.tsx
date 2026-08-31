"use client";

import { useEffect, useState, useTransition } from "react";
import { FileText, Plus, ChevronDown, ChevronUp, Pencil, Archive, CheckCircle, RefreshCw, AlertTriangle } from "lucide-react";
import {
  getStaffPersonnelRecords, createStaffPersonnelRecord,
  updateStaffPersonnelRecord, archiveStaffPersonnelRecord,
  RECORD_TYPE_LABELS, RECORD_TYPE_COLOR,
  type StaffPersonnelRecord, type PersonnelRecordType,
  type PersonnelRecordStatus, type PersonnelRecordPayload,
} from "@/app/actions/staffPersonnelRecords";
import { cn } from "@/lib/utils";

interface Props {
  staffRosterId: string;
  isFullAdmin:   boolean;
}

const RECORD_TYPES = Object.entries(RECORD_TYPE_LABELS) as [PersonnelRecordType, string][];

const STATUS_LABELS: Record<PersonnelRecordStatus, string> = {
  open:               "Open",
  resolved:           "Resolved",
  no_further_action:  "No Further Action",
};

const inputCls    = "w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white";
const textareaCls = `${inputCls} resize-none`;

function fmtDate(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

// ── Record form (create + edit) ───────────────────────────────────────────

interface RecordFormProps {
  staffRosterId: string;
  existing?:     StaffPersonnelRecord;
  onDone:        () => void;
  onCancel:      () => void;
}

function RecordForm({ staffRosterId, existing, onDone, onCancel }: RecordFormProps) {
  const today = new Date().toISOString().split("T")[0];
  const [isPending, start] = useTransition();
  const [error, setError]  = useState<string | null>(null);

  const [recordType,        setRecordType]        = useState<PersonnelRecordType>(existing?.record_type ?? "documented_conversation");
  const [title,             setTitle]             = useState(existing?.title ?? "");
  const [notes,             setNotes]             = useState(existing?.notes ?? "");
  const [date,              setDate]              = useState(existing?.date ?? today);
  const [relatedPolicy,     setRelatedPolicy]     = useState(existing?.related_policy ?? "");
  const [actionTaken,       setActionTaken]       = useState(existing?.action_taken ?? "");
  const [privateNotes,      setPrivateNotes]      = useState(existing?.private_admin_notes ?? "");
  const [followUpRequired,  setFollowUpRequired]  = useState(existing?.follow_up_required ?? false);
  const [followUpDate,      setFollowUpDate]      = useState(existing?.follow_up_date ?? "");
  const [followUpStatus,    setFollowUpStatus]    = useState(existing?.follow_up_status ?? "pending");
  const [status,            setStatus]            = useState<PersonnelRecordStatus>(existing?.status ?? "open");

  function handleSave() {
    setError(null);
    if (!title.trim()) { setError("Title is required."); return; }
    if (!notes.trim()) { setError("Notes are required."); return; }
    if (!date)         { setError("Date is required."); return; }

    const payload: PersonnelRecordPayload = {
      record_type:          recordType,
      title:                title.trim(),
      notes:                notes.trim(),
      date,
      related_policy:       relatedPolicy.trim() || null,
      action_taken:         actionTaken.trim()   || null,
      private_admin_notes:  privateNotes.trim()  || null,
      follow_up_required:   followUpRequired,
      follow_up_date:       followUpRequired ? (followUpDate || null) : null,
      status,
    };

    start(async () => {
      let res;
      if (existing) {
        res = await updateStaffPersonnelRecord(existing.id, staffRosterId, {
          ...payload, follow_up_status: followUpStatus,
        });
      } else {
        res = await createStaffPersonnelRecord(staffRosterId, payload);
      }
      if (!res.success) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div className="rounded-2xl border border-sc-navy/20 bg-white p-6 shadow-card space-y-5">
      <h3 className="font-serif text-heading-3 text-sc-navy">
        {existing ? "Edit Personnel Record" : "New Personnel Record"}
      </h3>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-label-sm font-medium text-sc-navy block mb-1">Record Type <span className="text-sc-rose">*</span></label>
          <select value={recordType} onChange={(e) => setRecordType(e.target.value as PersonnelRecordType)} className={inputCls}>
            {RECORD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-label-sm font-medium text-sc-navy block mb-1">Date <span className="text-sc-rose">*</span></label>
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className="text-label-sm font-medium text-sc-navy block mb-1">Title / Subject <span className="text-sc-rose">*</span></label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief summary of this record…" className={inputCls} />
      </div>

      <div>
        <label className="text-label-sm font-medium text-sc-navy block mb-1">Detailed Notes <span className="text-sc-rose">*</span></label>
        <textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Document the conversation, event, or observation in detail…" className={textareaCls} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-label-sm font-medium text-sc-navy block mb-1">Related Policy (optional)</label>
          <input type="text" value={relatedPolicy} onChange={(e) => setRelatedPolicy(e.target.value)}
            placeholder="Policy name or handbook section…" className={inputCls} />
        </div>
        <div>
          <label className="text-label-sm font-medium text-sc-navy block mb-1">Action Taken (optional)</label>
          <input type="text" value={actionTaken} onChange={(e) => setActionTaken(e.target.value)}
            placeholder="Steps taken or consequences…" className={inputCls} />
        </div>
      </div>

      <div>
        <label className="text-label-sm font-medium text-sc-navy block mb-1">Private Admin Notes (optional)</label>
        <textarea rows={2} value={privateNotes} onChange={(e) => setPrivateNotes(e.target.value)}
          placeholder="Sensitive notes visible only to Full Admin…" className={textareaCls} />
      </div>

      {/* Follow-up */}
      <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 p-4 space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={followUpRequired}
            onChange={(e) => setFollowUpRequired(e.target.checked)}
            className="h-4 w-4 rounded border-sc-gray-300 text-sc-teal" />
          <span className="text-label-md font-medium text-sc-navy">Follow-Up Required</span>
        </label>
        {followUpRequired && (
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-label-sm font-medium text-sc-navy block mb-1">Follow-Up Date</label>
              <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className={inputCls} />
            </div>
            {existing && (
              <div>
                <label className="text-label-sm font-medium text-sc-navy block mb-1">Follow-Up Status</label>
                <select value={followUpStatus} onChange={(e) => setFollowUpStatus(e.target.value as "pending" | "completed")} className={inputCls}>
                  <option value="pending">Pending</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="text-label-sm font-medium text-sc-navy block mb-1">Record Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as PersonnelRecordStatus)} className={inputCls}>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="no_further_action">No Further Action</option>
        </select>
      </div>

      {error && <p className="text-label-sm text-sc-rose">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={isPending}
          className="flex items-center gap-1.5 rounded-xl bg-sc-navy px-5 py-2.5 text-white text-label-md font-semibold hover:bg-sc-navy/90 transition-colors disabled:opacity-50">
          {isPending ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
          {isPending ? "Saving…" : "Save Record"}
        </button>
        <button onClick={onCancel}
          className="rounded-xl border border-sc-gray-200 px-5 py-2.5 text-label-md text-sc-gray hover:bg-sc-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Record card ───────────────────────────────────────────────────────────

function RecordCard({
  record, isFullAdmin, onEdit, onArchive,
}: {
  record:      StaffPersonnelRecord;
  isFullAdmin: boolean;
  onEdit:      (r: StaffPersonnelRecord) => void;
  onArchive:   (r: StaffPersonnelRecord) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const typeCls   = RECORD_TYPE_COLOR[record.record_type] ?? "bg-sc-gray-100 text-sc-gray border-sc-gray-200";
  const today     = new Date().toISOString().split("T")[0];
  const isOverdue = record.follow_up_required
    && record.follow_up_status === "pending"
    && record.follow_up_date
    && record.follow_up_date < today;

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      {/* Card header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-sc-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", typeCls)}>
              {RECORD_TYPE_LABELS[record.record_type]}
            </span>
            <span className="text-label-sm text-sc-gray-400">{fmtDate(record.date)}</span>
            {record.status !== "open" && (
              <span className="rounded-full bg-sc-gray-100 px-2 py-0.5 text-[11px] font-semibold text-sc-gray">
                {STATUS_LABELS[record.status]}
              </span>
            )}
            {isOverdue && (
              <span className="flex items-center gap-1 rounded-full bg-sc-rose-50 border border-sc-rose-200 px-2 py-0.5 text-[11px] font-semibold text-sc-rose-700">
                <AlertTriangle className="size-3" /> Follow-Up Overdue
              </span>
            )}
            {record.follow_up_required && record.follow_up_status === "pending" && !isOverdue && (
              <span className="rounded-full bg-sc-gold-50 border border-sc-gold-300 px-2 py-0.5 text-[11px] font-semibold text-sc-gold-700">
                Follow-Up {record.follow_up_date ? fmtDate(record.follow_up_date) : "Scheduled"}
              </span>
            )}
          </div>
          <p className="text-label-md font-semibold text-sc-navy truncate">{record.title}</p>
          {!expanded && (
            <p className="text-label-sm text-sc-gray mt-0.5 line-clamp-1">{record.notes}</p>
          )}
        </div>
        {expanded ? <ChevronUp className="size-4 text-sc-gray shrink-0 mt-0.5" /> : <ChevronDown className="size-4 text-sc-gray shrink-0 mt-0.5" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-sc-gray-100 pt-4">
          <div>
            <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-wide mb-1">Notes</p>
            <p className="text-body-md text-sc-navy whitespace-pre-wrap">{record.notes}</p>
          </div>

          {record.related_policy && (
            <div>
              <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-wide mb-1">Related Policy</p>
              <p className="text-label-md text-sc-navy">{record.related_policy}</p>
            </div>
          )}

          {record.action_taken && (
            <div>
              <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-wide mb-1">Action Taken</p>
              <p className="text-label-md text-sc-navy">{record.action_taken}</p>
            </div>
          )}

          {record.private_admin_notes && isFullAdmin && (
            <div className="rounded-xl border border-sc-gold-200 bg-sc-gold-50 px-4 py-3">
              <p className="text-label-sm font-semibold text-sc-gold-700 uppercase tracking-wide mb-1">Private Admin Notes</p>
              <p className="text-label-md text-sc-gold-800 whitespace-pre-wrap">{record.private_admin_notes}</p>
            </div>
          )}

          {record.follow_up_required && (
            <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 px-4 py-3">
              <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-wide mb-1">Follow-Up</p>
              <p className="text-label-md text-sc-navy">
                {record.follow_up_date ? fmtDate(record.follow_up_date) : "Date TBD"} ·{" "}
                <span className={record.follow_up_status === "completed" ? "text-sc-teal-700 font-medium" : "text-sc-gold-700 font-medium"}>
                  {record.follow_up_status === "completed" ? "Completed" : "Pending"}
                </span>
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-label-sm text-sc-gray-400">
              Recorded by {record.created_by_name} · {new Date(record.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {record.updated_by && record.updated_at !== record.created_at && (
                <span className="ml-2">· Edited {new Date(record.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              )}
            </p>
            {isFullAdmin && (
              <div className="flex items-center gap-2">
                <button onClick={() => onEdit(record)}
                  className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-navy hover:bg-sc-gray-50 transition-colors">
                  <Pencil className="size-3.5" /> Edit
                </button>
                <button onClick={() => onArchive(record)}
                  className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-gray hover:text-sc-rose hover:border-sc-rose-200 hover:bg-sc-rose-50 transition-colors">
                  <Archive className="size-3.5" /> Archive
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function StaffRecordsTab({ staffRosterId, isFullAdmin }: Props) {
  const [records, setRecords]   = useState<StaffPersonnelRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<StaffPersonnelRecord | null>(null);
  const [archiving, setArchiving] = useState<StaffPersonnelRecord | null>(null);
  const [archiveIsPending, startArchive] = useTransition();
  const [archiveError, setArchiveError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await getStaffPersonnelRecords(staffRosterId);
    setRecords(r);
    setLoading(false);
  }

  useEffect(() => { load(); }, [staffRosterId]);

  function handleDone() {
    setShowForm(false);
    setEditing(null);
    setArchiving(null);
    load();
  }

  function handleArchiveConfirm(record: StaffPersonnelRecord) {
    setArchiveError(null);
    startArchive(async () => {
      const res = await archiveStaffPersonnelRecord(record.id, staffRosterId);
      if (!res.success) { setArchiveError(res.error); return; }
      handleDone();
    });
  }

  if (!isFullAdmin) {
    return (
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-8 text-center">
        <FileText className="size-10 text-sc-gray-200 mx-auto mb-3" />
        <p className="text-label-md font-semibold text-sc-navy">Access Restricted</p>
        <p className="text-label-sm text-sc-gray mt-1">Personnel records are visible to Full Admin only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
          <FileText className="size-5 text-sc-navy" />
          Personnel Records
        </h2>
        {!showForm && !editing && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-xl bg-sc-navy px-4 py-2 text-white text-label-sm font-semibold hover:bg-sc-navy/90 transition-colors">
            <Plus className="size-4" /> Add Record
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && (
        <RecordForm staffRosterId={staffRosterId} onDone={handleDone} onCancel={() => setShowForm(false)} />
      )}

      {/* Archive confirm */}
      {archiving && (
        <div className="rounded-2xl border border-sc-rose-200 bg-sc-rose-50 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-label-md font-semibold text-sc-rose-800">Archive this record?</p>
            <p className="text-label-sm text-sc-rose-700 mt-0.5">
              "{archiving.title}" will be archived and hidden from the active list. It is not deleted.
            </p>
            {archiveError && <p className="text-label-sm text-sc-rose mt-1">{archiveError}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => handleArchiveConfirm(archiving)} disabled={archiveIsPending}
              className="rounded-xl bg-sc-rose px-3 py-1.5 text-white text-label-sm font-semibold hover:bg-sc-rose-700 disabled:opacity-50">
              {archiveIsPending ? "Archiving…" : "Archive"}
            </button>
            <button onClick={() => { setArchiving(null); setArchiveError(null); }}
              className="rounded-xl border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-gray hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Editing form */}
      {editing && (
        <RecordForm staffRosterId={staffRosterId} existing={editing}
          onDone={handleDone} onCancel={() => setEditing(null)} />
      )}

      {/* Record list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white h-20 animate-pulse" />)}
        </div>
      ) : records.length === 0 && !showForm ? (
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-8 text-center">
          <FileText className="size-10 text-sc-gray-200 mx-auto mb-2" />
          <p className="text-label-md text-sc-gray">No personnel records yet.</p>
          <p className="text-label-sm text-sc-gray-400 mt-1">Use the button above to document a conversation, coaching session, or commendation.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records
            .filter((r) => !editing || r.id !== editing.id)
            .filter((r) => !archiving || r.id !== archiving.id)
            .map((record) => (
              <RecordCard
                key={record.id}
                record={record}
                isFullAdmin={isFullAdmin}
                onEdit={(r) => { setEditing(r); setShowForm(false); setArchiving(null); }}
                onArchive={(r) => { setArchiving(r); setEditing(null); setShowForm(false); }}
              />
            ))}
        </div>
      )}
    </div>
  );
}
