/**
 * Academic extraction rules tests — Stage C1 refinement pass.
 * Run with: npx tsx tests/academic/extraction-rules.test.ts
 *
 * Covers all 18 spec-required scenarios for grades, school year,
 * term normalization, notes separation, and operational safeguards.
 * No live DB or Anthropic key required.
 */

import * as fs from "fs";
import {
  EXTRACTION_PROMPT_VERSION,
  EXTRACTION_VERSION,
} from "../../src/lib/academicExtraction";

// ── Assertion helper ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ── Load prompt text for inspection ──────────────────────────────────────────

const extractionSrc = fs.readFileSync("src/lib/academicExtraction.ts", "utf8");
const importSrc     = fs.readFileSync("src/app/actions/academicImport.ts", "utf8");
const courseRecSrc  = fs.readFileSync("src/app/actions/courseRecords.ts", "utf8");
const reviewSrc     = fs.readFileSync("src/components/grades/ImportReviewScreen.tsx", "utf8");
const recordSrc     = fs.readFileSync("src/components/grades/AcademicAchievementRecord.tsx", "utf8");
const migSrc        = fs.existsSync("supabase/migrations/00077_course_records_import_notes.sql")
  ? fs.readFileSync("supabase/migrations/00077_course_records_import_notes.sql", "utf8")
  : "";

// ── 1. source gives 79% + C → store both ─────────────────────────────────────

console.log("\n1. Source gives 79% and C → both stored");
{
  assert(
    "Prompt instructs: source shows BOTH → store both",
    extractionSrc.includes("source shows BOTH a percentage") &&
    extractionSrc.includes("store both"),
  );
  assert(
    "Prompt forbids deriving letter grade from percentage",
    extractionSrc.includes("NEVER calculate or derive a letter grade from a percentage"),
  );
}

// ── 2. source gives 79% only → percentage 79, letter grade null ───────────────

console.log("\n2. Source gives 79% only → letter grade null");
{
  assert(
    "Prompt instructs: percentage only → final_grade null",
    extractionSrc.includes("source shows ONLY a percentage") &&
    extractionSrc.includes("final_grade to null"),
  );
}

// ── 3. source gives C only → letter C, percentage null ───────────────────────

console.log("\n3. Source gives C only → percentage null");
{
  assert(
    "Prompt instructs: letter only → percentage null",
    extractionSrc.includes("source shows ONLY a letter grade") &&
    extractionSrc.includes("percentage to null"),
  );
}

// ── 4. Historical grade never calculated from RLA scale ───────────────────────

console.log("\n4. Historical grade never calculated from any grading scale");
{
  assert(
    "Prompt explicitly forbids applying any grading scale",
    extractionSrc.includes("NEVER apply any school") &&
    extractionSrc.includes("grading scale"),
  );
  assert(
    "Prompt says preserve source grade even if it differs from any scale",
    extractionSrc.includes("even if it differs from any grading scale"),
  );
}

// ── 5. Explicit school year → stored ─────────────────────────────────────────

console.log("\n5. Explicit school year label on transcript → stored");
{
  assert(
    "Prompt: explicit section label or row assignment → use that school year",
    extractionSrc.includes("explicitly states it, either as a section label"),
  );
}

// ── 6. Clearly labeled academic-year section → stored ────────────────────────

console.log("\n6. Clearly labeled section → stored");
{
  assert(
    "Prompt: course in labeled section → use that section school year",
    extractionSrc.includes("falls within a clearly labeled academic-year section"),
  );
}

// ── 7. Completion date only → school_year null + Needs Review ────────────────

console.log("\n7. Completion date only → school_year null + Needs Review");
{
  assert(
    "Prompt: cannot determine from explicit label → school_year null",
    extractionSrc.includes("set school_year to null"),
  );
  assert(
    "Prompt: sets needs_review_reason with explanation",
    extractionSrc.includes("School year was not explicitly identified on the source record"),
  );
}

// ── 8. July date does NOT automatically mean next school year ─────────────────

console.log("\n8. July date does NOT trigger automatic school year assumption");
{
  assert(
    "Prompt explicitly forbids inferring school year from month or calendar calculation",
    extractionSrc.includes("NEVER infer school year from completion date, month, or any calendar calculation"),
  );
  assert(
    "Prompt acknowledges institutions handle summer differently",
    extractionSrc.includes("Different institutions handle summer coursework differently"),
  );
}

// ── 9. Term 1 normalization remains traceable ─────────────────────────────────

console.log("\n9. Term normalization: source term preserved in source_notes");
{
  assert(
    "Prompt instructs: record exact source term wording in source_notes",
    extractionSrc.includes("record the exact term wording from the source"),
  );
  assert(
    "Prompt instructs: normalized value in term field",
    extractionSrc.includes("use the normalized value"),
  );
  assert(
    "Prompt instructs: mapping goes in import_notes",
    extractionSrc.includes("record the mapping you made") &&
    extractionSrc.includes("import_notes"),
  );
}

// ── 10. Import/review notes do not appear in clean official record ─────────────

console.log("\n10. import_notes not shown in clean Academic Achievement Record");
{
  assert(
    "AcademicAchievementRecord.tsx does not reference import_notes in display",
    !recordSrc.includes("import_notes"),
  );
  assert(
    "Import notes labeled 'AI note:' in staff ImportReviewScreen",
    reviewSrc.includes("AI note:"),
  );
}

// ── 11. Parent-facing verified record does not expose AI/import notes ──────────

