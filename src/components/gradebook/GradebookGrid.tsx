"use client";

import { useRef, useCallback } from "react";
import { MoreHorizontal, ChevronDown, Edit2, Archive } from "lucide-react";
import type { GradebookData, Assignment, StudentGrade } from "@/app/actions/grading-constants";
import type { QuarterGradeResult } from "@/lib/grading/types";
import type { CellSaveState } from "./GradebookView";
import { archiveAssignment } from "@/app/actions/grading";
import { GradeCell } from "./GradeCell";

interface Props {
  data: GradebookData;
  canEdit: boolean;
  getEffectiveGrade: (studentId: string, assignmentId: string) => StudentGrade | null;
  getCellSaveState: (studentId: string, assignmentId: string) => CellSaveState;
  computeQuarterGrade: (studentId: string) => QuarterGradeResult | null;
  onSaveGrade: (studentId: string, assignmentId: string, status: string, points: number | null) => Promise<void>;
  onBulkStatus: (assignmentId: string, status: string, onlyBlank: boolean) => Promise<void>;
  onQuickGrade: (assignmentId: string) => void;
  onEditAssignment: () => void;
}

const CATEGORY_ABBR: Record<string, string> = {
  homework: "HW", classwork: "CW", project: "Proj", quiz: "Quiz",
  test: "Test", participation: "Part", lab: "Lab", other: "Other",
};

