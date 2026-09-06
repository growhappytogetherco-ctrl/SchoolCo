"use client";

import { useState, useTransition } from "react";
import { X, Calendar } from "lucide-react";
import { createAssignment } from "@/app/actions/grading";
import { ASSIGNMENT_CATEGORY_LABELS } from "@/app/actions/grading-constants";

interface Props {
  orgId: string;
  courseSectionId: string;
  periodId: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
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
  onClose,
  onCreated,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("homework");
  const [points, setPoints] = useState("100");
  const [assignedDate, setAssignedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  // Determine if the assigned date falls within the period
  const dateInPeriod =
    assignedDate >= periodStart && assignedDate <= periodEnd;

  function handleSubmit() {
    if (!title.trim()) { setError("Name is required."); return; }
    const pts = parseFloat(points);
    if (isNaN(pts) || pts <= 0) { setError("Points must be a positive number."); return; }
    if (!assignedDate) { setError("Assigned date is required."); return; }
    if (!dateInPeriod) {
      setError(`Date must fall within ${periodName} (${periodStart} – ${periodEnd}).`);
      return;
    }
    setError("");
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
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sc-gray-100">
          <div>
            <h2 className="font-serif text-xl text-sc-navy">New Assignment</h2>
            <p className="text-label-sm text-sc-teal mt-0.5">{periodName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-sc-gray hover:bg-sc-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
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
              placeholder="e.g. Water Filtration Project"
              autoFocus
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
            />
          </div>

          {/* Category + Points in a row */}
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
              {assignedDate && !dateInPeriod && (
                <p className="text-[11px] text-sc-rose-600 mt-1">
                  Outside {periodName} range — auto-assigns to correct period
                </p>
              )}
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

          {/* Description (optional) */}
          <div>
            <label className="block text-label-sm font-medium text-sc-navy mb-1.5">
              Description <span className="text-sc-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Notes for students or yourself…"
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal resize-none"
            />
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
