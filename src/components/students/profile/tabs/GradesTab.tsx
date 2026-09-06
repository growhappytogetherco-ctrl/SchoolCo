"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, AlertTriangle, ChevronDown, ChevronUp, Loader2, ExternalLink } from "lucide-react";
import {
  getStudentGradeProfile,
  getStudentCourseGradeDetail,
  type StudentGradeProfile,
  type CourseGradeDetail,
  type GradePeriodInfo,
  type AssignmentGradeRow,
} from "@/app/actions/studentGrades";
import type { QuarterGradeResult, WeightedGradeResult } from "@/lib/grading/types";

// ── Status display labels ────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function GradeChip({ grade }: { grade: QuarterGradeResult | WeightedGradeResult }) {
  if (grade.state === "no_grade") {
    return <span className="text-label-sm text-sc-gray italic">No grades yet</span>;
  }
  const pct = grade.display_percentage ?? "";
  const letter = grade.letter_grade ?? "";
  const val = grade.percentage ?? 0;
  const color = val >= 70 ? "text-sc-teal-700" : val >= 60 ? "text-sc-gold-700" : "text-sc-rose";
  return (
    <span className={`font-semibold text-body-md ${color}`}>
      {pct} {letter && `— ${letter}`}
    </span>
  );
}

// ── Assignment detail table ──────────────────────────────────────────────────

