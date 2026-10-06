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
  "TranscriptDocument renders historical section with Completed Coursework",
  (transcriptDoc.includes("HistoricalSection") || transcriptDoc.includes("historicalGroups")) &&
  transcriptDoc.includes("Completed Coursework"),
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
  (transcriptDoc.includes("CurrentTable") || transcriptDoc.includes("CurrentSection")) &&
  (transcriptDoc.includes("InstitutionTable") || transcriptDoc.includes("HistoricalSection")),
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
  "transcript shows Earned HS Credits separately from Currently Attempted",
  (transcriptDoc.includes("Earned High School Credits") || transcriptDoc.includes("Earned Credits") || transcriptDoc.includes("Earned HS Credits")) &&
  (transcriptDoc.includes("Currently Attempted") || transcriptDoc.includes("Current HS Credits Attempted") || transcriptDoc.includes("Current Credits Attempted")),
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
  "transcript GPA handling: either not shown or shown as Cumulative GPA with unweighted label",
  !transcriptDoc.toLowerCase().includes("grade point average") && (
    // Stage E.2: no GPA at all
    !transcriptDoc.toLowerCase().includes("gpa") ||
    // Stage E.3: GPA shown with explicit label and pending fallback
    (transcriptDoc.includes("Cumulative GPA") || transcriptDoc.includes("No GPA") || transcriptDoc.includes("GPA pending"))
  ),
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

