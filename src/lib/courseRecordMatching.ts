/**
 * Course Record Matching — reusable duplicate / conflict detection.
 *
 * Pure functions with no DB or framework dependencies.
 * Called by server actions for manual entry (Stage B) and will be
 * called by the AI importer (Stage C) through the same entry points.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchableRecord {
  id: string;
  student_id: string;
  school_year: string;
  institution_name: string | null;
  course_name: string;
  course_code: string | null;
  term: string | null;
  grade_level: string | null;
  course_level: string | null;
  final_grade: string | null;
  semester_1_grade: string | null;
  semester_2_grade: string | null;
  credits_earned: number | null;
  credits_attempted: number | null;
  completion_status: string;
  counts_toward_high_school_credit: boolean;
  verification_status: string;
}

export type MatchLevel = "strong" | "possible";

export interface DuplicateMatch {
  record: MatchableRecord;
  matchLevel: MatchLevel;
  matchedFields: string[];
}

export interface ConflictField {
  field: string;
  label: string;
  existing: string | number | boolean | null;
  proposed: string | number | boolean | null;
}

export interface ConflictMatch {
  record: MatchableRecord;
  conflictingFields: ConflictField[];
}

// ── Normalization ─────────────────────────────────────────────────────────────

export function normalizeCourseName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")      // em/en dash → hyphen
    .replace(/[^\w\s\-]/g, "")  // strip other punctuation
    .replace(/\s+/g, " ");       // collapse whitespace
}

function normalizeInstitution(s: string | null | undefined): string {
  if (!s) return "";
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── Duplicate detection ────────────────────────────────────────────────────────

/**
 * Find potential duplicates of `proposed` among `existing` records.
 *
 * Strong: same year + normalized course name + normalized institution + compatible term.
 * Possible: same year + normalized course name, but institution or term differs.
 *
 * Does NOT block saves — warns only.
 * Legitimate retakes (different year, same institution, same course) are correctly
 * not flagged because `school_year` must match for any alert to fire.
 */
export function findDuplicates(
  proposed: MatchableRecord,
  existing: MatchableRecord[]
): DuplicateMatch[] {
  const results: DuplicateMatch[] = [];
  const pCourse = normalizeCourseName(proposed.course_name);

  for (const rec of existing) {
    if (rec.id === proposed.id) continue; // skip self (edit case)
    if (rec.student_id !== proposed.student_id) continue;
    if (rec.verification_status === "rejected") continue; // rejected records don't generate warnings

    const yearMatch   = rec.school_year === proposed.school_year;
    const courseMatch = normalizeCourseName(rec.course_name) === pCourse;

    if (!yearMatch || !courseMatch) continue;

    const pInst = normalizeInstitution(proposed.institution_name);
    const rInst = normalizeInstitution(rec.institution_name);
    const bothInst  = pInst !== "" && rInst !== "";
    const instMatch = !bothInst || pInst === rInst; // if either is missing, don't disqualify

    const bothTerm  = proposed.term != null && rec.term != null;
    const termMatch = !bothTerm || proposed.term === rec.term; // same logic

    const matchedFields: string[] = ["school_year", "course_name"];
    if (bothInst && pInst === rInst) matchedFields.push("institution_name");
    if (bothTerm && proposed.term === rec.term) matchedFields.push("term");
    if (rec.grade_level && proposed.grade_level && rec.grade_level === proposed.grade_level) {
      matchedFields.push("grade_level");
    }

    const isStrong = instMatch && termMatch;

    results.push({
      record: rec,
      matchLevel: isStrong ? "strong" : "possible",
      matchedFields,
    });
  }

  // Strong matches first
  results.sort((a, b) => (a.matchLevel === "strong" ? -1 : 1));
  return results;
}

// ── Conflict detection against verified records ────────────────────────────────

const MATERIAL_FIELDS: { field: keyof MatchableRecord; label: string }[] = [
  { field: "final_grade",                      label: "Final Grade" },
  { field: "semester_1_grade",                 label: "Semester 1 Grade" },
  { field: "semester_2_grade",                 label: "Semester 2 Grade" },
  { field: "credits_earned",                   label: "HS Credits Earned" },
  { field: "credits_attempted",                label: "HS Credits Attempted" },
  { field: "completion_status",                label: "Completion Status" },
  { field: "course_level",                     label: "Course Level" },
  { field: "counts_toward_high_school_credit", label: "Counts Toward HS Credit" },
];

/**
 * Among strong duplicates that are already verified, identify any whose
 * material academic fields disagree with the proposed record.
 *
 * Returns one `ConflictMatch` per conflicting verified record.
 * Never modifies the verified record — only warns.
 */
export function findConflictsWithVerified(
  proposed: MatchableRecord,
  existing: MatchableRecord[]
): ConflictMatch[] {
  const duplicates = findDuplicates(proposed, existing);
  const conflicts: ConflictMatch[] = [];

  for (const dup of duplicates) {
    if (dup.record.verification_status !== "verified") continue;
    if (dup.matchLevel !== "strong") continue;

    const conflictingFields: ConflictField[] = [];
    for (const { field, label } of MATERIAL_FIELDS) {
      const ev = dup.record[field];
      const pv = proposed[field];
      // Both null = no conflict. One null + one value = conflict.
      if (ev !== pv && !(ev == null && pv == null)) {
        conflictingFields.push({
          field,
          label,
          existing: ev as string | number | boolean | null,
          proposed: pv as string | number | boolean | null,
        });
      }
    }

    if (conflictingFields.length > 0) {
      conflicts.push({ record: dup.record, conflictingFields });
    }
  }

  return conflicts;
}
