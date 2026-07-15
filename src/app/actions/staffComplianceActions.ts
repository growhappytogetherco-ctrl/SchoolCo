"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import {
  calcDisplayStatus,
  DEFAULT_REQUIREMENTS,
  REQUIREMENT_LABELS,
  type RequirementType,
  type VerificationStatus,
} from "@/lib/compliance-constants";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ComplianceRecord {
  id: string;
  organization_id: string;
  staff_member_id: string;
  requirement_type: RequirementType;
  custom_requirement_name: string | null;
  verification_status: VerificationStatus;
  completion_date: string | null;
  expiration_date: string | null;
  verified_at: string | null;
  verified_by: string | null;
  verified_by_name: string | null;
  credential_number: string | null;
  provider_name: string | null;
  notes: string | null;
  document_url: string | null;
  reminder_enabled: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  display_status: VerificationStatus;
}

export interface StaffComplianceSummary {
  total: number;
  current: number;
  expiring_soon: number;
  expired: number;
  missing: number;
  pending: number;
  overall_status: "compliant" | "expiring_soon" | "action_required" | "missing";
}

export interface ComplianceDashboardAlert {
  staff_id: string;
  staff_name: string;
  requirement_type: RequirementType;
  display_label: string;
  display_status: VerificationStatus;
  expiration_date: string | null;
  urgency: "critical" | "high" | "normal";
  alert_type: string;
}

// ── Auth helpers ───────────────────────────────────────────────────────────

async function getOrgAndUser(): Promise<{ orgId: string; userId: string } | null> {
  const user = await getUser();
  if (!user) return null;
  const orgId = await getActiveOrgId();
  if (!orgId) return null;
  return { orgId, userId: user.id };
}

async function assertAdminOrAbove(): Promise<{ orgId: string; userId: string } | null> {
  const ctx = await getOrgAndUser();
  if (!ctx) return null;
  const role = await getActiveRole();
  const allowed = ["admin", "full_admin", "platform_admin", "registrar"];
  if (!allowed.includes(role ?? "")) return null;
  return ctx;
}

// ── Queries ────────────────────────────────────────────────────────────────

