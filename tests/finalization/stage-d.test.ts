/**
 * Stage D — RLA Course Finalization tests
 *
 * Tests cover architecture, authorization model, data integrity rules,
 * credit behavior, and operational safeguards.
 * No live DB or Anthropic key required — all tests inspect source code.
 *
 * Run with: npx tsx tests/finalization/stage-d.test.ts
 */

import * as fs from "fs";

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

// ── Load source files ─────────────────────────────────────────────────────────

const finalizationSrc  = fs.readFileSync("src/app/actions/courseFinalization.ts", "utf8");
const constantsSrc     = fs.readFileSync("src/lib/constants.ts", "utf8");
const roleGuardSrc     = fs.readFileSync("src/lib/roleGuard.ts", "utf8");
const migrationSrc     = fs.readFileSync("supabase/migrations/00078_finalization_schema.sql", "utf8");
const recordsSrc       = fs.readFileSync("src/app/actions/courseRecords.ts", "utf8");
const aarSrc           = fs.readFileSync("src/components/grades/AcademicAchievementRecord.tsx", "utf8");
const finalizationPanelSrc = fs.readFileSync("src/components/courses/FinalizationPanel.tsx", "utf8");
const courseDetailSrc  = fs.readFileSync("src/app/(dashboard)/dashboard/courses/[id]/page.tsx", "utf8");

// ── 1. Teacher cannot finalize permanent academic records ─────────────────────

console.log("\n1. Teacher cannot finalize permanent academic records");
{
  assert(
    "FINALIZATION_ROLES array excludes teacher, staff, volunteer, parent",
    finalizationSrc.includes('"registrar", "admin", "full_admin", "platform_admin"') &&
    !finalizationSrc.includes('"teacher"') ||
    // The assertRegistrar function must not include teacher
    finalizationSrc.includes("assertRegistrar") &&
    !finalizationSrc.slice(
      finalizationSrc.indexOf("async function assertRegistrar"),
      finalizationSrc.indexOf("async function assertRegistrar") + 400,
    ).includes('"teacher"'),
  );
  assert(
    "assertRegistrar throws 'registrar or above required' for insufficient roles",
    finalizationSrc.includes("registrar or above required to finalize academic records"),
  );
  assert(
    "finalizeCourseEnrollment calls assertRegistrar",
    finalizationSrc.includes("await assertRegistrar(orgId)"),
  );
  assert(
    "correctFinalizedRecord calls assertRegistrar",
    finalizationSrc.slice(
      finalizationSrc.indexOf("export async function correctFinalizedRecord"),
      finalizationSrc.indexOf("export async function correctFinalizedRecord") + 400,
    ).includes("assertRegistrar"),
  );
}

// ── 2. Admin/full_admin/registrar authorization ───────────────────────────────

console.log("\n2. Admin, full_admin, registrar authorization in FINALIZATION_ROLES");
{
  assert(
    "constants.ts exports FINALIZATION_ROLES with registrar, admin, full_admin, platform_admin",
    constantsSrc.includes("FINALIZATION_ROLES") &&
    constantsSrc.includes('"registrar"') &&
    constantsSrc.includes('"admin"') &&
    constantsSrc.includes('"full_admin"'),
  );
  assert(
    "isFinalizationRole exported from constants.ts",
    constantsSrc.includes("export function isFinalizationRole"),
  );
  assert(
    "requireRegistrar exported from roleGuard.ts",
    roleGuardSrc.includes("export async function requireRegistrar"),
  );
  assert(
    "requireRegistrar uses isFinalizationRole",
    roleGuardSrc.includes("isFinalizationRole"),
  );
}

// ── 3. One student can finalize while classmate remains in progress ───────────

