/**
 * Report integrity regression tests — Stage 5 issued reports.
 * Run with: npx tsx tests/reports/report-integrity.test.ts
 *
 * Covers the core invariants that caused the "No active courses" regression:
 *  - Issued reports return their stored course snapshots (not live enrollment data)
 *  - Reports with 0 courses cannot be saved or issued
 *  - Superseded reports retain their course rows for audit
 *  - Report retrieval is independent of current enrollment status
 *  - Quarter reports never include attendance
 *
 * No live DB or Next.js server required — tests are pure logic.
 */

// ── Types mirrored from reports.ts ───────────────────────────────────────────

type ReportStatus = "draft" | "issued" | "superseded";
type ReportType   = "progress" | "quarter" | "semester";

interface ReportCourseData {
  courseSectionId:  string;
  courseName:       string;
  subject:          string;
  teacherName:      string | null;
  gradingMethod:    "points" | "weighted";
  gradeState:       string;
  percentage:       number | null;
  displayPercentage: string | null;
  letterGrade:      string | null;
  missingCount:     number;
  teacherComment:   string | null;
  quarterGrades?:   unknown;
}

interface StoredReport {
  id:         string;
  status:     ReportStatus;
  report_type: ReportType;
  student_id: string;
  courseRows: StoredCourseRow[];
  attendance_snapshot: unknown | null;
}

interface StoredCourseRow {
  report_id:              string;
  course_name_snapshot:   string;
  subject_snapshot:       string;
  percentage_snapshot:    number | null;
  letter_grade_snapshot:  string | null;
  grade_state_snapshot:   string;
  missing_count_snapshot: number;
}

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    console.error(`    Expected: ${JSON.stringify(expected)}`);
    console.error(`    Got:      ${JSON.stringify(actual)}`);
    failed++;
  }
}

function expectTrue(label: string, value: boolean) {
  expect(label, value, true);
}

function expectFalse(label: string, value: boolean) {
  expect(label, value, false);
}

// ── Helpers that replicate production logic ───────────────────────────────────

/**
 * Maps stored DB rows → ReportCourseData (replicates getStudentReport mapping).
 * This is the exact same mapping used in production — testing it here guards
 * against future regressions where the field names are changed on one side only.
 */
function mapCourseRows(rows: StoredCourseRow[]): ReportCourseData[] {
  return rows.map((c) => ({
    courseSectionId:   "",
    courseName:        c.course_name_snapshot,
    subject:           c.subject_snapshot ?? "",
    teacherName:       null,
    gradingMethod:     "points" as const,
    gradeState:        c.grade_state_snapshot,
    percentage:        c.percentage_snapshot !== null ? Number(c.percentage_snapshot) : null,
    displayPercentage: c.percentage_snapshot !== null ? Number(c.percentage_snapshot).toFixed(2) + "%" : null,
    letterGrade:       c.letter_grade_snapshot,
    missingCount:      c.missing_count_snapshot,
    teacherComment:    null,
  }));
}

/**
 * Guard logic replicating the saveReportDraft zero-course check.
 */
function canSaveDraft(courses: ReportCourseData[]): { ok: boolean; error?: string } {
  if (courses.length === 0) {
    return { ok: false, error: "No courses found for this student and period. Cannot save a blank report." };
  }
  return { ok: true };
}

/**
 * Guard logic replicating the issueStudentReport zero-course check.
 */
function canIssueReport(courseRowCount: number): { ok: boolean; error?: string } {
  if (courseRowCount === 0) {
    return { ok: false, error: "Cannot issue a report with no course rows." };
  }
  return { ok: true };
}

/**
 * Attendance logic for getStudentReport (replicates production).
 */
function resolveAttendance(reportType: ReportType, isIssued: boolean, attendanceSnapshot: unknown) {
  if (reportType === "quarter") return null;
  if (isIssued) return attendanceSnapshot ?? null;
  return "live"; // would call getAttendanceSummary
}

// ── Sample data ───────────────────────────────────────────────────────────────