export async function getComplianceRecords(
  staffMemberId: string,
  opts?: { includeArchived?: boolean }
): Promise<ComplianceRecord[]> {
  const ctx = await getOrgAndUser();
  if (!ctx) return [];

  const supabase = await createClient();
  let query = supabase
    .from("staff_compliance_records")
    .select(`
      *,
      verified_by_profile:profiles!staff_compliance_records_verified_by_fkey(full_name),
      created_by_profile:profiles!staff_compliance_records_created_by_fkey(full_name)
    `)
    .eq("staff_member_id", staffMemberId)
    .eq("organization_id", ctx.orgId)
    .order("requirement_type", { ascending: true })
    .order("created_at", { ascending: false });

  if (!opts?.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((r) => {
    const display_status = calcDisplayStatus({
      verification_status: r.verification_status as VerificationStatus,
      expiration_date:     r.expiration_date ?? null,
      completion_date:     r.completion_date ?? null,
    });
    return {
      id:                      r.id,
      organization_id:         r.organization_id,
      staff_member_id:         r.staff_member_id,
      requirement_type:        r.requirement_type as RequirementType,
      custom_requirement_name: r.custom_requirement_name ?? null,
      verification_status:     r.verification_status as VerificationStatus,
      completion_date:         r.completion_date ?? null,
      expiration_date:         r.expiration_date ?? null,
      verified_at:             r.verified_at ?? null,
      verified_by:             r.verified_by ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      verified_by_name:        (r.verified_by_profile as any)?.full_name ?? null,
      credential_number:       r.credential_number ?? null,
      provider_name:           r.provider_name ?? null,
      notes:                   r.notes ?? null,
      document_url:            r.document_url ?? null,
      reminder_enabled:        r.reminder_enabled ?? false,
      created_by:              r.created_by ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      created_by_name:         (r.created_by_profile as any)?.full_name ?? null,
      created_at:              r.created_at,
      updated_at:              r.updated_at,
      archived_at:             r.archived_at ?? null,
      display_status,
    };
  });
}

export async function getStaffComplianceSummary(
  staffMemberId: string
): Promise<StaffComplianceSummary> {
  const ctx = await getOrgAndUser();
  const empty: StaffComplianceSummary = {
    total: 0, current: 0, expiring_soon: 0, expired: 0,
    missing: 0, pending: 0, overall_status: "missing",
  };
  if (!ctx) return empty;

  // Get staff_type
  const supabase = await createClient();
  const { data: staffRow } = await supabase
    .from("staff_roster")
    .select("staff_type")
    .eq("id", staffMemberId)
    .single();

  const staffType = staffRow?.staff_type ?? "staff";
  const required  = (DEFAULT_REQUIREMENTS[staffType] ?? DEFAULT_REQUIREMENTS.staff) as RequirementType[];

  const records = await getComplianceRecords(staffMemberId);
  const byType  = new Map(records.map((r) => [r.requirement_type, r]));

  let current = 0, expiring_soon = 0, expired = 0, missing = 0, pending = 0;

  for (const rt of required) {
    const rec = byType.get(rt);
    if (!rec) {
      missing++;
      continue;
    }
    const ds = rec.display_status;
    if (ds === "current")       current++;
    else if (ds === "expiring_soon") expiring_soon++;
    else if (ds === "expired")  expired++;
    else if (ds === "pending")  pending++;
    else if (ds === "not_started" || ds === "waived" || ds === "not_required") {
      if (ds === "not_started") missing++;
    }
  }

  // Also count non-required custom records
  const total = records.filter((r) => !r.archived_at).length;

  let overall_status: StaffComplianceSummary["overall_status"] = "compliant";
  if (expired > 0)       overall_status = "action_required";
  else if (expiring_soon > 0) overall_status = "expiring_soon";
  else if (missing > 0)  overall_status = "missing";

  return { total, current, expiring_soon, expired, missing, pending, overall_status };
}

export async function getComplianceDashboardAlerts(): Promise<ComplianceDashboardAlert[]> {
  const ctx = await assertAdminOrAbove();
  if (!ctx) return [];

  const supabase = await createClient();
  const today    = new Date().toISOString().split("T")[0];
  const in30days = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
  const in7days  = new Date(Date.now() + 7  * 86400000).toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  // Fetch all active staff
  const { data: staffRows } = await supabase
    .from("staff_roster")
    .select("id, full_name, staff_type")
    .eq("organization_id", ctx.orgId)
    .eq("status", "active")
    .is("archived_at", null);

  if (!staffRows) return [];

  // Fetch all non-archived compliance records for the org
  const { data: allRecords } = await supabase
    .from("staff_compliance_records")
    .select("*")
    .eq("organization_id", ctx.orgId)
    .is("archived_at", null);

  const alerts: ComplianceDashboardAlert[] = [];
  const recordsByStaff = new Map<string, typeof allRecords>();

  for (const rec of allRecords ?? []) {
    const list = recordsByStaff.get(rec.staff_member_id) ?? [];
    list.push(rec);
    recordsByStaff.set(rec.staff_member_id, list);
  }

  for (const staff of staffRows) {
    const staffType = staff.staff_type ?? "staff";
    const required  = (DEFAULT_REQUIREMENTS[staffType] ?? DEFAULT_REQUIREMENTS.staff) as RequirementType[];
    const recs      = recordsByStaff.get(staff.id) ?? [];
    const byType    = new Map(recs.map((r) => [r.requirement_type, r]));

    for (const rt of required) {
      const rec = byType.get(rt);

      if (!rec) {
        // Missing required item
        const urgency: "critical" | "high" | "normal" =
          rt === "background_screening" ? "critical" : "normal";
        alerts.push({
          staff_id:      staff.id,
          staff_name:    staff.full_name,
          requirement_type: rt,
          display_label: REQUIREMENT_LABELS[rt],
          display_status: "not_started",
          expiration_date: null,
          urgency,
          alert_type:    "missing",
        });
        continue;
      }

      const ds = calcDisplayStatus({
        verification_status: rec.verification_status as VerificationStatus,
        expiration_date:     rec.expiration_date ?? null,
        completion_date:     rec.completion_date ?? null,
      });

      if (ds === "expired") {
        const urgency: "critical" | "high" | "normal" =
          rt === "background_screening" ? "critical" :
          ["cpr_certification","first_aid_certification","child_safety_training"].includes(rt) ? "high" : "normal";
        alerts.push({
          staff_id:      staff.id,
          staff_name:    staff.full_name,
          requirement_type: rt,
          display_label: REQUIREMENT_LABELS[rt],
          display_status: "expired",
          expiration_date: rec.expiration_date ?? null,
          urgency,
          alert_type: "expired",
        });
      } else if (ds === "expiring_soon") {
        const daysUntil = rec.expiration_date
          ? (new Date(rec.expiration_date).getTime() - Date.now()) / 86400000
          : 999;
        const urgency: "critical" | "high" | "normal" =
          daysUntil <= 7 ? "high" : "normal";
        alerts.push({
          staff_id:      staff.id,
          staff_name:    staff.full_name,
          requirement_type: rt,
          display_label: REQUIREMENT_LABELS[rt],
          display_status: "expiring_soon",
          expiration_date: rec.expiration_date ?? null,
          urgency,
          alert_type: "expiring_soon",
        });
      } else if (ds === "pending") {
        // Pending > 7 days old
        const createdAt = rec.created_at ? new Date(rec.created_at).toISOString() : "";
        if (createdAt < sevenDaysAgo) {
          alerts.push({
            staff_id:      staff.id,
            staff_name:    staff.full_name,
            requirement_type: rt,
            display_label: REQUIREMENT_LABELS[rt],
            display_status: "pending",
            expiration_date: rec.expiration_date ?? null,
            urgency:       "normal",
            alert_type:    "pending_overdue",
          });
        }
      }
    }
  }

  // Sort: critical first, then high, then normal
  const URGENCY_ORDER = { critical: 0, high: 1, normal: 2 };
  alerts.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]);

  // Suppress unused vars warnings — these are used above via closure
  void today; void in30days; void in7days;

  return alerts;
}

