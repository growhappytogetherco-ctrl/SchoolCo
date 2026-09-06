"use client";

import { useEffect, useState } from "react";
import { BookOpen, AlertTriangle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import {
  getStudentGradeProfile,
  getStudentCourseGradeDetail,
  type StudentGradeProfile,
  type CourseGradeDetail,
  type AssignmentGradeRow,
} from "@/app/actions/studentGrades";
import type { ParentChild } from "@/lib/supabase/server";
import type { WeightedGradeResult, QuarterGradeResult } from "@/lib/grading/types";

// ── Status labels (full text — no codes) ────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  graded:      "Graded",
  missing:     "Missing",
  excused:     "Excused",
  absent:      "Absent",
  incomplete:  "Incomplete",
  not_graded:  "Not Graded",
  blank:       "—",
};

const STATUS_COLORS: Record<string, string> = {
  graded:      "text-sc-teal-700",
  missing:     "text-sc-rose",
  excused:     "text-sc-gold-700",
  absent:      "text-sc-gray",
  incomplete:  "text-sc-gold-700",
  not_graded:  "text-sc-gray",
  blank:       "text-sc-gray-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  homework:      "Homework",
  classwork:     "Classwork",
  quiz:          "Quiz",
  test:          "Test",
  project:       "Project",
  participation: "Participation",
  lab:           "Lab",
  other:         "Other",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function GradeDisplay({ grade }: { grade: QuarterGradeResult | WeightedGradeResult }) {
  if (grade.state === "setup_required") {
    return (
      <span className="text-label-sm text-sc-gray italic">
        Current grade not available yet
        <span className="block text-sc-gray-400 text-xs mt-0.5">Grading setup is being finalized.</span>
      </span>
    );
  }
  if (grade.state === "no_grade") {
    return <span className="text-label-sm text-sc-gray italic">No grades yet</span>;
  }
  const pct = grade.display_percentage ?? "";
  const letter = grade.letter_grade ?? "";
  const val = grade.percentage ?? 0;
  const color = val >= 70 ? "text-sc-teal-700" : val >= 60 ? "text-sc-gold-700" : "text-sc-rose";
  return (
    <span className={`font-semibold ${color}`}>
      Current Grade: {pct}{letter ? ` — ${letter}` : ""}
    </span>
  );
}

function AssignmentTable({ assignments }: { assignments: AssignmentGradeRow[] }) {
  if (assignments.length === 0) {
    return <p className="text-label-sm text-sc-gray italic py-3">No assignments have been added yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-label-sm">
        <thead>
          <tr className="border-b border-sc-gray-100">
            <th className="text-left py-2 pr-3 font-medium text-sc-gray">Assignment</th>
            <th className="text-left py-2 pr-3 font-medium text-sc-gray hidden sm:table-cell">Category</th>
            <th className="text-left py-2 pr-3 font-medium text-sc-gray">Due</th>
            <th className="text-right py-2 pr-3 font-medium text-sc-gray">Score</th>
            <th className="text-left py-2 font-medium text-sc-gray">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sc-gray-100">
          {assignments.map((a) => {
            const statusLabel = STATUS_LABELS[a.gradeStatus] ?? a.gradeStatus;
            const statusColor = STATUS_COLORS[a.gradeStatus] ?? "text-sc-gray";
            const showScore = a.gradeStatus === "graded" && a.isGraded;
            return (
              <tr key={a.assignmentId} className="hover:bg-sc-gray-50/50">
                <td className="py-2 pr-3 text-sc-navy">{a.title}</td>
                <td className="py-2 pr-3 text-sc-gray hidden sm:table-cell">
                  {CATEGORY_LABELS[a.category] ?? a.category}
                </td>
                <td className="py-2 pr-3 text-sc-gray">{fmtDate(a.dueDate)}</td>
                <td className="py-2 pr-3 text-right text-sc-navy font-mono">
                  {showScore ? `${a.pointsEarned ?? 0} / ${a.pointsPossible}` : "—"}
                </td>
                <td className={`py-2 font-medium ${statusColor}`}>{statusLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Course card for parent view ──────────────────────────────────────────────

function ParentCourseCard({
  course,
  studentId,
  periodId,
}: {
  course: StudentGradeProfile["courses"][0];
  studentId: string;
  periodId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<CourseGradeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggleDetail() {
    if (!expanded && !detail) {
      setLoading(true);
      const result = await getStudentCourseGradeDetail(studentId, course.courseSectionId, periodId);
      setLoading(false);
      if (result.success) setDetail(result.data);
      else setError(result.error ?? "Failed to load course details.");
    }
    setExpanded((v) => !v);
  }

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <button
        className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-sc-gray-50/50 transition-colors"
        onClick={toggleDetail}
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-serif text-lg text-sc-navy">{course.courseName}</p>
            {course.countMissing > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sc-rose-50 border border-sc-rose-200 px-2 py-0.5 text-label-sm text-sc-rose-700 font-medium">
                <AlertTriangle className="size-3" />
                {course.countMissing} missing
              </span>
            )}
          </div>
          <p className="text-label-sm text-sc-gray mt-0.5">
            Teacher: {course.teacherName ?? "—"}
          </p>
          <div className="mt-1.5">
            <GradeDisplay grade={course.currentPeriodGrade} />
          </div>
        </div>
        <div className="shrink-0 mt-1">
          {loading ? (
            <Loader2 className="size-4 text-sc-gray animate-spin" />
          ) : expanded ? (
            <ChevronUp className="size-4 text-sc-gray" />
          ) : (
            <ChevronDown className="size-4 text-sc-gray" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-sc-gray-100 px-5 py-4 bg-sc-gray-50/30 space-y-4">
          {error && <p className="text-label-sm text-sc-rose">{error}</p>}

          {detail && (
            <>
              {/* Semester summary */}
              {detail.semesterGrade && detail.semesterGrade.state !== "no_grade" && (
                <div className="rounded-xl bg-sc-navy/5 border border-sc-navy/10 px-4 py-3">
                  <p className="text-label-sm text-sc-gray mb-0.5">
                    {detail.semesterName ?? "Semester"} — Current
                  </p>
                  <p className="font-semibold text-sc-navy">
                    {detail.semesterGrade.display_percentage}
                    {detail.semesterGrade.letter_grade && ` — ${detail.semesterGrade.letter_grade}`}
                    {detail.semesterGrade.state === "partial" && (
                      <span className="ml-2 text-label-sm font-normal text-sc-gray">(in progress)</span>
                    )}
                  </p>
                </div>
              )}

              {/* Assignment list */}
              <AssignmentTable assignments={detail.assignments} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Per-child grades section ─────────────────────────────────────────────────

function ChildGradesSection({ child }: { child: ParentChild }) {
  const [profile, setProfile] = useState<StudentGradeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);

  useEffect(() => {
    getStudentGradeProfile(child.id)
      .then((result) => {
        if (result.success) {
          setProfile(result.data);
          setActivePeriodId(result.data.currentPeriodId);
        } else {
          setError(result.error ?? "Failed to load grades.");
        }
      })
      .finally(() => setLoading(false));
  }, [child.id]);

  function selectPeriod(pid: string) {
    setActivePeriodId(pid);
    setLoading(true);
    getStudentGradeProfile(child.id, pid)
      .then((result) => {
        if (result.success) setProfile(result.data);
        else setError(result.error ?? "Failed to load grades.");
      })
      .finally(() => setLoading(false));
  }

  const displayName = child.preferred_name
    ? `${child.preferred_name} ${child.last_name}`
    : `${child.first_name} ${child.last_name}`;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-heading-2 text-sc-navy">{displayName}</h2>
          {profile && (
            <p className="text-label-sm text-sc-gray mt-0.5">
              {profile.schoolYearLabel}
              {profile.totalMissing > 0 && (
                <span className="ml-2 text-sc-rose font-medium">
                  · {profile.totalMissing} missing assignment{profile.totalMissing !== 1 ? "s" : ""}
                </span>
              )}
            </p>
          )}
        </div>

        {/* Quarter selector */}
        {profile && profile.periods.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {profile.periods.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPeriod(p.id)}
                className={`rounded-lg px-3 py-1.5 text-label-sm font-medium transition-colors ${
                  activePeriodId === p.id
                    ? "bg-sc-navy text-white"
                    : "bg-sc-gray-100 text-sc-gray hover:bg-sc-gray-200"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && !profile && (
        <div className="flex items-center gap-2 text-label-sm text-sc-gray py-4">
          <Loader2 className="size-4 animate-spin" /> Loading grades…
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose-700">
          {error}
        </p>
      )}

      {loading && profile && (
        <p className="text-label-sm text-sc-gray flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" /> Updating…
        </p>
      )}

      {profile && profile.courses.length === 0 && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 p-8 text-center">
          <BookOpen className="size-8 text-sc-gray-300 mx-auto mb-2" />
          <p className="text-body-md text-sc-gray">No active courses for this quarter.</p>
        </div>
      )}

      {profile && profile.courses.length > 0 && (
        <div className="space-y-3">
          {profile.courses.map((course) => (
            <ParentCourseCard
              key={course.courseSectionId}
              course={course}
              studentId={child.id}
              periodId={activePeriodId ?? ""}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ParentGradesView({ children }: { children: ParentChild[] }) {
  if (children.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-sc-gray-100 p-10 text-center">
        <BookOpen className="size-10 text-sc-gray-300 mx-auto mb-3" />
        <p className="font-serif text-xl text-sc-navy mb-1">No children linked</p>
        <p className="text-body-md text-sc-gray">Contact the school to link your account to your children.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {children.map((child) => (
        <ChildGradesSection key={child.id} child={child} />
      ))}
    </div>
  );
}
