"use client";

import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Minus, Plus, ChevronDown, ChevronUp,
  Pencil, Archive, RotateCcw, AlertTriangle, CheckCircle, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getProgressRecords,
  getStudentGrowthSummary,
  createProgressRecord,
  updateProgressRecord,
  archiveProgressRecord,
  restoreProgressRecord,
  type ProgressRecord,
  type ProgressPayload,
  type SubjectGrowthEntry,
} from "@/app/actions/progressHistory";
import {
  BLANK_PROGRESS_PAYLOAD,
  CONFIDENCE_LEVEL_LABELS,
  CONFIDENCE_LEVEL_COLORS,
  type ConfidenceLevel,
} from "@/lib/progress-constants";
import { SUBJECTS, SUBJECT_LABELS } from "@/lib/academics-constants";

// ── Helpers ────────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function blankPayload(): ProgressPayload {
  return { ...BLANK_PROGRESS_PAYLOAD, recorded_date: today() };
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function GrowthSummaryCard({ entry, onView }: { entry: SubjectGrowthEntry; onView: () => void }) {
  const deltaColor =
    entry.masteryDelta == null ? "text-sc-gray"
    : entry.masteryDelta > 0  ? "text-sc-teal-700"
    : entry.masteryDelta < 0  ? "text-sc-rose-700"
    : "text-sc-gray";

  const DeltaIcon =
    entry.masteryDelta == null ? Minus
    : entry.masteryDelta > 0  ? TrendingUp
    : entry.masteryDelta < 0  ? TrendingDown
    : Minus;

  return (
    <div className={cn(
      "rounded-2xl border p-4 bg-white shadow-card",
      entry.isStale ? "border-sc-rose-200" : "border-sc-gray-100"
    )}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-label-sm font-semibold text-sc-navy">{entry.subjectLabel}</p>
          <p className="text-label-sm text-sc-gray">{entry.recordCount} check-in{entry.recordCount !== 1 ? "s" : ""}</p>
        </div>
        {entry.isStale && (
          <span className="flex items-center gap-1 text-label-sm text-sc-rose-700 font-medium">
            <AlertTriangle className="size-3.5" /> Stale
          </span>
        )}
      </div>

      {/* Mastery */}
      {entry.latestMastery != null && (
        <div className="flex items-center gap-2 mb-2">
          <div className="h-1.5 flex-1 bg-sc-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-sc-teal rounded-full"
              style={{ width: `${Math.min(entry.latestMastery, 100)}%` }}
            />
          </div>
          <span className="text-label-sm font-semibold text-sc-navy w-10 text-right">
            {entry.latestMastery}%
          </span>
          <span className={cn("flex items-center gap-0.5 text-label-sm font-medium", deltaColor)}>
            <DeltaIcon className="size-3.5" />
            {entry.masteryDelta != null && entry.masteryDelta !== 0
              ? `${entry.masteryDelta > 0 ? "+" : ""}${entry.masteryDelta}%`
              : null}
          </span>
        </div>
      )}

      {/* Level + confidence */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {entry.latestLevel && (
          <span className="rounded-full bg-sc-navy/5 text-sc-navy px-2 py-0.5 text-label-sm font-medium">
            {entry.latestLevel}
          </span>
        )}
        {entry.latestConfidence && (
          <span className={cn(
            "rounded-full px-2 py-0.5 text-label-sm font-medium border",
            CONFIDENCE_LEVEL_COLORS[entry.latestConfidence]
          )}>
            {CONFIDENCE_LEVEL_LABELS[entry.latestConfidence]}
          </span>
        )}
      </div>

      {entry.latestDate && (
        <p className="text-label-sm text-sc-gray mb-3">
          Updated {fmtDate(entry.latestDate)}
          {entry.daysSinceUpdate != null && entry.daysSinceUpdate > 0
            ? ` (${entry.daysSinceUpdate}d ago)`
            : ""}
        </p>
      )}

      <button
        onClick={onView}
        className="text-label-sm text-sc-teal font-medium hover:text-sc-teal-700"
      >
        View history →
      </button>
    </div>
  );
}

interface ProgressFormProps {
  payload: ProgressPayload;
  onChange: (p: ProgressPayload) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveError: string | null;
}

function ProgressForm({ payload, onChange, onSave, onCancel, saving, saveError }: ProgressFormProps) {
  function set<K extends keyof ProgressPayload>(key: K, val: ProgressPayload[K]) {
    onChange({ ...payload, [key]: val });
  }

  function numOrNull(s: string): number | null {
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  return (
    <div className="rounded-2xl border border-sc-navy/10 bg-sc-gray-50 p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Subject */}
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

        {/* Date */}
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Date *</label>
          <input
            type="date"
            value={payload.recorded_date}
            onChange={(e) => set("recorded_date", e.target.value)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>

        {/* Curriculum name */}
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Curriculum / Program</label>
          <input
            type="text"
            value={payload.curriculum_name ?? ""}
            onChange={(e) => set("curriculum_name", e.target.value || null)}
            placeholder="e.g. Saxon Math 5/4"
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>

        {/* Level */}
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Current Level</label>
          <input
            type="text"
            value={payload.current_level ?? ""}
            onChange={(e) => set("current_level", e.target.value || null)}
            placeholder="e.g. Grade 4, Level B"
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>

        {/* Lesson */}
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Lesson / Unit</label>
          <input
            type="text"
            value={payload.current_lesson ?? ""}
            onChange={(e) => set("current_lesson", e.target.value || null)}
            placeholder="e.g. Lesson 45"
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>

        {/* Unit */}
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Current Unit / Chapter</label>
          <input
            type="text"
            value={payload.current_unit ?? ""}
            onChange={(e) => set("current_unit", e.target.value || null)}
            placeholder="e.g. Chapter 7: Fractions"
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>

        {/* Skill / Topic */}
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Skill / Topic Focus</label>
          <input
            type="text"
            value={payload.skill_or_topic ?? ""}
            onChange={(e) => set("skill_or_topic", e.target.value || null)}
            placeholder="e.g. Long division"
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>

        {/* Mastery % */}
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Mastery %</label>
          <input
            type="number"
            min={0}
            max={100}
            value={payload.mastery_pct ?? ""}
            onChange={(e) => set("mastery_pct", numOrNull(e.target.value))}
            placeholder="0–100"
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          />
        </div>

        {/* Confidence */}
        <div>
          <label className="block text-label-sm font-medium text-sc-navy mb-1">Student Confidence</label>
          <select
            value={payload.confidence_level ?? ""}
            onChange={(e) => set("confidence_level", (e.target.value || null) as ConfidenceLevel | null)}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          >
            <option value="">— Select —</option>
            <option value="not_confident">Not Confident</option>
            <option value="developing">Building Confidence</option>
            <option value="confident">Confident</option>
            <option value="very_confident">Very Confident</option>
          </select>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-label-sm font-medium text-sc-navy mb-1">Staff Notes</label>
        <textarea
          value={payload.notes ?? ""}
          onChange={(e) => set("notes", e.target.value || null)}
          rows={3}
          placeholder="What happened in today's session? What did the student demonstrate?"
          className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 resize-none"
        />
      </div>

      {/* Next steps */}
      <div>
        <label className="block text-label-sm font-medium text-sc-navy mb-1">Next Steps</label>
        <textarea
          value={payload.next_steps ?? ""}
          onChange={(e) => set("next_steps", e.target.value || null)}
          rows={2}
          placeholder="What will the student work on next?"
          className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 resize-none"
        />
      </div>

      {/* Parent visible */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={payload.parent_visible}
          onChange={(e) => set("parent_visible", e.target.checked)}
          className="rounded border-sc-gray-300 text-sc-teal focus:ring-sc-teal/30"
        />
        <span className="text-label-sm text-sc-navy">Visible to family in parent portal</span>
      </label>

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
          disabled={saving || !payload.subject || !payload.recorded_date}
          className="rounded-xl bg-sc-teal px-4 py-2 text-label-sm font-semibold text-white hover:bg-sc-teal-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Check-in"}
        </button>
      </div>
    </div>
  );
}

function RecordCard({
  record,
  isAdmin,
  onEdit,
  onArchive,
  onRestore,
}: {
  record: ProgressRecord;
  isAdmin: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const archived = !!record.archived_at;

  return (
    <div className={cn(
      "rounded-2xl border bg-white shadow-card overflow-hidden",
      archived ? "opacity-60 border-sc-gray-200" : "border-sc-gray-100"
    )}>
      {/* Header row */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0">
            <p className="text-label-sm font-semibold text-sc-navy capitalize">{SUBJECT_LABELS[record.subject as keyof typeof SUBJECT_LABELS] ?? record.subject}</p>
            <p className="text-label-sm text-sc-gray">{fmtDate(record.recorded_date)}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 min-w-0">
            {record.confidence_level && (
              <span className={cn(
                "rounded-full px-2 py-0.5 text-label-sm font-medium border",
                CONFIDENCE_LEVEL_COLORS[record.confidence_level]
              )}>
                {CONFIDENCE_LEVEL_LABELS[record.confidence_level]}
              </span>
            )}
            {record.mastery_pct != null && (
              <span className="rounded-full bg-sc-teal/10 text-sc-teal-700 border border-sc-teal-200 px-2 py-0.5 text-label-sm font-medium">
                {record.mastery_pct}% mastery
              </span>
            )}
            {record.current_level && (
              <span className="rounded-full bg-sc-navy/5 text-sc-navy px-2 py-0.5 text-label-sm font-medium">
                {record.current_level}
              </span>
            )}
            {record.parent_visible && (
              <span className="rounded-full bg-sc-gold-50 text-sc-gold-700 border border-sc-gold-200 px-2 py-0.5 text-label-sm">
                Parent visible
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {!archived && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="rounded-lg p-1.5 text-sc-gray hover:text-sc-teal hover:bg-sc-teal/10"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {isAdmin && !archived && (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(); }}
              className="rounded-lg p-1.5 text-sc-gray hover:text-sc-rose hover:bg-sc-rose/10"
            >
              <Archive className="size-3.5" />
            </button>
          )}
          {isAdmin && archived && (
            <button
              onClick={(e) => { e.stopPropagation(); onRestore(); }}
              className="rounded-lg p-1.5 text-sc-gray hover:text-sc-teal hover:bg-sc-teal/10"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
          {expanded ? <ChevronUp className="size-4 text-sc-gray" /> : <ChevronDown className="size-4 text-sc-gray" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-sc-gray-100 pt-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-label-sm">
            {record.curriculum_name && (
              <div>
                <p className="text-sc-gray">Curriculum</p>
                <p className="font-medium text-sc-navy">{record.curriculum_name}</p>
              </div>
            )}
            {record.current_lesson && (
              <div>
                <p className="text-sc-gray">Lesson</p>
                <p className="font-medium text-sc-navy">{record.current_lesson}</p>
              </div>
            )}
            {record.current_unit && (
              <div>
                <p className="text-sc-gray">Unit / Chapter</p>
                <p className="font-medium text-sc-navy">{record.current_unit}</p>
              </div>
            )}
            {record.skill_or_topic && (
              <div>
                <p className="text-sc-gray">Skill / Topic</p>
                <p className="font-medium text-sc-navy">{record.skill_or_topic}</p>
              </div>
            )}
            {record.staff_name && (
              <div>
                <p className="text-sc-gray">Staff</p>
                <p className="font-medium text-sc-navy">{record.staff_name}</p>
              </div>
            )}
          </div>

          {record.notes && (
            <div>
              <p className="text-label-sm text-sc-gray mb-0.5">Staff Notes</p>
              <p className="text-label-sm text-sc-navy whitespace-pre-line">{record.notes}</p>
            </div>
          )}

          {record.next_steps && (
            <div>
              <p className="text-label-sm text-sc-gray mb-0.5">Next Steps</p>
              <p className="text-label-sm text-sc-navy whitespace-pre-line">{record.next_steps}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface Props {
  studentId: string;
  isAdmin: boolean;
}

export function ProgressTab({ studentId, isAdmin }: Props) {
  const [records, setRecords]             = useState<ProgressRecord[]>([]);
  const [growth, setGrowth]               = useState<SubjectGrowthEntry[]>([]);
  const [loading, setLoading]             = useState(true);
  const [fetchError, setFetchError]       = useState<string | false>(false);

  const [showAddForm, setShowAddForm]     = useState(false);
  const [editingRecord, setEditingRecord] = useState<ProgressRecord | null>(null);
  const [formPayload, setFormPayload]     = useState<ProgressPayload>(blankPayload());
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState<string | null>(null);

  const [filterSubject, setFilterSubject] = useState("all");
  const [searchQ, setSearchQ]             = useState("");
  const [showArchived, setShowArchived]   = useState(false);
  const [activeView, setActiveView]       = useState<"history" | "growth">("growth");
  const [filterSubjectForHistory, setFilterSubjectForHistory] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(false);
    const [recs, grw] = await Promise.all([
      getProgressRecords(studentId, { includeArchived: showArchived }),
      getStudentGrowthSummary(studentId),
    ]).catch(() => {
      setFetchError("Failed to load progress records.");
      setLoading(false);
      return [null, null] as const;
    });
    if (recs === null) return;
    setRecords(recs as ProgressRecord[]);
    setGrowth(grw as SubjectGrowthEntry[]);
    setLoading(false);
  }, [studentId, showArchived]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setFormPayload(blankPayload());
    setSaveError(null);
    setShowAddForm(true);
    setEditingRecord(null);
  }

  function openEdit(record: ProgressRecord) {
    setFormPayload({
      subject:                  record.subject,
      curriculum_enrollment_id: record.curriculum_enrollment_id,
      assessment_id:            record.assessment_id,
      growth_goal_id:           record.growth_goal_id,
      staff_member_id:          record.staff_member_id,
      recorded_date:            record.recorded_date,
      curriculum_name:          record.curriculum_name,
      current_level:            record.current_level,
      current_lesson:           record.current_lesson,
      current_unit:             record.current_unit,
      skill_or_topic:           record.skill_or_topic,
      mastery_pct:              record.mastery_pct,
      confidence_level:         record.confidence_level,
      notes:                    record.notes,
      next_steps:               record.next_steps,
      parent_visible:           record.parent_visible,
    });
    setSaveError(null);
    setEditingRecord(record);
    setShowAddForm(false);
  }

  function cancelForm() {
    setShowAddForm(false);
    setEditingRecord(null);
    setSaveError(null);
  }

  async function handleSave() {
    if (!formPayload.subject || !formPayload.recorded_date) return;
    setSaving(true);
    setSaveError(null);

    let result: { success?: true; id?: string; error?: string };
    if (editingRecord) {
      result = await updateProgressRecord(editingRecord.id, formPayload);
    } else {
      result = await createProgressRecord(studentId, formPayload);
    }

    if ("error" in result && result.error) {
      setSaveError(result.error);
      setSaving(false);
      return;
    }

    setSaving(false);
    setShowAddForm(false);
    setEditingRecord(null);
    load();
  }

  async function handleArchive(id: string) {
    await archiveProgressRecord(id);
    load();
  }

  async function handleRestore(id: string) {
    await restoreProgressRecord(id);
    load();
  }

  // Filter records
  const filteredRecords = records.filter((r) => {
    if (filterSubjectForHistory !== "all" && r.subject !== filterSubjectForHistory) return false;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      return (
        (r.curriculum_name ?? "").toLowerCase().includes(q) ||
        (r.skill_or_topic ?? "").toLowerCase().includes(q) ||
        (r.notes ?? "").toLowerCase().includes(q) ||
        (r.next_steps ?? "").toLowerCase().includes(q) ||
        (r.current_level ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="h-8 w-8 rounded-full border-2 border-sc-teal border-t-transparent animate-spin" />
        <p className="text-label-sm text-sc-gray">Loading progress history…</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-2xl border border-sc-rose-200 bg-sc-rose-50 p-6 text-center">
        <p className="text-sc-rose-700 font-medium">{fetchError}</p>
        <button onClick={load} className="mt-3 text-label-sm text-sc-teal font-medium hover:underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-heading-2 text-sc-navy flex items-center gap-2">
            <TrendingUp className="size-5 text-sc-teal" /> Progress History
          </h2>
          <p className="text-label-sm text-sc-gray mt-0.5">
            {records.filter((r) => !r.archived_at).length} active check-in{records.filter((r) => !r.archived_at).length !== 1 ? "s" : ""} across {growth.length} subject{growth.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm font-semibold text-white hover:bg-sc-teal-700"
        >
          <Plus className="size-4" /> Add Check-in
        </button>
      </div>

      {/* ── Add form ────────────────────────────────────────────────── */}
      {showAddForm && !editingRecord && (
        <ProgressForm
          payload={formPayload}
          onChange={setFormPayload}
          onSave={handleSave}
          onCancel={cancelForm}
          saving={saving}
          saveError={saveError}
        />
      )}

      {/* ── View toggle ─────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveView("growth")}
          className={cn(
            "rounded-xl px-4 py-2 text-label-sm font-medium border",
            activeView === "growth"
              ? "bg-sc-teal text-white border-sc-teal"
              : "bg-white text-sc-navy border-sc-gray-200 hover:bg-sc-gray-50"
          )}
        >
          Growth Summary
        </button>
        <button
          onClick={() => setActiveView("history")}
          className={cn(
            "rounded-xl px-4 py-2 text-label-sm font-medium border",
            activeView === "history"
              ? "bg-sc-teal text-white border-sc-teal"
              : "bg-white text-sc-navy border-sc-gray-200 hover:bg-sc-gray-50"
          )}
        >
          Check-in History
        </button>
      </div>

      {/* ── GROWTH SUMMARY VIEW ─────────────────────────────────────── */}
      {activeView === "growth" && (
        <>
          {growth.length === 0 ? (
            <div className="rounded-2xl border border-sc-gray-100 bg-white p-10 text-center">
              <TrendingUp className="size-10 text-sc-gray-300 mx-auto mb-3" />
              <p className="font-serif text-heading-3 text-sc-navy mb-1">No progress records yet</p>
              <p className="text-label-sm text-sc-gray mb-4">Add the first check-in to start tracking growth.</p>
              <button
                onClick={openAdd}
                className="rounded-xl bg-sc-teal px-4 py-2 text-label-sm font-semibold text-white hover:bg-sc-teal-700"
              >
                Add Check-in
              </button>
            </div>
          ) : (
            <>
              {/* Stale subjects alert */}
              {growth.some((g) => g.isStale) && (
                <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 px-4 py-3 flex items-center gap-2">
                  <AlertTriangle className="size-4 text-sc-rose-700 shrink-0" />
                  <p className="text-label-sm text-sc-rose-700">
                    {growth.filter((g) => g.isStale).length} subject{growth.filter((g) => g.isStale).length !== 1 ? "s" : ""} with no update in 30+ days:{" "}
                    {growth.filter((g) => g.isStale).map((g) => g.subjectLabel).join(", ")}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {growth.map((entry) => (
                  <GrowthSummaryCard
                    key={entry.subject}
                    entry={entry}
                    onView={() => {
                      setActiveView("history");
                      setFilterSubjectForHistory(entry.subject);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── HISTORY VIEW ───────────────────────────────────────────── */}
      {activeView === "history" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search notes, curriculum, skills…"
                className="w-full rounded-xl border border-sc-gray-200 bg-white pl-9 pr-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
              />
            </div>
            <select
              value={filterSubjectForHistory}
              onChange={(e) => setFilterSubjectForHistory(e.target.value)}
              className="rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            >
              <option value="all">All subjects</option>
              {SUBJECTS.map((s) => (
                <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>
              ))}
            </select>
            {isAdmin && (
              <label className="flex items-center gap-2 rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="rounded border-sc-gray-300 text-sc-teal"
                />
                Show archived
              </label>
            )}
          </div>

          {/* Edit form inline */}
          {editingRecord && (
            <ProgressForm
              payload={formPayload}
              onChange={setFormPayload}
              onSave={handleSave}
              onCancel={cancelForm}
              saving={saving}
              saveError={saveError}
            />
          )}

          {filteredRecords.length === 0 ? (
            <div className="rounded-2xl border border-sc-gray-100 bg-white p-10 text-center">
              <p className="font-serif text-heading-3 text-sc-navy mb-1">No check-ins found</p>
              <p className="text-label-sm text-sc-gray">
                {records.length === 0
                  ? "Add the first progress check-in above."
                  : "Try adjusting your filters."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRecords.map((record) => (
                <RecordCard
                  key={record.id}
                  record={record}
                  isAdmin={isAdmin}
                  onEdit={() => openEdit(record)}
                  onArchive={() => handleArchive(record.id)}
                  onRestore={() => handleRestore(record.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Show archived toggle at bottom ──────────────────────────── */}
      {activeView === "history" && !isAdmin && records.some((r) => r.archived_at) && (
        <p className="text-label-sm text-sc-gray text-center">
          {records.filter((r) => r.archived_at).length} archived record(s) — contact an admin to view.
        </p>
      )}
    </div>
  );
}
