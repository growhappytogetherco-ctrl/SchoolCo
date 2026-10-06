"use client";

/**
 * Stage D — Course Finalization Panel
 *
 * Shown in the course detail page for registrar/admin users.
 * Displays per-student finalization state and drives the finalization workflow.
 *
 * Authorization: finalization actions require registrar or above.
 * This component is conditionally rendered only for eligible roles.
 */

import { useState, useTransition, useCallback } from "react";
import { CheckCircle2, AlertTriangle, Clock, XCircle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  getFinalizationPreview,
  finalizeCourseEnrollment,
  getSectionFinalizationRoster,
  type SectionRosterRow,
  type FinalizationPreviewStudent,
  type FinalizationCompletionStatus,
} from "@/app/actions/courseFinalization";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGradeDisplay(pct: number | null, letter: string | null): string {
  if (pct === null && letter === null) return "—";
  const pctStr = pct !== null ? (Number.isInteger(pct) ? `${pct}%` : `${pct}%`) : null;
  if (pctStr && letter) return `${pctStr} (${letter})`;
  if (pctStr) return pctStr;
  return letter ?? "—";
}

function StateIcon({ state }: { state: SectionRosterRow["finalizationState"] }) {
  switch (state) {
    case "finalized":      return <CheckCircle2 className="size-4 text-sc-teal-700 shrink-0" />;
    case "needs_attention": return <AlertTriangle className="size-4 text-sc-gold-600 shrink-0" />;
    case "ready":          return <Clock className="size-4 text-sc-gray-400 shrink-0" />;
    default:               return <XCircle className="size-4 text-sc-gray-200 shrink-0" />;
  }
}

const STATE_LABELS: Record<SectionRosterRow["finalizationState"], string> = {
  finalized:      "Finalized",
  needs_attention: "Needs Attention",
  ready:          "Ready",
  not_started:    "Not Started",
};

const COMPLETION_STATUS_OPTIONS: { value: FinalizationCompletionStatus; label: string }[] = [
  { value: "completed",  label: "Completed" },
  { value: "failed",     label: "Failed" },
  { value: "incomplete", label: "Incomplete" },
  { value: "withdrawn",  label: "Withdrawn" },
];

// ── Finalization Preview Dialog ───────────────────────────────────────────────

interface PreviewDialogProps {
  enrollmentId: string;
  onClose:      () => void;
  onFinalized:  () => void;
}

