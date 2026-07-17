"use server";

import { createClient, getActiveOrgId } from "@/lib/supabase/server";
import {
  type StudentAlert,
  type AlertLevel,
  type AlertCategory,
  ALERT_LEVEL_ORDER,
  ALERT_CATEGORY_ORDER,
  STAFF_ROLES,
  ADMIN_ROLES,
} from "@/lib/student-alert-constants";

// ── Re-export the type so callers can import from one place ────────────────
export type { StudentAlert };

// ── Main engine ────────────────────────────────────────────────────────────

export async function getStudentSafetyAlerts(
  studentId: string,
  role?: string
): Promise<StudentAlert[]> {
  // Parent/student roles get no internal alerts
  if (role === "parent" || role === "student") return [];

  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const isStaff = !role || STAFF_ROLES.includes(role);
  const isAdmin = ADMIN_ROLES.includes(role ?? "");
  const isVolunteer = role === "volunteer";

  const alerts: StudentAlert[] = [];

  // ── Source 1: student_allergies ─────────────────────────────────────────
  const { data: allergies } = await supabase
    .from("student_allergies")
    .select("id, allergy_name, severity, emergency_medication_required")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .in("severity", ["severe", "life_threatening"])
    .eq("is_active", true)
    .is("archived_at", null);

  for (const a of allergies ?? []) {
    const isLifeThreat = a.severity === "life_threatening";
    alerts.push({
      id: `medical_allergy-${a.id}`,
      level: isLifeThreat ? "critical" : "high",
      category: "medical_allergy",
      title: isLifeThreat ? "LIFE-THREATENING ALLERGY" : "SEVERE ALLERGY",
      instruction: isLifeThreat
        ? `${a.allergy_name}${a.emergency_medication_required ? " — Emergency medication required" : ""}`
        : `${a.allergy_name} — monitor closely`,
      source_tab: "medical",
      detail_roles: STAFF_ROLES,
    });
  }

  // ── Source 2: medication_alerts ─────────────────────────────────────────
  const { data: medications } = await supabase
    .from("medication_alerts")
    .select("id, medication_name, storage_location")
    .eq("student_id", studentId)
    .eq("is_active", true)
    .eq("is_emergency", true);

  for (const m of medications ?? []) {
    alerts.push({
      id: `medical_medication-${m.id}`,
      level: "critical",
      category: "medical_medication",
      title: "EMERGENCY MEDICATION",
      instruction: `${m.medication_name}${m.storage_location ? ` — stored at ${m.storage_location}` : ""}`,
      source_tab: "medical",
      detail_roles: STAFF_ROLES,
    });
  }

  // ── Source 3: student_conditions ────────────────────────────────────────
  const { data: conditions } = await supabase
    .from("student_conditions")
    .select("id, condition_name, action_instructions")
    .eq("student_id", studentId)
    .eq("is_active", true)
    .is("archived_at", null)
    .eq("emergency_action_needed", true);

  for (const c of conditions ?? []) {
    alerts.push({
      id: `medical_condition-${c.id}`,
      level: "critical",
      category: "medical_condition",
      title: "EMERGENCY ACTION PLAN",
      instruction: c.condition_name +
        (c.action_instructions
          ? ` — ${(c.action_instructions as string).slice(0, 100)}`
          : " — See Medical tab for instructions"),
      source_tab: "medical",
      detail_roles: STAFF_ROLES,
    });
  }

  // ── Source 4: support_flags ─────────────────────────────────────────────
  if (!isVolunteer) {
    const { data: flags } = await supabase
      .from("support_flags")
      .select("id, title, priority, description, show_on_snapshot")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .in("priority", ["high", "critical"])
      .or(`expires_at.is.null,expires_at.gte.${today}`)
      .is("archived_at", null);

    for (const f of flags ?? []) {
      alerts.push({
        id: `support-${f.id}`,
        level: (f.priority === "critical" ? "critical" : "high") as AlertLevel,
        category: "support",
        title: f.title as string,
        instruction: (f.description as string | null) ?? "See Support tab for details",
        source_tab: "support",
        detail_roles: STAFF_ROLES,
      });
    }
  }

  // ── Source 5: support_strategies (SSP pinned) ───────────────────────────
  if (isStaff) {
    const { data: strategies } = await supabase
      .from("support_strategies")
      .select("id, title, description, priority")
      .eq("student_id", studentId)
      .eq("is_pinned", true)
      .in("priority", ["high", "critical"]);

    for (const s of strategies ?? []) {
      alerts.push({
        id: `support-ssp-${s.id}`,
        level: (s.priority === "critical" ? "critical" : "high") as AlertLevel,
        category: "support",
        title: s.title as string,
        instruction: (s.description as string | null) ?? "See Support tab for details",
        source_tab: "support",
        detail_roles: STAFF_ROLES,
      });
    }
  }

  // ── Source 6: staff_notes (open follow-ups) — staff only ────────────────
  if (isStaff && !isVolunteer) {
    const { data: notes } = await supabase
      .from("staff_notes")
      .select("id, title, priority, assigned_to:assigned_to(full_name)")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .in("priority", ["high", "urgent"])
      .in("status", ["open", "in_progress"])
      .eq("follow_up_required", true)
      .is("archived_at", null);

    for (const n of notes ?? []) {
      const assignedName = (n.assigned_to as { full_name: string } | null)?.full_name;
      alerts.push({
        id: `notes-${n.id}`,
        level: (n.priority === "urgent" ? "critical" : "high") as AlertLevel,
        category: "notes",
        title: "OPEN STAFF FOLLOW-UP",
        instruction: (n.title ?? "Urgent follow-up required") +
          (assignedName ? ` — assigned to ${assignedName}` : ""),
        source_tab: "notes",
        detail_roles: STAFF_ROLES,
      });
    }
  }

  // ── Source 7: guardianships (pickup restrictions) ───────────────────────
  const { data: guardians } = await supabase
    .from("guardianships")
    .select("id, custody_type, can_pickup, profiles:profile_id(full_name)")
    .eq("student_id", studentId)
    .or("custody_type.in.(supervised,none),can_pickup.eq.false");

  for (const g of guardians ?? []) {
    const guardianName = (g.profiles as { full_name: string } | null)?.full_name ?? "Guardian";
    const isNone = g.custody_type === "none" || g.can_pickup === false;
    const level: AlertLevel = isNone ? "critical" : "high";

    let instruction: string;
    if (isAdmin || (isStaff && !isVolunteer)) {
      instruction = isNone
        ? `${guardianName} is not authorized for pickup`
        : `${guardianName}: supervised pickup only`;
    } else {
      // Volunteer: no guardian name exposed
      instruction = isNone
        ? "Contact administrator before releasing student"
        : "Do not release student without staff present";
    }

    alerts.push({
      id: `pickup-${g.id}`,
      level,
      category: "pickup",
      title: isNone ? "PICKUP RESTRICTION" : "SUPERVISED PICKUP",
      instruction,
      source_tab: "family",
      detail_roles: ADMIN_ROLES,
    });
  }

  // ── Source 8: incidents (active safety follow-up) — staff only ──────────
  if (isStaff && !isVolunteer) {
    const { data: incidents } = await supabase
      .from("incidents")
      .select("id, severity")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .in("status", ["open", "under_review"])
      .or("incident_type.eq.safety,severity.in.(high,critical)");

    for (const inc of incidents ?? []) {
      alerts.push({
        id: `incident-${inc.id}`,
        level: (inc.severity === "critical" ? "critical" : "high") as AlertLevel,
        category: "incident",
        title: "ACTIVE SAFETY FOLLOW-UP",
        instruction: "Incident requires staff awareness — see Incidents tab",
        source_tab: "incidents",
        detail_roles: STAFF_ROLES,
      });
    }
  }

  // ── Deduplicate by id ───────────────────────────────────────────────────
  const seen = new Set<string>();
  const unique = alerts.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  // ── Sort: level order first, then category order ────────────────────────
  unique.sort((a, b) => {
    const lvl = ALERT_LEVEL_ORDER[a.level] - ALERT_LEVEL_ORDER[b.level];
    if (lvl !== 0) return lvl;
    return (ALERT_CATEGORY_ORDER[a.category] ?? 99) - (ALERT_CATEGORY_ORDER[b.category] ?? 99);
  });

  return unique;
}

// ── Summary helper ─────────────────────────────────────────────────────────

export async function getStudentAlertSummary(
  studentId: string,
  role?: string
): Promise<{
  critical: number;
  high: number;
  informational: number;
  topAlert: StudentAlert | null;
}> {
  const alerts = await getStudentSafetyAlerts(studentId, role);
  return {
    critical: alerts.filter((a) => a.level === "critical").length,
    high: alerts.filter((a) => a.level === "high").length,
    informational: alerts.filter((a) => a.level === "informational").length,
    topAlert: alerts[0] ?? null,
  };
}