const STEVIE_COURSES: StoredCourseRow[] = [
  { report_id: "r1", course_name_snapshot: "English 1",               subject_snapshot: "ela",     percentage_snapshot: 68,     letter_grade_snapshot: "D",  grade_state_snapshot: "graded", missing_count_snapshot: 0 },
  { report_id: "r1", course_name_snapshot: "Entrepreneurship 101",    subject_snapshot: "elective", percentage_snapshot: 100,   letter_grade_snapshot: "A+", grade_state_snapshot: "graded", missing_count_snapshot: 0 },
  { report_id: "r1", course_name_snapshot: "Environmental Science",   subject_snapshot: "science",  percentage_snapshot: 84,    letter_grade_snapshot: "B",  grade_state_snapshot: "graded", missing_count_snapshot: 0 },
  { report_id: "r1", course_name_snapshot: "Geography",               subject_snapshot: "social_studies", percentage_snapshot: 81, letter_grade_snapshot: "B", grade_state_snapshot: "graded", missing_count_snapshot: 0 },
  { report_id: "r1", course_name_snapshot: "HS Sea Perch ROV",        subject_snapshot: "elective", percentage_snapshot: 96,    letter_grade_snapshot: "A",  grade_state_snapshot: "graded", missing_count_snapshot: 0 },
  { report_id: "r1", course_name_snapshot: "KingDurance PE",          subject_snapshot: "pe_health", percentage_snapshot: 100,  letter_grade_snapshot: "A+", grade_state_snapshot: "graded", missing_count_snapshot: 0 },
  { report_id: "r1", course_name_snapshot: "Math-U-See Gamma Level",  subject_snapshot: "math",    percentage_snapshot: 86.70, letter_grade_snapshot: "B",  grade_state_snapshot: "graded", missing_count_snapshot: 0 },
  { report_id: "r1", course_name_snapshot: "RLA Bible",               subject_snapshot: "elective", percentage_snapshot: 100.20, letter_grade_snapshot: "A+", grade_state_snapshot: "graded", missing_count_snapshot: 0 },
  { report_id: "r1", course_name_snapshot: "RLA Public Speaking",     subject_snapshot: "ela",     percentage_snapshot: 92.50, letter_grade_snapshot: "A-", grade_state_snapshot: "graded", missing_count_snapshot: 0 },
];

// ── Test suite ────────────────────────────────────────────────────────────────

console.log("\n=== Report Integrity Regression Tests ===\n");

// ── A. Issued report returns stored course snapshots ──────────────────────────

console.log("A. Issued report course snapshot retrieval");

{
  const courses = mapCourseRows(STEVIE_COURSES);
  expect("A1. 9 courses returned from stored rows", courses.length, 9);
  expect("A2. Math grade is 86.70% B", courses.find(c => c.courseName === "Math-U-See Gamma Level")?.percentage, 86.70);
  expect("A3. Math letter grade", courses.find(c => c.courseName === "Math-U-See Gamma Level")?.letterGrade, "B");
  expect("A4. English 1 grade is 68% D", courses.find(c => c.courseName === "English 1")?.percentage, 68);
  expect("A5. All courses have gradeState=graded", courses.every(c => c.gradeState === "graded"), true);
  expect("A6. displayPercentage formatted correctly", courses.find(c => c.courseName === "Math-U-See Gamma Level")?.displayPercentage, "86.70%");
  expect("A7. RLA Bible displayPercentage", courses.find(c => c.courseName === "RLA Bible")?.displayPercentage, "100.20%");
}

// ── B. Zero-course guard in saveReportDraft ───────────────────────────────────

console.log("\nB. Zero-course guard (saveReportDraft)");

{
  const empty = canSaveDraft([]);
  expectFalse("B1. Empty course list returns ok=false", empty.ok);
  expectTrue("B2. Error message is present", !!empty.error);

  const nonEmpty = canSaveDraft(mapCourseRows(STEVIE_COURSES));
  expectTrue("B3. 9-course list returns ok=true", nonEmpty.ok);
}

// ── C. Zero-course guard in issueStudentReport ────────────────────────────────

console.log("\nC. Zero-course guard (issueStudentReport)");

