// ─── Raw CSV row ──────────────────────────────────────────────────────────────

/** A single parsed CSV row with normalized (lowercased, trimmed) header keys */
export type RawRow = Record<string, string>;

// ─── Mapped records (what we'll insert into Supabase) ────────────────────────

export interface MappedStudent {
  /** Original CSV row index (1-based, after header) */
  _rowIndex: number;

  // students table
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  grade_level?: string | null;
  enrollment_status: "enrolled" | "applicant" | "waitlisted" | "withdrawn" | "graduated" | "expelled";
  enrollment_date?: string | null;
  expected_graduation?: string | null;
  track?: string | null;
  date_of_birth?: string | null;
  medical_notes?: string | null;
  allergies?: string[] | null;
  scholarship_info?: Record<string, string> | null;
  authorized_pickup_notes?: string | null;

  // Related records to create alongside this student
  family?: MappedFamily | null;
  medical?: MappedMedical | null;
  guardians?: MappedGuardian[];
  notes?: MappedNote[];
}

export interface MappedFamily {
  family_name: string;
  is_split_household: boolean;
  notes?: string | null;
  household?: MappedHousehold | null;
}

export interface MappedHousehold {
  household_label: string;
  sort_order: number;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_zip?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface MappedGuardian {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  relationship_type: string;
  custody_type: string;
  is_legal_guardian: boolean;
  is_primary_contact: boolean;
  is_emergency_contact: boolean;
  emergency_contact_order?: number | null;
  can_pickup: boolean;
  pickup_restrictions?: string | null;
}

export interface MappedMedical {
  medical_conditions?: string[] | null;
  special_accommodations?: string[] | null;
  notes?: string | null;
  primary_doctor_name?: string | null;
  primary_doctor_phone?: string | null;
  insurance_provider?: string | null;
  insurance_policy_number?: string | null;
}

export interface MappedNote {
  category: string;
  priority: string;
  title: string;
  body: string;
  is_pinned: boolean;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationError {
  rowIndex: number;
  field: string;
  value: string;
  error: string;
  /** If true, this row cannot be imported at all */
  fatal: boolean;
}

export interface ValidationResult {
  errors: ValidationError[];
  warnings: ValidationError[];
  validRows: MappedStudent[];
  invalidRows: MappedStudent[];
}

// ─── Dry-run result ───────────────────────────────────────────────────────────

export interface DryRunRow {
  rowIndex: number;
  studentName: string;
  action: "insert" | "skip_duplicate" | "error";
  reason?: string;
  familyAction: "insert" | "link_existing" | "skip";
  guardianActions: Array<{ name: string; action: "insert" | "link_existing" }>;
}

export interface DryRunResult {
  totalRows: number;
  toInsert: number;
  toSkip: number;
  withErrors: number;
  rows: DryRunRow[];
  /** Families that already exist and would be linked, not duplicated */
  existingFamilies: string[];
  /** Guardians/profiles that already exist */
  existingProfiles: string[];
}

// ─── Import job status (from DB) ─────────────────────────────────────────────

export interface ImportJob {
  id: string;
  organization_id: string;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
  source: string;
  file_name: string | null;
  status: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  inserted_students: number;
  inserted_families: number;
  inserted_households: number;
  inserted_guardians: number;
  inserted_medical: number;
  inserted_notes: number;
  skipped_students: number;
  skipped_families: number;
  skipped_guardians: number;
  validation_errors: ValidationError[];
  import_log: Array<{ ts: string; level: string; message: string }>;
  preview_rows: RawRow[];
  error_message: string | null;
}

// ─── Airtable API (future) ────────────────────────────────────────────────────

export interface AirtableConfig {
  apiKey: string;
  baseId: string;
  tables: {
    students: string;
    families?: string;
    medical?: string;
  };
}

// ─── CSV field aliases ────────────────────────────────────────────────────────

/**
 * Maps normalized header variants to canonical field names.
 * Airtable field names can differ across organizations.
 */
export const FIELD_ALIASES: Record<string, string[]> = {
  first_name:               ["first name", "firstname", "student first name", "first"],
  last_name:                ["last name", "lastname", "student last name", "last", "surname"],
  preferred_name:           ["preferred name", "nickname", "goes by", "preferred", "preferred first name"],
  grade_level:              ["grade", "grade level", "current grade", "class", "year"],
  enrollment_status:        ["enrollment status", "status", "student status"],
  enrollment_date:          ["enrollment date", "enrolled date", "start date", "date enrolled", "admission date"],
  expected_graduation:      ["expected graduation", "graduation date", "expected grad", "graduation year"],
  track:                    ["track", "program", "program track", "pathway"],
  date_of_birth:            ["date of birth", "dob", "birthday", "birth date", "birthdate"],
  medical_notes:            ["medical notes", "medical", "health notes", "health"],
  allergies:                ["allergies", "allergy", "known allergies", "food allergies"],
  authorized_pickup_notes:  ["authorized pickup", "pickup notes", "authorized pickup notes", "pickup authorization"],
  scholarship_type:         ["scholarship type", "scholarship", "scholarship status", "aid type"],
  scholarship_amount:       ["scholarship amount", "aid amount", "award amount"],
  scholarship_donor:        ["scholarship donor", "donor", "sponsor"],
  scholarship_notes:        ["scholarship notes", "aid notes"],
  family_name:              ["family name", "family", "last name (family)", "household name"],
  is_split_household:       ["split household", "two households", "dual household", "divorced", "separated"],
  address_street:           ["address", "street", "street address", "address line 1", "home address"],
  address_city:             ["city", "address city"],
  address_state:            ["state", "address state"],
  address_zip:              ["zip", "zip code", "postal code", "address zip"],
  home_phone:               ["home phone", "house phone", "family phone", "household phone"],
  home_email:               ["home email", "family email", "household email"],
  parent1_name:             ["parent 1 name", "parent1 name", "mother name", "father name", "guardian 1 name", "guardian1"],
  parent1_email:            ["parent 1 email", "parent1 email", "guardian 1 email"],
  parent1_phone:            ["parent 1 phone", "parent1 phone", "guardian 1 phone"],
  parent1_relationship:     ["parent 1 relationship", "parent1 relationship", "guardian 1 relationship"],
  parent1_custody:          ["parent 1 custody", "parent1 custody", "guardian 1 custody"],
  parent1_legal:            ["parent 1 legal guardian", "parent1 legal", "guardian 1 legal"],
  parent1_primary_contact:  ["parent 1 primary", "parent1 primary", "primary contact"],
  parent1_emergency:        ["parent 1 emergency", "parent1 emergency"],
  parent1_can_pickup:       ["parent 1 pickup", "parent1 pickup", "parent1 can pickup"],
  parent2_name:             ["parent 2 name", "parent2 name", "guardian 2 name", "guardian2"],
  parent2_email:            ["parent 2 email", "parent2 email", "guardian 2 email"],
  parent2_phone:            ["parent 2 phone", "parent2 phone", "guardian 2 phone"],
  parent2_relationship:     ["parent 2 relationship", "parent2 relationship", "guardian 2 relationship"],
  parent2_custody:          ["parent 2 custody", "parent2 custody", "guardian 2 custody"],
  parent2_legal:            ["parent 2 legal guardian", "parent2 legal", "guardian 2 legal"],
  parent2_emergency:        ["parent 2 emergency", "parent2 emergency"],
  parent2_can_pickup:       ["parent 2 pickup", "parent2 pickup"],
  emergency_contact_name:   ["emergency contact", "emergency contact name", "emergency name"],
  emergency_contact_phone:  ["emergency contact phone", "emergency phone"],
  emergency_contact_rel:    ["emergency contact relationship", "emergency relationship"],
  medical_conditions:       ["medical conditions", "conditions", "health conditions", "diagnosis", "diagnoses"],
  special_accommodations:   ["special accommodations", "accommodations", "iep", "504", "modifications"],
  doctor_name:              ["doctor", "doctor name", "physician", "pediatrician", "primary doctor"],
  doctor_phone:             ["doctor phone", "physician phone", "doctor contact"],
  insurance_provider:       ["insurance", "insurance provider", "insurance company", "health insurance"],
  insurance_policy:         ["policy number", "insurance policy", "policy #", "member id"],
  notes:                    ["notes", "staff notes", "comments", "general notes", "remarks"],
};
