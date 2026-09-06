"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { Plus, Zap, AlertCircle, ChevronDown, Settings } from "lucide-react";
import type { GradingPeriodInfo } from "@/app/actions/grading";
import type { GradeScaleLevel, GradeInput } from "@/lib/grading/types";
import type { GradebookData, Assignment, StudentGrade } from "@/app/actions/grading-constants";
import { getGradebookData, upsertStudentGrade, deleteStudentGrade, bulkSetGradeStatus } from "@/app/actions/grading";
import { calculatePointsGrade } from "@/lib/grading/calculator";
import { GradebookGrid } from "./GradebookGrid";
import { CreateAssignmentDrawer } from "./CreateAssignmentDrawer";
import { QuickGradePanel } from "./QuickGradePanel";

export type CellSaveState = "idle" | "saving" | "saved" | "error";

export interface LocalGradeState {
  grade: StudentGrade | null;
  cellState: CellSaveState;
}

interface Props {
  orgId: string;
  courseSectionId: string;
  courseName: string;
  subject: string;
  teacherName: string;
  schoolYearLabel: string;
  periods: GradingPeriodInfo[];
  initialPeriodId: string | null;
  gradeScaleLevels: GradeScaleLevel[];
  canEdit: boolean;
  studentCount: number;
}

export function GradebookView({
  orgId,
  courseSectionId,
  courseName,
  subject,
  teacherName,
  schoolYearLabel,
  periods,
  initialPeriodId,
  gradeScaleLevels,
  canEdit,
  studentCount,
}: Props) {
  const [activePeriodId, setActivePeriodId] = useState<string | null>(initialPeriodId);
  const [data, setData] = useState<GradebookData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // localGrades: studentId → assignmentId → LocalGradeState (optimistic)
  const [localGrades, setLocalGrades] = useState<
    Map<string, Map<string, LocalGradeState>>
  >(new Map());

  const [showCreateAssignment, setShowCreateAssignment] = useState(false);
  const [quickGradeAssignmentId, setQuickGradeAssignmentId] = useState<string | null>(null);

  // Load/reload gradebook data
  const loadData = useCallback(async (periodId: string) => {
    setLoading(true);
    setLoadError("");
    setLocalGrades(new Map());
    const result = await getGradebookData(courseSectionId, periodId, orgId);
    setLoading(false);
    if (result.success) {
      setData(result.data);
    } else {
      setLoadError(result.error ?? "Failed to load gradebook.");
    }
  }, [courseSectionId, orgId]);

  useEffect(() => {
    if (activePeriodId) loadData(activePeriodId);
  }, [activePeriodId, loadData]);

  // Get current local grade or fall back to server data
  function getEffectiveGrade(studentId: string, assignmentId: string): StudentGrade | null {
    const local = localGrades.get(studentId)?.get(assignmentId);
    if (local !== undefined) return local.grade;
    const row = data?.studentRows.find(r => r.studentId === studentId);
    return row?.grades[assignmentId] ?? null;
  }

  function getCellSaveState(studentId: string, assignmentId: string): CellSaveState {
    return localGrades.get(studentId)?.get(assignmentId)?.cellState ?? "idle";
  }

  // Compute current quarter grade for a student from local + server data
  function computeQuarterGrade(studentId: string) {
    if (!data) return null;
    const row = data.studentRows.find(r => r.studentId === studentId);
    if (!row) return null;
    const inputs: GradeInput[] = data.assignments.map(a => {
      const g = getEffectiveGrade(studentId, a.id);
      return {
        assignment_id:   a.id,
        points_possible: a.points_possible,
        points_earned:   g?.grade_status === "graded" ? (g.points_earned ?? null) : null,
        grade_status:    (g?.grade_status ?? "not_graded") as any,
        category:        a.category as any,
        is_graded:       a.is_graded,
      };
    });
    return calculatePointsGrade(inputs, gradeScaleLevels);
  }

  // Optimistic save a grade
  async function saveGrade(
    studentId: string,
    assignmentId: string,
    gradeStatus: string,
    pointsEarned: number | null
  ) {
    const assignment = data?.assignments.find(a => a.id === assignmentId);
    if (!assignment) return;

    // Build optimistic grade object
    const optimistic: StudentGrade = {
      id: `optimistic-${Date.now()}`,
      organization_id: orgId,
      assignment_id: assignmentId,
      student_id: studentId,
      points_earned: gradeStatus === "graded" ? pointsEarned : null,
      grade_status: gradeStatus,
      teacher_note: null,
      entered_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Clear grade = no row (back to blank)
    const isClearing = gradeStatus === "not_graded" && pointsEarned === null;

    setLocalGrades(prev => {
      const next = new Map(prev);
      if (!next.has(studentId)) next.set(studentId, new Map());
      next.get(studentId)!.set(assignmentId, {
        grade: isClearing ? null : optimistic,
        cellState: "saving",
      });
      return next;
    });

    try {
      let result;
      if (isClearing) {
        result = await deleteStudentGrade(assignmentId, studentId, orgId);
      } else {
        result = await upsertStudentGrade({
          orgId,
          assignmentId,
          studentId,
          pointsEarned: gradeStatus === "graded" ? pointsEarned : null,
          gradeStatus,
        });
      }

      if (result.success) {
        setLocalGrades(prev => {
          const next = new Map(prev);
          const saved = result.success && !isClearing ? (result as any).data : null;
          next.get(studentId)!.set(assignmentId, {
            grade: saved ?? (isClearing ? null : optimistic),
            cellState: "saved",
          });
          return next;
        });
        // Clear "saved" indicator after 2s
        setTimeout(() => {
          setLocalGrades(prev => {
            const next = new Map(prev);
            const existing = next.get(studentId)?.get(assignmentId);
            if (existing?.cellState === "saved") {
              next.get(studentId)!.set(assignmentId, { ...existing, cellState: "idle" });
            }
            return next;
          });
        }, 2000);
      } else {
        setLocalGrades(prev => {
          const next = new Map(prev);
          next.get(studentId)!.set(assignmentId, {
            grade: isClearing ? null : optimistic,
            cellState: "error",
          });
          return next;
        });
      }
    } catch {
      setLocalGrades(prev => {
        const next = new Map(prev);
        next.get(studentId)!.set(assignmentId, {
          grade: isClearing ? null : optimistic,
          cellState: "error",
        });
        return next;
      });
    }
  }

  async function handleBulkStatus(assignmentId: string, status: string, onlyBlank: boolean) {
    if (!data) return;
    const targetStudents = onlyBlank
      ? data.studentRows
          .filter(r => !getEffectiveGrade(r.studentId, assignmentId))
          .map(r => r.studentId)
      : data.studentRows.map(r => r.studentId);

    if (targetStudents.length === 0) return;

    const label = status === "missing" ? "Missing" : status === "absent" ? "Absent" :
                  status === "excused" ? "Excused" : status;
    if (!confirm(`Mark ${targetStudents.length} student${targetStudents.length !== 1 ? "s" : ""} as ${label}?`)) return;

    await bulkSetGradeStatus(assignmentId, targetStudents, status, orgId);
    if (activePeriodId) await loadData(activePeriodId);
  }

  const activePeriod = periods.find(p => p.id === activePeriodId);
  const quarterPeriods = periods.filter(p => p.period_type === "quarter");
  const hasStudents = (data?.studentRows.length ?? studentCount) > 0;
  const hasAssignments = (data?.assignments.length ?? 0) > 0;

  // Missing assignment count across all students
  const missingCount = data
    ? data.studentRows.reduce((sum, row) =>
        sum + data.assignments.filter(a => {
          const g = getEffectiveGrade(row.studentId, a.id);
          return g?.grade_status === "missing";
        }).length, 0)
    : 0;

  const quickGradeAssignment = quickGradeAssignmentId
    ? data?.assignments.find(a => a.id === quickGradeAssignmentId) ?? null
    : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="rounded-full bg-sc-teal/10 px-2.5 py-0.5 text-label-sm font-medium text-sc-teal">
                {subject}
              </span>
            </div>
            <h1 className="font-serif text-heading-1 text-sc-navy">{courseName}</h1>
            <p className="text-label-sm text-sc-gray mt-0.5">
              {teacherName} · {schoolYearLabel}
            </p>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 bg-sc-gray-100/60 rounded-xl p-1 self-start sm:self-center">
            {quarterPeriods.map(p => (
              <button
                key={p.id}
                onClick={() => setActivePeriodId(p.id)}
                className={`px-3 py-1.5 rounded-lg text-label-sm font-medium transition-colors ${
                  activePeriodId === p.id
                    ? "bg-white text-sc-navy shadow-sm"
                    : "text-sc-gray hover:text-sc-navy"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCreateAssignment(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sc-teal px-3.5 py-2 text-label-sm font-medium text-white hover:bg-sc-teal-700 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Assignment
          </button>
          {hasAssignments && (
            <button
              onClick={() => setQuickGradeAssignmentId(data!.assignments[data!.assignments.length - 1].id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sc-teal text-sc-teal px-3.5 py-2 text-label-sm font-medium hover:bg-sc-teal/5 transition-colors"
            >
              <Zap className="h-4 w-4" />
              Quick Grade
            </button>
          )}
          {missingCount > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700 font-medium">
              <AlertCircle className="h-3.5 w-3.5" />
              {missingCount} Missing
            </div>
          )}
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-12 text-center">
          <div className="animate-pulse text-sc-gray">Loading gradebook…</div>
        </div>
      ) : loadError ? (
        <div className="rounded-2xl bg-sc-rose-50 border border-sc-rose-200 p-6 text-sc-rose-700 text-sm">
          {loadError}
        </div>
      ) : !hasStudents ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-12 text-center space-y-3">
          <p className="text-sc-gray">No students are enrolled in this course yet.</p>
          <a
            href={`/dashboard/courses/${courseSectionId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sc-teal px-4 py-2 text-white text-label-sm font-medium hover:bg-sc-teal-700 transition-colors"
          >
            Manage Roster
          </a>
        </div>
      ) : !hasAssignments ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-12 text-center space-y-3">
          <p className="text-sc-gray font-medium text-sc-navy">
            No assignments in {activePeriod?.name ?? "this period"} yet.
          </p>
          <p className="text-label-sm text-sc-gray">Create an assignment to start entering grades.</p>
          {canEdit && (
            <button
              onClick={() => setShowCreateAssignment(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sc-teal px-4 py-2 text-white text-label-sm font-medium hover:bg-sc-teal-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Assignment
            </button>
          )}
        </div>
      ) : (
        <GradebookGrid
          data={data!}
          canEdit={canEdit}
          getEffectiveGrade={getEffectiveGrade}
          getCellSaveState={getCellSaveState}
          computeQuarterGrade={computeQuarterGrade}
          onSaveGrade={saveGrade}
          onBulkStatus={handleBulkStatus}
          onQuickGrade={(assignmentId) => setQuickGradeAssignmentId(assignmentId)}
          onEditAssignment={() => activePeriodId && loadData(activePeriodId)}
        />
      )}

      {/* Create Assignment Drawer */}
      {showCreateAssignment && activePeriodId && (
        <CreateAssignmentDrawer
          orgId={orgId}
          courseSectionId={courseSectionId}
          periodId={activePeriodId}
          periodName={activePeriod?.name ?? ""}
          periodStart={activePeriod?.start_date ?? ""}
          periodEnd={activePeriod?.end_date ?? ""}
          onClose={() => setShowCreateAssignment(false)}
          onCreated={() => {
            setShowCreateAssignment(false);
            if (activePeriodId) loadData(activePeriodId);
          }}
        />
      )}

      {/* Quick Grade Panel */}
      {quickGradeAssignment && data && (
        <QuickGradePanel
          assignment={quickGradeAssignment}
          students={data.studentRows.map(r => ({
            studentId: r.studentId,
            studentName: r.studentName,
            grade: getEffectiveGrade(r.studentId, quickGradeAssignment.id),
          }))}
          canEdit={canEdit}
          onSaveGrade={saveGrade}
          onClose={() => setQuickGradeAssignmentId(null)}
        />
      )}
    </div>
  );
}