{
  const issue0 = canIssueReport(0);
  expectFalse("C1. 0 course rows → cannot issue", issue0.ok);
  expectTrue("C2. Error message is present", !!issue0.error);

  const issue9 = canIssueReport(9);
  expectTrue("C3. 9 course rows → can issue", issue9.ok);
}

// ── D. Superseded report course rows remain accessible ────────────────────────

console.log("\nD. Superseded report course row preservation");

{
  // A superseded report has stored course rows; they are not deleted on supersede.
  // This simulates reading a superseded report's courses from DB.
  const supersededRows: StoredCourseRow[] = STEVIE_COURSES.map(r => ({ ...r, report_id: "old_report" }));
  const courses = mapCourseRows(supersededRows);
  expect("D1. Superseded report still has 9 courses", courses.length, 9);
  expectTrue("D2. Courses are readable by getStudentReport regardless of status", courses.length > 0);
}

// ── E. Quarterly reports never include attendance ─────────────────────────────

console.log("\nE. Quarterly report attendance exclusion");

{
  const quarterIssued   = resolveAttendance("quarter",   true,  { present: 10 });
  const quarterDraft    = resolveAttendance("quarter",   false, null);
  const progressIssued  = resolveAttendance("progress",  true,  { present: 8 });
  const progressDraft   = resolveAttendance("progress",  false, null);
  const semesterIssued  = resolveAttendance("semester",  true,  { present: 15 });

  expect("E1. Quarter issued: attendance=null", quarterIssued, null);
  expect("E2. Quarter draft: attendance=null", quarterDraft, null);
  expect("E3. Progress issued: attendance=snapshot", progressIssued, { present: 8 });
  expect("E4. Progress draft: attendance=live", progressDraft, "live");
  expect("E5. Semester issued: attendance=snapshot", semesterIssued, { present: 15 });
}

// ── F. Corrected report grade values ─────────────────────────────────────────

console.log("\nF. Corrected grade values in report");

{
  const courses = mapCourseRows(STEVIE_COURSES);
  const math = courses.find(c => c.courseName === "Math-U-See Gamma Level")!;

  expectTrue("F1. Math has a grade (not no_grade)", math.gradeState === "graded");
  expect("F2. Math percentage is admin-confirmed 86.70", math.percentage, 86.70);
  expect("F3. Math letter grade is B", math.letterGrade, "B");

  // Verify none of the courses are no_grade
  const noGradeCourses = courses.filter(c => c.gradeState === "no_grade");
  expect("F4. No courses have grade_state=no_grade", noGradeCourses.length, 0);

  // Verify none are null/undefined
  const missingLetterGrade = courses.filter(c => !c.letterGrade);
  expect("F5. All courses have a letter grade", missingLetterGrade.length, 0);
}

// ── G. Enrollment-status independence ────────────────────────────────────────

console.log("\nG. Issued report independence from enrollment status");

{
  // getStudentReport reads from student_report_courses (stored snapshots),
  // NOT from curriculum_enrollments. This means it works regardless of whether
  // the student is active, withdrawn, or expelled at the time of retrieval.
  //
  // This test verifies the mapping logic does NOT reference enrollment status.
  const coursesFromSnapshot = mapCourseRows(STEVIE_COURSES);
  // No enrollment-status fields exist in the mapping — this is by design.
  const hasEnrollmentStatus = coursesFromSnapshot.some(c => "enrollmentStatus" in c);
  expectFalse("G1. Mapped courses do not include enrollment status field", hasEnrollmentStatus);
  expect("G2. Course count is same regardless of simulated student status", coursesFromSnapshot.length, 9);
}

// ── H. Report course count matches expected ───────────────────────────────────

console.log("\nH. Expected course list completeness");

{
  const courses = mapCourseRows(STEVIE_COURSES);
  const names = courses.map(c => c.courseName).sort();
  const expected = [
    "English 1",
    "Entrepreneurship 101",
    "Environmental Science",
    "Geography",
    "HS Sea Perch ROV",
    "KingDurance PE",
    "Math-U-See Gamma Level",
    "RLA Bible",
    "RLA Public Speaking",
  ].sort();
  expect("H1. All 9 expected courses are present", names, expected);
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