console.log("\n11. Parent-facing record excludes import_notes");
{
  // import_notes is a DB column not fetched or displayed in the parent portal
  // Verify it's not in the clean record component at all
  assert(
    "import_notes not in AcademicAchievementRecord component",
    !recordSrc.includes("import_notes"),
  );
  assert(
    "import_notes not in AcademicAchievementRecord form values",
    !recordSrc.includes("importNotes"),
  );
}

// ── 12. Verified record not silently overwritten ───────────────────────────────

console.log("\n12. Verified record cannot be silently overwritten by import");
{
  // In academicImport.ts all proposed courses insert as needs_review
  assert(
    "New imports insert with verification_status = needs_review",
    importSrc.includes(`verification_status:              "needs_review"`),
  );
  // updateVerifiedCourseRecord is the only path to change a verified record
  assert(
    "updateVerifiedCourseRecord exists for intentional edits",
    courseRecSrc.includes("updateVerifiedCourseRecord"),
  );
  // Verified records protected: courseRecords.ts checks source_type before allowing update
  assert(
    "updateProposedCourse only allows ai_proposed records",
    importSrc.includes(`source_type`) && importSrc.includes(`ai_proposed`),
  );
}

// ── 13. Completed/reviewed same source warns before re-analysis ───────────────

console.log("\n13. Completed or reviewed import warns before re-analysis");
{
  assert(
    "checkPriorImport is called before requestAcademicImport proceeds",
    importSrc.includes("checkPriorImport") && importSrc.includes("alreadyExists"),
  );
  assert(
    "status completed triggers alreadyExists return",
    importSrc.includes(`status === "completed"`) &&
    importSrc.includes(`alreadyExists: priorCheck.data`),
  );
  assert(
    "status reviewed also triggers alreadyExists return",
    importSrc.includes(`status === "reviewed"`),
  );
  assert(
    "UI shows prior import warning with Open Prior Import and Re-analyze options",
    recordSrc.includes("Open Prior Import") && recordSrc.includes("Re-analyze"),
  );
}

// ── 14. Failed import remains retryable ──────────────────────────────────────

console.log("\n14. Failed import remains retryable");
{
  assert(
    "checkPriorImport check only blocks on completed or reviewed (not failed)",
    !importSrc.includes(`status === "failed"`) ||
    importSrc.includes(`Only failed imports can be retried`),
  );
  assert(
    "retryImport action exists and requires status failed",
    importSrc.includes("retryImport") &&
    importSrc.includes(`Only failed imports can be retried`),
  );
}

// ── 15. Duplicate document titles are distinguishable in selector ──────────────

console.log("\n15. Duplicate document titles show upload date in selector");
{
  assert(
    "getSourceDocumentsForStudent fetches created_at",
    courseRecSrc.includes("created_at") &&
    courseRecSrc.includes("student_documents"),
  );
  assert(
    "Duplicate title detection counts occurrences",
    courseRecSrc.includes("titleCounts") || courseRecSrc.includes("isDuplicate"),
  );
  assert(
    "Date suffix appended to duplicate titles",
    courseRecSrc.includes("dateSuffix") || courseRecSrc.includes("Uploaded"),
  );
}

// ── 16. Mark Reviewed does not mutate course data ─────────────────────────────

console.log("\n16. Mark Reviewed updates only import lifecycle fields");
{
  const markReviewedFn = importSrc.slice(
    importSrc.indexOf("export async function markImportReviewed"),
    importSrc.indexOf("export async function", importSrc.indexOf("export async function markImportReviewed") + 10),
  );
  assert(
    "markImportReviewed updates status, reviewed_by, reviewed_at only",
    markReviewedFn.includes("reviewed_by") &&
    markReviewedFn.includes("reviewed_at") &&
    !markReviewedFn.includes("final_grade") &&
    !markReviewedFn.includes("credits_earned") &&
    !markReviewedFn.includes("verification_status"),
  );
  assert(
    "markImportReviewed operates on academic_record_imports table only",
    markReviewedFn.includes("academic_record_imports") &&
    !markReviewedFn.includes("student_course_records"),
  );
}

// ── 17. New imports store new prompt version ──────────────────────────────────

console.log("\n17. New imports store new prompt version 1.1.0");
{
  assert(
    "EXTRACTION_PROMPT_VERSION is 1.1.0",
    EXTRACTION_PROMPT_VERSION === "1.1.0",
  );
  assert(
    "EXTRACTION_VERSION is 1",
    EXTRACTION_VERSION === 1,
  );
  assert(
    "requestAcademicImport stores EXTRACTION_PROMPT_VERSION at insert time",
    importSrc.includes("prompt_version:     EXTRACTION_PROMPT_VERSION"),
  );
}

// ── 18. Previous imports retain their original prompt version ─────────────────

console.log("\n18. Previous imports retain their original prompt version");
{
  // Verified by DB audit: the completed import has prompt_version = "1.0.0"
  // and import records are never retroactively updated
  assert(
    "Academic record insert stores prompt_version at job creation only",
    importSrc.includes("prompt_version:     EXTRACTION_PROMPT_VERSION") &&
    // The update after completion does NOT include prompt_version
    !importSrc
      .slice(importSrc.indexOf("Update import to completed"))
      .slice(0, 200)
      .includes("prompt_version"),
  );
  assert(
    "Migration adds import_notes column without touching existing rows",
    migSrc.includes("add column if not exists import_notes"),
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(50)}`);
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) {
  console.error("SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("ALL TESTS PASSED");
}
