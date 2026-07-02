"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ClipboardList, Plus, Pencil, Archive, ChevronDown, ChevronUp,
  Loader2, TrendingUp, TrendingDown, Minus, AlertCircle, RotateCcw,
  BookOpen,
} from "lucide-react";
import {
  getAssessments, createAssessment, updateAssessment,
  archiveAssessment, restoreAssessment, getGrowthSummary,
  BLANK_PAYLOAD,
  type Assessment, type AssessmentPayload, type GrowthEntry,
} from "@/app/actions/assessments";
import {
  SUBJECTS, SUBJECT_LABELS,
} from "@/lib/academics-constants";
import {
  ASSESSMENT_PERIODS, ASSESSMENT_PERIOD_LABELS, ASSESSMENT_PERIOD_SHORT,
  ASSESSMENT_TYPES, ASSESSMENT_TYPE_LABELS,
  PERFORMANCE_LEVELS, PERFORMANCE_LEVEL_LABELS, PERFORMANCE_LEVEL_COLORS,
  type AssessmentPeriod, type AssessmentType, type PerformanceLevel,
} from "@/lib/assessment-constants";
import { cn } from "@/lib/utils";

interface Props { studentId: string; isAdmin?: boolean; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function PeriodBadge({ period }: { period: string }) {
  const p = period as AssessmentPeriod;
  const label = ASSESSMENT_PERIOD_SHORT[p] ?? period.toUpperCase();
  const cls = p === "boy" ? "bg-sc-navy text-white"
    : p === "moy" ? "bg-sc-teal text-white"
    : p === "eoy" ? "bg-sc-gold text-sc-navy"
    : "bg-sc-gray-100 text-sc-gray-700";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-label-sm font-semibold", cls)}>
      {label}
    </span>
  );
}

function PerfBadge({ level }: { level: string | null }) {
  if (!level) return null;
  const l = level as PerformanceLevel;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-label-sm font-medium", PERFORMANCE_LEVEL_COLORS[l] ?? "bg-sc-gray-100 text-sc-gray")}>
      {PERFORMANCE_LEVEL_LABELS[l] ?? level}
    </span>
  );
}

// ── Assessment Form ───────────────────────────────────────────────────────────

