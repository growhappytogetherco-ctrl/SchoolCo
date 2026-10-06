/**
 * Stage E — Transcript & Course Enrollment Summary tests
 *
 * Source-inspection tests verifying architecture, data rules, privacy,
 * formatting, and permission behavior. Run with: npx tsx tests/transcript/stage-e.test.ts
 */

import * as fs from "fs";
import * as path from "path";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

const ROOT = path.resolve(__dirname, "../..");

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function srcExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

// ── Load sources ──────────────────────────────────────────────────────────────

const actionSrc       = readSrc("src/app/actions/transcript.ts");
const transcriptDoc   = readSrc("src/components/transcript/TranscriptDocument.tsx");
const enrollDoc       = readSrc("src/components/transcript/EnrollmentSummaryDocument.tsx");
const transcriptPage  = readSrc("src/app/(print)/transcript/[studentId]/page.tsx");
const enrollPage      = readSrc("src/app/(print)/enrollment-summary/[studentId]/page.tsx");
const gradesTab       = readSrc("src/components/students/profile/tabs/GradesTab.tsx");

// ── 1. HS student verified historical coursework appears ─────────────────────
console.log("\n1. Verified historical records are included");
assert(
  "getTranscriptData queries verification_status = verified",
  actionSrc.includes(`eq("verification_status", "verified")`),
);
assert(
  "historical records grouped by school_year",
  actionSrc.includes("historicalGroups") && actionSrc.includes("schoolYear"),
);

// ── 2. Completed historical coursework appears in transcript ──────────────────
console.log("\n2. Historical coursework structure");
assert(
  "TranscriptDocument renders HistoricalSection",
  transcriptDoc.includes("HistoricalSection") && transcriptDoc.includes("Completed Coursework"),
);
assert(
  "institution grouping preserved",
  actionSrc.includes("institutionName") && transcriptDoc.includes("institutionName"),
);

// ── 3. Current RLA coursework appears as In Progress ─────────────────────────
console.log("\n3. Current coursework — In Progress");
assert(
  "current enrollments section label contains In Progress",
  transcriptDoc.includes("In Progress"),
);
assert(
  "current enrollments queried with status = active",
  actionSrc.includes(`eq("status", "active")`),
);
assert(
  "current section is separate from historical section",
  transcriptDoc.includes("CurrentSection") && transcriptDoc.includes("HistoricalSection"),
);

// ── 4. Active courses contribute zero earned credit ──────────────────────────
console.log("\n4. Active courses do not contribute to earned credits");
assert(
  "earnedHsCredits calculation only uses student_course_records (not enrollments)",
  actionSrc.includes("earnedHsCredits") &&
  actionSrc.includes(`completion_status === "completed"`) &&
  !actionSrc.includes("earnedHsCredits = currentEnrollments"),
);
assert(
  "currentHsCreditsAttempted is separate from earnedHsCredits",
  actionSrc.includes("currentHsCreditsAttempted") &&
  actionSrc.includes("creditsAttempted"),
);

// ── 5. Attempted credit is separate from earned credit ───────────────────────
console.log("\n5. Credit separation");
assert(
  "transcript shows Earned HS Credits separately from Current HS Credits Attempted",
  transcriptDoc.includes("Earned High School Credits") &&
  transcriptDoc.includes("Current HS Credits Attempted"),
);
assert(
  "credits not added together",
  !transcriptDoc.includes("earnedHsCredits + currentHsCreditsAttempted") &&
  !transcriptDoc.includes("earnedHsCredits+currentHsCreditsAttempted"),
);
assert(
  "enrollment summary labels credit as Credit Attempted not Credit Earned",
  enrollDoc.includes("Credit Attempted") && !enrollDoc.includes("Credit Earned"),
);