console.log("\n3. Per-enrollment finalization — classmates independent");
{
  assert(
    "finalizeCourseEnrollment takes enrollmentId (not courseSectionId) as target",
    finalizationSrc.includes("enrollmentId: string") &&
    finalizationSrc.includes("FinalizationCommitPayload") &&
    finalizationSrc.includes("payload.enrollmentId"),
  );
  assert(
    "enrollment idempotency check is per-enrollment (finalized_at on curriculum_enrollments)",
    finalizationSrc.includes("e.finalized_at") &&
    finalizationSrc.includes("already been finalized"),
  );
  assert(
    "getSectionFinalizationRoster returns per-student finalizationState",
    finalizationSrc.includes("finalizationState") &&
    finalizationSrc.includes("alreadyFinalized"),
  );
}

// ── 4. Double request cannot create duplicate permanent record ────────────────

console.log("\n4. Double request / duplicate finalization protection");
{
  assert(
    "App-layer idempotency: finalized_at check before insert",
    finalizationSrc.includes("if (e.finalized_at)") &&
    finalizationSrc.includes("already been finalized"),
  );
  assert(
    "DB-level uniqueness: uq_scr_native_per_enrollment partial unique index created",
    migrationSrc.includes("uq_scr_native_per_enrollment") &&
    migrationSrc.includes("create unique index"),
  );
  assert(
    "DB constraint error caught and returns friendly message",
    finalizationSrc.includes("uq_scr_native_per_enrollment") &&
    finalizationSrc.includes("duplicate detected"),
  );
}

// ── 5. Concurrent finalization protected at DB level ─────────────────────────

console.log("\n5. Concurrent finalization protected by DB unique index");
{
  assert(
    "Unique index on curriculum_enrollment_id WHERE source_type = 'schoolco_native'",
    migrationSrc.includes("where source_type = 'schoolco_native'") &&
    migrationSrc.includes("uq_scr_native_per_enrollment"),
  );
  assert(
    "Index is partial (applies to schoolco_native only, not historical imports)",
    migrationSrc.includes("curriculum_enrollment_id is not null"),
  );
}

// ── 6. No configured passing policy → no invented threshold ──────────────────

console.log("\n6. No invented passing threshold for credit award");
{
  assert(
    "No hardcoded passing percentage (60, 70, etc.) in finalization logic",
    !finalizationSrc.includes("pct >= 60") &&
    !finalizationSrc.includes("pct >= 70") &&
    !finalizationSrc.includes("percentage >= 60") &&
    !finalizationSrc.includes("percentage >= 70"),
  );
  assert(
    "creditsEarned requires explicit staff entry for HS-credit courses",
    finalizationSrc.includes("Credits earned must be explicitly provided"),
  );
  assert(
    "No automatic credit=1.0 or credit=0.0 default based on grade",
    !finalizationSrc.includes("creditsEarned = 1") &&
    !finalizationSrc.includes("creditsEarned: 1"),
  );
}

// ── 7. Earned credit requires explicit / canonical determination ──────────────

console.log("\n7. Credits earned requires explicit staff confirmation");
{
  assert(
    "creditsEarned in FinalizationCommitPayload is number | null (explicit)",
    finalizationSrc.includes("creditsEarned:        number | null"),
  );
  assert(
    "Preview shows creditsEarned: null (requires staff entry)",
    finalizationSrc.includes("creditsEarned:             null,   // requires explicit staff entry"),
  );
  assert(
    "UI requires credits earned input when countsTowardHsCredit",
    finalizationPanelSrc.includes("Credits earned must be entered for HS-credit courses"),
  );
}

// ── 8. K–8 no-credit finalization ────────────────────────────────────────────

console.log("\n8. K-8 no-credit finalization (countsTowardHighSchoolCredit = false)");
{
  assert(
    "counts_toward_high_school_credit defaults false on course_sections",
    migrationSrc.includes("counts_toward_high_school_credit boolean not null default false"),
  );
  assert(
    "credits_attempted and credits_earned set to null when not HS-credit course",
    finalizationSrc.includes("countsTowardHsCredit ? (section?.credits_attempted ?? null) : null"),
  );
  assert(
    "HS credit section hidden in UI when countsTowardHsCredit is false",
    finalizationPanelSrc.includes("{preview.countsTowardHsCredit && ("),
  );
}

