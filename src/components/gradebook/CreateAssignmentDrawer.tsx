"use client";

import { useState, useTransition } from "react";
import { X, Check } from "lucide-react";
import { createAssignment } from "@/app/actions/grading";
import { ASSIGNMENT_CATEGORY_LABELS } from "@/app/actions/grading-constants";

interface RosterStudent {
  studentId: string;
  studentName: string;
}

interface Props {
  orgId: string;
  courseSectionId: string;
  periodId: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
  roster: RosterStudent[];   // enrolled students for this section
  preselectedStudentId?: string;  // preselect one student (quick single-student entry)
  onClose: () => void;
  onCreated: () => void;
}

export function CreateAssignmentDrawer({
  orgId,
  courseSectionId,
  periodId,
  periodName,
  periodStart,
  periodEnd,
  roster,
  preselectedStudentId,
  onClose,
  onCreated,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("classwork");
  const [points, setPoints] = useState("100");
  const [assignedDate, setAssignedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  // Target mode: 'all' | 'selected'
  const [targetMode, setTargetMode] = useState<"all" | "selected">(
    preselectedStudentId ? "selected" : "all"
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    preselectedStudentId ? new Set([preselectedStudentId]) : new Set()
  );

  const dateInPeriod =
    assignedDate >= periodStart && assignedDate <= periodEnd;

  function toggleStudent(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(roster.map(s => s.studentId)));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  function handleSubmit() {
    if (!title.trim()) { setError("Name is required."); return; }
    const pts = parseFloat(points);
    if (isNaN(pts) || pts <= 0) { setError("Points must be a positive number."); return; }
    if (!assignedDate) { setError("Assigned date is required."); return; }
    if (!dateInPeriod) {
      setError(`Date must fall within ${periodName} (${periodStart} – ${periodEnd}).`);
      return;
    }
    if (targetMode === "selected" && selectedIds.size === 0) {
      setError("Select at least one student, or choose Entire Course.");
      return;
    }
    setError("");

    const enrolledStudentIds = roster.map(s => s.studentId);
    const targetStudentIds   = targetMode === "selected" ? [...selectedIds] : enrolledStudentIds;

    startTransition(async () => {
      const result = await createAssignment({
        orgId,
        courseSectionId,
        title: title.trim(),
        category,
        pointsPossible: pts,
        assignedDate,
        dueDate: dueDate || undefined,
        description: description.trim() || undefined,
        isGraded: true,
        targetMode,
        targetStudentIds:   targetMode === "selected" ? targetStudentIds : undefined,
        enrolledStudentIds: targetMode === "all" ? enrolledStudentIds : undefined,
      });
      if (!result.success) {
        setError(result.error ?? "Failed to create assignment.");
        return;
      }
      onCreated();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sc-gray-100 shrink-0">
          <div>
            <h2 className="font-serif text-xl text-sc-navy">New Assignment</h2>
            <p className="text-label-sm text-sc-teal mt-0.5">{periodName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-sc-gray hover:bg-sc-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2.5 text-sc-rose-700 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-label-sm font-medium text-sc-navy mb-1.5">
              Name <span className="text-sc-rose-700">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Gamma Lesson 12 or Geography Quiz"
              autoFocus
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
            />
          </div>

          {/* Category + Points */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-label-sm font-medium text-sc-navy mb-1.5">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-sc-navy bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
              >
                {Object.entries(ASSIGNMENT_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="block text-label-sm font-medium text-sc-navy mb-1.5">
                Points <span className="text-sc-rose-700">*</span>
              </label>
              <input
                type="number"
                value={points}
                onChange={e => setPoints(e.target.value)}
                min="0.01"
                step="any"
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-label-sm font-medium text-sc-navy mb-1.5">
                Assigned Date <span className="text-sc-rose-700">*</span>
              </label>
              <input
                type="date"
                value={assignedDate}
                onChange={e => setAssignedDate(e.target.value)}
                min={periodStart}
                max={periodEnd}
                className={`w-full rounded-lg border px-3 py-2.5 text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal ${
                  assignedDate && !dateInPeriod ? "border-sc-rose-400" : "border-sc-gray-200"
                }`}
              />
            </div>
            <div className="flex-1">
              <label className="block text-label-sm font-medium text-sc-navy mb-1.5">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-label-sm font-medium text-sc-navy mb-1.5">
              Notes <span className="text-sc-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Lesson notes or reminders…"
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal resize-none"
            />
          </div>

          {/* ── Assign To ── */}
          <div>
            <label className="block text-label-sm font-medium text-sc-navy mb-2">Assign To</label>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => { setTargetMode("all"); setSelectedIds(new Set()); }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  targetMode === "all"
                    ? "border-sc-teal bg-sc-teal/10 text-sc-teal"
                    : "border-sc-gray-200 text-sc-gray hover:border-sc-gray-400"
                }`}
              >
                Entire Course
              </button>
              <button
                type="button"
                onClick={() => setTargetMode("selected")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  targetMode === "selected"
                    ? "border-sc-teal bg-sc-teal/10 text-sc-teal"
                    : "border-sc-gray-200 text-sc-gray hover:border-sc-gray-400"
                }`}
              >
                Selected Students
              </button>
            </div>

            {targetMode === "selected" && (
              <div className="rounded-lg border border-sc-gray-200 overflow-hidden">
                {/* Quick-select toolbar */}
                <div className="flex items-center justify-between px-3 py-2 bg-sc-gray-100/60 border-b border-sc-gray-200">
                  <span className="text-label-sm text-sc-gray">
                    {selectedIds.size} selected
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="text-label-sm text-sc-teal hover:underline"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-label-sm text-sc-gray hover:text-sc-navy hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Student checkboxes */}
                <div className="divide-y divide-sc-gray-100 max-h-48 overflow-y-auto">
                  {roster.length === 0 && (
                    <p className="px-3 py-4 text-label-sm text-sc-gray-400 text-center">
                      No students enrolled in this course
                    </p>
                  )}
                  {roster.map(s => (
                    <label
                      key={s.studentId}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-sc-gray-100/50 transition-colors"
                    >
                      <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        selectedIds.has(s.studentId)
                          ? "bg-sc-teal border-sc-teal"
                          : "border-sc-gray-300 bg-white"
                      }`}>
                        {selectedIds.has(s.studentId) && (
                          <Check className="h-2.5 w-2.5 text-white" />
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.studentId)}
                        onChange={() => toggleStudent(s.studentId)}
                        className="sr-only"
                      />
                      <span className="text-sm text-sc-navy">{s.studentName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {targetMode === "all" && (
              <p className="text-label-sm text-sc-gray-400 mt-1">
                Assigns to all {roster.length} currently enrolled students.
                Students added later will not receive this assignment automatically.
              </p>
            )}
          </div>

          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full rounded-lg bg-sc-teal px-4 py-2.5 text-white font-medium hover:bg-sc-teal-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Creating…" : "Create Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}
