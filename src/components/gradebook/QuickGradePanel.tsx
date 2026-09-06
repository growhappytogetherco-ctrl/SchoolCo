"use client";

import { useState, useRef, useEffect } from "react";
import { X, Zap } from "lucide-react";
import type { Assignment, StudentGrade } from "@/app/actions/grading-constants";

const STATUS_SHORTCUTS: Record<string, string> = {
  m: "missing", M: "missing", e: "excused", E: "excused",
  ex: "excused", EX: "excused", a: "absent", A: "absent",
  i: "incomplete", I: "incomplete", ng: "not_graded", NG: "not_graded",
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  missing:    { label: "MISSING",    color: "text-sc-rose-700 bg-sc-rose-50 border-sc-rose-200" },
  excused:    { label: "EXCUSED",    color: "text-sc-gray bg-sc-gray-100 border-sc-gray-200" },
  absent:     { label: "ABSENT",     color: "text-sc-gold-700 bg-sc-gold-50 border-sc-gold-300" },
  incomplete: { label: "INCOMPLETE", color: "text-sc-gold-700 bg-sc-gold-50 border-sc-gold-300" },
  not_graded: { label: "NOT GRADED", color: "text-sc-gray-400 bg-sc-gray-100 border-sc-gray-100" },
};

interface StudentEntry {
  studentId: string;
  studentName: string;
  grade: StudentGrade | null;
}

interface Props {
  assignment: Assignment;
  students: StudentEntry[];
  canEdit: boolean;
  onSaveGrade: (studentId: string, assignmentId: string, status: string, points: number | null) => Promise<void>;
  onClose: () => void;
}

export function QuickGradePanel({ assignment, students, canEdit, onSaveGrade, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const s of students) {
      if (!s.grade || s.grade.grade_status === "not_graded") {
        init[s.studentId] = "";
      } else if (s.grade.grade_status === "graded") {
        init[s.studentId] = s.grade.points_earned != null ? String(s.grade.points_earned) : "";
      } else {
        init[s.studentId] = s.grade.grade_status;
      }
    }
    return init;
  });

  const [saving, setSaving] = useState<Record<string, "saving" | "saved" | "error">>({});
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => { inputRefs.current[0]?.focus(); }, []);

  function parseAndSave(studentId: string, raw: string) {
    const trimmed = raw.trim();
    let status = "not_graded";
    let points: number | null = null;

    if (trimmed === "") {
      status = "not_graded";
    } else {
      const shorthand = STATUS_SHORTCUTS[trimmed];
      if (shorthand) {
        status = shorthand;
      } else {
        const num = parseFloat(trimmed);
        if (!isNaN(num) && num >= 0) {
          status = "graded";
          points = num;
        } else {
          // Invalid — keep as-is, don't save
          return;
        }
      }
    }

    setSaving(prev => ({ ...prev, [studentId]: "saving" }));
    onSaveGrade(studentId, assignment.id, status, points).then(() => {
      setSaving(prev => ({ ...prev, [studentId]: "saved" }));
      setTimeout(() => setSaving(prev => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      }), 1500);
    }).catch(() => {
      setSaving(prev => ({ ...prev, [studentId]: "error" }));
    });
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    studentId: string,
    idx: number
  ) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      parseAndSave(studentId, values[studentId] ?? "");
      inputRefs.current[idx + 1]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      parseAndSave(studentId, values[studentId] ?? "");
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  function handleBlur(studentId: string) {
    parseAndSave(studentId, values[studentId] ?? "");
  }

  const pts = assignment.points_possible;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-sc-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Zap className="h-4 w-4 text-sc-teal" />
                <span className="text-label-sm font-medium text-sc-teal">Quick Grade</span>
              </div>
              <h2 className="font-serif text-xl text-sc-navy leading-tight">{assignment.title}</h2>
              <p className="text-label-sm text-sc-gray mt-0.5">
                {assignment.points_possible} points · {assignment.category}
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-sc-gray hover:bg-sc-gray-100 transition-colors flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
          {canEdit && (
            <p className="text-[11px] text-sc-gray-400 mt-2">
              Type score or: <span className="font-mono">M</span>=Missing · <span className="font-mono">EX</span>=Excused · <span className="font-mono">A</span>=Absent · <span className="font-mono">I</span>=Incomplete
            </p>
          )}
        </div>

        {/* Student list */}
        <div className="overflow-y-auto flex-1 divide-y divide-sc-gray-100/60">
          {students.map((s, idx) => {
            const val = values[s.studentId] ?? "";
            const state = saving[s.studentId];
            const shorthand = STATUS_SHORTCUTS[val.trim()];
            const statusMeta = shorthand ? STATUS_META[shorthand] : null;

            return (
              <div key={s.studentId} className="flex items-center gap-3 px-5 py-3">
                <span className="flex-1 text-label-md text-sc-navy font-medium truncate min-w-0">
                  {s.studentName}
                </span>

                {canEdit ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="relative">
                      <input
                        ref={el => { inputRefs.current[idx] = el; }}
                        type="text"
                        value={val}
                        onChange={e => setValues(prev => ({ ...prev, [s.studentId]: e.target.value }))}
                        onBlur={() => handleBlur(s.studentId)}
                        onKeyDown={e => handleKeyDown(e, s.studentId, idx)}
                        placeholder="—"
                        aria-label={`Score for ${s.studentName}`}
                        className={`w-20 rounded-lg border px-2 py-2 text-center text-label-sm font-medium text-sc-navy outline-none transition-colors
                          ${state === "error"   ? "border-sc-rose-400 bg-sc-rose-50" :
                            state === "saving"  ? "border-sc-gold-300" :
                            state === "saved"   ? "border-sc-teal/50 bg-sc-teal/5" :
                            statusMeta          ? "border-transparent " + statusMeta.color :
                                                  "border-sc-gray-200 focus:border-sc-teal focus:ring-2 focus:ring-sc-teal/20"}
                        `}
                      />
                    </div>
                    <span className="text-label-sm text-sc-gray-400 w-10 text-right">
                      {state === "saving" ? "…" :
                       state === "saved"  ? "✓" :
                       state === "error"  ? "!" :
                       val.trim() && !shorthand && !isNaN(parseFloat(val.trim())) ? `/${pts}` : ""}
                    </span>
                  </div>
                ) : (
                  <GradeReadOnly grade={s.grade} pointsPossible={pts} />
                )}
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-sc-gray-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-sc-teal px-4 py-2.5 text-white font-medium hover:bg-sc-teal-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function GradeReadOnly({ grade, pointsPossible }: { grade: StudentGrade | null; pointsPossible: number }) {
  if (!grade || grade.grade_status === "not_graded") return <span className="text-sc-gray-400 text-label-sm">—</span>;
  if (grade.grade_status === "graded" && grade.points_earned !== null) {
    return <span className="text-label-sm font-medium text-sc-navy">{grade.points_earned}/{pointsPossible}</span>;
  }
  const meta = STATUS_META[grade.grade_status];
  if (meta) return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${meta.color}`}>{meta.label}</span>
  );
  return null;
}
