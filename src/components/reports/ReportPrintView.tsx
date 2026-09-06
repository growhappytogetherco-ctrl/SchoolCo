"use client";

// The printable report layout.
// Used in both the staff (print) route and the parent portal report view.
// Print-first design: clean, professional, US Letter format.

import { useRef } from "react";
import type { ReportPreviewData, AttendanceSummary, ReportCourseData } from "@/app/actions/reports";

// ── Grade display helpers ─────────────────────────────────────────────────────

function gradeText(course: ReportCourseData): string {
  if (course.gradeState === "setup_required") return "Grade Pending";
  if (course.gradeState === "no_grade")       return "No Grade Yet";
  return course.displayPercentage ?? "—";
}

function letterText(course: ReportCourseData): string {
  if (course.gradeState === "setup_required") return "—";
  if (course.gradeState === "no_grade")       return "—";
  return course.letterGrade ?? "—";
}

function gradeNote(course: ReportCourseData): string | null {
  if (course.gradeState === "setup_required") return "Grading setup incomplete";
  return null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function fmtIssued(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AttendanceBlock({ att }: { att: AttendanceSummary }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-gray-50">
          <th className="text-left py-1.5 px-3 font-semibold text-gray-700 border border-gray-200">Present</th>
          <th className="text-left py-1.5 px-3 font-semibold text-gray-700 border border-gray-200">Absent</th>
          <th className="text-left py-1.5 px-3 font-semibold text-gray-700 border border-gray-200">Tardy</th>
          <th className="text-left py-1.5 px-3 font-semibold text-gray-700 border border-gray-200">Excused</th>
          <th className="text-left py-1.5 px-3 font-semibold text-gray-700 border border-gray-200">Early Dismissal</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="py-1.5 px-3 border border-gray-200 text-gray-900">{att.present}</td>
          <td className="py-1.5 px-3 border border-gray-200 text-gray-900">{att.absent}</td>
          <td className="py-1.5 px-3 border border-gray-200 text-gray-900">{att.tardy}</td>
          <td className="py-1.5 px-3 border border-gray-200 text-gray-900">{att.excused}</td>
          <td className="py-1.5 px-3 border border-gray-200 text-gray-900">{att.earlyDismissal}</td>
        </tr>
      </tbody>
    </table>
  );
}

function CourseTableQuarter({ courses }: { courses: ReportCourseData[] }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-gray-50">
          <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-200">Course</th>
          <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-200">Teacher</th>
          <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-gray-200">Percent</th>
          <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-gray-200">Grade</th>
          {courses.some((c) => c.missingCount > 0) && (
            <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-gray-200">Missing</th>
          )}
        </tr>
      </thead>
      <tbody>
        {courses.map((c, i) => (
          <tr key={c.courseSectionId} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
            <td className="py-2 px-3 border border-gray-200">
              <span className="font-medium text-gray-900">{c.courseName}</span>
              {gradeNote(c) && <span className="ml-2 text-xs text-amber-700 italic">{gradeNote(c)}</span>}
              {c.teacherComment && (
                <p className="text-xs text-gray-600 mt-0.5 italic">{c.teacherComment}</p>
              )}
            </td>
            <td className="py-2 px-3 border border-gray-200 text-gray-700">{c.teacherName ?? "—"}</td>
            <td className="py-2 px-3 border border-gray-200 text-right text-gray-900 font-mono">{gradeText(c)}</td>
            <td className="py-2 px-3 border border-gray-200 text-right font-semibold text-gray-900">{letterText(c)}</td>
            {courses.some((x) => x.missingCount > 0) && (
              <td className="py-2 px-3 border border-gray-200 text-right text-gray-700">
                {c.missingCount > 0 ? <span className="text-red-700 font-medium">{c.missingCount}</span> : "—"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CourseTableSemester({ courses }: { courses: ReportCourseData[] }) {
  const quarterNames = courses[0]?.quarterGrades?.map((q) => q.periodName) ?? [];
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="bg-gray-50">
          <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-200">Course</th>
          <th className="text-left py-2 px-3 font-semibold text-gray-700 border border-gray-200">Teacher</th>
          {quarterNames.map((qn) => (
            <th key={qn} className="text-right py-2 px-3 font-semibold text-gray-700 border border-gray-200">{qn}</th>
          ))}
          <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-gray-200">Semester</th>
          <th className="text-right py-2 px-3 font-semibold text-gray-700 border border-gray-200">Grade</th>
        </tr>
      </thead>
      <tbody>
        {courses.map((c, i) => (
          <tr key={c.courseSectionId} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/60"}>
            <td className="py-2 px-3 border border-gray-200">
              <span className="font-medium text-gray-900">{c.courseName}</span>
              {gradeNote(c) && <span className="ml-2 text-xs text-amber-700 italic">{gradeNote(c)}</span>}
              {c.teacherComment && (
                <p className="text-xs text-gray-600 mt-0.5 italic">{c.teacherComment}</p>
              )}
            </td>
            <td className="py-2 px-3 border border-gray-200 text-gray-700">{c.teacherName ?? "—"}</td>
            {(c.quarterGrades ?? []).map((q) => (
              <td key={q.periodName} className="py-2 px-3 border border-gray-200 text-right font-mono text-gray-800">
                {q.gradeState === "no_grade" ? "—" : (q.displayPercentage ?? "—")}
              </td>
            ))}
            <td className="py-2 px-3 border border-gray-200 text-right font-mono text-gray-900">{gradeText(c)}</td>
            <td className="py-2 px-3 border border-gray-200 text-right font-semibold text-gray-900">{letterText(c)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  data: ReportPreviewData;
  showToolbar?: boolean;  // false in parent portal
  isStaff?: boolean;
}

export function ReportPrintView({ data, showToolbar = true, isStaff = false }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    window.print();
  }

  const isSemester = data.reportType === "semester";
  const isProgress = data.reportType === "progress";
  const hasAnyMissing = data.courses.some((c) => c.missingCount > 0);

  // Friendly org type label — never "Private School"
  function orgDescriptor(): string {
    const t = data.orgType;
    if (t === "academy") return "Homeschool Co-op";
    if (t === "program") return "Academic Program";
    return "Learning Community";
  }

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">

      {/* ── Toolbar (screen only) ─────────────────────────────── */}
      {showToolbar && (
        <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
          <div>
            <p className="font-semibold text-gray-900">{data.reportTypeLabel}</p>
            <p className="text-sm text-gray-500">{data.studentName} · {data.schoolYearLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            {data.status === "draft" && (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
                Draft — Not Issued
              </span>
            )}
            {data.status === "issued" && (
              <span className="rounded-full bg-green-50 border border-green-200 px-3 py-1 text-xs font-medium text-green-700">
                Issued {fmtIssued(data.issuedAt)}
              </span>
            )}
            {data.status === "superseded" && (
              <span className="rounded-full bg-gray-100 border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500">
                Superseded
              </span>
            )}
            <button
              onClick={handlePrint}
              className="rounded-lg bg-[#046264] px-4 py-2 text-sm font-medium text-white hover:bg-[#035052] transition-colors"
            >
              Print / Save PDF
            </button>
          </div>
        </div>
      )}

      {/* ── Report page ─────────────────────────────────────────── */}
      {/* @page and print styles are injected via the style tag below */}
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.75in 0.75in 0.75in 0.75in; }
          body { background: white !important; }
          .print-hide { display: none !important; }
          .report-page { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          .no-break { page-break-inside: avoid; }
        }
      `}</style>

      <div className="py-8 px-4 print:py-0 print:px-0">
        <div
          ref={reportRef}
          className="report-page mx-auto bg-white shadow-md rounded-sm print:shadow-none"
          style={{ maxWidth: "816px" }}
        >
          <div className="px-12 py-10 print:px-0 print:py-0 space-y-7">

            {/* ── Header ─────────────────────────────────────────── */}
            <div className="no-break border-b-2 border-gray-800 pb-5">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{data.orgName}</h1>
                  <p className="text-sm text-gray-500 mt-0.5">{orgDescriptor()}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Academic Record</p>
                  {data.status === "draft" && (
                    <p className="text-xs text-amber-700 font-semibold mt-1 uppercase tracking-wide">Draft — Not Official</p>
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-y-1.5 text-sm">
                <div>
                  <span className="text-gray-500 font-medium">Student: </span>
                  <span className="text-gray-900 font-semibold">{data.studentName}</span>
                </div>
                {data.gradeLevel && (
                  <div>
                    <span className="text-gray-500 font-medium">Grade: </span>
                    <span className="text-gray-900">{data.gradeLevel}</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-500 font-medium">School Year: </span>
                  <span className="text-gray-900">{data.schoolYearLabel}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium">Date: </span>
                  <span className="text-gray-900">{fmtDate(data.generatedDate)}</span>
                </div>
              </div>

              <div className="mt-4">
                <h2 className="text-lg font-bold text-gray-900">{data.reportTypeLabel}</h2>
                {isProgress && (
                  <p className="text-xs text-gray-500 mt-0.5 italic">
                    Grades shown are current as of {fmtDate(data.generatedDate)} and are not finalized.
                  </p>
                )}
              </div>
            </div>

            {/* ── Academic Performance ────────────────────────────── */}
            <div className="no-break space-y-3">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-1">
                Academic Performance
              </h3>
              {data.courses.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No active courses found for this period.</p>
              ) : isSemester ? (
                <CourseTableSemester courses={data.courses} />
              ) : (
                <CourseTableQuarter courses={data.courses} />
              )}
            </div>

            {/* ── Missing work callout (progress reports) ─────────── */}
            {isProgress && hasAnyMissing && (
              <div className="no-break space-y-2">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-1">
                  Academic Concerns
                </h3>
                <ul className="text-sm space-y-1">
                  {data.courses.filter((c) => c.missingCount > 0).map((c) => (
                    <li key={c.courseSectionId} className="text-gray-700">
                      {c.courseName} — <span className="font-medium">{c.missingCount} missing assignment{c.missingCount !== 1 ? "s" : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* ── Attendance ──────────────────────────────────────── */}
            {data.attendance && (
              <div className="no-break space-y-3">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-1">
                  Attendance Summary — {data.periodName}
                </h3>
                <AttendanceBlock att={data.attendance} />
              </div>
            )}

            {/* ── General comment ─────────────────────────────────── */}
            {data.generalComment && (
              <div className="no-break space-y-2">
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide border-b border-gray-200 pb-1">
                  Academic Comment
                </h3>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{data.generalComment}</p>
              </div>
            )}

            {/* ── Signature lines ─────────────────────────────────── */}
            <div className="no-break mt-8 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-3 gap-10 text-sm">
                {["Academic Director", "Parent / Guardian", "Date"].map((label) => (
                  <div key={label}>
                    <div className="border-b border-gray-400 pb-1 mb-1">&nbsp;</div>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Footer ──────────────────────────────────────────── */}
            <div className="border-t border-gray-200 pt-4 flex items-center justify-between text-xs text-gray-400">
              <span>{data.orgName} · Academic Record</span>
              <span>Generated {fmtDate(data.generatedDate)}</span>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