function AssignmentTable({ assignments }: { assignments: AssignmentGradeRow[] }) {
  if (assignments.length === 0) {
    return <p className="text-label-sm text-sc-gray italic py-4">No assignments have been added yet.</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="min-w-full text-label-sm">
        <thead>
          <tr className="border-b border-sc-gray-100">
            <th className="text-left py-2 px-1 font-medium text-sc-gray">Assignment</th>
            <th className="text-left py-2 px-1 font-medium text-sc-gray">Category</th>
            <th className="text-left py-2 px-1 font-medium text-sc-gray">Due</th>
            <th className="text-right py-2 px-1 font-medium text-sc-gray">Score</th>
            <th className="text-left py-2 px-1 font-medium text-sc-gray">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-sc-gray-100">
          {assignments.map((a) => {
            const statusLabel = STATUS_LABELS[a.gradeStatus] ?? a.gradeStatus;
            const statusColor = STATUS_COLORS[a.gradeStatus] ?? "text-sc-gray";
            const showScore = a.gradeStatus === "graded" && a.isGraded;
            const scoreText = showScore
              ? `${a.pointsEarned ?? 0} / ${a.pointsPossible}`
              : "—";
            return (
              <tr key={a.assignmentId} className="hover:bg-sc-gray-50/50">
                <td className="py-2 px-1 text-sc-navy">{a.title}</td>
                <td className="py-2 px-1 text-sc-gray">{CATEGORY_LABELS[a.category] ?? a.category}</td>
                <td className="py-2 px-1 text-sc-gray">{fmtDate(a.dueDate)}</td>
                <td className="py-2 px-1 text-right text-sc-navy font-mono">{scoreText}</td>
                <td className={`py-2 px-1 font-medium ${statusColor}`}>{statusLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Course card with expandable detail ───────────────────────────────────────

function CourseCard({
  course,
  studentId,
  periodId,
  gradebookLink,
}: {
  course: StudentGradeProfile["courses"][0];
  studentId: string;
  periodId: string;
  gradebookLink: boolean;
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
      if (result.success) {
        setDetail(result.data);
      } else {
        setError(result.error ?? "Failed to load course details.");
      }
    }
    setExpanded((v) => !v);
  }

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      {/* Header row */}
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
            {course.teacherName ?? "No teacher assigned"}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <GradeChip grade={course.currentPeriodGrade} />
          {loading ? (
            <Loader2 className="size-4 text-sc-gray animate-spin" />
          ) : expanded ? (
            <ChevronUp className="size-4 text-sc-gray" />
          ) : (
            <ChevronDown className="size-4 text-sc-gray" />
          )}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-sc-gray-100 px-5 py-4 bg-sc-gray-50/30 space-y-4">
          {error && <p className="text-label-sm text-sc-rose">{error}</p>}

          {detail && (
            <>
              {/* Weighted category breakdown */}
              {"categories" in detail.quarterGrade &&
                (detail.quarterGrade as WeightedGradeResult).categories.length > 0 && (
                  <div>
                    <p className="text-label-sm font-medium text-sc-navy mb-2">Category Breakdown</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(detail.quarterGrade as WeightedGradeResult).categories
                        .filter((c) => c.is_active)
                        .map((c) => (
                          <div key={c.category} className="rounded-xl bg-white border border-sc-gray-100 px-3 py-2">
                            <p className="text-label-sm text-sc-gray">{CATEGORY_LABELS[c.category] ?? c.category} ({c.weight}%)</p>
                            <p className="font-medium text-sc-navy">
                              {c.percentage != null ? `${c.percentage.toFixed(1)}%` : "—"}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

              {/* Semester grade */}
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

              {/* Assignment table */}
              <AssignmentTable assignments={detail.assignments} />

              {/* Open gradebook link (staff only) */}
              {gradebookLink && (
                <div className="pt-1">
                  <Link
                    href={`/dashboard/courses/${course.courseSectionId}/gradebook`}
                    className="inline-flex items-center gap-1.5 text-label-sm text-sc-teal hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    Open Gradebook
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main GradesTab ────────────────────────────────────────────────────────────

interface Props {
  studentId: string;
  isAdmin?: boolean;
  isStaff?: boolean;
}

export function GradesTab({ studentId, isAdmin = false, isStaff = false }: Props) {
  const [profile, setProfile] = useState<StudentGradeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getStudentGradeProfile(studentId)
      .then((result) => {
        if (result.success) {
          setProfile(result.data);
          setActivePeriodId(result.data.currentPeriodId);
        } else {
          setError(result.error ?? "Failed to load grades.");
        }
      })
      .finally(() => setLoading(false));
  }, [studentId]);

  function selectPeriod(pid: string) {
    setActivePeriodId(pid);
    setLoading(true);
    getStudentGradeProfile(studentId, pid)
      .then((result) => {
        if (result.success) setProfile(result.data);
        else setError(result.error ?? "Failed to load grades.");
      })
      .finally(() => setLoading(false));
  }

  if (loading && !profile) {
    return (
      <div className="flex items-center justify-center py-16 text-sc-gray">
        <Loader2 className="size-5 animate-spin mr-2" /> Loading grades…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose-700">
        {error}
      </div>
    );
  }

  if (!profile) return null;

  const activePeriod = profile.periods.find((p) => p.id === activePeriodId);

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-heading-2 text-sc-navy">Grades &amp; Academics</h2>
          <p className="text-body-md text-sc-gray mt-0.5">
            {profile.schoolYearLabel}
            {profile.totalMissing > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-sc-rose font-medium">
                <AlertTriangle className="size-3.5" />
                {profile.totalMissing} missing assignment{profile.totalMissing !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>

        {/* Period selector */}
        {profile.periods.length > 0 && (
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

      {loading && (
        <div className="flex items-center gap-2 text-label-sm text-sc-gray">
          <Loader2 className="size-3.5 animate-spin" /> Updating…
        </div>
      )}

      {/* No courses */}
      {profile.courses.length === 0 && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-10 text-center">
          <BookOpen className="size-10 mx-auto mb-3 text-sc-gray-300" />
          <p className="font-serif text-heading-2 text-sc-navy">No active courses</p>
          <p className="text-body-md text-sc-gray mt-1">No active course sections have been assigned yet.</p>
        </div>
      )}

      {/* Course list */}
      <div className="space-y-3">
        {profile.courses.map((course) => (
          <CourseCard
            key={course.courseSectionId}
            course={course}
            studentId={studentId}
            periodId={activePeriodId ?? ""}
            gradebookLink={isStaff || isAdmin}
          />
        ))}
      </div>

      {/* Missing work summary */}
      {profile.totalMissing > 0 && (
        <div className="rounded-2xl border border-sc-rose-200 bg-sc-rose-50/50 p-5 space-y-3">
          <p className="font-medium text-sc-rose-700 flex items-center gap-1.5">
            <AlertTriangle className="size-4" />
            Missing Work — {activePeriod?.name ?? "Current Period"}
          </p>
          <div className="space-y-2">
            {profile.courses
              .filter((c) => c.countMissing > 0)
              .map((c) => (
                <div key={c.courseSectionId}>
                  <p className="text-label-sm font-medium text-sc-navy">{c.courseName}</p>
                  <p className="text-label-sm text-sc-rose-700">
                    {c.countMissing} missing assignment{c.countMissing !== 1 ? "s" : ""}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
