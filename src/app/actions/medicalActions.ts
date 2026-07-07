"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";

// ── Role helper ───────────────────────────────────────────────────────────────

async function assertStaffOrAbove(): Promise<{ orgId: string; userId: string } | null> {
  const user = await getUser();
  if (!user) return null;
  const orgId = await getActiveOrgId();
  if (!orgId) return null;
  const role = await getActiveRole();
  const restricted = ["parent", "student_future", "volunteer"];
  if (restricted.includes(role ?? "")) return null;
  return { orgId, userId: user.id };
}

async function assertOrgMember(): Promise<{ orgId: string; userId: string } | null> {
  const user = await getUser();
  if (!user) return null;
  const orgId = await getActiveOrgId();
  if (!orgId) return null;
  return { orgId, userId: user.id };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type AllergySeverity = "mild" | "moderate" | "severe" | "life_threatening";

export interface StudentAllergy {
  id: string;
  student_id: string;
  organization_id: string;
  allergy_name: string;
  reaction: string | null;
  severity: AllergySeverity;
  emergency_medication_required: boolean;
  notes: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentCondition {
  id: string;
  student_id: string;
  organization_id: string;
  condition_name: string;
  description: string | null;
  emergency_action_needed: boolean;
  action_instructions: string | null;
  notes: string | null;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentMedication {
  id: string;
  student_id: string;
  organization_id: string;
  medication_name: string;
  dosage: string | null;
  frequency: string | null;
  schedule: string | null;
  instructions: string | null;
  storage_location: string | null;
  stored_on_campus: boolean;
  is_emergency: boolean;
  is_active: boolean;
  notes: string | null;
  prescribed_by: string | null;
  authorization_on_file: boolean;
  requires_daily_log: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MedicalRecord {
  primary_doctor_name: string | null;
  primary_doctor_phone: string | null;
  primary_doctor_fax: string | null;
  preferred_hospital: string | null;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  insurance_group_number: string | null;
  insurance_phone: string | null;
  notes: string | null;
  updated_at: string | null;
}

export interface MedicalSummary {
  allergyCount: number;
  severeAllergyCount: number;
  hasEmergencyMed: boolean;
  hasEmergencyCondition: boolean;
  hasLifeThreateningAllergy: boolean;
  criticalAlerts: string[];
  lastUpdated: string | null;
}

export interface MedicalDashboardAlert {
  student_id: string;
  student_name: string;
  alert_type: "life_threatening_allergy" | "emergency_medication" | "emergency_condition";
  detail: string;
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getAllergies(
  studentId: string,
  opts?: { includeArchived?: boolean }
): Promise<StudentAllergy[]> {
  const ctx = await assertOrgMember();
  if (!ctx) return [];
  const supabase = await createClient();
  let q = supabase
    .from("student_allergies")
    .select("*")
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId)
    .order("created_at", { ascending: false });
  if (!opts?.includeArchived) {
    q = q.is("archived_at", null);
  }
  const { data } = await q;
  return (data ?? []) as StudentAllergy[];
}

export async function getConditions(
  studentId: string,
  opts?: { includeArchived?: boolean }
): Promise<StudentCondition[]> {
  const ctx = await assertOrgMember();
  if (!ctx) return [];
  const supabase = await createClient();
  let q = supabase
    .from("student_conditions")
    .select("*")
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId)
    .order("created_at", { ascending: false });
  if (!opts?.includeArchived) {
    q = q.is("archived_at", null);
  }
  const { data } = await q;
  return (data ?? []) as StudentCondition[];
}

export async function getMedications(
  studentId: string,
  opts?: { includeArchived?: boolean }
): Promise<StudentMedication[]> {
  const ctx = await assertOrgMember();
  if (!ctx) return [];
  const supabase = await createClient();
  let q = supabase
    .from("medication_alerts")
    .select("id,student_id,organization_id,medication_name,dosage,frequency,schedule,instructions,storage_location,stored_on_campus,is_emergency,is_active,notes,prescribed_by,authorization_on_file,requires_daily_log,archived_at,created_at,updated_at")
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId)
    .order("is_emergency", { ascending: false });
  if (!opts?.includeArchived) {
    q = q.is("archived_at", null).eq("is_active", true);
  }
  const { data } = await q;
  return (data ?? []) as StudentMedication[];
}

export async function getMedicalRecord(studentId: string): Promise<MedicalRecord | null> {
  const ctx = await assertOrgMember();
  if (!ctx) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_medical")
    .select("primary_doctor_name,primary_doctor_phone,primary_doctor_fax,preferred_hospital,insurance_provider,insurance_policy_number,insurance_group_number,insurance_phone,notes,updated_at")
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId)
    .single();
  return data as MedicalRecord | null;
}

export async function getMedicalSummary(studentId: string): Promise<MedicalSummary> {
  const ctx = await assertOrgMember();
  if (!ctx) {
    return { allergyCount: 0, severeAllergyCount: 0, hasEmergencyMed: false, hasEmergencyCondition: false, hasLifeThreateningAllergy: false, criticalAlerts: [], lastUpdated: null };
  }
  const supabase = await createClient();

  const [allergiesRes, conditionsRes, medsRes] = await Promise.all([
    supabase
      .from("student_allergies")
      .select("allergy_name,severity,emergency_medication_required")
      .eq("student_id", studentId)
      .eq("organization_id", ctx.orgId)
      .eq("is_active", true)
      .is("archived_at", null),
    supabase
      .from("student_conditions")
      .select("condition_name,emergency_action_needed,action_instructions")
      .eq("student_id", studentId)
      .eq("organization_id", ctx.orgId)
      .eq("is_active", true)
      .is("archived_at", null),
    supabase
      .from("medication_alerts")
      .select("medication_name,is_emergency,updated_at")
      .eq("student_id", studentId)
      .eq("organization_id", ctx.orgId)
      .eq("is_active", true)
      .is("archived_at", null),
  ]);

  const allergies = allergiesRes.data ?? [];
  const conditions = conditionsRes.data ?? [];
  const meds = medsRes.data ?? [];

  const severeAllergies = allergies.filter(
    (a) => a.severity === "severe" || a.severity === "life_threatening"
  );
  const lifeThreateningAllergies = allergies.filter((a) => a.severity === "life_threatening");
  const emergencyMeds = meds.filter((m) => m.is_emergency);
  const emergencyConditions = conditions.filter((c) => c.emergency_action_needed);

  const criticalAlerts: string[] = [];

  lifeThreateningAllergies.forEach((a) => {
    const suffix = a.emergency_medication_required ? " — EpiPen required" : "";
    criticalAlerts.push(`LIFE-THREATENING ALLERGY: ${a.allergy_name}${suffix}`);
  });
  severeAllergies
    .filter((a) => a.severity === "severe")
    .forEach((a) => {
      criticalAlerts.push(`SEVERE ALLERGY: ${a.allergy_name}`);
    });
  emergencyMeds.forEach((m) => {
    criticalAlerts.push(`EMERGENCY MEDICATION: ${m.medication_name}`);
  });
  emergencyConditions.forEach((c) => {
    criticalAlerts.push(`EMERGENCY CONDITION: ${c.condition_name}`);
  });

  const allDates = meds.map((m) => m.updated_at).filter(Boolean) as string[];
  const lastUpdated = allDates.length > 0 ? allDates.sort().reverse()[0] : null;

  return {
    allergyCount: allergies.length,
    severeAllergyCount: severeAllergies.length,
    hasEmergencyMed: emergencyMeds.length > 0,
    hasEmergencyCondition: emergencyConditions.length > 0,
    hasLifeThreateningAllergy: lifeThreateningAllergies.length > 0,
    criticalAlerts,
    lastUpdated,
  };
}

export async function getMedicalDashboardAlerts(): Promise<MedicalDashboardAlert[]> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return [];
  const supabase = await createClient();

  const [allergyRes, medRes, conditionRes] = await Promise.all([
    supabase
      .from("student_allergies")
      .select("student_id,allergy_name,severity,students(first_name,last_name,preferred_name)")
      .eq("organization_id", ctx.orgId)
      .eq("severity", "life_threatening")
      .eq("is_active", true)
      .is("archived_at", null)
      .limit(50),
    supabase
      .from("medication_alerts")
      .select("student_id,medication_name,students(first_name,last_name,preferred_name)")
      .eq("organization_id", ctx.orgId)
      .eq("is_emergency", true)
      .eq("is_active", true)
      .is("archived_at", null)
      .limit(50),
    supabase
      .from("student_conditions")
      .select("student_id,condition_name,students(first_name,last_name,preferred_name)")
      .eq("organization_id", ctx.orgId)
      .eq("emergency_action_needed", true)
      .eq("is_active", true)
      .is("archived_at", null)
      .limit(50),
  ]);

  const alerts: MedicalDashboardAlert[] = [];

  function nameFromStudent(s: unknown): string {
    const student = s as { first_name?: string; last_name?: string; preferred_name?: string } | null;
    if (!student) return "Unknown";
    const first = student.preferred_name ?? student.first_name ?? "";
    return `${first} ${student.last_name ?? ""}`.trim();
  }

  for (const row of allergyRes.data ?? []) {
    alerts.push({
      student_id: row.student_id,
      student_name: nameFromStudent(row.students),
      alert_type: "life_threatening_allergy",
      detail: row.allergy_name,
    });
  }
  for (const row of medRes.data ?? []) {
    alerts.push({
      student_id: row.student_id,
      student_name: nameFromStudent(row.students),
      alert_type: "emergency_medication",
      detail: row.medication_name,
    });
  }
  for (const row of conditionRes.data ?? []) {
    alerts.push({
      student_id: row.student_id,
      student_name: nameFromStudent(row.students),
      alert_type: "emergency_condition",
      detail: row.condition_name,
    });
  }

  return alerts;
}

