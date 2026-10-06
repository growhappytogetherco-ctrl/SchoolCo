"use client";

import type { TranscriptData, HistoricalRecord, CurrentEnrollment } from "@/app/actions/transcript";

// ── Term ordering ─────────────────────────────────────────────────────────────

const TERM_ORDER: Record<string, number> = {
  full_year:  0,
  semester_1: 1,
  semester_2: 2,
  quarter_1:  3,
  quarter_2:  4,
  quarter_3:  5,
  quarter_4:  6,
  summer:     7,
  other:      8,
};

const TERM_LABELS: Record<string, string> = {
  full_year:  "Full Year",
  semester_1: "Semester 1",
  semester_2: "Semester 2",
  quarter_1:  "Quarter 1",
  quarter_2:  "Quarter 2",
  quarter_3:  "Quarter 3",
  quarter_4:  "Quarter 4",
  summer:     "Summer",
  other:      "Other",
};

export function getTermOrder(term: string | null): number {
  if (!term) return 9;
  return TERM_ORDER[term] ?? 8;
}

function termLabel(term: string | null): string {
  if (!term) return "—";
  return TERM_LABELS[term] ?? term;
}

// ── S1/S2 display grouping ────────────────────────────────────────────────────
// Groups only when: same courseName (normalized), same courseCode, same courseLevel,
// and the two records are clearly semester_1 + semester_2.
// Does NOT merge different courses, retakes, different institutions, ambiguous records.

type PairedRow = {
  type: "paired";
  courseName: string;
  courseCode: string | null;
  courseLevel: string | null;
  s1: HistoricalRecord;
  s2: HistoricalRecord;
  combinedCredits: number | null;
};

type SingleRow = {
  type: "single";
  record: HistoricalRecord;
};

type DisplayRow = PairedRow | SingleRow;

export function buildDisplayRows(records: HistoricalRecord[]): DisplayRow[] {
  // Sort deterministically by academic term order before grouping
  const sorted = [...records].sort(
    (a, b) => getTermOrder(a.term) - getTermOrder(b.term),
  );

  const rows: DisplayRow[] = [];
  const used = new Set<string>();

  for (const r of sorted) {
    if (used.has(r.id)) continue;

    if (r.term === "semester_1") {
      const normalize = (s: string | null | undefined) =>
        (s ?? "").trim().toLowerCase();
      const rName = normalize(r.courseName);
      const rCode = normalize(r.courseCode);
      const rLevel = normalize(r.courseLevel);

      const partner = sorted.find(
        (s) =>
          !used.has(s.id) &&
          s.id !== r.id &&
          s.term === "semester_2" &&
          normalize(s.courseName) === rName &&
          normalize(s.courseCode) === rCode &&
          normalize(s.courseLevel) === rLevel,
      );

      if (partner) {
        // Only sum credits from records that actually have credits_earned set
        const hasS1Credit = r.creditsEarned != null;
        const hasS2Credit = partner.creditsEarned != null;
        const combinedCredits =
          hasS1Credit && hasS2Credit
            ? Math.round((r.creditsEarned! + partner.creditsEarned!) * 100) / 100
            : hasS1Credit
            ? r.creditsEarned
            : hasS2Credit
            ? partner.creditsEarned
            : null;

        used.add(r.id);
        used.add(partner.id);
        rows.push({
          type: "paired",
          courseName: r.courseName,
          courseCode: r.courseCode,
          courseLevel: r.courseLevel,
          s1: r,
          s2: partner,
          combinedCredits,
        });
        continue;
      }
    }

    used.add(r.id);
    rows.push({ type: "single", record: r });
  }

  return rows;
}

// ── Style helpers (inline — ensures identical print/screen rendering) ──────────

type CSSProps = { [key: string]: string | number | undefined };

const FONT_BODY = "Arial, Helvetica, sans-serif";
const FONT_HEADING = "Georgia, 'Palatino Linotype', Palatino, serif";
const NAVY = "#1a1a2e";

function th(align: "left" | "right", width?: string): CSSProps {
  return {
    textAlign: align,
    width,
    fontFamily: FONT_BODY,
    fontWeight: 700,
    fontSize: "0.8em",
    color: "#555",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "2px 4px 3px",
    borderBottom: "1px solid #888",
    whiteSpace: "nowrap",
  };
}

function td(align: "left" | "right", color = "#333"): CSSProps {
  return {
    textAlign: align,
    color,
    fontFamily: FONT_BODY,
    fontSize: "inherit",
    padding: "2px 4px 2px",
    verticalAlign: "top",
    borderBottom: "1px solid #e8e8e8",
  };
}

// ── Level / course helpers ────────────────────────────────────────────────────

