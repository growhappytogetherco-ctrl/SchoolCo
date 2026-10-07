"use client";

import type {
  TranscriptData,
  HistoricalRecord,
  CurrentEnrollment,
  DepartmentCredit,
  ServiceYearSummary,
} from "@/app/actions/transcript";

// ── Subject labels ────────────────────────────────────────────────────────────
// Maps raw enum values from course_sections.subject / curriculum_enrollments.subject
// to professionally capitalized display labels.

const SUBJECT_LABEL: Record<string, string> = {
  ela:             "English Language Arts",
  english:         "English Language Arts",
  english_ela:     "English Language Arts",
  reading:         "Reading",
  writing:         "Writing",
  math:            "Mathematics",
  mathematics:     "Mathematics",
  science:         "Science",
  history:         "History / Social Studies",
  social_studies:  "History / Social Studies",
  pe:              "Physical Education",
  pe_health:       "Physical Education / Health",
  bible:           "Bible",
  leadership:      "Leadership",
  entrepreneurship:"Entrepreneurship",
  stem:            "STEM",
  art:             "Fine Arts",
  fine_arts:       "Fine Arts",
  music:           "Music",
  world_language:  "Foreign Language",
  foreign_language:"Foreign Language",
  career_technical:"Career & Technical Education",
  elective:        "Elective",
  other:           "Other",
};