function AssessmentForm({
  payload, onChange, onSave, onCancel, saving, label, curriculumOptions,
}: {
  payload:           AssessmentPayload;
  onChange:          (p: Partial<AssessmentPayload>) => void;
  onSave:            () => void;
  onCancel:          () => void;
  saving:            boolean;
  label:             string;
  curriculumOptions: { id: string; label: string }[];
}) {
  const raw = payload.score_raw;
  const max = payload.score_max;
  const autoPct = raw != null && max != null && max > 0
    ? Math.round((raw / max) * 100)
    : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Subject */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Subject *</label>
          <select value={payload.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
            {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
          </select>
        </div>

        {/* Period */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Assessment Period *</label>
          <select value={payload.assessment_period}
            onChange={(e) => onChange({ assessment_period: e.target.value })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
            {ASSESSMENT_PERIODS.map((p) => (
              <option key={p} value={p}>{ASSESSMENT_PERIOD_LABELS[p]}</option>
            ))}
          </select>
        </div>

        {/* Assessment name */}
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Assessment Name *</label>
          <input value={payload.assessment_name}
            onChange={(e) => onChange({ assessment_name: e.target.value })}
            placeholder="e.g. Saxon 5/4 Chapter 8 Test, Lexia Level Assessment"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Type */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Assessment Type</label>
          <select value={payload.assessment_type ?? ""}
            onChange={(e) => onChange({ assessment_type: e.target.value || null })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="">— Select —</option>
            {ASSESSMENT_TYPES.map((t) => (
              <option key={t} value={t}>{ASSESSMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Date Administered *</label>
          <input type="date" value={payload.administered_at}
            onChange={(e) => onChange({ administered_at: e.target.value })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Staff */}
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Staff Member</label>
          <input value={payload.staff_name ?? ""}
            onChange={(e) => onChange({ staff_name: e.target.value || null })}
            placeholder="Name of administering staff member"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Scores */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Raw Score</label>
          <input type="number" min={0} value={payload.score_raw ?? ""}
            onChange={(e) => onChange({ score_raw: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 42"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Max Score</label>
          <input type="number" min={1} value={payload.score_max ?? ""}
            onChange={(e) => onChange({ score_max: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 100"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {autoPct != null && (
          <div className="sm:col-span-2 rounded-lg bg-sc-teal-50 border border-sc-teal-200 px-3 py-2 text-label-sm text-sc-teal-700">
            Auto-calculated score: <strong>{autoPct}%</strong>
          </div>
        )}

        {/* Performance level */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Performance Level</label>
          <select value={payload.performance_level ?? ""}
            onChange={(e) => onChange({ performance_level: e.target.value || null })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="">— Select —</option>
            {PERFORMANCE_LEVELS.map((l) => (
              <option key={l} value={l}>{PERFORMANCE_LEVEL_LABELS[l]}</option>
            ))}
          </select>
        </div>

        {/* Grade equivalent */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Grade Equivalent</label>
          <input value={payload.grade_equivalent ?? ""}
            onChange={(e) => onChange({ grade_equivalent: e.target.value || null })}
            placeholder="e.g. 3.2, 5.7"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Placement level */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Placement / Level Result</label>
          <input value={payload.placement_level ?? ""}
            onChange={(e) => onChange({ placement_level: e.target.value || null })}
            placeholder="e.g. Level 11, Book 3"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Percentile */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Percentile Rank</label>
          <input type="number" min={1} max={99} value={payload.percentile_rank ?? ""}
            onChange={(e) => onChange({ percentile_rank: e.target.value ? Number(e.target.value) : null })}
            placeholder="1–99"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Stanine */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Stanine</label>
          <input type="number" min={1} max={9} value={payload.stanine ?? ""}
            onChange={(e) => onChange({ stanine: e.target.value ? Number(e.target.value) : null })}
            placeholder="1–9"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Fluency / reading-specific */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Fluency (WPM)</label>
          <input type="number" min={0} value={payload.fluency_wpm ?? ""}
            onChange={(e) => onChange({ fluency_wpm: e.target.value ? Number(e.target.value) : null })}
            placeholder="Words per minute"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Accuracy (%)</label>
          <input type="number" min={0} max={100} value={payload.accuracy_percent ?? ""}
            onChange={(e) => onChange({ accuracy_percent: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 96"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Mastery (%)</label>
          <input type="number" min={0} max={100} value={payload.mastery_percent ?? ""}
            onChange={(e) => onChange({ mastery_percent: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 85"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Link to curriculum */}
        {curriculumOptions.length > 0 && (
          <div className="sm:col-span-2">
            <label className="text-label-sm font-semibold text-sc-navy block mb-1">Linked Curriculum Record</label>
            <select value={payload.curriculum_enrollment_id ?? ""}
              onChange={(e) => onChange({ curriculum_enrollment_id: e.target.value || null })}
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
              <option value="">— None —</option>
              {curriculumOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Notes</label>
          <textarea value={payload.notes ?? ""}
            onChange={(e) => onChange({ notes: e.target.value || null })}
            placeholder="General notes about this assessment"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>

        {/* Staff interpretation */}
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Staff Interpretation</label>
          <textarea value={payload.staff_interpretation ?? ""}
            onChange={(e) => onChange({ staff_interpretation: e.target.value || null })}
            placeholder="How does this score compare to where the student should be? What does it indicate?"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>

        {/* Next steps */}
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Recommended Next Steps</label>
          <textarea value={payload.recommended_next_steps ?? ""}
            onChange={(e) => onChange({ recommended_next_steps: e.target.value || null })}
            placeholder="What instructional adjustments or follow-up actions are recommended?"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel}
          className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50">
          Cancel
        </button>
        <button onClick={onSave} disabled={saving || !payload.assessment_name.trim() || !payload.administered_at}
          className="rounded-lg bg-sc-teal px-4 py-2 text-label-sm text-white hover:bg-sc-teal-700 disabled:opacity-60">
          {saving ? "Saving…" : label}
        </button>
      </div>
    </div>
  );
}

// ── Growth Summary ────────────────────────────────────────────────────────────

function GrowthCard({ entry }: { entry: GrowthEntry }) {
  const isBaseline = entry.direction === "insufficient_data";
  const DirIcon = entry.direction === "improved" ? TrendingUp
    : entry.direction === "declined" ? TrendingDown
    : Minus;
  const dirColor = entry.direction === "improved" ? "text-sc-teal-700"
    : entry.direction === "declined" ? "text-sc-rose-700"
    : "text-sc-gray";

  return (
    <div className="rounded-xl border border-sc-gray-100 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-label-md text-sc-navy">{entry.subjectLabel}</p>
        {!isBaseline && (
          <div className={cn("flex items-center gap-1 text-label-sm font-semibold", dirColor)}>
            <DirIcon className="size-3.5" />
            {entry.delta != null ? `${entry.delta > 0 ? "+" : ""}${entry.delta}%` : entry.direction}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-label-sm">
        <div className="rounded-lg bg-sc-gray-50 px-2.5 py-2">
          <p className="text-sc-gray text-xs uppercase tracking-wide font-medium">
            {ASSESSMENT_PERIOD_SHORT[entry.baselinePeriod as AssessmentPeriod] ?? "Start"}
          </p>
          <p className="font-semibold text-sc-navy mt-0.5">
            {entry.baselineScore != null ? `${entry.baselineScore}%` : "—"}
          </p>
          {entry.baselineLevel && (
            <p className="text-sc-gray text-xs mt-0.5 capitalize">
              {PERFORMANCE_LEVEL_LABELS[entry.baselineLevel as PerformanceLevel] ?? entry.baselineLevel}
            </p>
          )}
          <p className="text-sc-gray-400 text-xs">{fmtDate(entry.baselineDate)}</p>
        </div>
        <div className="rounded-lg bg-sc-teal-50 border border-sc-teal-100 px-2.5 py-2">
          <p className="text-sc-teal-700 text-xs uppercase tracking-wide font-medium">Latest</p>
          <p className="font-semibold text-sc-navy mt-0.5">
            {entry.latestScore != null ? `${entry.latestScore}%` : "—"}
          </p>
          {entry.latestLevel && (
            <p className="text-sc-gray text-xs mt-0.5 capitalize">
              {PERFORMANCE_LEVEL_LABELS[entry.latestLevel as PerformanceLevel] ?? entry.latestLevel}
            </p>
          )}
          <p className="text-sc-gray-400 text-xs">{fmtDate(entry.latestDate)}</p>
        </div>
      </div>

      {isBaseline && (
        <p className="text-label-sm text-sc-gray italic">Only one assessment on record — add another to see growth.</p>
      )}
    </div>
  );
}

// ── Assessment Card ───────────────────────────────────────────────────────────

function AssessmentCard({
  assessment, onEdit, onArchive, onRestore, isAdmin,
}: {
  assessment: Assessment;
  onEdit:     (a: Assessment) => void;
  onArchive:  (id: string) => void;
  onRestore:  (id: string) => void;
  isAdmin:    boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isArchived = !!assessment.archived_at;

  function handleArchive() {
    startTransition(async () => {
      await archiveAssessment(assessment.id);
      onArchive(assessment.id);
      setConfirming(false);
    });
  }

  function handleRestore() {
    startTransition(async () => {
      await restoreAssessment(assessment.id);
      onRestore(assessment.id);
    });
  }

  const scoreDisplay = assessment.score_pct != null
    ? `${Math.round(Number(assessment.score_pct))}%`
    : assessment.fluency_wpm != null ? `${assessment.fluency_wpm} WPM`
    : assessment.mastery_percent != null ? `${assessment.mastery_percent}% mastery`
    : null;

  return (
    <div className={cn(
      "rounded-2xl border bg-white shadow-card overflow-hidden transition-opacity",
      isArchived && "opacity-60"
    )}>
      {/* Card header */}
      <div className="flex items-start gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <PeriodBadge period={assessment.assessment_period} />
            <span className="text-label-sm text-sc-gray">
              {SUBJECT_LABELS[assessment.subject as keyof typeof SUBJECT_LABELS] ?? assessment.subject}
            </span>
            {assessment.assessment_type && (
              <span className="text-label-sm text-sc-gray-400">
                · {ASSESSMENT_TYPE_LABELS[assessment.assessment_type as AssessmentType] ?? assessment.assessment_type}
              </span>
            )}
            {isArchived && (
              <span className="text-label-sm text-sc-gray bg-sc-gray-100 rounded-full px-2 py-0.5">Archived</span>
            )}
          </div>
          <p className="font-semibold text-sc-navy text-label-md">{assessment.assessment_name}</p>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            <span className="text-label-sm text-sc-gray">{fmtDate(assessment.administered_at)}</span>
            {assessment.staff_name && (
              <span className="text-label-sm text-sc-gray">· {assessment.staff_name}</span>
            )}
            {scoreDisplay && (
              <span className="font-semibold text-sc-navy text-label-sm">· {scoreDisplay}</span>
            )}
            {assessment.performance_level && <PerfBadge level={assessment.performance_level} />}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!isArchived && (
            <button onClick={() => onEdit(assessment)}
              className="rounded-lg p-1.5 text-sc-gray hover:bg-sc-gray-100 transition-colors">
              <Pencil className="size-3.5" />
            </button>
          )}
          {isAdmin && (
            isArchived
              ? (
                <button onClick={handleRestore} disabled={isPending}
                  className="rounded-lg p-1.5 text-sc-teal hover:bg-sc-teal-50 transition-colors">
                  <RotateCcw className="size-3.5" />
                </button>
              )
              : (
                confirming
                  ? (
                    <div className="flex items-center gap-1">
                      <span className="text-label-sm text-sc-rose-700">Archive?</span>
                      <button onClick={handleArchive} disabled={isPending}
                        className="text-label-sm text-white bg-sc-rose rounded px-2 py-0.5 hover:bg-sc-rose-700">
                        Yes
                      </button>
                      <button onClick={() => setConfirming(false)}
                        className="text-label-sm text-sc-gray border border-sc-gray-200 rounded px-2 py-0.5 hover:bg-sc-gray-50">
                        No
                      </button>
                    </div>
                  )
                  : (
                    <button onClick={() => setConfirming(true)}
                      className="rounded-lg p-1.5 text-sc-gray hover:bg-sc-rose-50 hover:text-sc-rose transition-colors">
                      <Archive className="size-3.5" />
                    </button>
                  )
              )
          )}
          <button onClick={() => setExpanded((v) => !v)}
            className="rounded-lg p-1.5 text-sc-gray hover:bg-sc-gray-100 transition-colors">
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-sc-gray-100 px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-label-sm">
            {assessment.score_raw != null && assessment.score_max != null && (
              <div>
                <p className="text-sc-gray">Score</p>
                <p className="text-sc-navy font-medium">{assessment.score_raw} / {assessment.score_max}</p>
              </div>
            )}
            {assessment.grade_equivalent && (
              <div>
                <p className="text-sc-gray">Grade Equivalent</p>
                <p className="text-sc-navy font-medium">{assessment.grade_equivalent}</p>
              </div>
            )}
            {assessment.placement_level && (
              <div>
                <p className="text-sc-gray">Placement</p>
                <p className="text-sc-navy font-medium">{assessment.placement_level}</p>
              </div>
            )}
            {assessment.percentile_rank != null && (
              <div>
                <p className="text-sc-gray">Percentile</p>
                <p className="text-sc-navy font-medium">{assessment.percentile_rank}th</p>
              </div>
            )}
            {assessment.stanine != null && (
              <div>
                <p className="text-sc-gray">Stanine</p>
                <p className="text-sc-navy font-medium">{assessment.stanine}</p>
              </div>
            )}
            {assessment.fluency_wpm != null && (
              <div>
                <p className="text-sc-gray">Fluency</p>
                <p className="text-sc-navy font-medium">{assessment.fluency_wpm} WPM</p>
              </div>
            )}
            {assessment.accuracy_percent != null && (
              <div>
                <p className="text-sc-gray">Accuracy</p>
                <p className="text-sc-navy font-medium">{assessment.accuracy_percent}%</p>
              </div>
            )}
            {assessment.mastery_percent != null && (
              <div>
                <p className="text-sc-gray">Mastery</p>
                <p className="text-sc-navy font-medium">{assessment.mastery_percent}%</p>
              </div>
            )}
          </div>

          {assessment.notes && (
            <div>
              <p className="text-label-sm font-medium text-sc-navy mb-1">Notes</p>
              <p className="text-body-md text-sc-gray">{assessment.notes}</p>
            </div>
          )}
          {assessment.staff_interpretation && (
            <div className="rounded-lg bg-sc-teal-50 border border-sc-teal-100 px-3 py-2">
              <p className="text-label-sm font-medium text-sc-teal-800 mb-1">Staff Interpretation</p>
              <p className="text-body-md text-sc-navy">{assessment.staff_interpretation}</p>
            </div>
          )}
          {assessment.recommended_next_steps && (
            <div className="rounded-lg bg-sc-gold-50 border border-sc-gold-100 px-3 py-2">
              <p className="text-label-sm font-medium text-sc-gold-800 mb-1">Recommended Next Steps</p>
              <p className="text-body-md text-sc-navy">{assessment.recommended_next_steps}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export function AssessmentsTab({ studentId, isAdmin = false }: Props) {
  const [assessments, setAssessments]     = useState<Assessment[] | null>(null);
  const [growth, setGrowth]               = useState<GrowthEntry[]>([]);
  const [showArchived, setShowArchived]   = useState(false);
  const [addingNew, setAddingNew]         = useState(false);
  const [editTarget, setEditTarget]       = useState<Assessment | null>(null);
  const [draft, setDraft]                 = useState<AssessmentPayload>(BLANK_PAYLOAD);
  const [error, setError]                 = useState<string | null>(null);
  const [isPending, startTransition]      = useTransition();
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [periodFilter, setPeriodFilter]   = useState("all");
  const [typeFilter, setTypeFilter]       = useState("all");
  const [search, setSearch]               = useState("");

  useEffect(() => {
    getAssessments(studentId, { includeArchived: true })
      .then(setAssessments)
      .catch(() => setAssessments([]));
    getGrowthSummary(studentId).then(setGrowth).catch(() => setGrowth([]));
  }, [studentId]);

  function openAdd() {
    setDraft(BLANK_PAYLOAD);
    setError(null);
    setEditTarget(null);
    setAddingNew(true);
  }

  function openEdit(a: Assessment) {
    setDraft({
      subject:                  a.subject,
      assessment_name:          a.assessment_name,
      assessment_type:          a.assessment_type,
      assessment_period:        a.assessment_period,
      administered_at:          a.administered_at,
      staff_member_id:          a.staff_member_id,
      staff_name:               a.staff_name,
      curriculum_enrollment_id: a.curriculum_enrollment_id,
      growth_goal_id:           a.growth_goal_id,
      score_raw:                a.score_raw,
      score_max:                a.score_max,
      score_pct:                a.score_pct,
      performance_level:        a.performance_level,
      grade_equivalent:         a.grade_equivalent,
      placement_level:          a.placement_level,
      percentile_rank:          a.percentile_rank,
      stanine:                  a.stanine,
      fluency_wpm:              a.fluency_wpm,
      accuracy_percent:         a.accuracy_percent,
      mastery_percent:          a.mastery_percent,
      notes:                    a.notes,
      staff_interpretation:     a.staff_interpretation,
      recommended_next_steps:   a.recommended_next_steps,
      parent_visible:           a.parent_visible,
      attachment_url:           a.attachment_url,
    });
    setError(null);
    setEditTarget(a);
    setAddingNew(false);
  }

  function handleSave() {
    startTransition(async () => {
      if (editTarget) {
        const r = await updateAssessment(editTarget.id, draft);
        if (!r.success) { setError(r.error); return; }
        setAssessments((arr) => arr?.map((a) => a.id === editTarget.id ? r.data : a) ?? null);
        const freshGrowth = await getGrowthSummary(studentId);
        setGrowth(freshGrowth);
        setEditTarget(null);
      } else {
        const r = await createAssessment(studentId, draft);
        if (!r.success) { setError(r.error); return; }
        setAssessments((arr) => arr ? [r.data, ...arr] : [r.data]);
        const freshGrowth = await getGrowthSummary(studentId);
        setGrowth(freshGrowth);
        setAddingNew(false);
      }
      setError(null);
    });
  }

  function handleArchived(id: string) {
    setAssessments((arr) => arr?.map((a) =>
      a.id === id ? { ...a, archived_at: new Date().toISOString() } : a
    ) ?? null);
    getGrowthSummary(studentId).then(setGrowth).catch(() => {});
  }

  function handleRestored(id: string) {
    setAssessments((arr) => arr?.map((a) =>
      a.id === id ? { ...a, archived_at: null } : a
    ) ?? null);
    getGrowthSummary(studentId).then(setGrowth).catch(() => {});
  }

  if (assessments === null) {
    return (
      <div className="flex items-center justify-center py-16 text-sc-gray">
        <Loader2 className="size-5 animate-spin mr-2" /> Loading assessments…
      </div>
    );
  }

  // ── Filter logic ─────────────────────────────────────────────────────────────
  const q = search.toLowerCase().trim();
  const visible = assessments
    .filter((a) => {
      if (!showArchived && a.archived_at) return false;
      if (subjectFilter !== "all" && a.subject !== subjectFilter) return false;
      if (periodFilter  !== "all" && a.assessment_period !== periodFilter) return false;
      if (typeFilter    !== "all" && a.assessment_type !== typeFilter) return false;
      if (q) {
        const hay = [a.assessment_name, a.subject, a.staff_name, a.assessment_period, a.assessment_type, a.notes]
          .join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.administered_at).getTime() - new Date(a.administered_at).getTime());

  const activeCount   = assessments.filter((a) => !a.archived_at).length;
  const archivedCount = assessments.filter((a) => a.archived_at).length;

  const formOpen = addingNew || editTarget !== null;

  return (
    <div className="space-y-5 max-w-4xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-heading-2 text-sc-navy">Assessment Center</h2>
          <p className="text-body-md text-sc-gray mt-0.5">
            {activeCount} assessment{activeCount !== 1 ? "s" : ""} on record
          </p>
        </div>
        {!formOpen && (
          <button onClick={openAdd}
            className="flex items-center gap-1.5 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white font-medium hover:bg-sc-teal-700 transition-colors">
            <Plus className="size-4" /> Add Assessment
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose-700">{error}</p>
      )}

      {/* ── Growth Summary ──────────────────────────────────────────────────── */}
      {growth.length > 0 && (
        <div>
          <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <TrendingUp className="size-3.5" /> Growth Summary
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {growth.map((g) => <GrowthCard key={g.subject} entry={g} />)}
          </div>
        </div>
      )}

      {/* ── Add / Edit form ─────────────────────────────────────────────────── */}
      {formOpen && (
        <div className="rounded-2xl border border-sc-teal-200 bg-white shadow-card p-5">
          <p className="font-serif text-heading-3 text-sc-navy mb-4 flex items-center gap-2">
            <ClipboardList className="size-4 text-sc-teal" />
            {editTarget ? "Edit Assessment" : "New Assessment"}
          </p>
          <AssessmentForm
            payload={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            onSave={handleSave}
            onCancel={() => { setAddingNew(false); setEditTarget(null); setError(null); }}
            saving={isPending}
            label={editTarget ? "Save Changes" : "Add Assessment"}
            curriculumOptions={[]}
          />
        </div>
      )}

      {/* ── Search & Filter ─────────────────────────────────────────────────── */}
      {activeCount > 0 && !formOpen && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assessments…"
            className="flex-1 rounded-xl border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal"
          />
          <select value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}
            className="rounded-xl border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="all">All Subjects</option>
            {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
          </select>
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value)}
            className="rounded-xl border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="all">All Periods</option>
            {ASSESSMENT_PERIODS.map((p) => (
              <option key={p} value={p}>{ASSESSMENT_PERIOD_LABELS[p]}</option>
            ))}
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-xl border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="all">All Types</option>
            {ASSESSMENT_TYPES.map((t) => (
              <option key={t} value={t}>{ASSESSMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {activeCount === 0 && !formOpen && (
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-10 text-center">
          <BookOpen className="size-10 mx-auto mb-3 text-sc-gray-300" />
          <p className="font-serif text-heading-2 text-sc-navy">No assessments on file</p>
          <p className="text-body-md text-sc-gray mt-1 mb-4">
            Add beginning-of-year assessments to start tracking student growth.
          </p>
          <button onClick={openAdd}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white hover:bg-sc-teal-700 transition-colors">
            <Plus className="size-4" /> Add First Assessment
          </button>
        </div>
      )}

      {/* ── Filtered empty ──────────────────────────────────────────────────── */}
      {activeCount > 0 && visible.length === 0 && !formOpen && (
        <p className="text-label-sm text-sc-gray italic py-4 text-center">
          No assessments match your search or filters.
        </p>
      )}

      {/* ── Assessment list ─────────────────────────────────────────────────── */}
      {!formOpen && (
        <div className="space-y-3">
          {visible.map((a) => (
            <AssessmentCard
              key={a.id}
              assessment={a}
              onEdit={openEdit}
              onArchive={handleArchived}
              onRestore={handleRestored}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* ── Show/hide archived toggle ────────────────────────────────────────── */}
      {archivedCount > 0 && !formOpen && (
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="flex items-center gap-2 text-label-sm text-sc-gray hover:text-sc-navy transition-colors mx-auto">
          <Archive className="size-3.5" />
          {showArchived ? `Hide ${archivedCount} archived` : `Show ${archivedCount} archived assessment${archivedCount !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
