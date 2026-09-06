"use client";

import { useState, useTransition } from "react";
import { Settings, Plus, Trash2, X } from "lucide-react";
import { updateCourseGradingSettings } from "@/app/actions/studentGrades";
import type { CategoryWeights, AssignmentCategory } from "@/lib/grading/types";

const CATEGORY_OPTIONS: { value: AssignmentCategory; label: string }[] = [
  { value: "homework",      label: "Homework" },
  { value: "classwork",     label: "Classwork" },
  { value: "quiz",          label: "Quiz" },
  { value: "test",          label: "Test" },
  { value: "project",       label: "Project" },
  { value: "participation", label: "Participation" },
  { value: "lab",           label: "Lab" },
  { value: "other",         label: "Other" },
];

interface Props {
  courseSectionId: string;
  initialMethod: "points" | "weighted";
  initialCategoryWeights: CategoryWeights | null;
  onSaved?: (method: "points" | "weighted", weights: CategoryWeights | null) => void;
}

export function GradingSettingsEditor({
  courseSectionId,
  initialMethod,
  initialCategoryWeights,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"points" | "weighted">(initialMethod);
  const [currentMethod, setCurrentMethod] = useState<"points" | "weighted">(initialMethod);
  const [currentWeights, setCurrentWeights] = useState<CategoryWeights | null>(initialCategoryWeights);

  // Weighted category editor state
  const [rows, setRows] = useState<Array<{ category: AssignmentCategory; weight: number }>>(
    () => {
      if (initialCategoryWeights) {
        return Object.entries(initialCategoryWeights).map(([cat, w]) => ({
          category: cat as AssignmentCategory,
          weight: w as number,
        }));
      }
      return [
        { category: "homework", weight: 20 },
        { category: "classwork", weight: 20 },
        { category: "quiz", weight: 20 },
        { category: "test", weight: 40 },
      ];
    }
  );

  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const totalWeight = rows.reduce((s, r) => s + (r.weight || 0), 0);
  const weightError = method === "weighted" && totalWeight !== 100
    ? `Category weights must total 100%. Currently: ${totalWeight}%`
    : "";

  function openEditor() {
    setMethod(currentMethod);
    if (currentWeights) {
      setRows(
        Object.entries(currentWeights).map(([cat, w]) => ({
          category: cat as AssignmentCategory,
          weight: w as number,
        }))
      );
    }
    setError("");
    setOpen(true);
  }

  function addRow() {
    const used = new Set(rows.map((r) => r.category));
    const next = CATEGORY_OPTIONS.find((o) => !used.has(o.value));
    if (!next) return;
    setRows((prev) => [...prev, { category: next.value, weight: 0 }]);
  }

  function updateRow(idx: number, field: "category" | "weight", value: string | number) {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, [field]: field === "weight" ? Number(value) : value } : r
      )
    );
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSave() {
    if (weightError) { setError(weightError); return; }
    setError("");
    startTransition(async () => {
      const weights: CategoryWeights | null =
        method === "weighted"
          ? Object.fromEntries(rows.map((r) => [r.category, r.weight])) as CategoryWeights
          : null;

      const result = await updateCourseGradingSettings(courseSectionId, method, weights);
      if (!result.success) {
        setError(result.error ?? "Failed to save settings.");
        return;
      }
      setCurrentMethod(method);
      setCurrentWeights(weights);
      setOpen(false);
      onSaved?.(method, weights);
    });
  }

  const methodLabel = currentMethod === "weighted" ? "Weighted Categories" : "Points-Based";

  return (
    <>
      {/* Display card */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-label-sm text-sc-gray">Grading Method</p>
          <p className="font-medium text-sc-navy">{methodLabel}</p>
          {currentMethod === "weighted" && currentWeights && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(currentWeights).map(([cat, w]) => (
                <span key={cat} className="rounded-full bg-sc-teal/10 px-2 py-0.5 text-label-sm text-sc-teal">
                  {CATEGORY_OPTIONS.find((o) => o.value === cat)?.label ?? cat}: {w as number}%
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={openEditor}
          className="flex items-center gap-1.5 rounded-lg border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-gray hover:bg-sc-gray-50 transition-colors"
        >
          <Settings className="size-3.5" />
          Edit Settings
        </button>
      </div>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl text-sc-navy">Grading Settings</h2>
              <button onClick={() => setOpen(false)} className="text-sc-gray hover:text-sc-navy">
                <X className="size-5" />
              </button>
            </div>

            {/* Method selector */}
            <div className="space-y-2">
              <label className="text-label-sm font-medium text-sc-navy">Grading Method</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMethod("points")}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    method === "points"
                      ? "border-sc-teal bg-sc-teal/5 text-sc-navy"
                      : "border-sc-gray-200 text-sc-gray hover:border-sc-gray-300"
                  }`}
                >
                  <p className="font-medium text-label-md">Points-Based</p>
                  <p className="text-label-sm text-sc-gray mt-0.5">Total earned ÷ total possible</p>
                </button>
                <button
                  onClick={() => setMethod("weighted")}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    method === "weighted"
                      ? "border-sc-teal bg-sc-teal/5 text-sc-navy"
                      : "border-sc-gray-200 text-sc-gray hover:border-sc-gray-300"
                  }`}
                >
                  <p className="font-medium text-label-md">Weighted</p>
                  <p className="text-label-sm text-sc-gray mt-0.5">Category percentages</p>
                </button>
              </div>
            </div>

            {/* Category weight editor */}
            {method === "weighted" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-label-sm font-medium text-sc-navy">Category Weights</label>
                  <span className={`text-label-sm font-medium ${totalWeight === 100 ? "text-sc-teal" : "text-sc-rose"}`}>
                    Total: {totalWeight}%
                  </span>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {rows.map((row, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={row.category}
                        onChange={(e) => updateRow(idx, "category", e.target.value)}
                        className="flex-1 rounded-lg border border-sc-gray-200 px-2 py-1.5 text-label-sm bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                      >
                        {CATEGORY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={row.weight}
                          onChange={(e) => updateRow(idx, "weight", e.target.value)}
                          className="w-16 rounded-lg border border-sc-gray-200 px-2 py-1.5 text-label-sm text-right focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                        />
                        <span className="text-label-sm text-sc-gray">%</span>
                      </div>
                      <button
                        onClick={() => removeRow(idx)}
                        className="text-sc-gray hover:text-sc-rose transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {rows.length < CATEGORY_OPTIONS.length && (
                  <button
                    onClick={addRow}
                    className="flex items-center gap-1.5 text-label-sm text-sc-teal hover:underline"
                  >
                    <Plus className="size-3.5" /> Add category
                  </button>
                )}

                {weightError && (
                  <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">
                    {weightError}
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isPending || (method === "weighted" && totalWeight !== 100)}
                className="rounded-lg bg-sc-teal px-4 py-2 text-label-sm text-white hover:bg-sc-teal-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