function FinalizationPreviewDialog({ enrollmentId, onClose, onFinalized }: PreviewDialogProps) {
  const [preview, setPreview]               = useState<FinalizationPreviewStudent | null>(null);
  const [loading, setLoading]               = useState(true);
  const [loadError, setLoadError]           = useState<string | null>(null);
  const [isPending, startTransition]        = useTransition();
  const [confirmError, setConfirmError]     = useState<string | null>(null);

  // Editable commit fields
  const [officialPct, setOfficialPct]       = useState<string>("");
  const [completionStatus, setCompletionStatus] = useState<FinalizationCompletionStatus>("completed");
  const [creditsEarned, setCreditsEarned]   = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");

  // Load preview on mount
  useState(() => {
    (async () => {
      setLoading(true);
      const result = await getFinalizationPreview(enrollmentId);
      setLoading(false);
      if (result.success) {
        const p = result.data;
        setPreview(p);
        setOfficialPct(p.officialPercentage !== null ? p.officialPercentage.toString() : "");
        setCompletionStatus(p.suggestedCompletionStatus);
      } else {
        setLoadError(result.error ?? "Could not load preview.");
      }
    })();
  });

  if (!preview && loading) {
    return (
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Finalization Preview</DialogTitle>
        </DialogHeader>
        <p className="text-label-md text-sc-gray py-6 text-center">Loading…</p>
      </DialogContent>
    );
  }

  if (loadError || !preview) {
    return (
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Finalization Preview</DialogTitle>
        </DialogHeader>
        <p className="text-label-md text-sc-rose-700 py-6">{loadError ?? "Unknown error"}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    );
  }

  const parsedOfficialPct = officialPct.trim() ? parseFloat(officialPct) : null;
  const isOverride = parsedOfficialPct !== null &&
    preview.calculatedPercentage !== null &&
    Math.abs(parsedOfficialPct - preview.calculatedPercentage) >= 0.005;

  // Derive official letter from the OFFICIAL percentage (not calculated)
  // (server also recalculates, this is just for preview display)
  const officialDisplayLetter = parsedOfficialPct !== null ? "…" : null;

  function handleCommit() {
    setConfirmError(null);
    if (parsedOfficialPct === null && completionStatus !== "withdrawn" && completionStatus !== "incomplete") {
      setConfirmError("Official percentage is required for completed/failed courses.");
      return;
    }
    if (isOverride && !overrideReason.trim()) {
      setConfirmError("A reason is required when overriding the calculated grade.");
      return;
    }
    if (preview!.countsTowardHsCredit && creditsEarned.trim() === "") {
      setConfirmError("Credits earned must be entered for HS-credit courses. Enter 0 if no credit earned.");
      return;
    }

    startTransition(async () => {
      const result = await finalizeCourseEnrollment({
        enrollmentId:       preview!.enrollmentId,
        officialPercentage: parsedOfficialPct!,
        completionStatus,
        creditsEarned:      preview!.countsTowardHsCredit
          ? (creditsEarned.trim() ? parseFloat(creditsEarned) : null)
          : null,
        overrideReason:     overrideReason.trim() || undefined,
      });

      if (result.success) {
        onFinalized();
      } else {
        setConfirmError(result.error ?? "Finalization failed.");
      }
    });
  }

  return (
    <DialogContent className="max-w-xl">
      <DialogHeader>
        <DialogTitle>Finalize Academic Record</DialogTitle>
      </DialogHeader>

      {/* Blockers */}
      {preview.blockers.length > 0 && (
        <div className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 p-3 space-y-1">
          {preview.blockers.map((b, i) => (
            <p key={i} className="text-label-sm text-sc-rose-700 flex items-start gap-1.5">
              <XCircle className="size-3.5 shrink-0 mt-0.5" /> {b}
            </p>
          ))}
        </div>
      )}

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <div className="rounded-lg bg-sc-gold-50 border border-sc-gold-300 p-3 space-y-1">
          {preview.warnings.map((w, i) => (
            <p key={i} className="text-label-sm text-sc-gold-800 flex items-start gap-1.5">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" /> {w}
            </p>
          ))}
        </div>
      )}

      {/* Preview summary */}
      <div className="rounded-lg border border-sc-gray-100 divide-y divide-sc-gray-100 text-label-sm">
        <Row label="Student"     value={preview.studentName} />
        <Row label="Course"      value={preview.courseName} />
        <Row label="School Year" value={preview.schoolYear} />
        <Row label="Institution" value={preview.institution} />
        {preview.courseLevel && (
          <Row label="Level" value={
            { standard: "Standard", honors: "Honors", ap: "AP", dual_enrollment: "Dual Enrollment" }[preview.courseLevel] ?? preview.courseLevel
          } />
        )}
        <Row
          label="Calculated Grade"
          value={formatGradeDisplay(preview.calculatedPercentage, preview.calculatedLetterGrade)}
        />
      </div>

      {/* Official percentage — editable */}
      <div className="space-y-1.5">
        <Label className="text-label-sm text-sc-gray">
          Official Percentage <span className="text-sc-rose-700">*</span>
        </Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            max="200"
            step="0.01"
            value={officialPct}
            onChange={(e) => setOfficialPct(e.target.value)}
            placeholder={preview.calculatedPercentage?.toString() ?? "e.g. 91.5"}
            className="w-32"
          />
          <span className="text-label-sm text-sc-gray-400">%</span>
          {parsedOfficialPct !== null && isOverride && (
            <span className="text-label-sm text-sc-gold-700 font-medium">Override</span>
          )}
        </div>
        <p className="text-xs text-sc-gray-400">
          Percentage is primary. Letter grade is calculated from this value using the RLA grade scale.
        </p>
      </div>

      {/* Override reason — required when overriding */}
      {isOverride && (
        <div className="space-y-1.5">
          <Label className="text-label-sm text-sc-gray">
            Override Reason <span className="text-sc-rose-700">*</span>
          </Label>
          <Textarea
            placeholder="Explain why the official grade differs from the calculated grade…"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            rows={2}
          />
          <p className="text-xs text-sc-gray-400">Staff-only. Not shown in the official record or parent portal.</p>
        </div>
      )}

      {/* Completion status */}
      <div className="space-y-1.5">
        <Label className="text-label-sm text-sc-gray">Completion Status</Label>
        <Select
          value={completionStatus}
          onChange={(e) => setCompletionStatus(e.target.value as FinalizationCompletionStatus)}
          className="w-48"
        >
          {COMPLETION_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </div>

      {/* HS Credit section — only for credit-bearing courses */}
      {preview.countsTowardHsCredit && (
        <div className="rounded-lg border border-sc-gray-100 p-3 space-y-3">
          <p className="text-label-sm font-medium text-sc-navy">High-School Credit</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-label-sm text-sc-gray">Credits Attempted</p>
              <p className="text-body-md font-medium">
                {preview.creditsAttempted !== null ? preview.creditsAttempted : <span className="text-sc-gold-700">Not configured</span>}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-label-sm text-sc-gray">
                Credits Earned <span className="text-sc-rose-700">*</span>
              </Label>
              <Input
                type="number"
                min="0"
                max="99.99"
                step="0.25"
                value={creditsEarned}
                onChange={(e) => setCreditsEarned(e.target.value)}
                placeholder="e.g. 1.0"
                className="w-24"
                disabled={["incomplete","withdrawn"].includes(completionStatus)}
              />
              {["incomplete","withdrawn"].includes(completionStatus) && (
                <p className="text-xs text-sc-gray-400">0 for this status.</p>
              )}
            </div>
          </div>
          <p className="text-xs text-sc-gray-400">
            HS transcript credit only. Dual-enrollment college hours are tracked separately and are not auto-converted.
          </p>
        </div>
      )}

      <div className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 p-3">
        <p className="text-label-sm text-sc-rose-700">
          Finalize only when this student&apos;s course is complete. Finalization creates the permanent academic record and ends active grading for this enrollment.
        </p>
      </div>

      {confirmError && (
        <p className="text-label-sm text-sc-rose-700">{confirmError}</p>
      )}

      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleCommit}
          disabled={isPending || preview.blockers.length > 0}
        >
          {isPending ? "Finalizing…" : "Finalize Record"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center px-3 py-2">
      <span className="text-sc-gray">{label}</span>
      <span className="font-medium text-sc-navy">{value}</span>
    </div>
  );
}