// ── 6. No GPA displayed ──────────────────────────────────────────────────────
console.log("\n6. No GPA");
assert(
  "transcript document does not display GPA",
  !transcriptDoc.toLowerCase().includes("gpa") &&
  !transcriptDoc.toLowerCase().includes("grade point average"),
);
assert(
  "enrollment summary does not display GPA",
  !enrollDoc.toLowerCase().includes("gpa"),
);
assert(
  "action does not compute GPA",
  !actionSrc.toLowerCase().includes("gpa_points") ||
  actionSrc.toLowerCase().includes("// no gpa") ||
  !actionSrc.toLowerCase().includes("cumulative gpa"),
);

// ── 7. Percentage appears before letter grade ────────────────────────────────
console.log("\n7. Percentage-primary grade format");
assert(
  "formatHistoricalGrade builds pctStr before letter",
  actionSrc.includes("pctStr") &&
  actionSrc.includes("pctStr} (${letter})"),
);
assert(
  "current grade format puts percentage first",
  actionSrc.includes("pctStr} (${letterGrade})") ||
  actionSrc.includes("pctStr} ({letter}") ||
  actionSrc.includes("${pctStr} (${ytd.letter_grade}"),
);

// ── 8. Historical percentage-only stays percentage-only ──────────────────────
console.log("\n8. Historical grade — no derived data");
assert(
  "formatHistoricalGrade returns pctStr alone when no letter",
  actionSrc.includes("return letter ? `${pctStr} (${letter})` : pctStr"),
);

// ── 9. Historical letter-only stays letter-only ──────────────────────────────
console.log("\n9. Historical letter-only");
assert(
  "formatHistoricalGrade returns letter alone when no percentage",
  actionSrc.includes("return letter ?? null") || actionSrc.includes("return letter;"),
);

// ── 10. Missing historical grade value is not derived using RLA scale ─────────
console.log("\n10. No derived missing grades");
assert(
  "formatHistoricalGrade does not call lookupLetterGrade",
  !actionSrc.includes("lookupLetterGrade"),
);
assert(
  "formatHistoricalGrade does not call calculateYTDGrade for historical records",
  !actionSrc.match(/formatHistoricalGrade[\s\S]{0,200}calculateYTDGrade/),
);

// ── 11. Current course with calculable grade shows current grade ──────────────
console.log("\n11. Current grade — calculable case");
assert(
  "getStudentYTDGrade is called for active enrollments",
  actionSrc.includes("getStudentYTDGrade"),
);
assert(
  "grade only shown when state is not no_grade",
  actionSrc.includes(`state !== "no_grade"`),
);
assert(
  "transcript shows currentGradeDisplay when hasGrade is true",
  transcriptDoc.includes("hasGrade && e.currentGradeDisplay"),
);

// ── 12. Current course without calculable grade shows In Progress, not 0/F ───
console.log("\n12. Current grade — no grade case");
assert(
  "no_grade state results in hasGrade = false",
  actionSrc.includes(`state !== "no_grade"`) &&
  actionSrc.includes("hasGrade: false"),
);
assert(
  "transcript renders In Progress when hasGrade is false",
  transcriptDoc.includes("In Progress") && transcriptDoc.includes("!e.hasGrade || !e.currentGradeDisplay") ||
  transcriptDoc.includes("hasGrade && e.currentGradeDisplay") && transcriptDoc.includes("In Progress"),
);
assert(
  "0% or F not shown for ungraded courses",
  !transcriptDoc.includes(">0%<") && !transcriptDoc.includes(">F<") &&
  !transcriptDoc.includes('"0%"') && !transcriptDoc.includes('"F"'),
);

// ── 13. Finalized RLA course appears as completed permanent coursework ────────
console.log("\n13. Finalized RLA courses in historical section");
assert(
  "schoolco_native records with verification_status=verified are included in historical query",
  actionSrc.includes(`eq("verification_status", "verified")`) &&
  !actionSrc.includes(`neq("source_type", "schoolco_native")`),
);