const LEVEL_ABBR: Record<string, string> = {
  standard:        "Std",
  honors:          "Hon",
  ap:              "AP",
  dual_enrollment: "DE",
};

function levelAbbr(level: string | null): string | null {
  if (!level) return null;
  return LEVEL_ABBR[level] ?? level;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

// ── OrgContact ────────────────────────────────────────────────────────────────

function OrgContact({ org }: { org: TranscriptData["org"] }) {
  const lines: string[] = [];
  if (org.address) {
    if (org.address.street1) lines.push(org.address.street1);
    const city = [org.address.city, org.address.state, org.address.zip]
      .filter(Boolean).join(", ");
    if (city) lines.push(city);
  }
  if (org.phone) lines.push(org.phone);
  if (org.email) lines.push(org.email);
  if (org.website) lines.push(org.website);
  if (!lines.length) return null;
  return (
    <div style={{ fontFamily: FONT_BODY, fontSize: "9px", color: "#666", lineHeight: 1.5, textAlign: "right" }}>
      {lines.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}

// ── InstitutionTable ──────────────────────────────────────────────────────────

function InstitutionTable({ records }: { records: HistoricalRecord[] }) {
  const rows = buildDisplayRows(records);
  const hasCodes = rows.some((row) =>
    row.type === "paired" ? !!row.courseCode : !!row.record.courseCode,
  );

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_BODY, fontSize: "inherit" }}>
      <thead>
        <tr>
          <th style={th("left", "38%")}>Course</th>
          {hasCodes && <th style={th("left", "12%")}>Code</th>}
          <th style={th("left", "16%")}>Term</th>
          <th style={th("right", "18%")}>Grade</th>
          <th style={th("right", "16%")}>Credit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) =>
          row.type === "paired" ? (
            <tr key={`${row.s1.id}-${row.s2.id}`}>
              <td style={td("left")}>
                <span style={{ fontWeight: 600, color: "#111" }}>{row.courseName}</span>
                {row.courseLevel && (
                  <span style={{ marginLeft: 4, color: "#888", fontSize: "0.85em" }}>
                    {levelAbbr(row.courseLevel)}
                  </span>
                )}
              </td>
              {hasCodes && <td style={td("left", "#666")}>{row.courseCode ?? "—"}</td>}
              <td style={td("left", "#666")}>S1 / S2</td>
              <td style={td("right", "#111")}>
                <span style={{ fontWeight: 500 }}>{row.s1.gradeDisplay ?? "—"}</span>
                <span style={{ color: "#bbb", margin: "0 2px" }}>/</span>
                <span style={{ fontWeight: 500 }}>{row.s2.gradeDisplay ?? "—"}</span>
              </td>
              <td style={td("right", "#444")}>
                {(row.s1.countsTowardHsCredit || row.s2.countsTowardHsCredit) &&
                row.combinedCredits != null
                  ? `${row.combinedCredits} cr`
                  : "—"}
              </td>
            </tr>
          ) : (
            <tr key={row.record.id}>
              <td style={td("left")}>
                <span style={{ fontWeight: 600, color: "#111" }}>{row.record.courseName}</span>
                {row.record.courseLevel && (
                  <span style={{ marginLeft: 4, color: "#888", fontSize: "0.85em" }}>
                    {levelAbbr(row.record.courseLevel)}
                  </span>
                )}
              </td>
              {hasCodes && <td style={td("left", "#666")}>{row.record.courseCode ?? "—"}</td>}
              <td style={td("left", "#666")}>{termLabel(row.record.term)}</td>
              <td style={td("right", "#111")}>
                <span style={{ fontWeight: 500 }}>{row.record.gradeDisplay ?? "—"}</span>
              </td>
              <td style={td("right", "#444")}>
                {row.record.countsTowardHsCredit && row.record.creditsEarned != null
                  ? `${row.record.creditsEarned} cr`
                  : "—"}
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

// ── CurrentTable ──────────────────────────────────────────────────────────────

function CurrentTable({ enrollments }: { enrollments: CurrentEnrollment[] }) {
  const hasHs = enrollments.some((e) => e.countsTowardHsCredit);

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_BODY, fontSize: "inherit" }}>
      <thead>
        <tr>
          <th style={th("left", hasHs ? "38%" : "50%")}>Course</th>
          <th style={th("left", "25%")}>Subject / Level</th>
          <th style={th("right", hasHs ? "22%" : "25%")}>Current Grade</th>
          {hasHs && <th style={th("right", "15%")}>Credit Attempted</th>}
        </tr>
      </thead>
      <tbody>
        {enrollments.map((e) => (
          <tr key={e.id}>
            <td style={td("left")}>
              <span style={{ fontWeight: 600, color: "#111" }}>{e.courseName}</span>
            </td>
            <td style={td("left", "#666")}>
              {[e.subject, levelAbbr(e.courseLevel)].filter(Boolean).join(" · ") || "—"}
            </td>
            <td style={td("right")}>
              {e.hasGrade && e.currentGradeDisplay ? (
                <span style={{ fontWeight: 500, color: "#111" }}>{e.currentGradeDisplay}</span>
              ) : (
                <span style={{ color: "#888", fontStyle: "italic" }}>In Progress</span>
              )}
            </td>
            {hasHs && (
              <td style={td("right", "#555")}>
                {e.countsTowardHsCredit && e.creditsAttempted != null
                  ? `${e.creditsAttempted} cr`
                  : "—"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── TranscriptDocument ────────────────────────────────────────────────────────

export function TranscriptDocument({ data }: { data: TranscriptData }) {
  const hasCredits =
    data.earnedHsCredits > 0 || data.currentHsCreditsAttempted > 0;

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">

      {/* ── Toolbar (screen only) ─────────────────────────────────────────── */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div>
          <p className="font-semibold text-gray-900 text-sm">Academic Achievement Record</p>
          <p className="text-xs text-gray-500">{data.studentName} · {data.currentSchoolYear}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => window.print()}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 transition-colors"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* ── Print CSS ─────────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 0.38in 0.45in 0.38in 0.45in;
          }
          body { background: white !important; }
          .transcript-page {
            box-shadow: none !important;
            margin: 0 !important;
            border-radius: 0 !important;
          }
          .tp-root { font-size: 8.5pt !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
          .no-break { page-break-inside: avoid; }
          .print-hide { display: none !important; }
        }
      `}</style>

      {/* ── Paper ─────────────────────────────────────────────────────────── */}
      <div className="py-8 px-4 print:py-0 print:px-0">
        <div
          className="transcript-page mx-auto bg-white shadow-md print:shadow-none"
          style={{ maxWidth: "816px" }}
        >
          {/* tp-root: base font size that print CSS overrides to 8.5pt */}
          <div
            className="px-10 py-8 print:px-0 print:py-0 tp-root"
            style={{ fontFamily: FONT_BODY, fontSize: "11px", lineHeight: 1.45, color: "#222" }}
          >

            {/* ── Document header ─────────────────────────────────────────── */}
            <header className="no-break" style={{ marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                {/* Left: Logo + org name + document type */}
                <div>
                  {data.org.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.org.logoUrl}
                      alt={`${data.org.name} logo`}
                      style={{ height: "34px", width: "auto", marginBottom: "4px", display: "block", objectFit: "contain" }}
                    />
                  )}
                  <div style={{
                    fontFamily: FONT_HEADING,
                    fontWeight: 700,
                    fontSize: "17px",
                    color: NAVY,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    lineHeight: 1.2,
                  }}>
                    {data.org.name}
                  </div>
                  <div style={{
                    fontFamily: FONT_HEADING,
                    fontSize: "12px",
                    color: "#444",
                    letterSpacing: "0.05em",
                    marginTop: "2px",
                    lineHeight: 1.3,
                  }}>
                    Academic Achievement Record
                  </div>
                  <div style={{ fontFamily: FONT_BODY, fontSize: "9px", color: "#888", marginTop: "1px" }}>
                    Current Academic Transcript
                  </div>
                </div>
                {/* Right: contact + generated date */}
                <div style={{ textAlign: "right" }}>
                  <OrgContact org={data.org} />
                  <div style={{ fontFamily: FONT_BODY, fontSize: "9px", color: "#999", marginTop: "4px" }}>
                    Generated: {fmtDate(data.generatedAt)}
                  </div>
                </div>
              </div>

              {/* Student info strip */}
              <div style={{
                borderTop: `2px solid ${NAVY}`,
                borderBottom: "1px solid #bbb",
                padding: "5px 0 4px",
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr",
                gap: "12px",
              }}>
                <div>
                  <div style={{ fontSize: "7.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#777" }}>Student</div>
                  <div style={{ fontFamily: FONT_HEADING, fontSize: "13px", fontWeight: 700, color: "#111", marginTop: "1px" }}>
                    {data.studentName}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "7.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#777" }}>Grade Level</div>
                  <div style={{ fontFamily: FONT_BODY, fontSize: "11px", fontWeight: 600, color: "#111", marginTop: "1px" }}>
                    {data.gradeLevel ?? "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "7.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#777" }}>Academic Year</div>
                  <div style={{ fontFamily: FONT_BODY, fontSize: "11px", fontWeight: 600, color: "#111", marginTop: "1px" }}>
                    {data.currentSchoolYear || "—"}
                  </div>
                </div>
              </div>
            </header>

            {/* ── Completed coursework ─────────────────────────────────────── */}
            {data.historicalGroups.length > 0 && (
              <section style={{ marginBottom: "10px" }}>
                <div style={{
                  fontSize: "7.5px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#555",
                  borderBottom: "1px solid #999",
                  paddingBottom: "2px",
                  marginBottom: "6px",
                  fontFamily: FONT_BODY,
                }}>
                  Completed Coursework
                </div>
                {data.historicalGroups.map((g) => (
                  <div key={g.schoolYear} style={{ marginBottom: "8px" }}>
                    <div style={{
                      fontFamily: FONT_HEADING,
                      fontSize: "10px",
                      fontWeight: 700,
                      color: NAVY,
                      marginBottom: "3px",
                    }}>
                      {g.schoolYear}
                    </div>
                    {g.institutions.map((inst) => (
                      <div key={inst.institutionName} className="no-break" style={{ paddingLeft: "8px", marginBottom: "6px" }}>
                        <div style={{
                          fontSize: "7.5px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          color: "#888",
                          marginBottom: "2px",
                          fontFamily: FONT_BODY,
                        }}>
                          {inst.institutionName}
                        </div>
                        <InstitutionTable records={inst.records} />
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            )}

            {/* ── Current coursework ───────────────────────────────────────── */}
            {data.currentEnrollments.length > 0 && (
              <section className="no-break" style={{ marginBottom: "10px" }}>
                <div style={{
                  fontSize: "7.5px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#555",
                  borderBottom: "1px solid #999",
                  paddingBottom: "2px",
                  marginBottom: "4px",
                  fontFamily: FONT_BODY,
                }}>
                  {data.currentSchoolYear
                    ? `${data.currentSchoolYear} — Rising Leaders Academy`
                    : "Current Coursework"}
                  <span style={{ fontWeight: 400, marginLeft: "6px", color: "#aaa" }}>
                    · In Progress
                  </span>
                </div>
                <CurrentTable enrollments={data.currentEnrollments} />
              </section>
            )}

            {/* ── Credit summary ───────────────────────────────────────────── */}
            {hasCredits && (
              <div className="no-break" style={{
                border: "1px solid #ccc",
                padding: "5px 10px",
                marginBottom: "10px",
                display: "flex",
                alignItems: "center",
                gap: "20px",
                backgroundColor: "#fafafa",
              }}>
                <div style={{ fontSize: "7.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#555", fontFamily: FONT_BODY }}>
                  High School Credit Summary
                </div>
                <div style={{ display: "flex", gap: "20px", marginLeft: "4px" }}>
                  <div>
                    <span style={{ fontFamily: FONT_BODY, fontSize: "8px", color: "#777" }}>Earned Credits: </span>
                    <span style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: "12px", color: "#111" }}>
                      {data.earnedHsCredits}
                    </span>
                  </div>
                  {data.currentHsCreditsAttempted > 0 && (
                    <div>
                      <span style={{ fontFamily: FONT_BODY, fontSize: "8px", color: "#888" }}>Currently Attempted: </span>
                      <span style={{ fontFamily: FONT_HEADING, fontWeight: 600, fontSize: "12px", color: "#888" }}>
                        {data.currentHsCreditsAttempted}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ marginLeft: "auto", fontSize: "7.5px", color: "#bbb", fontStyle: "italic", fontFamily: FONT_BODY }}>
                  No GPA calculated
                </div>
              </div>
            )}

            {/* ── Signature ────────────────────────────────────────────────── */}
            <div className="no-break" style={{ borderTop: "1px solid #ccc", paddingTop: "7px", marginBottom: "7px" }}>
              <div style={{ fontSize: "7.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#666", marginBottom: "6px", fontFamily: FONT_BODY }}>
                Authorized Academic Administrator
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                {(["Printed Name", "Title", "Date"] as const).map((label) => (
                  <div key={label}>
                    <div style={{ borderBottom: "1px solid #999", height: "18px", marginBottom: "2px" }} />
                    <div style={{ fontSize: "7.5px", color: "#999", fontFamily: FONT_BODY }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Footer ───────────────────────────────────────────────────── */}
            <footer style={{ borderTop: "1px solid #e5e5e5", paddingTop: "4px" }}>
              <p style={{ fontSize: "7px", color: "#aaa", textAlign: "center", fontFamily: FONT_BODY, margin: 0, lineHeight: 1.4 }}>
                This record reflects academic history and current enrollment maintained by {data.org.name} as of{" "}
                {fmtDate(data.generatedAt)}. Courses marked In Progress have not yet been awarded final credit.
              </p>
            </footer>

          </div>
        </div>
      </div>
    </div>
  );
}
