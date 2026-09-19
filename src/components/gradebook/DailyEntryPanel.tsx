"use client";

import { useState, useRef, useCallback } from "react";
import { Save, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { createAssignment, upsertStudentGrade } from "@/app/actions/grading";
import type { GradingPeriodInfo } from "@/app/actions/grading";

interface RosterStudent {
  studentId: string;
  studentName: string;
}

interface Props {
  orgId: string;
  courseSectionId: string;
  periods: GradingPeriodInfo[];
  activePeriodId: string | null;
  canEdit: boolean;
  roster: RosterStudent[];
  onSaved: () => void; // refresh Grid View data after save
}

interface RowState {
  title: string;
  score: string;
  outOf: string;
  status: "idle" | "saving" | "saved" | "error";
  error: string | null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyRows(roster: RosterStudent[]): Record<string, RowState> {
  const out: Record<string, RowState> = {};
  for (const s of roster) {
    out[s.studentId] = { title: "", score: "", outOf: "", status: "idle", error: null };
  }
  return out;
}

export function DailyEntryPanel({
  orgId,
  courseSectionId,
  periods,
  activePeriodId,
  canEdit,
  roster,
  onSaved,
}: Props) {
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Record<string, RowState>>(() => emptyRows(roster));
  const [saving, setSaving] = useState(false);
  const [saveAttempted, setSaveAttempted] = useState(false);

  const activePeriod = periods.find(p => p.id === activePeriodId);

  // Input refs for keyboard navigation: [studentIdx][field 0=title,1=score,2=outOf]
  const inputRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  function refKey(studentId: string, field: "title" | "score" | "outOf") {
    return `${studentId}:${field}`;
  }
  function setRef(studentId: string, field: "title" | "score" | "outOf", el: HTMLInputElement | null) {
    inputRefs.current.set(refKey(studentId, field), el);
  }
  function focusInput(studentId: string, field: "title" | "score" | "outOf") {
    const el = inputRefs.current.get(refKey(studentId, field));
    el?.focus();
    el?.select();
  }

  function updateRow(studentId: string, field: keyof RowState, value: string) {
    setRows(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: value, status: "idle", error: null },
    }));
  }

  // Tab navigation: title → score → outOf → next student title
  const handleTab = useCallback((
    e: React.KeyboardEvent,
    studentIdx: number,
    field: "title" | "score" | "outOf"
  ) => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const order: ("title" | "score" | "outOf")[] = ["title", "score", "outOf"];
    const fieldIdx = order.indexOf(field);
    if (!e.shiftKey) {
      if (fieldIdx < order.length - 1) {
        focusInput(roster[studentIdx].studentId, order[fieldIdx + 1]);
      } else if (studentIdx < roster.length - 1) {
        focusInput(roster[studentIdx + 1].studentId, "title");
      }
    } else {
      if (fieldIdx > 0) {
        focusInput(roster[studentIdx].studentId, order[fieldIdx - 1]);
      } else if (studentIdx > 0) {
        focusInput(roster[studentIdx - 1].studentId, "outOf");
      }
    }
  }, [roster]);

  // Enter advances like Tab (title→score, score→outOf, outOf→next title)
  const handleEnter = useCallback((
    e: React.KeyboardEvent,
    studentIdx: number,
    field: "title" | "score" | "outOf"
  ) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const order: ("title" | "score" | "outOf")[] = ["title", "score", "outOf"];
    const fieldIdx = order.indexOf(field);
    if (fieldIdx < order.length - 1) {
      focusInput(roster[studentIdx].studentId, order[fieldIdx + 1]);
    } else if (studentIdx < roster.length - 1) {
      focusInput(roster[studentIdx + 1].studentId, "title");
    }
  }, [roster]);

  function validateRow(row: RowState): string | null {
    const hasTitle = row.title.trim().length > 0;
    const hasScore = row.score.trim().length > 0;
    const hasOutOf = row.outOf.trim().length > 0;
    // Completely blank = skip
    if (!hasTitle && !hasScore && !hasOutOf) return null; // signal: skip
    // Partial = error
    if (!hasTitle) return "Assignment title is required.";
    if (row.title.trim().length > 200) return "Title must be under 200 characters.";
    if (!hasOutOf) return "Points possible is required.";
    const outOf = parseFloat(row.outOf);
    if (isNaN(outOf) || outOf <= 0) return "Points possible must be a number greater than 0.";
    if (hasScore) {
      const score = parseFloat(row.score);
      if (isNaN(score) || score < 0) return "Score must be a non-negative number.";
    }
    return ""; // valid
  }

  async function handleSaveAll() {
    if (!canEdit || saving) return;
    setSaveAttempted(true);

    // Validate all rows first, mark errors
    const validationErrors: Record<string, string | null> = {};
    let hasErrors = false;
    for (const s of roster) {
      const row = rows[s.studentId];
      const result = validateRow(row);
      if (result === null) {
        // blank — skip, no error
        validationErrors[s.studentId] = null;
      } else if (result === "") {
        // valid
        validationErrors[s.studentId] = null;
      } else {
        validationErrors[s.studentId] = result;
        hasErrors = true;
      }
    }

    if (hasErrors) {
      setRows(prev => {
        const next = { ...prev };
        for (const s of roster) {
          const err = validationErrors[s.studentId];
          if (err) {
            next[s.studentId] = { ...prev[s.studentId], error: err, status: "error" };
          }
        }
        return next;
      });
      return;
    }

    setSaving(true);

    // Mark all non-blank rows as saving
    setRows(prev => {
      const next = { ...prev };
      for (const s of roster) {
        const row = prev[s.studentId];
        if (validateRow(row) === "") {
          next[s.studentId] = { ...row, status: "saving", error: null };
        }
      }
      return next;
    });

    let anySaved = false;

    // Save each valid non-blank row independently so one failure doesn't block others
    for (const s of roster) {
      const row = rows[s.studentId];
      const validation = validateRow(row);
      if (validation !== "") continue; // blank or already errored

      const points = parseFloat(row.outOf);
      const scoreRaw = row.score.trim();
      const pointsEarned = scoreRaw.length > 0 ? parseFloat(scoreRaw) : null;
      const gradeStatus = pointsEarned !== null ? "graded" : "not_graded";

      try {
        // Create assignment targeted to this one student
        const assignResult = await createAssignment({
          orgId,
          courseSectionId,
          title:           row.title.trim(),
          category:        "classwork",
          assignedDate:    date,
          pointsPossible:  points,
          isGraded:        true,
          targetMode:      "selected",
          targetStudentIds: [s.studentId],
        });

        if (!assignResult.success) {
          setRows(prev => ({
            ...prev,
            [s.studentId]: { ...prev[s.studentId], status: "error", error: assignResult.error ?? "Failed to create assignment." },
          }));
          continue;
        }

        // Save grade
        const gradeResult = await upsertStudentGrade({
          orgId,
          assignmentId: assignResult.data.id,
          studentId:    s.studentId,
          pointsEarned,
          gradeStatus,
        });

        if (!gradeResult.success) {
          setRows(prev => ({
            ...prev,
            [s.studentId]: { ...prev[s.studentId], status: "error", error: gradeResult.error ?? "Assignment created but grade failed to save." },
          }));
          continue;
        }

        setRows(prev => ({
          ...prev,
          [s.studentId]: { ...prev[s.studentId], status: "saved" },
        }));
        anySaved = true;
      } catch (err) {
        setRows(prev => ({
          ...prev,
          [s.studentId]: { ...prev[s.studentId], status: "error", error: "Unexpected error. Please try again." },
        }));
      }
    }

    setSaving(false);

    if (anySaved) {
      onSaved(); // refresh Grid View
    }
  }

  function hasAnyData() {
    return roster.some(s => {
      const r = rows[s.studentId];
      return r.title.trim() || r.score.trim() || r.outOf.trim();
    });
  }

  const savedCount = roster.filter(s => rows[s.studentId].status === "saved").length;
  const errorCount = roster.filter(s => rows[s.studentId].status === "error").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-heading-1 text-sc-navy">Daily Entry</h2>
            <p className="text-label-sm text-sc-gray mt-0.5">
              Fast grade entry for individualized work. Each row creates a separate assignment.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Date picker */}
            <div className="flex items-center gap-2">
              <label className="text-label-sm text-sc-gray font-medium whitespace-nowrap">Date:</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="rounded-lg border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
              />
            </div>
            {/* Period display */}
            {activePeriod && (
              <span className="rounded-lg bg-sc-gray-100/60 px-3 py-1.5 text-label-sm text-sc-gray font-medium whitespace-nowrap">
                {activePeriod.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Save status banner */}
      {saveAttempted && !saving && (savedCount > 0 || errorCount > 0) && (
        <div className={`rounded-xl px-4 py-3 flex items-center gap-2 text-label-sm font-medium ${
          errorCount > 0
            ? "bg-sc-rose-50 border border-sc-rose-200 text-sc-rose-700"
            : "bg-emerald-50 border border-emerald-200 text-emerald-700"
        }`}>
          {errorCount > 0 ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          {savedCount > 0 && `${savedCount} row${savedCount !== 1 ? "s" : ""} saved. `}
          {errorCount > 0 && `${errorCount} row${errorCount !== 1 ? "s" : ""} had errors — see below.`}
        </div>
      )}

      {/* Entry table — desktop/tablet */}
      <div className="hidden sm:block rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-clip">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" style={{ minWidth: "580px" }}>
            <thead>
              <tr className="border-b border-sc-gray-100">
                <th className="sticky left-0 z-20 bg-sc-gray-100/80 backdrop-blur-sm text-left px-4 py-3 text-label-sm font-medium text-sc-gray w-40 min-w-[10rem]">
                  Student
                </th>
                <th className="bg-sc-gray-100/60 px-3 py-3 text-left text-label-sm font-medium text-sc-gray">
                  Assignment / Work
                </th>
                <th className="bg-sc-gray-100/60 px-3 py-3 text-center text-label-sm font-medium text-sc-gray w-24">
                  Score
                </th>
                <th className="bg-sc-gray-100/60 px-3 py-3 text-center text-label-sm font-medium text-sc-gray w-24">
                  Out Of
                </th>
                <th className="bg-sc-gray-100/60 px-3 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {roster.map((s, idx) => {
                const row = rows[s.studentId];
                const isSaved  = row.status === "saved";
                const isError  = row.status === "error";
                const isSaving = row.status === "saving";
                return (
                  <tr
                    key={s.studentId}
                    className={`border-b border-sc-gray-100/60 transition-colors ${
                      isSaved  ? "bg-emerald-50/40" :
                      isError  ? "bg-sc-rose-50/40" :
                      "hover:bg-sc-gray-100/20"
                    }`}
                  >
                    {/* Sticky student name */}
                    <td className={`sticky left-0 z-10 px-4 py-2.5 font-medium text-sc-navy text-label-md border-r border-sc-gray-100/60 transition-colors ${
                      isSaved ? "bg-emerald-50/40" : isError ? "bg-sc-rose-50/40" : "bg-white group-hover:bg-sc-gray-100/20"
                    }`}>
                      <span className="truncate block max-w-[9rem]" title={s.studentName}>
                        {s.studentName}
                      </span>
                    </td>

                    {/* Assignment title */}
                    <td className="px-2 py-1.5">
                      <input
                        ref={el => setRef(s.studentId, "title", el)}
                        type="text"
                        value={row.title}
                        onChange={e => updateRow(s.studentId, "title", e.target.value)}
                        onKeyDown={e => { handleTab(e, idx, "title"); handleEnter(e, idx, "title"); }}
                        placeholder="e.g. Lesson 12"
                        maxLength={200}
                        disabled={!canEdit || isSaving || isSaved}
                        className="w-full rounded-lg border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </td>

                    {/* Score */}
                    <td className="px-2 py-1.5">
                      <input
                        ref={el => setRef(s.studentId, "score", el)}
                        type="number"
                        min="0"
                        step="any"
                        value={row.score}
                        onChange={e => updateRow(s.studentId, "score", e.target.value)}
                        onKeyDown={e => { handleTab(e, idx, "score"); handleEnter(e, idx, "score"); }}
                        placeholder="—"
                        disabled={!canEdit || isSaving || isSaved}
                        className="w-full rounded-lg border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-navy text-center placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </td>

                    {/* Out Of */}
                    <td className="px-2 py-1.5">
                      <input
                        ref={el => setRef(s.studentId, "outOf", el)}
                        type="number"
                        min="0.01"
                        step="any"
                        value={row.outOf}
                        onChange={e => updateRow(s.studentId, "outOf", e.target.value)}
                        onKeyDown={e => { handleTab(e, idx, "outOf"); handleEnter(e, idx, "outOf"); }}
                        placeholder="—"
                        disabled={!canEdit || isSaving || isSaved}
                        className="w-full rounded-lg border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-navy text-center placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </td>

                    {/* Status indicator */}
                    <td className="px-2 py-1.5 text-center">
                      {isSaving && <Loader2 className="h-4 w-4 animate-spin text-sc-teal mx-auto" />}
                      {isSaved  && <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />}
                      {isError  && (
                        <span title={row.error ?? "Error"}>
                          <AlertCircle className="h-4 w-4 text-sc-rose mx-auto" />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {/* Error detail rows */}
              {roster.map(s => {
                const row = rows[s.studentId];
                if (!row.error) return null;
                return (
                  <tr key={`err-${s.studentId}`} className="bg-sc-rose-50/60">
                    <td className="sticky left-0 z-10 bg-sc-rose-50/60 px-4 py-1 border-r border-sc-gray-100/60" />
                    <td colSpan={4} className="px-3 py-1 text-label-sm text-sc-rose-700">
                      {s.studentName}: {row.error}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Entry cards — mobile */}
      <div className="sm:hidden space-y-3">
        {roster.map((s, idx) => {
          const row = rows[s.studentId];
          const isSaved  = row.status === "saved";
          const isError  = row.status === "error";
          const isSaving = row.status === "saving";
          return (
            <div
              key={s.studentId}
              className={`rounded-2xl border p-4 space-y-3 ${
                isSaved ? "bg-emerald-50 border-emerald-200" :
                isError ? "bg-sc-rose-50 border-sc-rose-200" :
                "bg-white border-sc-gray-100 shadow-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sc-navy text-label-md">{s.studentName}</span>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin text-sc-teal" />}
                {isSaved  && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {isError  && <AlertCircle className="h-4 w-4 text-sc-rose" />}
              </div>

              <div>
                <label className="block text-label-sm text-sc-gray mb-1">Assignment / Work</label>
                <input
                  ref={el => setRef(s.studentId, "title", el)}
                  type="text"
                  value={row.title}
                  onChange={e => updateRow(s.studentId, "title", e.target.value)}
                  onKeyDown={e => { handleTab(e, idx, "title"); handleEnter(e, idx, "title"); }}
                  placeholder="e.g. Lesson 12"
                  maxLength={200}
                  disabled={!canEdit || isSaving || isSaved}
                  className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal disabled:opacity-50"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-label-sm text-sc-gray mb-1">Score</label>
                  <input
                    ref={el => setRef(s.studentId, "score", el)}
                    type="number"
                    min="0"
                    step="any"
                    value={row.score}
                    onChange={e => updateRow(s.studentId, "score", e.target.value)}
                    onKeyDown={e => { handleTab(e, idx, "score"); handleEnter(e, idx, "score"); }}
                    placeholder="—"
                    disabled={!canEdit || isSaving || isSaved}
                    className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy text-center placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal disabled:opacity-50"
                  />
                </div>
                <div className="flex items-end pb-0.5 text-sc-gray-400 text-label-sm font-medium">/</div>
                <div className="flex-1">
                  <label className="block text-label-sm text-sc-gray mb-1">Out Of</label>
                  <input
                    ref={el => setRef(s.studentId, "outOf", el)}
                    type="number"
                    min="0.01"
                    step="any"
                    value={row.outOf}
                    onChange={e => updateRow(s.studentId, "outOf", e.target.value)}
                    onKeyDown={e => { handleTab(e, idx, "outOf"); handleEnter(e, idx, "outOf"); }}
                    placeholder="—"
                    disabled={!canEdit || isSaving || isSaved}
                    className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy text-center placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal disabled:opacity-50"
                  />
                </div>
              </div>

              {isError && row.error && (
                <p className="text-label-sm text-sc-rose-700">{row.error}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Save All button */}
      {canEdit && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-label-sm text-sc-gray">
            Blank rows are skipped. Each completed row creates a separate assignment.
          </p>
          <button
            onClick={handleSaveAll}
            disabled={saving || !hasAnyData()}
            className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-5 py-2.5 text-label-sm font-medium text-white hover:bg-sc-teal-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save All
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