// ── Allergy mutations ─────────────────────────────────────────────────────────

export async function createAllergy(
  studentId: string,
  payload: {
    allergy_name: string;
    reaction?: string;
    severity: AllergySeverity;
    emergency_medication_required?: boolean;
    notes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase.from("student_allergies").insert({
    student_id: studentId,
    organization_id: ctx.orgId,
    allergy_name: payload.allergy_name,
    reaction: payload.reaction ?? null,
    severity: payload.severity,
    emergency_medication_required: payload.emergency_medication_required ?? false,
    notes: payload.notes ?? null,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateAllergy(
  id: string,
  studentId: string,
  payload: Partial<{
    allergy_name: string;
    reaction: string;
    severity: AllergySeverity;
    emergency_medication_required: boolean;
    notes: string;
  }>
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_allergies")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function archiveAllergy(
  id: string,
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_allergies")
    .update({ is_active: false, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function restoreAllergy(
  id: string,
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_allergies")
    .update({ is_active: true, archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Condition mutations ───────────────────────────────────────────────────────

export async function createCondition(
  studentId: string,
  payload: {
    condition_name: string;
    description?: string;
    emergency_action_needed?: boolean;
    action_instructions?: string;
    notes?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase.from("student_conditions").insert({
    student_id: studentId,
    organization_id: ctx.orgId,
    condition_name: payload.condition_name,
    description: payload.description ?? null,
    emergency_action_needed: payload.emergency_action_needed ?? false,
    action_instructions: payload.action_instructions ?? null,
    notes: payload.notes ?? null,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateCondition(
  id: string,
  studentId: string,
  payload: Partial<{
    condition_name: string;
    description: string;
    emergency_action_needed: boolean;
    action_instructions: string;
    notes: string;
  }>
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_conditions")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function archiveCondition(
  id: string,
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_conditions")
    .update({ is_active: false, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function restoreCondition(
  id: string,
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_conditions")
    .update({ is_active: true, archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Medication mutations ──────────────────────────────────────────────────────

export async function createMedication(
  studentId: string,
  payload: {
    medication_name: string;
    dosage?: string;
    frequency?: string;
    schedule?: string;
    instructions?: string;
    storage_location?: string;
    stored_on_campus?: boolean;
    is_emergency?: boolean;
    notes?: string;
    prescribed_by?: string;
    authorization_on_file?: boolean;
    requires_daily_log?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase.from("medication_alerts").insert({
    student_id: studentId,
    organization_id: ctx.orgId,
    medication_name: payload.medication_name,
    dosage: payload.dosage ?? null,
    frequency: payload.frequency ?? null,
    schedule: payload.schedule ?? null,
    instructions: payload.instructions ?? null,
    storage_location: payload.storage_location ?? null,
    stored_on_campus: payload.stored_on_campus ?? false,
    is_emergency: payload.is_emergency ?? false,
    notes: payload.notes ?? null,
    prescribed_by: payload.prescribed_by ?? null,
    authorization_on_file: payload.authorization_on_file ?? false,
    requires_daily_log: payload.requires_daily_log ?? false,
    is_active: true,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateMedication(
  id: string,
  studentId: string,
  payload: Partial<{
    medication_name: string;
    dosage: string;
    frequency: string;
    schedule: string;
    instructions: string;
    storage_location: string;
    stored_on_campus: boolean;
    is_emergency: boolean;
    notes: string;
    prescribed_by: string;
    authorization_on_file: boolean;
    requires_daily_log: boolean;
  }>
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("medication_alerts")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function archiveMedication(
  id: string,
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("medication_alerts")
    .update({ is_active: false, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function restoreMedication(
  id: string,
  studentId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("medication_alerts")
    .update({ is_active: true, archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", ctx.orgId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Medical record upsert ─────────────────────────────────────────────────────

export async function upsertMedicalRecord(
  studentId: string,
  payload: Partial<{
    primary_doctor_name: string;
    primary_doctor_phone: string;
    primary_doctor_fax: string;
    preferred_hospital: string;
    insurance_provider: string;
    insurance_policy_number: string;
    insurance_group_number: string;
    insurance_phone: string;
    notes: string;
  }>
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertStaffOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };
  const supabase = await createClient();
  const { error } = await supabase.from("student_medical").upsert(
    {
      student_id: studentId,
      organization_id: ctx.orgId,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
      ...payload,
    },
    { onConflict: "student_id" }
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}