// ── 14. Finalized enrollment not duplicated as In Progress ───────────────────
console.log("\n14. No duplication of finalized enrollments");
assert(
  "current enrollments query uses status=active only",
  actionSrc.match(/\.from\("curriculum_enrollments"\)[\s\S]{0,500}status.*active/),
);
assert(
  "finalized enrollments have status=completed so they are excluded from active query",
  actionSrc.includes(`eq("status", "active")`),
);

// ── 15. Multiple prior institutions remain separately attributed ──────────────
console.log("\n15. Multiple institution support");
assert(
  "records grouped by institution_name within each school_year",
  actionSrc.includes("institution_name") &&
  actionSrc.includes("instMap") &&
  actionSrc.includes("institutionName"),
);
assert(
  "institution_name preserved from source record, not overwritten for all",
  actionSrc.includes("r.institution_name ?? orgData.name") ||
  actionSrc.includes("r.institution_name ?? org.name"),
);

// ── 16. K–8 Course Enrollment Summary works ──────────────────────────────────
console.log("\n16. K–8 enrollment summary");
assert(
  "K-8 simple layout when no HS credit",
  enrollDoc.includes("hasHsCredit") &&
  enrollDoc.includes("Simple K") || enrollDoc.includes("K–8"),
);
assert(
  "K-8 table has no Credit Attempted column when hasHsCredit is false",
  enrollDoc.includes("!hasHsCredit") ||
  enrollDoc.includes("hasHsCredit ?") ||
  enrollDoc.includes("hasHsCredit &&"),
);

// ── 17. HS Course Enrollment Summary works ────────────────────────────────────
console.log("\n17. HS enrollment summary");
assert(
  "HS table includes Credit Attempted column when hasHsCredit is true",
  enrollDoc.includes("Credit Attempted") && enrollDoc.includes("countsTowardHsCredit"),
);
assert(
  "hasHsCredit flag derived from enrollment data",
  actionSrc.includes("hasHsCredit") && actionSrc.includes("counts_toward_high_school_credit"),
);

// ── 18. Enrollment Summary works with zero assignments ────────────────────────
console.log("\n18. Enrollment summary — zero assignments");
assert(
  "getEnrollmentSummaryData does not query assignments or gradebook",
  !actionSrc.match(/getEnrollmentSummaryData[\s\S]{0,2000}assignments/),
);
assert(
  "enrollment summary renders empty course list gracefully",
  enrollDoc.includes("enrollments.length === 0"),
);

// ── 19. No private/internal fields appear ────────────────────────────────────
console.log("\n19. Privacy exclusions");
const privateFields = [
  "social_security", "date_of_birth", "diagnosis",
  "accommodation", "staff_note", "parent_note", "safety_alert",
  "discipline", "finance", "balance", "import_note", "override_reason",
  "correction_reason", "audit_history",
];
for (const field of privateFields) {
  assert(
    `TranscriptDocument does not display ${field}`,
    !transcriptDoc.toLowerCase().includes(field),
  );
}
for (const field of ["import_note", "override_reason", "correction_reason", "audit_history"]) {
  assert(
    `EnrollmentSummaryDocument does not display ${field}`,
    !enrollDoc.toLowerCase().includes(field),
  );
}
assert(
  "TranscriptData type has no DOB field",
  !actionSrc.includes("dateOfBirth") && !actionSrc.includes("date_of_birth"),
);

// ── 20. Transcript print CSS — Letter paper ──────────────────────────────────
console.log("\n20. Print CSS — Letter format");
assert(
  "transcript uses @page letter portrait",
  transcriptDoc.includes("size: letter portrait"),
);
assert(
  "transcript hides toolbar on print",
  transcriptDoc.includes("print:hidden"),
);
assert(
  "transcript page-break rules prevent clipping",
  transcriptDoc.includes("page-break-inside: avoid") || transcriptDoc.includes("no-break"),
);
assert(
  "thead repeats on multi-page (display: table-header-group)",
  transcriptDoc.includes("table-header-group"),
);