export function formatSubject(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (key in SUBJECT_LABEL) return SUBJECT_LABEL[key];
  // Fallback: title-case the raw value so at minimum it's capitalized
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  // Sort by course name (numeric-aware) then term order — determines display sequence
  const sorted = [...records].sort((a, b) => {
    const nameCompare = a.courseName.localeCompare(b.courseName, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (nameCompare !== 0) return nameCompare;
    return getTermOrder(a.term) - getTermOrder(b.term);
  });

  const rows: DisplayRow[] = [];
  const used = new Set<string>();

  for (const r of sorted) {
    if (used.has(r.id)) continue;

    if (r.term === "semester_1") {
      const normalize = (s: string | null | undefined) =>
        (s ?? "").trim().toLowerCase();
      const rName  = normalize(r.courseName);
      const rCode  = normalize(r.courseCode);
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
        const hasS1Credit = r.creditsEarned != null;
        const hasS2Credit = partner.creditsEarned != null;
        const combinedCredits =
          hasS1Credit && hasS2Credit
            ? Math.round((r.creditsEarned! + partner.creditsEarned!) * 100) / 100
            : hasS1Credit ? r.creditsEarned
            : hasS2Credit ? partner.creditsEarned
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

// ── Style helpers ─────────────────────────────────────────────────────────────

type CSSProps = Record<string, string | number | undefined>;

const FONT_BODY    = "Arial, Helvetica, sans-serif";
const FONT_HEADING = "Georgia, 'Palatino Linotype', Palatino, serif";
const NAVY         = "#1a1a2e";
const TEXT_DARK    = "#111";
const TEXT_MED     = "#444";
const TEXT_DIM     = "#666";
const RULE         = "#aaa";
const RULE_LIGHT   = "#ddd";

// Level abbreviations — Standard is assumed, only non-standard shown
const LEVEL_ABBR: Record<string, string | null> = {
  standard:        null,   // hidden — standard is assumed
  honors:          "Honors",
  ap:              "AP",
  dual_enrollment: "DE",
};

function levelAbbr(level: string | null): string | null {
  if (!level) return null;
  const val = LEVEL_ABBR[level];
  return val === undefined ? level : val; // unknown values shown as-is
}

function th(align: "left" | "right", width?: string): CSSProps {
  return {
    textAlign: align,
    width,
    fontFamily: FONT_BODY,
    fontWeight: 700,
    fontSize: "0.8em",
    color: TEXT_DIM,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    padding: "2px 4px 3px",
    borderBottom: `1px solid ${RULE}`,
    whiteSpace: "nowrap",
  };
}

function td(align: "left" | "right", color = TEXT_MED): CSSProps {
  return {
    textAlign: align,
    color,
    fontFamily: FONT_BODY,
    fontSize: "inherit",
    padding: "2px 4px 2px",
    verticalAlign: "top",
    borderBottom: `1px solid ${RULE_LIGHT}`,
  };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

export function fmtCredit(n: number | null | undefined): string | null {
  if (n == null) return null;
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

export function stripCreditAnnotation(name: string): string {
  return name.replace(/\s*\(\d+(?:\.\d+)?\s+credits?\)\s*$/i, "").trim();
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
  if (org.phone)   lines.push(org.phone);
  if (org.email)   lines.push(org.email);
  if (org.website) lines.push(org.website);
  if (!lines.length) return null;
  return (
    <div style={{ fontFamily: FONT_BODY, fontSize: "9px", color: TEXT_DIM, lineHeight: 1.5, textAlign: "right" }}>
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
        {rows.map((row) =>
          row.type === "paired" ? (
            <tr key={`${row.s1.id}-${row.s2.id}`}>
              <td style={td("left")}>
                <span style={{ fontWeight: 600, color: TEXT_DARK }}>{stripCreditAnnotation(row.courseName)}</span>
                {levelAbbr(row.courseLevel) && (
                  <span style={{ marginLeft: 4, color: TEXT_DIM, fontSize: "0.85em" }}>
                    {levelAbbr(row.courseLevel)}
                  </span>
                )}
              </td>
              {hasCodes && <td style={td("left")}>{row.courseCode ?? "—"}</td>}
              <td style={td("left")}>S1 / S2</td>
              <td style={td("right", TEXT_DARK)}>
                <span style={{ fontWeight: 500 }}>{row.s1.gradeDisplay ?? "—"}</span>
                <span style={{ color: "#bbb", margin: "0 2px" }}>/</span>
                <span style={{ fontWeight: 500 }}>{row.s2.gradeDisplay ?? "—"}</span>
              </td>
              <td style={td("right")}>
                {(row.s1.countsTowardHsCredit || row.s2.countsTowardHsCredit) &&
                row.combinedCredits != null
                  ? `${fmtCredit(row.combinedCredits)} cr`
                  : "—"}
              </td>
            </tr>
          ) : (
            <tr key={row.record.id}>
              <td style={td("left")}>
                <span style={{ fontWeight: 600, color: TEXT_DARK }}>{stripCreditAnnotation(row.record.courseName)}</span>
                {levelAbbr(row.record.courseLevel) && (
                  <span style={{ marginLeft: 4, color: TEXT_DIM, fontSize: "0.85em" }}>
                    {levelAbbr(row.record.courseLevel)}
                  </span>
                )}
              </td>
              {hasCodes && <td style={td("left")}>{row.record.courseCode ?? "—"}</td>}
              <td style={td("left")}>{termLabel(row.record.term)}</td>
              <td style={td("right", TEXT_DARK)}>
                <span style={{ fontWeight: 500 }}>{row.record.gradeDisplay ?? "—"}</span>
              </td>
              <td style={td("right")}>
                {row.record.countsTowardHsCredit && row.record.creditsEarned != null
                  ? `${fmtCredit(row.record.creditsEarned)} cr`
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
          <th style={th("left", "24%")}>Subject</th>
          <th style={th("right", hasHs ? "22%" : "26%")}>Current Grade</th>
          {hasHs && <th style={th("right", "16%")}>Credit Attempted</th>}
        </tr>
      </thead>
      <tbody>
        {enrollments.map((e) => (
          <tr key={e.id}>
            <td style={td("left")}>
              <span style={{ fontWeight: 600, color: TEXT_DARK }}>{stripCreditAnnotation(e.courseName)}</span>
              {levelAbbr(e.courseLevel) && (
                <span style={{ marginLeft: 4, color: TEXT_DIM, fontSize: "0.85em" }}>
                  {levelAbbr(e.courseLevel)}
                </span>
              )}
            </td>
            <td style={td("left")}>{formatSubject(e.subject) ?? "—"}</td>
            <td style={td("right")}>
              {e.hasGrade && e.currentGradeDisplay ? (
                <span style={{ fontWeight: 500, color: TEXT_DARK }}>{e.currentGradeDisplay}</span>
              ) : (
                <span style={{ color: TEXT_DIM, fontStyle: "italic" }}>In Progress</span>
              )}
            </td>
            {hasHs && (
              <td style={td("right")}>
                {e.countsTowardHsCredit && e.creditsAttempted != null
                  ? `${fmtCredit(e.creditsAttempted)} cr`
                  : "—"}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── DepartmentCreditsSection ──────────────────────────────────────────────────

function DepartmentCreditsSection({
  departments,
  unclassified,
  totalEarned,
}: {
  departments: DepartmentCredit[];
  unclassified: number;
  totalEarned: number;
}) {
  const rows = [...departments];
  if (unclassified > 0) rows.push({ department: "Unclassified", credits: unclassified });
  if (!rows.length) return null;

  return (
    <section className="no-break" style={{ marginBottom: "10px" }}>
      <div style={sectionHeadStyle()}>Credits Earned by Department</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_BODY, fontSize: "inherit" }}>
        <thead>
          <tr>
            <th style={th("left", "70%")}>Department</th>
            <th style={th("right", "30%")}>Credits Earned</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.department}>
              <td style={td("left", TEXT_MED)}>{d.department}</td>
              <td style={td("right", TEXT_DARK)}>
                <span style={{ fontWeight: 500 }}>{fmtCredit(d.credits)}</span>
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: `1px solid ${RULE}` }}>
            <td style={{ ...td("left"), fontWeight: 700, color: TEXT_DARK }}>Total</td>
            <td style={{ ...td("right"), fontWeight: 700, color: TEXT_DARK }}>{fmtCredit(totalEarned)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

// ── ServiceHoursSection ───────────────────────────────────────────────────────

function ServiceHoursSection({
  serviceHours,
  total,
}: {
  serviceHours: ServiceYearSummary[];
  total: number;
}) {
  if (!serviceHours.length) return null;

  return (
    <section className="no-break" style={{ marginBottom: "10px" }}>
      <div style={sectionHeadStyle()}>Community Service Hours</div>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "baseline" }}>
        {serviceHours.map((s) => (
          <div key={s.schoolYear} style={{ fontFamily: FONT_BODY, fontSize: "inherit" }}>
            <span style={{ color: TEXT_DIM, fontSize: "0.85em" }}>{s.schoolYear}: </span>
            <span style={{ fontWeight: 600, color: TEXT_DARK }}>{s.hours}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontFamily: FONT_BODY, fontSize: "inherit" }}>
          <span style={{ color: TEXT_DIM, fontSize: "0.85em" }}>Total: </span>
          <span style={{ fontWeight: 700, color: TEXT_DARK }}>{total}</span>
        </div>
      </div>
    </section>
  );
}

// ── Shared section heading style ──────────────────────────────────────────────

function sectionHeadStyle(): CSSProps {
  return {
    fontSize: "7.5px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: TEXT_DIM,
    borderBottom: `1px solid ${RULE}`,
    paddingBottom: "2px",
    marginBottom: "4px",
    fontFamily: FONT_BODY,
  };
}

// ── TranscriptDocument ────────────────────────────────────────────────────────

export function TranscriptDocument({ data }: { data: TranscriptData }) {
  const hasCredits =
    data.earnedHsCredits > 0 || data.currentHsCreditsAttempted > 0;
  const hasDepartments =
    data.departmentCredits.length > 0 || data.unclassifiedHsCredits > 0;
  const hasService = data.serviceHours.length > 0;

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
          <div
            className="px-10 py-8 print:px-0 print:py-0 tp-root"
            style={{ fontFamily: FONT_BODY, fontSize: "11px", lineHeight: 1.45, color: TEXT_MED }}
          >

            {/* ── Header ────────────────────────────────────────────────── */}
            <header className="no-break" style={{ marginBottom: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div>
                  {data.org.logoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.org.logoUrl}
                      alt={`${data.org.name} logo`}
                      style={{ height: "34px", width: "auto", marginBottom: "4px", display: "block", objectFit: "contain" }}
                    />
                  )}
                  <div style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: "17px", color: NAVY, letterSpacing: "0.06em", textTransform: "uppercase", lineHeight: 1.2 }}>
                    {data.org.name}
                  </div>
                  <div style={{ fontFamily: FONT_HEADING, fontSize: "12px", color: TEXT_MED, letterSpacing: "0.05em", marginTop: "2px", lineHeight: 1.3 }}>
                    Academic Achievement Record
                  </div>
                  <div style={{ fontFamily: FONT_BODY, fontSize: "9px", color: TEXT_DIM, marginTop: "1px" }}>
                    Current Academic Transcript — Homeschool Co-op
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <OrgContact org={data.org} />
                  <div style={{ fontFamily: FONT_BODY, fontSize: "9px", color: "#999", marginTop: "4px" }}>
                    Generated: {fmtDate(data.generatedAt)}
                  </div>
                </div>
              </div>

              {/* Student info strip */}
              <div style={{ borderTop: `2px solid ${NAVY}`, borderBottom: `1px solid ${RULE}`, padding: "5px 0 4px", display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "7.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TEXT_DIM }}>Student</div>
                  <div style={{ fontFamily: FONT_HEADING, fontSize: "13px", fontWeight: 700, color: TEXT_DARK, marginTop: "1px" }}>{data.studentName}</div>
                </div>
                <div>
                  <div style={{ fontSize: "7.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TEXT_DIM }}>Grade Level</div>
                  <div style={{ fontFamily: FONT_BODY, fontSize: "11px", fontWeight: 600, color: TEXT_DARK, marginTop: "1px" }}>{data.gradeLevel ?? "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "7.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TEXT_DIM }}>Academic Year</div>
                  <div style={{ fontFamily: FONT_BODY, fontSize: "11px", fontWeight: 600, color: TEXT_DARK, marginTop: "1px" }}>{data.currentSchoolYear || "—"}</div>
                </div>
              </div>
            </header>

            {/* ── Completed coursework ──────────────────────────────────── */}
            {data.historicalGroups.length > 0 && (
              <section style={{ marginBottom: "10px" }}>
                <div style={sectionHeadStyle()}>Completed Coursework</div>
                {data.historicalGroups.map((g) => (
                  <div key={g.schoolYear} style={{ marginBottom: "8px" }}>
                    <div style={{ fontFamily: FONT_HEADING, fontSize: "10px", fontWeight: 700, color: NAVY, marginBottom: "3px" }}>
                      {g.schoolYear}
                    </div>
                    {g.institutions.map((inst) => (
                      <div key={inst.institutionName} className="no-break" style={{ paddingLeft: "8px", marginBottom: "6px" }}>
                        <div style={{ fontSize: "7.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#999", marginBottom: "2px", fontFamily: FONT_BODY }}>
                          {inst.institutionName}
                        </div>
                        <InstitutionTable records={inst.records} />
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            )}

            {/* ── Current coursework ────────────────────────────────────── */}
            {data.currentEnrollments.length > 0 && (
              <section className="no-break" style={{ marginBottom: "10px" }}>
                <div style={sectionHeadStyle()}>
                  {data.currentSchoolYear
                    ? `${data.currentSchoolYear} — Rising Leaders Academy`
                    : "Current Coursework"}
                  <span style={{ fontWeight: 400, marginLeft: "6px", color: "#aaa" }}>· In Progress</span>
                </div>
                <CurrentTable enrollments={data.currentEnrollments} />
              </section>
            )}

            {/* ── High School Summary ───────────────────────────────────── */}
            {hasCredits && (
              <div className="no-break" style={{ border: `1px solid ${RULE}`, padding: "6px 10px", marginBottom: "10px", backgroundColor: "#fafafa" }}>
                <div style={{ fontSize: "7.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TEXT_DIM, fontFamily: FONT_BODY, marginBottom: "4px" }}>
                  High School Summary
                </div>
                <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "baseline" }}>
                  <div>
                    <span style={{ fontFamily: FONT_BODY, fontSize: "8px", color: TEXT_DIM }}>Earned Credits: </span>
                    <span style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: "12px", color: TEXT_DARK }}>{fmtCredit(data.earnedHsCredits)}</span>
                  </div>
                  {data.currentHsCreditsAttempted > 0 && (
                    <div>
                      <span style={{ fontFamily: FONT_BODY, fontSize: "8px", color: TEXT_DIM }}>Current Credits Attempted: </span>
                      <span style={{ fontFamily: FONT_HEADING, fontWeight: 600, fontSize: "12px", color: TEXT_MED }}>{fmtCredit(data.currentHsCreditsAttempted)}</span>
                    </div>
                  )}
                  {data.cumulativeGpa !== null ? (
                    <div>
                      <span style={{ fontFamily: FONT_BODY, fontSize: "8px", color: TEXT_DIM }}>Cumulative GPA (Unweighted): </span>
                      <span style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: "12px", color: TEXT_DARK }}>{data.cumulativeGpa.toFixed(2)}</span>
                    </div>
                  ) : (
                    <div style={{ marginLeft: "auto", fontSize: "7.5px", color: "#bbb", fontStyle: "italic", fontFamily: FONT_BODY }}>
                      GPA not available
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Credits by Department ─────────────────────────────────── */}
            {hasDepartments && (
              <DepartmentCreditsSection
                departments={data.departmentCredits}
                unclassified={data.unclassifiedHsCredits}
                totalEarned={data.earnedHsCredits}
              />
            )}

            {/* ── Community Service ─────────────────────────────────────── */}
            {hasService && (
              <ServiceHoursSection
                serviceHours={data.serviceHours}
                total={data.totalServiceHours}
              />
            )}

            {/* ── Signature ─────────────────────────────────────────────── */}
            <div className="no-break" style={{ borderTop: `1px solid ${RULE}`, paddingTop: "7px", marginBottom: "7px" }}>
              <div style={{ fontSize: "7.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: TEXT_DIM, marginBottom: "6px", fontFamily: FONT_BODY }}>
                Authorized Academic Administrator
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                {(["Printed Name", "Title", "Date"] as const).map((label) => (
                  <div key={label}>
                    <div style={{ borderBottom: `1px solid ${RULE}`, height: "18px", marginBottom: "2px" }} />
                    <div style={{ fontSize: "7.5px", color: "#999", fontFamily: FONT_BODY }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Footer ────────────────────────────────────────────────── */}
            <footer style={{ borderTop: `1px solid ${RULE_LIGHT}`, paddingTop: "4px" }}>
              <p style={{ fontSize: "7px", color: "#aaa", textAlign: "center", fontFamily: FONT_BODY, margin: 0, lineHeight: 1.4 }}>
                This record reflects academic history and current enrollment maintained by {data.org.name} as of{" "}
                {fmtDate(data.generatedAt)}. Courses marked In Progress have not yet been awarded final credit.
                GPA is unweighted and based on verified completed coursework only.
              </p>
            </footer>

          </div>
        </div>
      </div>
    </div>
  );
}
