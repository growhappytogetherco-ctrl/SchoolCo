"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";

// ── Volunteer-safe medical endpoint ───────────────────────────────────────────
// Returns only critical safety labels — no private medical details.
// All org members (including volunteers) can call this.

export async function getStudentSafetyAlerts(
  studentId: string
): Promise<{ hasCritical: boolean; labels: string[] }> {
  const user = await getUser();
  if (!user) return { hasCritical: false, labels: [] };
  const orgId = await getActiveOrgId();
  if (!orgId) return { hasCritical: false, labels: [] };

  const supabase = await createClient();

  const [allergyRes, medRes, conditionRes] = await Promise.all([
    supabase
      .from("student_allergies")
      .select("severity,emergency_medication_required")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .in("severity", ["severe", "life_threatening"])
      .eq("is_active", true)
      .is("archived_at", null),
    supabase
      .from("medication_alerts")
      .select("medication_name")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("is_emergency", true)
      .eq("is_active", true)
      .is("archived_at", null),
    supabase
      .from("student_conditions")
      .select("condition_name")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .eq("emergency_action_needed", true)
      .eq("is_active", true)
      .is("archived_at", null),
  ]);

  const labels: string[] = [];

  const allergies = allergyRes.data ?? [];
  const lifeThreateningCount = allergies.filter((a) => a.severity === "life_threatening").length;
  const severeCount = allergies.filter((a) => a.severity === "severe").length;

  if (lifeThreateningCount > 0) {
    labels.push(`Life-threatening allergy on file — notify staff immediately`);
  }
  if (severeCount > 0) {
    labels.push(`Severe allergy on file — notify staff`);
  }
  if ((medRes.data ?? []).length > 0) {
    labels.push(`Emergency medication required — notify staff`);
  }
  if ((conditionRes.data ?? []).length > 0) {
    labels.push(`Emergency medical condition on file — notify staff`);
  }

  return { hasCritical: labels.length > 0, labels };
}
