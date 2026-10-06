"use client";

import type { EnrollmentSummaryData } from "@/app/actions/transcript";

const COURSE_LEVEL_LABELS: Record<string, string> = {
  standard:        "Standard",
  honors:          "Honors",
  ap:              "AP",
  dual_enrollment: "Dual Enrollment",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function OrgAddress({ address }: { address: EnrollmentSummaryData["org"]["address"] }) {
  if (!address) return null;
  const parts = [
    address.street1,
    [address.city, address.state, address.zip].filter(Boolean).join(", "),
  ].filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className="text-xs text-gray-600">
      {parts.map((p, i) => <div key={i}>{p}</div>)}
    </div>
  );
}

export function EnrollmentSummaryDocument({ data }: { data: EnrollmentSummaryData }) {
  const { enrollments, hasHsCredit } = data;

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">

      {/* ── Toolbar (screen only) ─────────────────────────────── */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div>
          <p className="font-semibold text-gray-900">Course Enrollment Summary</p>
          <p className="text-sm text-gray-500">{data.studentName} · {data.currentSchoolYear}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: letter portrait; margin: 0.75in 0.75in 0.75in 0.75in; }
          body { background: white !important; }
          .enrollment-page { box-shadow: none !important; margin: 0 !important; border-radius: 0 !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          .no-break { page-break-inside: avoid; }
        }
      `}</style>

      <div className="py-8 px-4 print:py-0 print:px-0">
        <div
          className="enrollment-page mx-auto bg-white shadow-md rounded-sm print:shadow-none"
          style={{ maxWidth: "816px" }}
        >
          <div className="px-12 py-10 print:px-0 print:py-0 space-y-7">

            {/* ── Header ──────────────────────────────────────── */}
            <header className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  {data.org.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.org.logoUrl}
                      alt={`${data.org.name} logo`}
                      className="h-12 w-auto mb-2 object-contain"
                    />
                  )}
                  <h1 className="text-xl font-bold tracking-tight text-gray-900">
                    {data.org.name}
                  </h1>
                  <OrgAddress address={data.org.address} />
                  {(data.org.phone || data.org.email || data.org.website) && (
                    <div className="text-xs text-gray-500 space-x-3">
                      {data.org.phone && <span>{data.org.phone}</span>}
                      {data.org.email && <span>{data.org.email}</span>}
                      {data.org.website && <span>{data.org.website}</span>}
                    </div>
                  )}
                </div>
                <div className="text-right text-xs text-gray-500 space-y-0.5">
                  <p className="text-sm font-semibold uppercase tracking-widest text-gray-700">
                    Course Enrollment Summary
                  </p>
                  <p>Generated: {fmtDate(data.generatedAt)}</p>
                </div>
              </div>

              <div className="border-t border-b border-gray-300 py-3 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Student</span>
                  <p className="font-semibold text-gray-900">{data.studentName}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Grade</span>
                  <p className="font-semibold text-gray-900">{data.gradeLevel ?? "—"}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">School Year</span>
                  <p className="font-semibold text-gray-900">{data.currentSchoolYear || "—"}</p>
                </div>
              </div>
            </header>

            {/* ── Course list ──────────────────────────────────── */}
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 border-b border-gray-300 pb-1 mb-3">
                Current Courses
              </h2>

              {enrollments.length === 0 ? (
                <p className="text-sm text-gray-500 italic">No active course enrollments found.</p>
              ) : hasHsCredit ? (
                // HS-capable table with credit column
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-200">
                      <th className="text-left font-medium py-1 w-2/5">Course</th>
                      <th className="text-left font-medium py-1">Subject / Level</th>
                      <th className="text-left font-medium py-1">Term</th>
                      <th className="text-right font-medium py-1">Credit Attempted</th>
                      <th className="text-right font-medium py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e) => (
                      <tr key={e.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-1.5 pr-2">
                          <span className="font-medium text-gray-900">{e.courseName}</span>
                          {e.courseCode && (
                            <span className="ml-2 text-xs text-gray-400">{e.courseCode}</span>
                          )}
                        </td>
                        <td className="py-1.5 text-xs text-gray-600">
                          {[
                            e.subject,
                            e.courseLevel ? COURSE_LEVEL_LABELS[e.courseLevel] ?? e.courseLevel : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="py-1.5 text-xs text-gray-600">{e.term ?? "—"}</td>
                        <td className="py-1.5 text-right text-gray-700">
                          {e.countsTowardHsCredit && e.creditsAttempted != null
                            ? `${e.creditsAttempted} cr`
                            : "—"}
                        </td>
                        <td className="py-1.5 text-right">
                          <span className="text-xs text-gray-500 italic">In Progress</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                // Simple K–8 list — no HS credit clutter
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-200">
                      <th className="text-left font-medium py-1 w-1/2">Course</th>
                      <th className="text-left font-medium py-1">Subject</th>
                      <th className="text-right font-medium py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e) => (
                      <tr key={e.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-gray-900">{e.courseName}</td>
                        <td className="py-1.5 text-xs text-gray-600">{e.subject ?? "—"}</td>
                        <td className="py-1.5 text-right">
                          <span className="text-xs text-gray-500 italic">In Progress</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* ── Footer ───────────────────────────────────────── */}
            <footer className="border-t border-gray-200 pt-4 text-xs text-gray-500 text-center">
              <p>
                This document reflects current course enrollment maintained by {data.org.name} as of{" "}
                {fmtDate(data.generatedAt)}. Enrollment status is subject to change.
              </p>
            </footer>

          </div>
        </div>
      </div>
    </div>
  );
}
