import {
  type RawRow,
  type MappedStudent,
  type MappedGuardian,
  type MappedFamily,
  type MappedHousehold,
  type MappedMedical,
  type MappedNote,
} from "./types";
import {
  buildHeaderMap,
  getField,
  parseBool,
  parseDate,
  parseList,
  normalizeRelationship,
  normalizeCustody,
  normalizeEnrollmentStatus,
  defaultFamilyName,
} from "./csvParser";

/**
 * Map parsed CSV rows into structured Supabase-ready records.
 * Returns one MappedStudent per CSV row (invalid or not — validation happens separately).
 */
export function mapRows(rows: RawRow[]): MappedStudent[] {
  if (rows.length === 0) return [];
  const headerMap = buildHeaderMap(Object.keys(rows[0]));

  return rows.map((row, i) => mapRow(row, i + 1, headerMap));
}

function mapRow(row: RawRow, rowIndex: number, headerMap: Map<string, string>): MappedStudent {
  const g = (field: string) => getField(row, headerMap, field);

  // ── Student core ──────────────────────────────────────────────────────
  const firstName = g("first_name");
  const lastName  = g("last_name");

  const rawAllergies     = g("allergies");
  const rawConditions    = g("medical_conditions");
  const rawAccommodations = g("special_accommodations");
  const rawMedNotes      = g("medical_notes");
  const rawDocName       = g("doctor_name");
  const rawDocPhone      = g("doctor_phone");
  const rawInsurance     = g("insurance_provider");
  const rawPolicy        = g("insurance_policy");

  const hasMedical = rawAllergies || rawConditions || rawAccommodations || rawMedNotes || rawDocName || rawInsurance;

  const medical: MappedMedical | null = hasMedical ? {
    medical_conditions:     parseList(rawConditions).length   ? parseList(rawConditions)    : null,
    special_accommodations: parseList(rawAccommodations).length ? parseList(rawAccommodations) : null,
    notes:                  rawMedNotes  || null,
    primary_doctor_name:    rawDocName   || null,
    primary_doctor_phone:   rawDocPhone  || null,
    insurance_provider:     rawInsurance || null,
    insurance_policy_number: rawPolicy   || null,
  } : null;

  // ── Scholarship ───────────────────────────────────────────────────────
  const schType   = g("scholarship_type");
  const schAmount = g("scholarship_amount");
  const schDonor  = g("scholarship_donor");
  const schNotes  = g("scholarship_notes");
  const scholarship_info: Record<string, string> | null =
    (schType || schAmount || schDonor || schNotes)
      ? Object.fromEntries(
          [["type", schType], ["amount", schAmount], ["donor", schDonor], ["notes", schNotes]]
            .filter(([, v]) => v)
        )
      : null;

  // ── Family & household ────────────────────────────────────────────────
  const familyNameRaw = g("family_name") || defaultFamilyName(lastName);
  const isSplit       = parseBool(g("is_split_household"));

  const streetRaw = g("address_street");
  const cityRaw   = g("address_city");
  const stateRaw  = g("address_state");
  const zipRaw    = g("address_zip");
  const hasAddress = streetRaw || cityRaw;

  const household: MappedHousehold | null = hasAddress ? {
    household_label: `${familyNameRaw} – Primary`,
    sort_order: 1,
    address_street: streetRaw || null,
    address_city:   cityRaw   || null,
    address_state:  stateRaw  || null,
    address_zip:    zipRaw    || null,
    phone: g("home_phone") || null,
    email: g("home_email") || null,
  } : null;

  const family: MappedFamily | null = {
    family_name:        familyNameRaw,
    is_split_household: isSplit,
    notes:              null,
    household,
  };

  // ── Guardians ─────────────────────────────────────────────────────────
  const guardians: MappedGuardian[] = [];

  const p1Name = g("parent1_name");
  if (p1Name) {
    guardians.push({
      full_name:               p1Name,
      email:                   g("parent1_email") || null,
      phone:                   g("parent1_phone") || null,
      relationship_type:       normalizeRelationship(g("parent1_relationship") || "other"),
      custody_type:            normalizeCustody(g("parent1_custody") || "primary"),
      is_legal_guardian:       parseBool(g("parent1_legal")) || false,
      is_primary_contact:      parseBool(g("parent1_primary_contact")),
      is_emergency_contact:    parseBool(g("parent1_emergency")),
      emergency_contact_order: parseBool(g("parent1_emergency")) ? 1 : null,
      can_pickup:              !g("parent1_can_pickup") || parseBool(g("parent1_can_pickup")),
      pickup_restrictions:     null,
    });
  }

  const p2Name = g("parent2_name");
  if (p2Name) {
    guardians.push({
      full_name:               p2Name,
      email:                   g("parent2_email") || null,
      phone:                   g("parent2_phone") || null,
      relationship_type:       normalizeRelationship(g("parent2_relationship") || "other"),
      custody_type:            normalizeCustody(g("parent2_custody") || "primary"),
      is_legal_guardian:       parseBool(g("parent2_legal")) || false,
      is_primary_contact:      false,
      is_emergency_contact:    parseBool(g("parent2_emergency")),
      emergency_contact_order: parseBool(g("parent2_emergency")) ? (guardians.some((g) => g.is_emergency_contact) ? 2 : 1) : null,
      can_pickup:              !g("parent2_can_pickup") || parseBool(g("parent2_can_pickup")),
      pickup_restrictions:     null,
    });
  }

  const ecName = g("emergency_contact_name");
  // Add emergency contact only if not already captured as a parent
  if (ecName && !guardians.some((g) => g.full_name.toLowerCase() === ecName.toLowerCase())) {
    guardians.push({
      full_name:               ecName,
      email:                   null,
      phone:                   g("emergency_contact_phone") || null,
      relationship_type:       normalizeRelationship(g("emergency_contact_rel") || "other"),
      custody_type:            "none",
      is_legal_guardian:       false,
      is_primary_contact:      false,
      is_emergency_contact:    true,
      emergency_contact_order: guardians.filter((g) => g.is_emergency_contact).length + 1,
      can_pickup:              false,
      pickup_restrictions:     null,
    });
  }

  // ── Staff notes ───────────────────────────────────────────────────────
  const notes: MappedNote[] = [];
  const rawNotes = g("notes");
  if (rawNotes) {
    notes.push({
      category:  "general",
      priority:  "normal",
      title:     "Imported from Airtable",
      body:      rawNotes,
      is_pinned: false,
    });
  }

  return {
    _rowIndex:               rowIndex,
    first_name:              firstName,
    last_name:               lastName,
    preferred_name:          g("preferred_name")        || null,
    grade_level:             g("grade_level")           || null,
    enrollment_status:       normalizeEnrollmentStatus(g("enrollment_status")) as MappedStudent["enrollment_status"],
    enrollment_date:         parseDate(g("enrollment_date")),
    expected_graduation:     parseDate(g("expected_graduation")),
    track:                   g("track")                 || null,
    date_of_birth:           parseDate(g("date_of_birth")),
    medical_notes:           g("medical_notes")         || null,
    allergies:               parseList(g("allergies")).length ? parseList(g("allergies")) : null,
    scholarship_info,
    authorized_pickup_notes: g("authorized_pickup_notes") || null,
    family,
    medical,
    guardians,
    notes,
  };
}