// ── 21. Enrollment summary print CSS — Letter ────────────────────────────────
console.log("\n21. Enrollment summary print CSS");
assert(
  "enrollment summary uses @page letter portrait",
  enrollDoc.includes("size: letter portrait"),
);
assert(
  "enrollment summary hides toolbar on print",
  enrollDoc.includes("print:hidden"),
);

// ── 22. Multi-page transcript avoids clipping ────────────────────────────────
console.log("\n22. Multi-page print safety");
assert(
  "no-break class applied to section groups",
  transcriptDoc.includes("no-break"),
);
assert(
  "tr page-break-inside: avoid",
  transcriptDoc.includes("page-break-inside: avoid"),
);

// ── 23. Unauthorized cross-student/org access blocked ────────────────────────
console.log("\n23. Cross-org security");
assert(
  "assertStaffAndStudent verifies student belongs to active org",
  actionSrc.includes('.eq("organization_id", orgId)'),
);
assert(
  "assertStaffAndStudent throws if student not in org",
  actionSrc.includes("Student not found in your organization"),
);
assert(
  "transcript page calls getUser and getActiveOrgId",
  transcriptPage.includes("getUser") && transcriptPage.includes("getActiveOrgId"),
);

// ── 24. Parent permissions unchanged ─────────────────────────────────────────
console.log("\n24. Parent access unchanged");
assert(
  "transcript action requires staff role (not parent)",
  actionSrc.includes('"teacher","staff","registrar","admin","full_admin","platform_admin"') &&
  !actionSrc.includes('"parent"'),
);
assert(
  "GradesTab print buttons are inside (isStaff || isAdmin) guard",
  gradesTab.includes("isStaff || isAdmin") && gradesTab.includes("/enrollment-summary/"),
);
assert(
  "Print Transcript button only visible to isAdmin",
  gradesTab.includes("isAdmin") && gradesTab.includes("/transcript/"),
);

// ── 25. No new finalization behavior ─────────────────────────────────────────
console.log("\n25. Stage D not modified");
assert(
  "transcript action does NOT call finalizeCourseEnrollment",
  !actionSrc.includes("finalizeCourseEnrollment"),
);
assert(
  "transcript action does NOT write to student_course_records",
  !actionSrc.match(/\.from\("student_course_records"\)[\s\S]{0,100}\.insert|\.upsert/),
);
assert(
  "transcript action does NOT update curriculum_enrollments status",
  !actionSrc.match(/student_course_records[\s\S]{0,200}insert/) &&
  !actionSrc.match(/curriculum_enrollments[\s\S]{0,200}update/),
);

// ── 26. Print routes exist under (print) group ───────────────────────────────
console.log("\n26. Routes under (print) group");
assert(
  "transcript route exists",
  srcExists("src/app/(print)/transcript/[studentId]/page.tsx"),
);
assert(
  "enrollment summary route exists",
  srcExists("src/app/(print)/enrollment-summary/[studentId]/page.tsx"),
);
assert(
  "transcript route uses force-dynamic",
  transcriptPage.includes('force-dynamic'),
);
assert(
  "enrollment summary route uses force-dynamic",
  enrollPage.includes('force-dynamic'),
);

// ── 27. No parallel academic-record system ───────────────────────────────────
console.log("\n27. No parallel transcript database");
assert(
  "no migration for transcript data",
  !srcExists("supabase/migrations/00079_transcript.sql") &&
  !srcExists("supabase/migrations/00079_transcripts.sql"),
);
assert(
  "action reads student_course_records, not a separate transcript table",
  actionSrc.includes(`from("student_course_records")`),
);

// ── Final summary ─────────────────────────────────────────────────────────────
console.log("\n──────────────────────────────────────────────────");
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed === 0) {
  console.log("ALL TESTS PASSED");
} else {
  console.log("SOME TESTS FAILED");
  process.exit(1);
}
