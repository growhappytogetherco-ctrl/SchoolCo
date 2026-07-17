// ── Student Alert Types & Constants ────────────────────────────────────────
// NOTE: This file is NOT "use server" — it exports constants and types only.

export type AlertLevel = "critical" | "high" | "informational";

export type AlertCategory =
  | "medical_allergy"
  | "medical_medication"
  | "medical_condition"
  | "support"
  | "pickup"
  | "notes"
  | "incident"
  | "manual";

export type AlertSourceTab =
  | "medical"
  | "family"
  | "support"
  | "notes"
  | "incidents";

export interface StudentAlert {
  id: string;
  level: AlertLevel;
  category: AlertCategory;
  title: string;           // short, e.g. "LIFE-THREATENING ALLERGY"
  instruction: string;     // actionable text
  source_tab?: AlertSourceTab;
  // Role-restricted: if set, only these roles get the source_tab link
  detail_roles?: string[];
  expires_at?: string | null;
}

export const ALERT_LEVEL_ORDER: Record<AlertLevel, number> = {
  critical: 0,
  high: 1,
  informational: 2,
};

// Roles that can see full medical/support details
export const STAFF_ROLES = [
  "admin", "full_admin", "platform_admin", "registrar", "teacher", "staff",
];

export const ADMIN_ROLES = [
  "admin", "full_admin", "platform_admin", "registrar",
];

// Category sort order within same level
export const ALERT_CATEGORY_ORDER: Record<AlertCategory, number> = {
  medical_medication: 0,
  medical_allergy: 1,
  medical_condition: 2,
  pickup: 3,
  support: 4,
  notes: 5,
  incident: 6,
  manual: 7,
};
