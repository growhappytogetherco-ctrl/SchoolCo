"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, BarChart2, Clock, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { QuarterCourseRowItem } from "./QuarterCourseRow";
import {
  startQuarterReview,
  finalizeQuarterCourse,
  batchFinalizeQuarterCourses,
  reopenQuarterCourse,
} from "@/app/actions/quarterWorkflow";
import type { QuarterDashboardData, QuarterPeriodSummary } from "@/app/actions/quarterWorkflow";

interface QuarterDashboardProps {
  data:           QuarterDashboardData;
  orgId:          string;
  canFinalize:    boolean;   // registrar+
  initialPeriodId?: string | null;
}

export function QuarterDashboard({
  data,
  orgId,
  canFinalize,
  initialPeriodId,
}: QuarterDashboardProps) {
  const [activePeriodId, setActivePeriodId] = useState<string>(
    initialPeriodId ?? data.periods[0]?.periodId ?? "",
  );
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [isBatchPending, startBatchTransition] = useTransition();
  const [batchError, setBatchError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activePeriod = data.periods.find((p) => p.periodId === activePeriodId)
    ?? data.periods[0];

  if (!activePeriod) {
    return (
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 text-body-md text-sc-gray-400">
        No grading periods found for this school year.
      </div>
    );
  }

  function handleSelectToggle(sectionId: string) {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) { next.delete(sectionId); }
      else { next.add(sectionId); }
      return next;
    });
  }

  function handleSelectAll() {
    const reviewSections = activePeriod!.courses
      .filter((c) => c.workflow.status === "review")
      .map((c) => c.courseSectionId);
    setSelectedSections(new Set(reviewSections));
  }

  function handleClearSelection() {
    setSelectedSections(new Set());
  }

  async function handleMoveToReview(sectionId: string) {
    setBatchError(null);
    setSuccessMsg(null);
    const result = await startQuarterReview(orgId, activePeriodId, sectionId);
    if (!result.success) {
      setBatchError((result as any).error ?? "Failed to start review");
    } else {
      setSuccessMsg("Course moved to Review.");
    }
  }

  async function handleFinalize(sectionId: string) {
    setBatchError(null);
    setSuccessMsg(null);
    const result = await finalizeQuarterCourse(orgId, activePeriodId, sectionId);
    if (!result.success) {
      setBatchError((result as any).error ?? "Finalization failed");
    } else {
      setSuccessMsg(`Finalized — ${result.data?.snapshotCount ?? 0} grade snapshots created.`);
      setSelectedSections((prev) => {
        const next = new Set(prev);
        next.delete(sectionId);
        return next;
      });
    }
  }

  async function handleReopen(sectionId: string, reason: string) {
    setBatchError(null);
    setSuccessMsg(null);
    const result = await reopenQuarterCourse(orgId, activePeriodId, sectionId, reason);
    if (!result.success) {
      setBatchError((result as any).error ?? "Reopen failed");
    } else {
      setSuccessMsg("Course reopened and returned to Review.");
    }
  }

  function handleBatchFinalize() {
    setBatchError(null);
    setSuccessMsg(null);
    const ids = Array.from(selectedSections);
    if (ids.length === 0) return;

    startBatchTransition(async () => {
      const result = await batchFinalizeQuarterCourses(orgId, activePeriodId, ids);
      if (result.success) {
        const failed = result.data?.filter((r) => !r.success) ?? [];
        const passed = result.data?.filter((r) => r.success) ?? [];
        if (failed.length > 0) {
          setBatchError(
            `${passed.length} finalized. Errors: ${failed.map((f) => f.error).join("; ")}`
          );
        } else {
          setSuccessMsg(`${passed.length} course${passed.length !== 1 ? "s" : ""} finalized.`);
        }
        setSelectedSections(new Set());
      } else {
        setBatchError((result as any).error ?? "Batch finalization failed");
      }
    });
  }

  const reviewSections    = activePeriod.courses.filter((c) => c.workflow.status === "review");
  const readySections     = reviewSections.filter((c) => c.readyToFinalize);
  const needsReviewCount  = reviewSections.length - readySections.length;
  const canBatchFinalize  = canFinalize && selectedSections.size > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Quarter tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-sc-gray-100 p-1 w-fit">
        {data.periods.map((period) => (
          <button
            key={period.periodId}
            onClick={() => {
              setActivePeriodId(period.periodId);
              setSelectedSections(new Set());
              setBatchError(null);
              setSuccessMsg(null);
            }}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-label-sm font-medium transition-all",
              activePeriodId === period.periodId
                ? "bg-white text-sc-navy shadow-sm"
                : "text-sc-gray-400 hover:text-sc-navy",
            )}
          >
            {period.periodName}
            <PeriodStatusPip period={period} />
          </button>
        ))}
      </div>

      {/* Period summary card */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
        {/* Summary stats */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex-1">
            <h2 className="text-heading-1 text-sc-navy">{activePeriod.periodName}</h2>
            <p className="text-body-md text-sc-gray-400">
              {activePeriod.startDate} – {activePeriod.endDate}
            </p>
          </div>
          <div className="flex items-center gap-4 text-label-sm">
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold text-sc-teal">{activePeriod.finalizedCount}</span>
              <span className="text-sc-gray-400">Finalized</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold text-sc-gold-600">{activePeriod.reviewCount}</span>
              <span className="text-sc-gray-400">In Review</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold text-sc-gray-400">{activePeriod.openCount}</span>
              <span className="text-sc-gray-400">Open</span>
            </div>
          </div>
        </div>

        {/* Success / error messages */}
        {successMsg && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-sc-teal/10 border border-sc-teal/20 px-3 py-2 text-label-sm text-sc-teal">
            <CheckCircle2 className="size-4 shrink-0" />
            {successMsg}
          </div>
        )}
        {batchError && (
          <div className="mb-4 rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">
            {batchError}
          </div>
        )}

        {/* Batch finalize toolbar */}
        {canFinalize && reviewSections.length > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg bg-sc-gold-50 border border-sc-gold-300 px-3 py-2">
            <Layers className="size-4 text-sc-gold-600 shrink-0" />
            <span className="text-label-sm text-sc-gold-800 flex-1">
              {readySections.length > 0 && (
                <span className="text-sc-teal font-medium">{readySections.length} ready</span>
              )}
              {readySections.length > 0 && needsReviewCount > 0 && (
                <span className="text-sc-gold-700"> · </span>
              )}
              {needsReviewCount > 0 && (
                <span className="text-sc-gold-700">{needsReviewCount} need{needsReviewCount !== 1 ? "" : "s"} review</span>
              )}
            </span>
            {selectedSections.size > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-label-sm text-sc-gold-700">
                  {selectedSections.size} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearSelection}
                  className="text-label-sm text-sc-gold-700 h-7 px-2"
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  disabled={isBatchPending}
                  onClick={handleBatchFinalize}
                  className="bg-sc-teal hover:bg-sc-teal-700 text-label-sm h-7"
                >
                  {isBatchPending ? "Finalizing…" : `Finalize ${selectedSections.size} Selected`}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectAll}
                className="text-sc-gold-700 hover:bg-sc-gold-50 text-label-sm h-7"
              >
                Select All
              </Button>
            )}
          </div>
        )}

        {/* Course list */}
        {activePeriod.courses.length === 0 ? (
          <p className="text-body-md text-sc-gray-400 py-6 text-center">
            No courses have assignments in this quarter yet.
          </p>
        ) : (
          <div className="space-y-2">
            {activePeriod.courses.map((course) => (
              <QuarterCourseRowItem
                key={course.courseSectionId}
                course={course}
                periodId={activePeriodId}
                orgId={orgId}
                canFinalize={canFinalize}
                onMoveToReview={handleMoveToReview}
                onFinalize={handleFinalize}
                onReopen={handleReopen}
                selected={selectedSections.has(course.courseSectionId)}
                onSelectToggle={handleSelectToggle}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Period progress pip ───────────────────────────────────────────────────────

function PeriodStatusPip({ period }: { period: QuarterPeriodSummary }) {
  const allFinalized = period.totalCourses > 0 && period.finalizedCount === period.totalCourses;
  const someFinalized = period.finalizedCount > 0;
  const hasReview = period.reviewCount > 0;

  if (allFinalized) {
    return <CheckCircle2 className="size-3 text-sc-teal" />;
  }
  if (hasReview) {
    return <BarChart2 className="size-3 text-sc-gold-600" />;
  }
  if (someFinalized) {
    return <Clock className="size-3 text-sc-gray-400" />;
  }
  return null;
}
