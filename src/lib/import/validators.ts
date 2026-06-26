import {
  type MappedStudent,
  type ValidationError,
  type ValidationResult,
} from "./types";

const VALID_ENROLLMENT_STATUSES = ["enrolled","applicant","waitlisted","withdrawn","graduated","expelled"];

export function validateMappedStudents(students: MappedStudent[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const validRows: MappedStudent[] = [];
  const invalidRows: MappedStudent[] = [];

  const seenNames = new Map<string, number>(); // normalized name → first row index

  for (const s of students) {
    const rowErrors: ValidationError[] = [];
    const rowWarnings: ValidationError[] = [];

    // ── Required fields ────────────────────────────────────────────────
    if (!s.first_name.trim()) {
      rowErrors.push({ rowIndex: s._rowIndex, field: "first_name", value: s.first_name, error: "First name is required", fatal: true });
    }
    if (!s.last_name.trim()) {
      rowErrors.push({ rowIndex: s._rowIndex, field: "last_name", value: s.last_name, error: "Last name is required", fatal: true });
    }

    // ── Enrollment status ──────────────────────────────────────────────
    if (!VALID_ENROLLMENT_STATUSES.includes(s.enrollment_status)) {
      rowErrors.push({ rowIndex: s._rowIndex, field: "enrollment_status", value: s.enrollment_status, error: `Invalid status. Must be one of: ${VALID_ENROLLMENT_STATUSES.join(", ")}`, fatal: false });
    }

    // ── Date validation ────────────────────────────────────────────────
    if (s.date_of_birth === null && s._rowIndex > 0 /* suppress on truly missing */) {
      // intentionally not fatal — DOB is helpful but not required
    }

    // ── Duplicate within this CSV ──────────────────────────────────────
    const normName = `${s.first_name.trim().toLowerCase()} ${s.last_name.trim().toLowerCase()}`;
    const existing = seenNames.get(normName);
    if (existing !== undefined) {
      rowWarnings.push({
        rowIndex: s._rowIndex, field: "name", value: `${s.first_name} ${s.last_name}`,
        error: `Duplicate name in this CSV (also at row ${existing}). Will be skipped unless DB check clears it.`,
        fatal: false,
      });
    } else {
      seenNames.set(normName, s._rowIndex);
    }

    // ── Guardian email validation ─────────────────────────────────────
    for (const g of s.guardians ?? []) {
      if (g.email && !isValidEmail(g.email)) {
        rowWarnings.push({
          rowIndex: s._rowIndex, field: "guardian_email", value: g.email,
          error: `Guardian "${g.full_name}" has an invalid email format. Email will be skipped.`,
          fatal: false,
        });
        g.email = null; // sanitize
      }
    }

    // ── Family name ────────────────────────────────────────────────────
    if (!s.family?.family_name?.trim()) {
      rowWarnings.push({
        rowIndex: s._rowIndex, field: "family_name", value: "",
        error: "No family name — will use student last name to auto-generate.",
        fatal: false,
      });
    }

    // ── No guardians ──────────────────────────────────────────────────
    if (!s.guardians || s.guardians.length === 0) {
      rowWarnings.push({
        rowIndex: s._rowIndex, field: "guardians", value: "",
        error: "No parent/guardian data found. Student will be imported without guardian records.",
        fatal: false,
      });
    }

    errors.push(...rowErrors);
    warnings.push(...rowWarnings);

    const hasFatal = rowErrors.some((e) => e.fatal);
    if (hasFatal) {
      invalidRows.push(s);
    } else {
      validRows.push(s);
    }
  }

  return { errors, warnings, validRows, invalidRows };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
