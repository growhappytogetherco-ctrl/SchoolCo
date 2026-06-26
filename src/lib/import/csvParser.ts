import { FIELD_ALIASES, type RawRow } from "./types";

// ─── Core CSV parser (no dependencies) ───────────────────────────────────────

export function parseCSV(text: string): { headers: string[]; rows: RawRow[] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows: RawRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseLine(line);
    const row: RawRow = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

/** Parse a single CSV line handling quoted fields (including commas and newlines inside quotes) */
function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Header normalization ─────────────────────────────────────────────────────

/**
 * Normalize raw CSV headers to canonical field names using FIELD_ALIASES.
 * Returns a map from canonical name → raw header as found in the CSV.
 */
export function buildHeaderMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const normalizedHeaders = headers.map((h) => h.toLowerCase().replace(/[_\-\/\\]+/g, " ").trim());

  for (const [canonical, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      const idx = normalizedHeaders.indexOf(alias.toLowerCase().trim());
      if (idx !== -1 && !map.has(canonical)) {
        map.set(canonical, headers[idx]);
        break;
      }
    }
  }

  return map;
}

/** Look up a canonical field value from a raw row using the header map */
export function getField(row: RawRow, headerMap: Map<string, string>, canonical: string): string {
  const header = headerMap.get(canonical);
  if (!header) return "";
  return (row[header] ?? "").trim();
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

/** Parse comma-separated or semicolon-separated list into trimmed array, filtering blanks */
export function parseList(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(/[,;|]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Normalize a boolean field ("yes"/"no"/"true"/"false"/"1"/"0") */
export function parseBool(value: string): boolean {
  const v = value.toLowerCase().trim();
  return ["yes", "true", "1", "y"].includes(v);
}

/** Parse a date string and return ISO date (YYYY-MM-DD) or null */
export function parseDate(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value.trim());
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

/** Normalize relationship_type to the enum values */
export function normalizeRelationship(value: string): string {
  const v = value.toLowerCase().replace(/\s+/g, "_").trim();
  const MAP: Record<string, string> = {
    mom: "mother", dad: "father",
    step_mom: "stepmother", step_dad: "stepfather",
    step_mother: "stepmother", step_father: "stepfather",
    grandma: "grandmother", grandpa: "grandfather",
    grand_mother: "grandmother", grand_father: "grandfather",
    aunt: "aunt", uncle: "uncle",
    foster: "foster_parent", foster_parent: "foster_parent",
    guardian: "legal_guardian", legal_guardian: "legal_guardian",
    other: "other",
  };
  const valid = ["mother","father","stepmother","stepfather","grandmother","grandfather","aunt","uncle","foster_parent","legal_guardian","other"];
  return MAP[v] ?? (valid.includes(v) ? v : "other");
}

/** Normalize custody_type */
export function normalizeCustody(value: string): string {
  const v = value.toLowerCase().trim();
  const MAP: Record<string, string> = {
    primary: "primary", main: "primary",
    joint: "joint", shared: "joint", equal: "joint",
    secondary: "secondary", partial: "secondary", visiting: "secondary",
    supervised: "supervised", restricted: "supervised",
    none: "none", "no custody": "none", "emergency only": "none",
  };
  return MAP[v] ?? "primary";
}

/** Normalize enrollment_status */
export function normalizeEnrollmentStatus(value: string): string {
  const v = value.toLowerCase().trim();
  const MAP: Record<string, string> = {
    enrolled: "enrolled", active: "enrolled", current: "enrolled",
    applicant: "applicant", applying: "applicant", "in review": "applicant",
    waitlisted: "waitlisted", "wait list": "waitlisted", waiting: "waitlisted",
    withdrawn: "withdrawn", "left school": "withdrawn", transferred: "withdrawn",
    graduated: "graduated", "completed program": "graduated",
    expelled: "expelled", dismissed: "expelled",
  };
  return MAP[v] ?? "enrolled";
}

/** Generate a family name from student's last name */
export function defaultFamilyName(lastName: string): string {
  if (!lastName.trim()) return "Unknown Family";
  return `The ${lastName.trim()} Family`;
}
