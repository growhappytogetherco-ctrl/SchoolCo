"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp, Plus, ChevronDown, ChevronUp, Pencil, Archive,
  RotateCcw, AlertTriangle, Search, CalendarDays, User, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getCheckIns,
  getProgressSummary,
  createCheckIn,
  updateCheckIn,
  archiveCheckIn,
  restoreCheckIn,
  type CheckIn,
  type CheckInPayload,
  type ProgressSummary,
} from "@/app/actions/progressHistory";
import {
  BLANK_CHECKIN_PAYLOAD,
  CHECK_IN_TYPES,
  CHECK_IN_TYPE_LABELS,
  CHECK_IN_TYPE_COLORS,
  CONFIDENCE_LEVELS,
  CONFIDENCE_LEVEL_LABELS,
  CONFIDENCE_LEVEL_COLORS,
  CHECK_IN_STATUS_LABELS,
  CHECK_IN_STATUS_COLORS,
  type CheckInType,
  type CheckInStatus,
  type ConfidenceLevel,
} from "@/lib/progress-constants";
import { SUBJECTS, SUBJECT_LABELS } from "@/lib/academics-constants";

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function blankPayload(): CheckInPayload {
  return { ...BLANK_CHECKIN_PAYLOAD, recorded_date: todayStr() };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function subjectLabel(s: string): string {
  return SUBJECT_LABELS[s as keyof typeof SUBJECT_LABELS] ?? s;
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({ summary }: { summary: ProgressSummary }) {
  return (
    <div className="rounded-2xl border border-sc-navy/10 bg-sc-navy p-5 space-y-4">
      <p className="text-label-sm font-semibold text-white/60 uppercase tracking-wider">
        Teacher Progress — This School Year
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl bg-white/10 px-3 py-3 text-center">
          <p className="text-display-2 font-serif font-bold text-white">{summary.totalCheckIns}</p>
          <p className="text-label-sm text-white/70 mt-0.5">Total Check-ins</p>
        </div>
        <div className="rounded-xl bg-white/10 px-3 py-3 text-center">
          <p className="text-display-2 font-serif font-bold text-sc-teal">{summary.totalOneSessions}</p>
          <p className="text-label-sm text-white/70 mt-0.5">1:1 Sessions</p>
        </div>
        <div className="rounded-xl bg-white/10 px-3 py-3 text-center">
          {summary.openFollowUps > 0 ? (
            <>
              <p className="text-display-2 font-serif font-bold text-sc-gold">{summary.openFollowUps}</p>
              <p className="text-label-sm text-white/70 mt-0.5">Open Follow-ups</p>
            </>
          ) : (
            <>
              <p className="text-display-2 font-serif font-bold text-white/40">0</p>
              <p className="text-label-sm text-white/50 mt-0.5">Open Follow-ups</p>
            </>
          )}
        </div>
        <div className="rounded-xl bg-white/10 px-3 py-3">
          <p className="text-label-sm text-white/60 mb-0.5">Last Check-in</p>
          <p className="text-label-sm font-semibold text-white">
            {summary.lastUpdateDate ? fmtDate(summary.lastUpdateDate) : "—"}
          </p>
          {summary.lastUpdatedBy && (
            <p className="text-label-sm text-white/60 mt-0.5 truncate">{summary.lastUpdatedBy}</p>
          )}
        </div>
        <div className="rounded-xl bg-white/10 px-3 py-3">
          <p className="text-label-sm text-white/60 mb-1">Subjects</p>
          <div className="flex flex-wrap gap-1">
            {summary.monitoredSubjects.length > 0
              ? summary.monitoredSubjects.slice(0, 4).map((s) => (
                  <span key={s} className="rounded-full bg-white/20 text-white text-label-sm px-2 py-0.5">
                    {s}
                  </span>
                ))
              : <span className="text-label-sm text-white/50">None</span>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Check-in Form ─────────────────────────────────────────────────────────────

interface FormProps {
  payload: CheckInPayload;
  onChange: (p: CheckInPayload) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveError: string | null;
}

function CheckInForm({ payload, onChange, onSave, onCancel, saving, saveError }: FormProps) {
  function set<K extends keyof CheckInPayload>(key: K, val: CheckInPayload[K]) {
    onChange({ ...payload, [key]: val });
  }

  return (
    <div className="rounded-2xl border border-sc-navy/10 bg-sc-gray-50 p-5 space-y-5">
      <p className="font-serif text-heading-3 text-sc-navy">New Check-in</p>

      {/* Row 1: Subject + Type + Date */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Subject *</label>
          <select
            value={payload.subject}
            onChange={(e) => set("subject", e.target.value)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          >
            {SUBJECTS.map((s) => (
              <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Check-in Type *</label>
          <select
            value={payload.check_in_type ?? ""}
            onChange={(e) => set("check_in_type", (e.target.value || null) as CheckInType | null)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          >
            <option value="">— Select type —</option>
            {CHECK_IN_TYPES.map((t) => (
              <option key={t} value={t}>{CHECK_IN_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Date *</label>
          <input
            type="date"
            value={payload.recorded_date}
            onChange={(e) => set("recorded_date", e.target.value)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>
      </div>

      {/* Current lesson / topic */}
      <div>
        <label className="block text-label-sm font-medium text-sc-navy mb-1">Current Lesson / Topic</label>
        <input
          type="text"
          value={payload.lesson_topic ?? ""}
          onChange={(e) => set("lesson_topic", e.target.value || null)}
          placeholder="e.g. Saxon Lesson 43, Reading fluency Unit 2"
          className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
        />
      </div>

      {/* What was worked on */}
      <div>
        <label className="block text-label-sm font-medium text-sc-navy mb-1">What Was Worked On</label>
        <textarea
          value={payload.what_was_worked_on ?? ""}
          onChange={(e) => set("what_was_worked_on", e.target.value || null)}
          rows={3}
          placeholder="e.g. Reviewed multiplication facts. Worked through fractions. Practiced decoding."
          className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 resize-none"
        />
      </div>

      {/* Student response */}
      <div>
        <label className="block text-label-sm font-medium text-sc-navy mb-1">Student Response</label>
        <textarea
          value={payload.student_response ?? ""}
          onChange={(e) => set("student_response", e.target.value || null)}
          rows={2}
          placeholder="e.g. Needed prompting. Stayed focused. Excellent participation."
          className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 resize-none"
        />
      </div>

      {/* Progress observed */}
      <div>
        <label className="block text-label-sm font-medium text-sc-navy mb-1">Progress Observed</label>
        <textarea
          value={payload.progress_observed ?? ""}
          onChange={(e) => set("progress_observed", e.target.value || null)}
          rows={2}
          placeholder="e.g. Understands regrouping now. Reading fluency improved. Still struggling with division."
          className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 resize-none"
        />
      </div>

      {/* Next instructional steps */}
      <div>
        <label className="block text-label-sm font-medium text-sc-navy mb-1">Next Instructional Steps</label>
        <textarea
          value={payload.next_steps ?? ""}
          onChange={(e) => set("next_steps", e.target.value || null)}
          rows={2}
          placeholder="e.g. Review again Friday. Move into Lesson 44. Assign extra practice."
          className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 resize-none"
        />
      </div>

      {/* Row 2: Confidence + Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Confidence Level</label>
          <select
            value={payload.confidence_level ?? ""}
            onChange={(e) => set("confidence_level", (e.target.value || null) as ConfidenceLevel | null)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          >
            <option value="">— Select —</option>
            {CONFIDENCE_LEVELS.map((c) => (
              <option key={c} value={c}>{CONFIDENCE_LEVEL_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Status</label>
          <select
            value={payload.status}
            onChange={(e) => set("status", e.target.value as CheckInStatus)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Parent follow-up */}
      <div className="rounded-xl border border-sc-gray-200 bg-white p-4 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={payload.parent_follow_up_required}
            onChange={(e) => set("parent_follow_up_required", e.target.checked)}
            className="rounded border-sc-gray-300 text-sc-teal focus:ring-sc-teal/30"
          />
          <span className="text-label-sm font-medium text-sc-navy">Parent follow-up required</span>
        </label>
        {payload.parent_follow_up_required && (
          <textarea
            value={payload.parent_follow_up_notes ?? ""}
            onChange={(e) => set("parent_follow_up_notes", e.target.value || null)}
            rows={2}
            placeholder="Notes for parent follow-up…"
            className="w-full rounded-xl border border-sc-gray-200 bg-sc-gray-50 px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 resize-none"
          />
        )}
      </div>

      {/* Optional fields: due date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Due Date <span className="text-sc-gray font-normal">(optional)</span></label>
          <input
            type="date"
            value={payload.due_date ?? ""}
            onChange={(e) => set("due_date", e.target.value || null)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>
      </div>

      {saveError && (
        <p className="text-label-sm text-sc-rose-700 font-medium">{saveError}</p>
      )}

      <div className="flex justify-end gap-3 pt-1">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl border border-sc-gray-200 bg-white px-4 py-2 text-label-sm font-medium text-sc-navy hover:bg-sc-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={saving || !payload.subject || !payload.recorded_date || !payload.check_in_type}
          className="rounded-xl bg-sc-teal px-4 py-2 text-label-sm font-semibold text-white hover:bg-sc-teal-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Check-in"}
        </button>
      </div>
    </div>
  );
}

// ── Check-in Card ─────────────────────────────────────────────────────────────

function CheckInCard({
  record,
  isAdmin,
  onEdit,
  onArchive,
  onRestore,
}: {
  record: CheckIn;
  isAdmin: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const archived = !!record.archived_at;

  const typeLabel = record.check_in_type ? CHECK_IN_TYPE_LABELS[record.check_in_type] : "Check-in";
  const typeColor = record.check_in_type ? CHECK_IN_TYPE_COLORS[record.check_in_type] : "bg-sc-gray-100 text-sc-gray-600 border-sc-gray-200";
  const statusColor = record.status ? CHECK_IN_STATUS_COLORS[record.status] : "bg-sc-gray-100 text-sc-gray-600 border-sc-gray-200";
  const statusLabel = record.status ? CHECK_IN_STATUS_LABELS[record.status] : "Open";

  const preview = record.what_was_worked_on ?? record.progress_observed ?? record.lesson_topic ?? "";

  return (
    <div className={cn(
      "rounded-2xl border bg-white shadow-card overflow-hidden",
      archived ? "opacity-60 border-sc-gray-200" : "border-sc-gray-100"
    )}>
      {/* Header */}
      <button
        className="w-full flex items-start justify-between px-4 py-3.5 text-left gap-3"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Date + subject */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-label-sm text-sc-gray flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {fmtDate(record.recorded_date)}
            </span>
            <span className="font-semibold text-label-sm text-sc-navy">
              {subjectLabel(record.subject)}
            </span>
            {record.lesson_topic && (
              <span className="text-label-sm text-sc-gray truncate max-w-[180px]">
                — {record.lesson_topic}
              </span>
            )}
          </div>
          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            <span className={cn("rounded-full px-2 py-0.5 text-label-sm font-medium border", typeColor)}>
              {typeLabel}
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-label-sm font-medium border", statusColor)}>
              {statusLabel}
            </span>
            {record.confidence_level && (
              <span className={cn("rounded-full px-2 py-0.5 text-label-sm font-medium border", CONFIDENCE_LEVEL_COLORS[record.confidence_level])}>
                {CONFIDENCE_LEVEL_LABELS[record.confidence_level]}
              </span>
            )}
            {record.parent_follow_up_required && record.status !== "completed" && (
              <span className="rounded-full bg-sc-gold-50 text-sc-gold-700 border border-sc-gold-200 px-2 py-0.5 text-label-sm font-medium flex items-center gap-1">
                <AlertTriangle className="size-3" /> Follow-up needed
              </span>
            )}
          </div>
          {/* Staff + preview */}
          {record.staff_name && (
            <p className="text-label-sm text-sc-gray flex items-center gap-1">
              <User className="size-3.5" /> {record.staff_name}
            </p>
          )}
          {!expanded && preview && (
            <p className="text-label-sm text-sc-gray line-clamp-2">{preview}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {!archived && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="rounded-lg p-1.5 text-sc-gray hover:text-sc-teal hover:bg-sc-teal/10"
              title="Edit"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {isAdmin && !archived && (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(); }}
              className="rounded-lg p-1.5 text-sc-gray hover:text-sc-rose hover:bg-sc-rose/10"
              title="Archive"
            >
              <Archive className="size-3.5" />
            </button>
          )}
          {isAdmin && archived && (
            <button
              onClick={(e) => { e.stopPropagation(); onRestore(); }}
              className="rounded-lg p-1.5 text-sc-gray hover:text-sc-teal hover:bg-sc-teal/10"
              title="Restore"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
          {expanded
            ? <ChevronUp className="size-4 text-sc-gray shrink-0" />
            : <ChevronDown className="size-4 text-sc-gray shrink-0" />
          }
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-sc-gray-100 pt-3 space-y-3">
          {record.what_was_worked_on && (
            <div>
              <p className="text-label-sm font-semibold text-sc-gray mb-0.5">What Was Worked On</p>
              <p className="text-label-sm text-sc-navy whitespace-pre-line">{record.what_was_worked_on}</p>
            </div>
          )}
          {record.student_response && (
            <div>
              <p className="text-label-sm font-semibold text-sc-gray mb-0.5">Student Response</p>
              <p className="text-label-sm text-sc-navy whitespace-pre-line">{record.student_response}</p>
            </div>
          )}
          {record.progress_observed && (
            <div>
              <p className="text-label-sm font-semibold text-sc-gray mb-0.5">Progress Observed</p>
              <p className="text-label-sm text-sc-navy whitespace-pre-line">{record.progress_observed}</p>
            </div>
          )}
          {record.next_steps && (
            <div>
              <p className="text-label-sm font-semibold text-sc-gray mb-0.5">Next Instructional Steps</p>
              <p className="text-label-sm text-sc-navy whitespace-pre-line">{record.next_steps}</p>
            </div>
          )}
          {record.parent_follow_up_required && (
            <div className="rounded-xl border border-sc-gold-200 bg-sc-gold-50 px-3 py-2.5">
              <p className="text-label-sm font-semibold text-sc-gold-700 mb-0.5 flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" /> Parent Follow-up Required
              </p>
              {record.parent_follow_up_notes && (
                <p className="text-label-sm text-sc-gold-700">{record.parent_follow_up_notes}</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-label-sm text-sc-gray pt-1 border-t border-sc-gray-100">
            {record.due_date && (
              <span>Due: <span className="text-sc-navy font-medium">{fmtDate(record.due_date)}</span></span>
            )}
            {record.assigned_staff_name && (
              <span>Assigned to: <span className="text-sc-navy font-medium">{record.assigned_staff_name}</span></span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Filters Bar ───────────────────────────────────────────────────────────────

interface FiltersState {
  search: string;
  subject: string;
  checkInType: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  showArchived: boolean;
}

function FiltersBar({
  filters,
  onChange,
  isAdmin,
}: {
  filters: FiltersState;
  onChange: (f: FiltersState) => void;
  isAdmin: boolean;
}) {
  function set<K extends keyof FiltersState>(key: K, val: FiltersState[K]) {
    onChange({ ...filters, [key]: val });
  }
  const hasActive = filters.subject || filters.checkInType || filters.status || filters.dateFrom || filters.dateTo;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search check-ins…"
            className="w-full rounded-xl border border-sc-gray-200 bg-white pl-9 pr-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>

        {/* Subject */}
        <select
          value={filters.subject}
          onChange={(e) => set("subject", e.target.value)}
          className="rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
        >
          <option value="">All subjects</option>
          {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
        </select>

        {/* Type */}
        <select
          value={filters.checkInType}
          onChange={(e) => set("checkInType", e.target.value)}
          className="rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
        >
          <option value="">All types</option>
          {CHECK_IN_TYPES.map((t) => <option key={t} value={t}>{CHECK_IN_TYPE_LABELS[t]}</option>)}
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) => set("status", e.target.value)}
          className="rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Date range + show archived */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5">
          <label className="text-label-sm text-sc-gray shrink-0">From</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => set("dateFrom", e.target.value)}
            className="rounded-xl border border-sc-gray-200 bg-white px-3 py-1.5 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-label-sm text-sc-gray shrink-0">To</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => set("dateTo", e.target.value)}
            className="rounded-xl border border-sc-gray-200 bg-white px-3 py-1.5 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy cursor-pointer">
            <input
              type="checkbox"
              checked={filters.showArchived}
              onChange={(e) => set("showArchived", e.target.checked)}
              className="rounded border-sc-gray-300 text-sc-teal"
            />
            Show archived
          </label>
        )}
        {hasActive && (
          <button
            onClick={() => onChange({ search: "", subject: "", checkInType: "", status: "", dateFrom: "", dateTo: "", showArchived: filters.showArchived })}
            className="flex items-center gap-1 text-label-sm text-sc-teal hover:text-sc-teal-700 font-medium"
          >
            <X className="size-3.5" /> Clear filters
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface Props {
  studentId: string;
  isAdmin: boolean;
}

export function ProgressTab({ studentId, isAdmin }: Props) {
  const [records, setRecords]       = useState<CheckIn[]>([]);
  const [summary, setSummary]       = useState<ProgressSummary | null>(null);
  const [loading, setLoading]       = useState(true);
  const [fetchError, setFetchError] = useState<string | false>(false);

  const [showForm, setShowForm]         = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [formPayload, setFormPayload]   = useState<CheckInPayload>(blankPayload());
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState<string | null>(null);

  const [filters, setFilters] = useState<FiltersState>({
    search: "", subject: "", checkInType: "", status: "",
    dateFrom: "", dateTo: "", showArchived: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const [recs, sum] = await Promise.all([
        getCheckIns(studentId, { includeArchived: filters.showArchived }),
        getProgressSummary(studentId),
      ]);
      setRecords(recs);
      setSummary(sum);
    } catch {
      setFetchError("Failed to load progress check-ins.");
    } finally {
      setLoading(false);
    }
  }, [studentId, filters.showArchived]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setFormPayload(blankPayload());
    setSaveError(null);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(record: CheckIn) {
    setFormPayload({
      subject:                   record.subject,
      check_in_type:             record.check_in_type,
      recorded_date:             record.recorded_date,
      lesson_topic:              record.lesson_topic,
      what_was_worked_on:        record.what_was_worked_on,
      student_response:          record.student_response,
      progress_observed:         record.progress_observed,
      next_steps:                record.next_steps,
      confidence_level:          record.confidence_level,
      parent_follow_up_required: record.parent_follow_up_required,
      parent_follow_up_notes:    record.parent_follow_up_notes,
      curriculum_enrollment_id:  record.curriculum_enrollment_id,
      growth_goal_id:            record.growth_goal_id,
      assessment_id:             record.assessment_id,
      assigned_staff_id:         record.assigned_staff_id,
      due_date:                  record.due_date,
      status:                    record.status,
    });
    setSaveError(null);
    setEditingId(record.id);
    setShowForm(false);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setSaveError(null);
  }

  async function handleSave() {
    if (!formPayload.subject || !formPayload.recorded_date || !formPayload.check_in_type) return;
    setSaving(true);
    setSaveError(null);

    const result = editingId
      ? await updateCheckIn(editingId, formPayload)
      : await createCheckIn(studentId, formPayload);

    if ("error" in result) {
      setSaveError(result.error);
      setSaving(false);
      return;
    }
    setSaving(false);
    setShowForm(false);
    setEditingId(null);
    load();
  }

  async function handleArchive(id: string) {
    await archiveCheckIn(id);
    load();
  }

  async function handleRestore(id: string) {
    await restoreCheckIn(id);
    load();
  }

  // Client-side filter (search + subject/type/status/dates already handled by server action on re-load,
  // but for instant filtering without re-fetching we filter client-side too)
  const filtered = records.filter((r) => {
    if (filters.subject && r.subject !== filters.subject) return false;
    if (filters.checkInType && r.check_in_type !== filters.checkInType) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.dateFrom && r.recorded_date < filters.dateFrom) return false;
    if (filters.dateTo && r.recorded_date > filters.dateTo) return false;
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      return (
        (r.what_was_worked_on ?? "").toLowerCase().includes(q) ||
        (r.lesson_topic ?? "").toLowerCase().includes(q) ||
        (r.progress_observed ?? "").toLowerCase().includes(q) ||
        (r.student_response ?? "").toLowerCase().includes(q) ||
        (r.next_steps ?? "").toLowerCase().includes(q) ||
        subjectLabel(r.subject).toLowerCase().includes(q) ||
        (r.staff_name ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-sc-teal border-t-transparent animate-spin" />
        <p className="text-label-sm text-sc-gray">Loading teacher progress…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-2xl border border-sc-rose-200 bg-sc-rose-50 p-6 text-center">
        <p className="text-sc-rose-700 font-medium">{fetchError}</p>
        <button onClick={load} className="mt-3 text-label-sm text-sc-teal font-medium hover:underline">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-heading-2 text-sc-navy flex items-center gap-2">
            <TrendingUp className="size-5 text-sc-teal" /> Teacher Progress
          </h2>
          <p className="text-label-sm text-sc-gray mt-0.5">
            Ongoing teacher observations and instructional check-ins
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm font-semibold text-white hover:bg-sc-teal-700"
        >
          <Plus className="size-4" /> New Check-in
        </button>
      </div>

      {/* ── Summary card ──────────────────────────────────────────── */}
      {summary && <SummaryCard summary={summary} />}

      {/* ── Add form ──────────────────────────────────────────────── */}
      {showForm && (
        <CheckInForm
          payload={formPayload}
          onChange={setFormPayload}
          onSave={handleSave}
          onCancel={cancelForm}
          saving={saving}
          saveError={saveError}
        />
      )}

      {/* ── Filters ───────────────────────────────────────────────── */}
      <FiltersBar filters={filters} onChange={setFilters} isAdmin={isAdmin} />

      {/* ── Timeline ──────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-sc-gray-100 bg-white p-10 text-center">
          <TrendingUp className="size-10 text-sc-gray-300 mx-auto mb-3" />
          {records.length === 0 ? (
            <>
              <p className="font-serif text-heading-3 text-sc-navy mb-1">No check-ins yet</p>
              <p className="text-label-sm text-sc-gray mb-4">
                Use this log to document teacher observations, 1:1 sessions, and instructional notes.
              </p>
              <button
                onClick={openAdd}
                className="rounded-xl bg-sc-teal px-4 py-2 text-label-sm font-semibold text-white hover:bg-sc-teal-700"
              >
                Add First Check-in
              </button>
            </>
          ) : (
            <>
              <p className="font-serif text-heading-3 text-sc-navy mb-1">No results</p>
              <p className="text-label-sm text-sc-gray">Try adjusting your filters.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-label-sm text-sc-gray">
            {filtered.length} check-in{filtered.length !== 1 ? "s" : ""}
            {filtered.length < records.length ? ` (filtered from ${records.length})` : ""}
          </p>
          {filtered.map((record) =>
            editingId === record.id ? (
              <div key={record.id}>
                <CheckInForm
                  payload={formPayload}
                  onChange={setFormPayload}
                  onSave={handleSave}
                  onCancel={cancelForm}
                  saving={saving}
                  saveError={saveError}
                />
              </div>
            ) : (
              <CheckInCard
                key={record.id}
                record={record}
                isAdmin={isAdmin}
                onEdit={() => openEdit(record)}
                onArchive={() => handleArchive(record.id)}
                onRestore={() => handleRestore(record.id)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