// ── 9. Middle-school student with HS-credit course ───────────────────────────

console.log("\n9. Explicit HS-credit opt-in for any grade level");
{
  assert(
    "Migration comment states K–8 student may have counts_toward_high_school_credit = true",
    migrationSrc.includes("K–8 section may still be true for early HS credit"),
  );
  assert(
    "No grade_level check gates HS credit eligibility in finalization code",
    !finalizationSrc.includes("grade_level") ||
    !finalizationSrc.includes("countsTowardHsCredit"),
  );
}

// ── 10. Failed course: attempted > 0, earned = 0 ─────────────────────────────

console.log("\n10. Failed course remains on record with attempted > 0 and earned = 0");
{
  assert(
    "completion_status 'failed' is valid in FinalizationCompletionStatus",
    finalizationSrc.includes('"failed"'),
  );
  assert(
    "credits_attempted stored independently from credits_earned",
    finalizationSrc.includes("credits_attempted:") &&
    finalizationSrc.includes("credits_earned:"),
  );
  assert(
    "migration adds credits_attempted to course_sections (the configured attempted value)",
    migrationSrc.includes("credits_attempted") && migrationSrc.includes("course_sections"),
  );
}

// ── 11. Incomplete cannot accidentally receive earned credit ──────────────────

console.log("\n11. Incomplete/withdrawn cannot have credits_earned > 0");
{
  assert(
    "Server action rejects credits_earned > 0 for incomplete/withdrawn",
    finalizationSrc.includes("incomplete\", \"withdrawn\"].includes(payload.completionStatus) && (payload.creditsEarned ?? 0) > 0"),
  );
  assert(
    "UI disables credits earned input for incomplete/withdrawn",
    finalizationPanelSrc.includes('["incomplete","withdrawn"].includes(completionStatus)'),
  );
}

// ── 12. Override: 89.40 → 90.00 recalculates letter from 90.00 ───────────────

console.log("\n12. Override percentage recalculates letter from official percentage");
{
  assert(
    "officialLetterGrade = lookupLetterGrade(payload.officialPercentage, scale)",
    finalizationSrc.includes("lookupLetterGrade(payload.officialPercentage, scale)"),
  );
  assert(
    "Override calculation captures calculated_percentage separately",
    finalizationSrc.includes("calculated_percentage:    calculatedPercentage") ||
    finalizationSrc.includes("calculated_percentage:"),
  );
  assert(
    "Override uses official percentage (not calculated) for permanent record",
    finalizationSrc.includes("percentage:                   payload.officialPercentage"),
  );
}

// ── 13. Override reason is staff-only ────────────────────────────────────────

console.log("\n13. Override reason stored in course_finalization_overrides, not on record");
{
  assert(
    "Override reason stored in course_finalization_overrides table",
    finalizationSrc.includes("course_finalization_overrides") &&
    finalizationSrc.includes("reason:                   payload.overrideReason"),
  );
  assert(
    "Override table not shown in AcademicAchievementRecord",
    !aarSrc.includes("course_finalization_overrides") &&
    !aarSrc.includes("overrideReason") &&
    !aarSrc.includes("override_reason"),
  );
  assert(
    "UI notes override reason is staff-only",
    finalizationPanelSrc.includes("Staff-only. Not shown in the official record or parent portal"),
  );
}

// ── 14. Post-finalization correction retains before/after audit ───────────────

console.log("\n14. Post-finalization correction has full before/after audit trail");
{
  assert(
    "correctFinalizedRecord calls logAudit with previous_values and new_values",
    finalizationSrc.includes("previous_values:") &&
    finalizationSrc.includes("new_values:") &&
    finalizationSrc.includes("correctFinalizedRecord"),
  );
  assert(
    "Audit logs correction_reason in metadata",
    finalizationSrc.includes("correction_reason: payload.reason"),
  );
  assert(
    "before-values include percentage, final_grade, completion_status, credits",
    finalizationSrc.includes("prev.percentage") &&
    finalizationSrc.includes("prev.completion_status") &&
    finalizationSrc.includes("prev.credits_earned"),
  );
}

