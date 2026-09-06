"use client";

import { useState, useRef, useCallback } from "react";
import type { StudentGrade } from "@/app/actions/grading-constants";
import type { CellSaveState } from "./GradebookView";

// Status shorthand inputs the teacher can type
const STATUS_SHORTCUTS: Record<string, string> = {
  m: "missing",  M: "missing",
  e: "excused",  E: "excused",
  ex: "excused", EX: "excused",
  a: "absent",   A: "absent",
  i: "incomplete", I: "incomplete",
  inc: "incomplete", INC: "incomplete",
  ng: "not_graded", NG: "not_graded",
};

const STATUS_DISPLAY: Record<string, { label: string; cls: string }> = {
  missing:    { label: "M",   cls: "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200" },
  excused:    { label: "EX",  cls: "bg-sc-gray-100 text-sc-gray border-sc-gray-200" },
  absent:     { label: "ABS", cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-300" },
  incomplete: { label: "INC", cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-300" },
  not_graded: { label: "NG",  cls: "bg-sc-gray-100 text-sc-gray-400 border-sc-gray-100" },
};

interface Props {
  grade: StudentGrade | null;
  saveState: CellSaveState;
  pointsPossible: number;
  canEdit: boolean;
  cellRef: (el: HTMLInputElement | null) => void;
  onSave: (status: string, points: number | null) => Promise<void>;
  onKeyNav: (e: React.KeyboardEvent) => void;
}

export function GradeCell({
  grade,
  saveState,
  pointsPossible,
  canEdit,
  cellRef,
  onSave,
  onKeyNav,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const prevValue = useRef<string>("");

  function getDisplayValue(): string {
    if (!grade || grade.grade_status === "not_graded") return "";
    if (grade.grade_status === "graded") {
      return grade.points_earned !== null ? String(grade.points_earned) : "";
    }
    return grade.grade_status;
  }

  function startEditing() {
    if (!canEdit) return;
    const v = getDisplayValue();
    setInputValue(v === grade?.grade_status ? "" : v);
    prevValue.current = v;
    setEditing(true);
  }

  function commitValue(raw: string) {
    const trimmed = raw.trim();

    if (trimmed === "") {
      // Clear → back to no grade
      onSave("not_graded", null);
      setEditing(false);
      return;
    }

    // Check shorthand
    const shorthand = STATUS_SHORTCUTS[trimmed];
    if (shorthand) {
      onSave(shorthand, null);
      setEditing(false);
      return;
    }

    // Numeric
    const num = parseFloat(trimmed);
    if (!isNaN(num)) {
      if (num < 0) {
        setInputValue(prevValue.current);
        setEditing(false);
        return;
      }
      onSave("graded", num);
      setEditing(false);
      return;
    }

    // Invalid — revert
    setInputValue(prevValue.current);
    setEditing(false);
  }

  function handleBlur() {
    commitValue(inputValue);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setInputValue(prevValue.current);
      setEditing(false);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      commitValue(inputValue);
      // After commitValue closes the input, allow onKeyNav to move focus
      // We need a slight delay for focus to settle
      setTimeout(() => onKeyNav(e), 0);
      return;
    }
  }

  // Cell appearance
  const borderCls =
    saveState === "error"  ? "border-sc-rose-400 bg-sc-rose-50" :
    saveState === "saving" ? "border-sc-gold-300 bg-sc-gold-50/40" :
    saveState === "saved"  ? "border-sc-teal/40 bg-sc-teal/5" :
    editing                ? "border-sc-teal bg-white shadow-sm" :
                             "border-transparent hover:border-sc-gray-200";

  if (editing) {
    return (
      <input
        ref={el => { cellRef(el); }}
        type="text"
        value={inputValue}
        onChange={e => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        className={`w-20 rounded-md border px-2 py-1.5 text-center text-label-sm text-sc-navy outline-none transition-colors ${borderCls}`}
        aria-label="Enter grade"
      />
    );
  }

  // Status badge
  const status = grade?.grade_status;
  if (status && status !== "graded" && status !== "not_graded" && STATUS_DISPLAY[status]) {
    const { label, cls } = STATUS_DISPLAY[status];
    return (
      <button
        ref={el => cellRef(el as any)}
        onClick={startEditing}
        disabled={!canEdit}
        className={`inline-flex items-center justify-center rounded-md border px-2 py-1 text-[11px] font-semibold min-w-[2.5rem] transition-colors ${cls} ${canEdit ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
        aria-label={`${status} — click to edit`}
      >
        {label}
      </button>
    );
  }

  // Numeric grade display
  if (grade?.grade_status === "graded" && grade.points_earned !== null) {
    const pct = (grade.points_earned / pointsPossible) * 100;
    const lowGrade = pct < 60;
    return (
      <button
        ref={el => cellRef(el as any)}
        onClick={startEditing}
        disabled={!canEdit}
        className={`inline-flex items-center justify-center rounded-md border px-2 py-1.5 text-label-sm font-medium min-w-[4.5rem] transition-colors
          ${lowGrade ? "text-sc-rose-700" : "text-sc-navy"}
          ${borderCls}
          ${canEdit ? "cursor-pointer" : "cursor-default"}
          ${saveState === "idle" ? "border-transparent hover:border-sc-gray-200" : ""}
        `}
        aria-label={`${grade.points_earned}/${pointsPossible} — click to edit`}
      >
        {saveState === "saving" ? (
          <span className="text-sc-gray-400 text-[10px]">…</span>
        ) : (
          <>
            <span>{grade.points_earned}</span>
            <span className="text-sc-gray-400 ml-0.5 text-[10px]">/{pointsPossible}</span>
          </>
        )}
      </button>
    );
  }

  // Empty / not graded
  return (
    <button
      ref={el => cellRef(el as any)}
      onClick={startEditing}
      disabled={!canEdit}
      className={`inline-flex items-center justify-center rounded-md border min-w-[4.5rem] h-8 transition-colors
        ${borderCls}
        ${saveState === "error" ? "" : "border-transparent"}
        ${canEdit ? "cursor-pointer hover:border-sc-gray-200 hover:bg-sc-gray-100/40" : "cursor-default"}
      `}
      aria-label="No grade — click to enter"
    >
      {saveState === "error" && (
        <span className="text-sc-rose-600 text-[10px] font-medium">ERR</span>
      )}
    </button>
  );
}