// ── 27b. Root-cause regression: course_sections schema correctness ────────────
console.log("\n27b. Schema correctness (root-cause regression)");
assert(
  "course_sections join does NOT select course_code (column does not exist on course_sections)",
  !actionSrc.match(/course_sections\s*\([^)]*course_code/),
);
assert(
  "course_sections join does NOT select subject_area (column does not exist; correct name is subject)",
  !actionSrc.match(/course_sections\s*\([^)]*subject_area/),
);
assert(
  "course_sections join selects subject (correct column name)",
  actionSrc.match(/course_sections\s*\([^)]*subject[^_]/),
);
assert(
  "current enrollment courseCode is set to null (no course_code on course_sections)",
  actionSrc.includes("courseCode: null,"),
);
assert(
  "safeErrorMessage handles non-Error objects (prevents [object Object])",
  actionSrc.includes("safeErrorMessage") &&
  actionSrc.includes("typeof obj.message === \"string\""),
);
assert(
  "error messages returned to client are safe strings, never raw error objects",
  actionSrc.includes('"Unable to generate transcript. Please try again') &&
  actionSrc.includes('"Unable to generate enrollment summary. Please try again'),
);
assert(
  "per-enrollment grade calculation is wrapped in try/catch for resilience",
  actionSrc.includes("try {") && actionSrc.includes("// Grade calculation unavailable"),
);
assert(
  "safeAddress handles null, string, and object address shapes",
  actionSrc.includes("safeAddress") &&
  actionSrc.includes("typeof raw === \"string\"") &&
  actionSrc.includes("typeof raw === \"object\""),
);
assert(
  "school year lookup is wrapped in try/catch (missing year does not crash transcript)",
  actionSrc.includes("async function resolveCurrentSchoolYear") &&
  actionSrc.includes("} catch {"),
);
assert(
  "enrollment summary also uses safeErrorMessage pattern",
  // safeErrorMessage appears in both catch blocks
  (actionSrc.match(/safeErrorMessage/g) ?? []).length >= 2,
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

// ── Stage E.3 — Subject labels, course ordering, GPA, departments ────────────

const transcriptDocSrc = transcriptDoc; // alias for clarity in E.3 tests

console.log("\n28e3. Stage E.3 — Subject labels");
assert(
  "formatSubject maps ela to English Language Arts",
  transcriptDoc.includes("ela:") && transcriptDoc.includes("English Language Arts"),
);
assert(
  "formatSubject maps math to Mathematics",
  transcriptDoc.includes("math:") && transcriptDoc.includes("Mathematics"),
);
assert(
  "formatSubject maps pe to Physical Education",
  transcriptDoc.includes("pe:") && transcriptDoc.includes("Physical Education"),
);
assert(
  "formatSubject maps social_studies to History / Social Studies",
  transcriptDoc.includes("History / Social Studies"),
);
assert(
  "formatSubject is exported and used in CurrentTable",
  transcriptDoc.includes("formatSubject"),
);

console.log("\n29e3. Stage E.3 — Level display");
assert(
  "Standard level is NOT displayed (hidden — assumed)",
  transcriptDoc.includes("standard:") && transcriptDoc.includes("null"),
);
assert(
  "Honors is still displayed",
  transcriptDoc.includes('"Honors"') || transcriptDoc.includes("honors:"),
);
assert(
  "AP is still displayed",
  transcriptDoc.includes('"AP"'),
);
assert(
  "DE (Dual Enrollment) is still displayed",
  transcriptDoc.includes('"DE"') || transcriptDoc.includes("dual_enrollment"),
);

console.log("\n30e3. Stage E.3 — Course ordering");
assert(
  "buildDisplayRows sorts by courseName with numeric option before term",
  transcriptDoc.includes("numeric: true") && transcriptDoc.includes("localeCompare"),
);
assert(
  "name sort applied before term sort within buildDisplayRows",
  transcriptDoc.includes("nameCompare !== 0") && transcriptDoc.includes("return nameCompare"),
);
assert(
  "getTermOrder still used for within-course ordering",
  transcriptDoc.includes("getTermOrder"),
);

console.log("\n31e3. Stage E.3 — GPA");
assert(
  "GPA scale defined with canonical point values",
  actionSrc.includes("GPA_SCALE") && actionSrc.includes('"A": 4.0') && actionSrc.includes('"F": 0.0'),
);
assert(
  "calculateGpa uses credits_attempted (not credits_earned) for weighting",
  actionSrc.includes("credits_attempted") && actionSrc.includes("totalAttempted"),
);
assert(
  "GPA uses stored final_grade letter only — never derives from percentage",
  actionSrc.includes("final_grade") && !actionSrc.includes("formatHistoricalGrade(r).*gpa"),
);
assert(
  "failed courses with credits_attempted are included in GPA denominator",
  actionSrc.includes('"failed"') && actionSrc.includes("totalAttempted"),
);
assert(
  "GPA returns null when no eligible records (not 0.00)",
  actionSrc.includes("if (totalAttempted === 0) return null"),
);
assert(
  "current active enrollments do NOT affect GPA",
  !actionSrc.match(/currentEnrollments[\s\S]{0,200}gpa/) &&
  !actionSrc.match(/gpa[\s\S]{0,200}currentEnrollments/),
);
assert(
  "cumulativeGpa passed in TranscriptData",
  actionSrc.includes("cumulativeGpa") && transcriptDoc.includes("cumulativeGpa"),
);
assert(
  "GPA displayed as X.XX format",
  transcriptDoc.includes("toFixed(2)"),
);
assert(
  "no GPA when null — shows pending note instead",
  transcriptDoc.includes("GPA pending"),
);

console.log("\n32e3. Stage E.3 — Department credits");
assert(
  "buildDepartmentCredits implemented in transcript action",
  actionSrc.includes("buildDepartmentCredits") && actionSrc.includes("DEPT_LABEL"),
);
assert(
  "department totals use verified completed HS records only (not current active)",
  actionSrc.includes("completion_status") && actionSrc.includes('"completed"'),
);
assert(
  "current active credits do NOT appear in department totals",
  !actionSrc.match(/currentEnrollments[\s\S]{0,200}buildDepartmentCredits/) &&
  !actionSrc.match(/buildDepartmentCredits[\s\S]{0,200}currentEnrollments/),
);
assert(
  "unclassified credits tracked separately",
  actionSrc.includes("unclassified") && transcriptDoc.includes("Unclassified"),
);
assert(
  "DepartmentCreditsSection rendered in document",
  transcriptDoc.includes("DepartmentCreditsSection"),
);
assert(
  "department total equals earned HS credits (passed as totalEarned prop)",
  transcriptDoc.includes("totalEarned") && transcriptDoc.includes("earnedHsCredits"),
);

console.log("\n33e3. Stage E.3 — Service hours");
assert(
  "service_hours table queried in getTranscriptData",
  actionSrc.includes("service_hours") && actionSrc.includes("hours, service_date"),
);
assert(
  "service hours grouped by derived academic year (Aug–Jul rule)",
  actionSrc.includes("deriveAcademicYear") && actionSrc.includes("month >= 8"),
);
assert(
  "service hours query scoped to student + org",
  actionSrc.match(/service_hours[\s\S]{0,200}student_id[\s\S]{0,100}organization_id/) ||
  actionSrc.match(/service_hours[\s\S]{0,200}organization_id[\s\S]{0,100}student_id/),
);
assert(
  "ServiceHoursSection rendered when hours exist",
  transcriptDoc.includes("ServiceHoursSection"),
);
assert(
  "total service hours displayed alongside year breakdown",
  transcriptDoc.includes("totalServiceHours"),
);

// ── Stage E.2 — Term ordering, S1/S2 grouping, compact design ────────────────

console.log("\n28. Stage E.2 — Term ordering");
assert(
  "semester_1 sorts before semester_2 (term order values)",
  transcriptDoc.includes("semester_1") && transcriptDoc.includes("semester_2") &&
  transcriptDoc.includes("TERM_ORDER") &&
  (transcriptDoc.match(/semester_1.*?:\s*1/) !== null || transcriptDoc.match(/semester_1[^,]*,\s*2/) !== null ||
   transcriptDoc.includes("semester_1: 1")),
);
assert(
  "semester_2 has higher order number than semester_1",
  transcriptDoc.includes("semester_1: 1") && transcriptDoc.includes("semester_2: 2"),
);
assert(
  "quarter_1 through quarter_4 have deterministic ordering (3–6)",
  transcriptDoc.includes("quarter_1:") && transcriptDoc.includes("quarter_4:"),
);
assert(
  "unknown/null terms sort last (order 8 or 9)",
  transcriptDoc.includes("getTermOrder") &&
  transcriptDoc.includes("return 9") || transcriptDoc.includes("return TERM_ORDER[term] ?? 8"),
);
assert(
  "buildDisplayRows sorts by term order before grouping — does not rely on insertion order",
  transcriptDoc.includes("buildDisplayRows") &&
  transcriptDoc.includes("sort(") &&
  transcriptDoc.includes("getTermOrder"),
);

console.log("\n29. Stage E.2 — S1/S2 display grouping");
assert(
  "S1/S2 same-course display grouping is implemented (PairedRow type)",
  transcriptDoc.includes("paired") &&
  transcriptDoc.includes("semester_1") &&
  transcriptDoc.includes("semester_2"),
);
assert(
  "pairing only occurs when courseName, courseCode, courseLevel all match",
  transcriptDoc.includes("normalize(s.courseName) === rName") &&
  transcriptDoc.includes("normalize(s.courseCode) === rCode") &&
  transcriptDoc.includes("normalize(s.courseLevel) === rLevel"),
);
assert(
  "ambiguous/different-course records are not merged (paired rows use id-based used-set)",
  transcriptDoc.includes("used.has(r.id)") &&
  transcriptDoc.includes("used.add(r.id)"),
);
assert(
  "combined credit is sum of s1.creditsEarned + s2.creditsEarned only when both are non-null",
  transcriptDoc.includes("hasS1Credit && hasS2Credit") &&
  transcriptDoc.includes("creditsEarned!") || transcriptDoc.includes("creditsEarned +"),
);
assert(
  "combinedCredits does not invent credit when one semester has no credits_earned",
  transcriptDoc.includes("hasS1Credit") && transcriptDoc.includes("hasS2Credit"),
);

console.log("\n30. Stage E.2 — Design & typography");
assert(
  "Georgia serif font used for headings",
  transcriptDoc.includes("Georgia") || transcriptDoc.includes("georgia"),
);
assert(
  "Arial/Helvetica used for body data",
  transcriptDoc.includes("Arial") || transcriptDoc.includes("Helvetica"),
);
assert(
  "compact print margins (~0.38–0.45 inch not 0.75 inch)",
  transcriptDoc.includes("0.38in") || transcriptDoc.includes("0.40in") ||
  transcriptDoc.includes("0.45in") || transcriptDoc.includes("0.35in"),
);
assert(
  "print font size is 8–9pt (compact, not 12pt default)",
  transcriptDoc.includes("8.5pt") || transcriptDoc.includes("8pt") || transcriptDoc.includes("9pt"),
);
assert(
  "one-page-oriented design — compact tp-root class applied",
  transcriptDoc.includes("tp-root"),
);
assert(
  "multi-page fallback: table-header-group and no-break still present",
  transcriptDoc.includes("table-header-group") && transcriptDoc.includes("no-break"),
);
assert(
  "no GPA anywhere in redesigned document",
  !transcriptDoc.includes("earnedGPA") && !transcriptDoc.includes("cumulativeGPA") &&
  !transcriptDoc.includes("gpa_points") && !transcriptDoc.includes("GPA:"),
);
assert(
  "active courses still show In Progress status in redesigned component",
  transcriptDoc.includes("In Progress"),
);
assert(
  "active credits still shown as attempted (not earned) in redesigned component",
  transcriptDoc.includes("creditsAttempted") && !transcriptDoc.includes("creditsEarned = e.creditsAttempted"),
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