export async function getComplianceCountsForDirectory(): Promise<
  { staff_id: string; summary: StaffComplianceSummary }[]
> {
  const ctx = await assertAdminOrAbove();
  if (!ctx) return [];

  const supabase = await createClient();

  const { data: staffRows } = await supabase
    .from("staff_roster")
    .select("id, staff_type")
    .eq("organization_id", ctx.orgId)
    .eq("status", "active")
    .is("archived_at", null);

  if (!staffRows) return [];

  const { data: allRecords } = await supabase
    .from("staff_compliance_records")
    .select("*")
    .eq("organization_id", ctx.orgId)
    .is("archived_at", null);

  const recordsByStaff = new Map<string, typeof allRecords>();
  for (const rec of allRecords ?? []) {
    const list = recordsByStaff.get(rec.staff_member_id) ?? [];
    list.push(rec);
    recordsByStaff.set(rec.staff_member_id, list);
  }

  return staffRows.map((staff) => {
    const staffType = staff.staff_type ?? "staff";
    const required  = (DEFAULT_REQUIREMENTS[staffType] ?? DEFAULT_REQUIREMENTS.staff) as RequirementType[];
    const recs      = recordsByStaff.get(staff.id) ?? [];
    const byType    = new Map(recs.map((r) => [r.requirement_type, r]));

    let current = 0, expiring_soon = 0, expired = 0, missing = 0, pending = 0;
    for (const rt of required) {
      const rec = byType.get(rt);
      if (!rec) { missing++; continue; }
      const ds = calcDisplayStatus({
        verification_status: rec.verification_status as VerificationStatus,
        expiration_date:     rec.expiration_date ?? null,
        completion_date:     rec.completion_date ?? null,
      });
      if (ds === "current")        current++;
      else if (ds === "expiring_soon") expiring_soon++;
      else if (ds === "expired")   expired++;
      else if (ds === "pending")   pending++;
      else if (ds === "not_started") missing++;
    }

    let overall_status: StaffComplianceSummary["overall_status"] = "compliant";
    if (expired > 0)        overall_status = "action_required";
    else if (expiring_soon > 0) overall_status = "expiring_soon";
    else if (missing > 0)   overall_status = "missing";

    return {
      staff_id: staff.id,
      summary: {
        total:    recs.length,
        current,
        expiring_soon,
        expired,
        missing,
        pending,
        overall_status,
      },
    };
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export async function createComplianceRecord(
  staffMemberId: string,
  payload: {
    requirement_type:        RequirementType;
    custom_requirement_name?: string | null;
    verification_status:     VerificationStatus;
    completion_date?:        string | null;
    expiration_date?:        string | null;
    credential_number?:      string | null;
    provider_name?:          string | null;
    notes?:                  string | null;
    document_url?:           string | null;
    reminder_enabled?:       boolean;
  }
): Promise<{ success: boolean; error?: string; id?: string }> {
  const ctx = await assertAdminOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_compliance_records")
    .insert({
      organization_id:         ctx.orgId,
      staff_member_id:         staffMemberId,
      requirement_type:        payload.requirement_type,
      custom_requirement_name: payload.custom_requirement_name ?? null,
      verification_status:     payload.verification_status,
      completion_date:         payload.completion_date ?? null,
      expiration_date:         payload.expiration_date ?? null,
      credential_number:       payload.credential_number ?? null,
      provider_name:           payload.provider_name ?? null,
      notes:                   payload.notes ?? null,
      document_url:            payload.document_url ?? null,
      reminder_enabled:        payload.reminder_enabled ?? false,
      created_by:              ctx.userId,
      updated_by:              ctx.userId,
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: data.id };
}

export async function updateComplianceRecord(
  id: string,
  staffMemberId: string,
  payload: {
    requirement_type?:        RequirementType;
    custom_requirement_name?: string | null;
    verification_status?:     VerificationStatus;
    completion_date?:         string | null;
    expiration_date?:         string | null;
    credential_number?:       string | null;
    provider_name?:           string | null;
    notes?:                   string | null;
    document_url?:            string | null;
    reminder_enabled?:        boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertAdminOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_compliance_records")
    .update({ ...payload, updated_by: ctx.userId })
    .eq("id", id)
    .eq("staff_member_id", staffMemberId)
    .eq("organization_id", ctx.orgId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function verifyComplianceRecord(
  id: string,
  staffMemberId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertAdminOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_compliance_records")
    .update({
      verification_status: "current",
      verified_at:         new Date().toISOString(),
      verified_by:         ctx.userId,
      updated_by:          ctx.userId,
    })
    .eq("id", id)
    .eq("staff_member_id", staffMemberId)
    .eq("organization_id", ctx.orgId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function archiveComplianceRecord(
  id: string,
  staffMemberId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertAdminOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_compliance_records")
    .update({ archived_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq("id", id)
    .eq("staff_member_id", staffMemberId)
    .eq("organization_id", ctx.orgId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function restoreComplianceRecord(
  id: string,
  staffMemberId: string
): Promise<{ success: boolean; error?: string }> {
  const ctx = await assertAdminOrAbove();
  if (!ctx) return { success: false, error: "Unauthorized" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_compliance_records")
    .update({ archived_at: null, updated_by: ctx.userId })
    .eq("id", id)
    .eq("staff_member_id", staffMemberId)
    .eq("organization_id", ctx.orgId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