export function GradebookGrid({
  data,
  canEdit,
  getEffectiveGrade,
  getCellSaveState,
  computeQuarterGrade,
  onSaveGrade,
  onBulkStatus,
  onQuickGrade,
  onEditAssignment,
}: Props) {
  // Grid ref for keyboard navigation: cellRefs[rowIdx][colIdx]
  const cellRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());

  function setCellRef(studentId: string, assignmentId: string, el: HTMLInputElement | null) {
    cellRefs.current.set(`${studentId}:${assignmentId}`, el);
  }

  const focusCell = useCallback((studentId: string, assignmentId: string) => {
    const el = cellRefs.current.get(`${studentId}:${assignmentId}`);
    el?.focus();
    el?.select();
  }, []);

  function handleKeyNavigation(
    e: React.KeyboardEvent,
    rowIdx: number,
    colIdx: number
  ) {
    const rows = data.studentRows;
    const cols = data.assignments;
    let nextRow = rowIdx;
    let nextCol = colIdx;

    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      nextRow = Math.min(rowIdx + 1, rows.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      nextRow = Math.max(rowIdx - 1, 0);
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      if (colIdx < cols.length - 1) {
        nextCol = colIdx + 1;
      } else {
        nextCol = 0;
        nextRow = Math.min(rowIdx + 1, rows.length - 1);
      }
    } else if (e.key === "Tab" && e.shiftKey) {
      e.preventDefault();
      if (colIdx > 0) {
        nextCol = colIdx - 1;
      } else {
        nextCol = cols.length - 1;
        nextRow = Math.max(rowIdx - 1, 0);
      }
    } else {
      return;
    }

    focusCell(rows[nextRow].studentId, cols[nextCol].id);
  }

  async function handleArchiveAssignment(assignment: Assignment) {
    if (!confirm(`Archive "${assignment.title}"? Grades will be preserved.`)) return;
    await archiveAssignment(assignment.id, data.assignments[0]?.organization_id ?? "");
    onEditAssignment();
  }

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
      {/* Horizontal scroll wrapper */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: `${Math.max(600, 220 + data.assignments.length * 110)}px` }}>
          <thead>
            <tr className="border-b border-sc-gray-100">
              {/* Sticky student name column */}
              <th className="sticky left-0 z-20 bg-sc-gray-100/80 backdrop-blur-sm text-left px-4 py-3 text-label-sm font-medium text-sc-gray w-44 min-w-[11rem]">
                Student
              </th>

              {/* Assignment columns */}
              {data.assignments.map(a => (
                <th key={a.id} className="bg-sc-gray-100/60 px-2 py-2 text-center min-w-[6.5rem]">
                  <AssignmentHeaderCell
                    assignment={a}
                    canEdit={canEdit}
                    onQuickGrade={() => onQuickGrade(a.id)}
                    onArchive={() => handleArchiveAssignment(a)}
                    onBulkStatus={(status, onlyBlank) => onBulkStatus(a.id, status, onlyBlank)}
                  />
                </th>
              ))}

              {/* Current grade column */}
              <th className="bg-sc-gray-100/60 px-4 py-3 text-right text-label-sm font-medium text-sc-gray min-w-[8rem]">
                Current
              </th>
            </tr>
          </thead>

          <tbody>
            {data.studentRows.map((row, rowIdx) => {
              const qGrade = computeQuarterGrade(row.studentId);
              return (
                <tr
                  key={row.studentId}
                  className="border-b border-sc-gray-100/60 hover:bg-sc-gray-100/20 transition-colors group"
                >
                  {/* Sticky student name */}
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-sc-gray-100/20 px-4 py-2 font-medium text-sc-navy text-label-md border-r border-sc-gray-100/60 transition-colors">
                    <span className="truncate block max-w-[10rem]" title={row.studentName}>
                      {row.studentName}
                    </span>
                  </td>

                  {/* Grade cells */}
                  {data.assignments.map((a, colIdx) => (
                    <td key={a.id} className="px-1 py-1 text-center">
                      <GradeCell
                        grade={getEffectiveGrade(row.studentId, a.id)}
                        saveState={getCellSaveState(row.studentId, a.id)}
                        pointsPossible={a.points_possible}
                        canEdit={canEdit}
                        cellRef={el => setCellRef(row.studentId, a.id, el)}
                        onSave={(status, points) =>
                          onSaveGrade(row.studentId, a.id, status, points)
                        }
                        onKeyNav={(e) => handleKeyNavigation(e, rowIdx, colIdx)}
                      />
                    </td>
                  ))}

                  {/* Current quarter grade */}
                  <td className="px-4 py-2 text-right">
                    <QuarterGradeDisplay grade={qGrade} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Assignment header cell ────────────────────────────────────────────────────

function AssignmentHeaderCell({
  assignment,
  canEdit,
  onQuickGrade,
  onArchive,
  onBulkStatus,
}: {
  assignment: Assignment;
  canEdit: boolean;
  onQuickGrade: () => void;
  onArchive: () => void;
  onBulkStatus: (status: string, onlyBlank: boolean) => void;
}) {
  return (
    <div className="space-y-0.5 relative group/header">
      <div className="font-medium text-sc-navy text-xs leading-tight text-center truncate max-w-[6rem] mx-auto" title={assignment.title}>
        {assignment.title}
      </div>
      <div className="text-sc-gray-400 text-[10px] text-center">
        {CATEGORY_ABBR[assignment.category] ?? assignment.category} · {assignment.points_possible}pts
      </div>
      {canEdit && (
        <div className="absolute right-0 top-0 opacity-0 group-hover/header:opacity-100 transition-opacity">
          <AssignmentMenu
            onQuickGrade={onQuickGrade}
            onArchive={onArchive}
            onBulkStatus={onBulkStatus}
          />
        </div>
      )}
    </div>
  );
}

function AssignmentMenu({
  onQuickGrade,
  onArchive,
  onBulkStatus,
}: {
  onQuickGrade: () => void;
  onArchive: () => void;
  onBulkStatus: (status: string, onlyBlank: boolean) => void;
}) {
  return (
    <div className="relative group/menu">
      <button className="p-0.5 rounded text-sc-gray hover:text-sc-navy hover:bg-white transition-colors">
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      <div className="absolute right-0 top-full z-30 hidden group-hover/menu:block bg-white rounded-xl shadow-xl border border-sc-gray-100 py-1 w-44">
        <button
          onClick={onQuickGrade}
          className="w-full text-left px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-100/60 transition-colors"
        >
          Quick Grade
        </button>
        <div className="border-t border-sc-gray-100 my-1" />
        <div className="px-3 py-1 text-[10px] text-sc-gray-400 font-medium uppercase tracking-wide">Mark blank as</div>
        {[
          { status: "missing",   label: "Missing" },
          { status: "absent",    label: "Absent" },
          { status: "excused",   label: "Excused" },
          { status: "not_graded", label: "Not Graded" },
        ].map(({ status, label }) => (
          <button
            key={status}
            onClick={() => onBulkStatus(status, true)}
            className="w-full text-left px-3 py-1.5 text-label-sm text-sc-navy hover:bg-sc-gray-100/60 transition-colors"
          >
            {label}
          </button>
        ))}
        <div className="border-t border-sc-gray-100 my-1" />
        <button
          onClick={onArchive}
          className="w-full text-left px-3 py-2 text-label-sm text-sc-rose-700 hover:bg-sc-rose-50 transition-colors"
        >
          Archive Assignment
        </button>
      </div>
    </div>
  );
}

// ── Quarter grade display ─────────────────────────────────────────────────────

function QuarterGradeDisplay({ grade }: { grade: QuarterGradeResult | null }) {
  if (!grade || grade.state === "no_grade") {
    return <span className="text-sc-gray-400 text-label-sm">—</span>;
  }
  return (
    <div className="text-right">
      <span className="font-medium text-sc-navy text-label-md">
        {grade.display_percentage ?? "—"}
      </span>
      {grade.letter_grade && (
        <span className="ml-1.5 text-sc-teal font-semibold text-label-sm">
          {grade.letter_grade}
        </span>
      )}
    </div>
  );
}