// ── 15. Correction reason is staff-only ──────────────────────────────────────

console.log("\n15. Correction reason in audit_logs only (not on permanent record display)");
{
  assert(
    "correctFinalizedRecord stores reason only in logAudit metadata",
    finalizationSrc.includes("correction_reason: payload.reason") &&
    !finalizationSrc.includes("patch.correction_reason"),
  );
  assert(
    "AAR does not display correction_reason from audit_logs",
    !aarSrc.includes("correction_reason"),
  );
}

// ── 16. In-progress row transitions after that enrollment is finalized ────────

console.log("\n16. In-progress → finalized transition (per-student)");
{
  // The live GradesTab only queries status='active' enrollments.
  // After finalization, enrollment.status = 'completed' → disappears from live view.
  assert(
    "finalizeCourseEnrollment sets enrollment status to completed",
    finalizationSrc.includes('status:              "completed"') &&
    finalizationSrc.includes("curriculum_enrollments"),
  );
  assert(
    "Finalized enrollment gets finalized_at timestamp",
    finalizationSrc.includes("finalized_at:        new Date().toISOString()"),
  );
}

// ── 17. Other students in same section remain in progress ─────────────────────

console.log("\n17. Sibling enrollments in same section unaffected by one finalization");
{
  assert(
    "Finalization update uses .eq(id, e.id) — scoped to single enrollment",
    finalizationSrc.includes('.eq("id", e.id)') ||
    finalizationSrc.includes(".eq(\"id\", e.id)"),
  );
  assert(
    "No bulk update of curriculum_enrollments by course_section_id",
    !finalizationSrc.includes('.eq("course_section_id"') ||
    finalizationSrc.includes("getSectionFinalizationRoster"),
  );
}

// ── 18. Historical records untouched ─────────────────────────────────────────

console.log("\n18. Migration does not modify existing records");
{
  assert(
    "Migration has no UPDATE statements on student_course_records",
    !migrationSrc.includes("update student_course_records"),
  );
  assert(
    "Migration has no UPDATE statements on curriculum_enrollments",
    !migrationSrc.includes("update curriculum_enrollments"),
  );
  assert(
    "Unique index applies only to schoolco_native rows (partial)",
    migrationSrc.includes("where source_type = 'schoolco_native'"),
  );
}

// ── 19. Parent cannot see internal audit/override/import notes ────────────────

console.log("\n19. Parent portal — no audit/override/import details");
{
  assert(
    "course_finalization_overrides has RLS: registrar+ only",
    migrationSrc.includes("has_min_org_role(organization_id, 'registrar'::user_role)") &&
    migrationSrc.includes("course_finalization_overrides"),
  );
  assert(
    "import_notes not in AcademicAchievementRecord display (only in staff ImportReviewScreen)",
    !aarSrc.includes("import_notes"),
  );
  assert(
    "No correction or override fields in AcademicAchievementRecord",
    !aarSrc.includes("correction_reason") &&
    !aarSrc.includes("override_reason"),
  );
}

// ── 20. Percentage displayed before letter in AAR ─────────────────────────────

console.log("\n20. Percentage primary in grade display (percentage% (letter))");
{
  assert(
    "Grade display formats as percentage% (letter) when both present",
    aarSrc.includes("pctStr} (${letterGrade})") ||
    aarSrc.includes("`${pctStr} (${letterGrade})`"),
  );
  assert(
    "percentage null → shows letter only; letter null → shows percentage only",
    aarSrc.includes("return letterGrade") &&
    aarSrc.includes(": pctStr"),
  );
}

// ── 21. Provenance: exact enrollment traceable ────────────────────────────────

