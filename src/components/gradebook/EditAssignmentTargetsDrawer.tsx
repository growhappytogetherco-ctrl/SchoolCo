"use client";

import { useState, useTransition, useEffect } from "react";
import { X, Check, AlertTriangle } from "lucide-react";
import { getAssignmentTargets, getStudentsWithGrades, updateAssignmentTargets } from "@/app/actions/grading";
import type { Assignment } from "@/app/actions/grading-constants";

interface RosterStudent {
  studentId: string;
  studentName: string;
}

interface Props {
  assignment: Assignment;
  orgId: string;
  roster: RosterStudent[];
  onClose: () => void;
  onUpdated: () => void;
}

export function EditAssignmentTargetsDrawer({
  assignment,
  orgId,
  roster,
  onClose,
  onUpdated,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [targetMode, setTargetMode] = useState<"all" | "selected">(
    (assignment.target_mode ?? "all") as "all" | "selected"
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [studentsWithGrades, setStudentsWithGrades] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  // Load current targets on mount
  useEffect(() => {
    async function load() {
      const result = await getAssignmentTargets(assignment.id, orgId);
      if (result.success) {
        const ids = new Set(result.data as string[]);
        setSelectedIds(ids);
        // If all roster students are targeted, show as "all" mode regardless of stored value
        const allTargeted = roster.every(s => ids.has(s.studentId));
        if (allTargeted && ids.size === roster.length) {
          setTargetMode("all");
        } else if (ids.size < roster.length) {
          setTargetMode("selected");
        }
      }
      // Load which of those students have grades already
      if (result.success && (result.data as string[]).length > 0) {
        const graded = await getStudentsWithGrades(
          assignment.id,
          result.data as string[],
          orgId
        );
        if (graded.success) {
          setStudentsWithGrades(new Set(graded.data as string[]));
        }
      }
      setLoading(false);
    }
    load();
  }, [assignment.id, orgId, roster]);

  function toggleStudent(studentId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(roster.map(s => s.studentId)));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  // Students who currently have grades and would be removed
  const wouldLoseGrades = roster
    .filter(s => studentsWithGrades.has(s.studentId) && !selectedIds.has(s.studentId))
    .map(s => s.studentName);

  const effectiveTargetIds = targetMode === "all"
    ? roster.map(s => s.studentId)
    : [...selectedIds];

  function handleSave() {
    if (targetMode === "selected" && selectedIds.size === 0) {
      setError("Select at least one student.");
      return;
    }

    let confirmed = true;
    if (wouldLoseGrades.length > 0) {
      confirmed = window.confirm(
        `Warning: ${wouldLoseGrades.join(", ")} already ${wouldLoseGrades.length === 1 ? "has" : "have"} a grade for this assignment.\n\nRemoving them will DELETE their grade. This cannot be undone.\n\nContinue?`
      );
    }
    if (!confirmed) return;

    setError("");
    startTransition(async () => {
      const result = await updateAssignmentTargets({
        assignmentId: assignment.id,
        orgId,
        targetMode,
        studentIds: effectiveTargetIds,
        removeGradesForRemovedStudents: wouldLoseGrades.length > 0,
      });
      if (result.success) {
        onUpdated();
      } else {
        setError(result.error ?? "Failed to update assignment targets.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative ml-auto w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-sc-gray-100">
          <div>
            <h2 className="font-serif text-heading-2 text-sc-navy">Edit Assignment Targets</h2>
            <p className="text-label-sm text-sc-gray mt-0.5 truncate max-w-[18rem]">
              {assignment.title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-sc-gray-100 transition-colors text-sc-gray"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-sc-gray animate-pulse">
            Loading…
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Assign To */}
            <div className="space-y-2">
              <label className="text-label-sm font-medium text-sc-navy">Assign To</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTargetMode("all")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-label-sm font-medium transition-colors ${
                    targetMode === "all"
                      ? "border-sc-teal bg-sc-teal/5 text-sc-teal"
                      : "border-sc-gray-100 text-sc-gray hover:border-sc-teal/50"
                  }`}
                >
                  Entire Course
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode("selected")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-label-sm font-medium transition-colors ${
                    targetMode === "selected"
                      ? "border-sc-teal bg-sc-teal/5 text-sc-teal"
                      : "border-sc-gray-100 text-sc-gray hover:border-sc-teal/50"
                  }`}
                >
                  Selected Students
                </button>
              </div>
            </div>

            {/* Student list (selected mode) */}
            {targetMode === "selected" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-label-sm font-medium text-sc-navy">
                    Students ({selectedIds.size} selected)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-label-sm text-sc-teal hover:underline"
                    >
                      All
                    </button>
                    <span className="text-sc-gray-400">·</span>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-label-sm text-sc-teal hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-sc-gray-100 overflow-hidden max-h-64 overflow-y-auto">
                  {roster.map(s => {
                    const checked = selectedIds.has(s.studentId);
                    const hasGrade = studentsWithGrades.has(s.studentId);
                    const willLoseGrade = hasGrade && !checked;
                    return (
                      <button
                        key={s.studentId}
                        type="button"
                        onClick={() => toggleStudent(s.studentId)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-sc-gray-100/40 transition-colors text-left border-b border-sc-gray-100/60 last:border-0"
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${
                          checked
                            ? "bg-sc-teal border-sc-teal"
                            : "border-sc-gray-200"
                        }`}>
                          {checked && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                        </div>
                        <span className="text-label-sm text-sc-navy flex-1">{s.studentName}</span>
                        {hasGrade && (
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              willLoseGrade
                                ? "bg-sc-rose-50 text-sc-rose-700"
                                : "bg-sc-teal/10 text-sc-teal"
                            }`}
                            title={willLoseGrade ? "Grade will be deleted if removed" : "Has a grade"}
                          >
                            {willLoseGrade ? "grade will be deleted" : "graded"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Warning for grade deletion */}
            {wouldLoseGrades.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-xl bg-sc-rose-50 border border-sc-rose-200 p-3">
                <AlertTriangle className="h-4 w-4 text-sc-rose-700 flex-shrink-0 mt-0.5" />
                <p className="text-label-sm text-sc-rose-700">
                  Removing {wouldLoseGrades.length === 1 ? wouldLoseGrades[0] : `${wouldLoseGrades.length} students`} will permanently delete {wouldLoseGrades.length === 1 ? "their" : "their"} existing grade{wouldLoseGrades.length > 1 ? "s" : ""} for this assignment.
                </p>
              </div>
            )}

            {error && (
              <p className="text-label-sm text-sc-rose-700">{error}</p>
            )}
          </div>
        )}

        {/* Footer */}
        {!loading && (
          <div className="border-t border-sc-gray-100 p-5 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-sc-gray-100 px-4 py-2.5 text-label-sm font-medium text-sc-gray hover:bg-sc-gray-100/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 rounded-lg bg-sc-teal px-4 py-2.5 text-label-sm font-medium text-white hover:bg-sc-teal-700 transition-colors disabled:opacity-60"
            >
              {isPending ? "Saving…" : "Save Targets"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