// ── Main Finalization Panel ───────────────────────────────────────────────────

interface FinalizationPanelProps {
  courseSectionId: string;
  initialRoster:   SectionRosterRow[];
}

export function FinalizationPanel({ courseSectionId, initialRoster }: FinalizationPanelProps) {
  const [roster, setRoster]                   = useState(initialRoster);
  const [selectedEnrollmentId, setSelected]   = useState<string | null>(null);
  const [refreshing, setRefreshing]           = useState(false);

  const refreshRoster = useCallback(async () => {
    setRefreshing(true);
    const result = await getSectionFinalizationRoster(courseSectionId);
    if (result.success) setRoster(result.data);
    setRefreshing(false);
  }, [courseSectionId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-label-md font-medium text-sc-navy">Course Finalization</p>
          <p className="text-label-sm text-sc-gray">
            Finalize each student&apos;s permanent academic record individually.
            Finalization requires registrar or administrator authority.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshRoster}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {roster.length === 0 ? (
        <p className="text-label-sm text-sc-gray-400 py-4 text-center">
          No enrolled students found for this course.
        </p>
      ) : (
        <div className="rounded-2xl border border-sc-gray-100 divide-y divide-sc-gray-100 overflow-hidden">
          {roster.map((row) => (
            <div
              key={row.enrollmentId}
              className="flex items-center gap-3 px-4 py-3 hover:bg-sc-gray-100/40"
            >
              <StateIcon state={row.finalizationState} />
              <div className="flex-1 min-w-0">
                <p className="text-label-md font-medium text-sc-navy truncate">
                  {row.studentName}
                </p>
                {row.warnings.length > 0 && !row.alreadyFinalized && (
                  <p className="text-xs text-sc-gold-700 truncate">
                    {row.warnings[0]}
                    {row.warnings.length > 1 && ` +${row.warnings.length - 1} more`}
                  </p>
                )}
                {row.alreadyFinalized && row.finalizedAt && (
                  <p className="text-xs text-sc-teal-700">
                    Finalized {new Date(row.finalizedAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", year: "numeric"
                    })}
                  </p>
                )}
              </div>
              <Badge
                variant="outline"
                className={
                  row.finalizationState === "finalized"      ? "border-sc-teal-700 text-sc-teal-700" :
                  row.finalizationState === "needs_attention" ? "border-sc-gold-600 text-sc-gold-700" :
                  "border-sc-gray-200 text-sc-gray"
                }
              >
                {STATE_LABELS[row.finalizationState]}
              </Badge>
              {!row.alreadyFinalized && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1 gap-1"
                  onClick={() => setSelected(row.enrollmentId)}
                >
                  Finalize <ChevronRight className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Finalization preview/commit dialog */}
      {selectedEnrollmentId && (
        <Dialog open onOpenChange={(open) => { if (!open) setSelected(null); }}>
          <FinalizationPreviewDialog
            enrollmentId={selectedEnrollmentId}
            onClose={() => setSelected(null)}
            onFinalized={async () => {
              setSelected(null);
              await refreshRoster();
            }}
          />
        </Dialog>
      )}
    </div>
  );
}