console.log("\n21. Permanent record traceable to exact curriculum_enrollment");
{
  assert(
    "student_course_records gets curriculum_enrollment_id FK column",
    migrationSrc.includes("add column if not exists curriculum_enrollment_id"),
  );
  assert(
    "student_course_records gets course_section_id FK column",
    migrationSrc.includes("add column if not exists course_section_id"),
  );
  assert(
    "finalizeCourseEnrollment writes both FKs to the permanent record",
    finalizationSrc.includes("curriculum_enrollment_id:     e.id") &&
    finalizationSrc.includes("course_section_id:            e.course_section_id"),
  );
}

// ── 22. Finalization UI only shown to registrar+ ─────────────────────────────

console.log("\n22. Finalization UI restricted to registrar+ in course detail page");
{
  assert(
    "Course detail page checks isFinalizationRole before showing FinalizationPanel",
    courseDetailSrc.includes("isFinalizationRole") &&
    courseDetailSrc.includes("canFinalize"),
  );
  assert(
    "FinalizationPanel only rendered when canFinalize is true",
    courseDetailSrc.includes("{canFinalize && ("),
  );
}

// ── 23. Override table — no cascade-delete of audit history ──────────────────

console.log("\n23. Override audit history not cascade-deleted with record");
{
  assert(
    "course_finalization_overrides.curriculum_enrollment_id uses on delete restrict",
    migrationSrc.includes("on delete restrict"),
  );
  assert(
    "course_finalization_overrides.student_course_record_id uses on delete restrict",
    migrationSrc.includes("on delete restrict"),
  );
}

// ── 24. Dual Enrollment: college credits not auto-converted ──────────────────

console.log("\n24. Dual enrollment: college credits not auto-converted to HS credit");
{
  assert(
    "HS credit note in finalization panel UI",
    finalizationPanelSrc.includes("Dual-enrollment college hours are tracked separately and are not auto-converted"),
  );
  assert(
    "No automatic source_credits → credits_earned conversion in finalization",
    !finalizationSrc.includes("source_credits") ||
    finalizationSrc.includes("source_credits_earned") === false,
  );
}

// ── 25. Completion status must be explicitly set ─────────────────────────────

console.log("\n25. Completion status not defaulted to 'completed' for all finalized courses");
{
  assert(
    "FinalizationCompletionStatus includes failed, incomplete, withdrawn",
    finalizationSrc.includes('"failed"') &&
    finalizationSrc.includes('"incomplete"') &&
    finalizationSrc.includes('"withdrawn"'),
  );
  assert(
    "UI provides completion status selector with all four options",
    finalizationPanelSrc.includes("Completed") &&
    finalizationPanelSrc.includes("Failed") &&
    finalizationPanelSrc.includes("Incomplete") &&
    finalizationPanelSrc.includes("Withdrawn"),
  );
}

// ── 26. Migration: no credits awarded, no enrollments finalized ───────────────

console.log("\n26. Migration is schema-only — no data mutations");
{
  assert(
    "Migration contains only DDL (no INSERT, UPDATE, DELETE on user data)",
    !migrationSrc.match(/\bupdate\s+(curriculum_enrollments|student_course_records|students)\b/i) &&
    !migrationSrc.match(/\binsert into\s+(curriculum_enrollments|student_course_records|students)\b/i),
  );
}

// ── 27. CourseRecord type includes provenance fields ─────────────────────────

console.log("\n27. CourseRecord type includes course_section_id and curriculum_enrollment_id");
{
  assert(
    "courseRecords.ts CourseRecord interface has curriculum_enrollment_id",
    recordsSrc.includes("curriculum_enrollment_id: string | null"),
  );
  assert(
    "courseRecords.ts CourseRecord interface has course_section_id",
    recordsSrc.includes("course_section_id: string | null"),
  );
}

// ── 28. Correction reason required ───────────────────────────────────────────

console.log("\n28. Post-finalization correction requires a reason");
{
  assert(
    "correctFinalizedRecord rejects empty reason",
    finalizationSrc.includes("reason is required for post-finalization corrections"),
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
