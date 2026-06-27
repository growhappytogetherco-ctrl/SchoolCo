"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import { isAdminRole } from "@/lib/constants";

// ── Types ─────────────────────────────────────────────────────────────────

export type BgStatus       = "not_submitted" | "pending" | "cleared" | "expired" | "flagged";
export type TrainingStatus = "not_started" | "in_progress" | "completed" | "expired";
export type CprStatus      = "not_applicable" | "current" | "expired";
export type StaffType      = "staff" | "volunteer" | "contractor";
export type StaffStatus    = "active" | "inactive" | "suspended";

export interface StaffRosterRow {
  id:                       string;
  organization_id:          string;
  first_name:               string;
  last_name:                string;
  full_name:                string;   // computed: first + last
  email:                    string | null;
  phone:                    string | null;
  display_title:            string | null;
  bio:                      string | null;
  avatar_url:               string | null;
  staff_type:               StaffType;
  primary_role:             string;
  additional_roles:         string[];
  status:                   StaffStatus;
  start_date:               string | null;
  end_date:                 string | null;
  background_check_status:  BgStatus;
  background_check_date:    string | null;
  background_check_expires: string | null;
  training_status:          TrainingStatus;
  training_completed_at:    string | null;
  training_expires_at:      string | null;
  cpr_status:               CprStatus;
  cpr_expires_at:           string | null;
  emergency_contact_name:   string | null;
  emergency_contact_phone:  string | null;
  emergency_contact_rel:    string | null;
  compliance_notes:         string | null;
  profile_id:               string | null;
  created_at:               string;
}

export type StaffPayload = Omit<StaffRosterRow,
  "id" | "organization_id" | "full_name" | "profile_id" | "created_at"
>;

// ── Helpers ───────────────────────────────────────────────────────────────

function mapRow(raw: Record<string, unknown>): StaffRosterRow {
  const fn = raw.first_name as string;
  const ln = raw.last_name  as string;
  return {
    id:                       raw.id as string,
    organization_id:          raw.organization_id as string,
    first_name:               fn,
    last_name:                ln,
    full_name:                `${fn} ${ln}`.trim(),
    email:                    (raw.email as string | null) ?? null,
    phone:                    (raw.phone as string | null) ?? null,
    display_title:            (raw.display_title as string | null) ?? null,
    bio:                      (raw.bio as string | null) ?? null,
    avatar_url:               (raw.avatar_url as string | null) ?? null,
    staff_type:               (raw.staff_type as StaffType) ?? "staff",
    primary_role:             (raw.primary_role as string) ?? "staff",
    additional_roles:         (raw.additional_roles as string[]) ?? [],
    status:                   (raw.status as StaffStatus) ?? "active",
    start_date:               (raw.start_date as string | null) ?? null,
    end_date:                 (raw.end_date as string | null) ?? null,
    background_check_status:  (raw.background_check_status as BgStatus) ?? "not_submitted",
    background_check_date:    (raw.background_check_date as string | null) ?? null,
    background_check_expires: (raw.background_check_expires as string | null) ?? null,
    training_status:          (raw.training_status as TrainingStatus) ?? "not_started",
    training_completed_at:    (raw.training_completed_at as string | null) ?? null,
    training_expires_at:      (raw.training_expires_at as string | null) ?? null,
    cpr_status:               (raw.cpr_status as CprStatus) ?? "not_applicable",
    cpr_expires_at:           (raw.cpr_expires_at as string | null) ?? null,
    emergency_contact_name:   (raw.emergency_contact_name as string | null) ?? null,
    emergency_contact_phone:  (raw.emergency_contact_phone as string | null) ?? null,
    emergency_contact_rel:    (raw.emergency_contact_rel as string | null) ?? null,
    compliance_notes:         (raw.compliance_notes as string | null) ?? null,
    profile_id:               (raw.profile_id as string | null) ?? null,
    created_at:               raw.created_at as string,
  };
}

// ── Read ──────────────────────────────────────────────────────────────────

export async function getStaffDirectory(): Promise<StaffRosterRow[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_roster")
    .select("*")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("last_name")
    .order("first_name");
  if (error) { console.error("[getStaffDirectory]", error.message); return []; }
  return ((data ?? []) as unknown[]).map((r) => mapRow(r as Record<string, unknown>));
}

export async function getStaffMember(id: string): Promise<StaffRosterRow | null> {
  const orgId = await getActiveOrgId();
  if (!orgId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_roster")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as unknown as Record<string, unknown>);
}

// ── Create ────────────────────────────────────────────────────────────────

export async function createStaffMember(payload: StaffPayload): Promise<
  { success: true; id: string } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };
  if (!payload.first_name.trim()) return { success: false, error: "First name is required" };
  if (!payload.last_name.trim())  return { success: false, error: "Last name is required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_roster")
    .insert({
      organization_id:          orgId,
      first_name:               payload.first_name.trim(),
      last_name:                payload.last_name.trim(),
      email:                    payload.email?.trim() || null,
      phone:                    payload.phone?.trim() || null,
      display_title:            payload.display_title?.trim() || null,
      bio:                      payload.bio?.trim() || null,
      staff_type:               payload.staff_type,
      primary_role:             payload.primary_role,
      additional_roles:         payload.additional_roles ?? [],
      status:                   payload.status ?? "active",
      start_date:               payload.start_date || null,
      end_date:                 payload.end_date || null,
      background_check_status:  payload.background_check_status,
      background_check_date:    payload.background_check_date || null,
      background_check_expires: payload.background_check_expires || null,
      training_status:          payload.training_status,
      training_completed_at:    payload.training_completed_at || null,
      training_expires_at:      payload.training_expires_at || null,
      cpr_status:               payload.cpr_status,
      cpr_expires_at:           payload.cpr_expires_at || null,
      emergency_contact_name:   payload.emergency_contact_name || null,
      emergency_contact_phone:  payload.emergency_contact_phone || null,
      emergency_contact_rel:    payload.emergency_contact_rel || null,
      compliance_notes:         payload.compliance_notes || null,
    } as never)
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/staff");
  return { success: true, id: (data as unknown as { id: string }).id };
}

// ── Update ────────────────────────────────────────────────────────────────

export async function updateStaffMember(
  id: string,
  payload: Partial<StaffPayload>
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };

  const supabase = await createClient();
  const update: Record<string, unknown> = {};
  if (payload.first_name   !== undefined) update.first_name   = payload.first_name.trim();
  if (payload.last_name    !== undefined) update.last_name    = payload.last_name.trim();
  if (payload.email        !== undefined) update.email        = payload.email?.trim() || null;
  if (payload.phone        !== undefined) update.phone        = payload.phone?.trim() || null;
  if (payload.display_title !== undefined) update.display_title = payload.display_title?.trim() || null;
  if (payload.bio          !== undefined) update.bio          = payload.bio?.trim() || null;
  if (payload.staff_type   !== undefined) update.staff_type   = payload.staff_type;
  if (payload.primary_role !== undefined) update.primary_role = payload.primary_role;
  if (payload.additional_roles !== undefined) update.additional_roles = payload.additional_roles;
  if (payload.status       !== undefined) update.status       = payload.status;
  if (payload.start_date   !== undefined) update.start_date   = payload.start_date || null;
  if (payload.end_date     !== undefined) update.end_date     = payload.end_date || null;
  if (payload.background_check_status  !== undefined) update.background_check_status  = payload.background_check_status;
  if (payload.background_check_date    !== undefined) update.background_check_date    = payload.background_check_date || null;
  if (payload.background_check_expires !== undefined) update.background_check_expires = payload.background_check_expires || null;
  if (payload.training_status      !== undefined) update.training_status      = payload.training_status;
  if (payload.training_completed_at !== undefined) update.training_completed_at = payload.training_completed_at || null;
  if (payload.training_expires_at  !== undefined) update.training_expires_at  = payload.training_expires_at || null;
  if (payload.cpr_status     !== undefined) update.cpr_status     = payload.cpr_status;
  if (payload.cpr_expires_at !== undefined) update.cpr_expires_at = payload.cpr_expires_at || null;
  if (payload.emergency_contact_name  !== undefined) update.emergency_contact_name  = payload.emergency_contact_name || null;
  if (payload.emergency_contact_phone !== undefined) update.emergency_contact_phone = payload.emergency_contact_phone || null;
  if (payload.emergency_contact_rel   !== undefined) update.emergency_contact_rel   = payload.emergency_contact_rel || null;
  if (payload.compliance_notes !== undefined) update.compliance_notes = payload.compliance_notes || null;

  const { error } = await supabase
    .from("staff_roster")
    .update(update as never)
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/staff");
  revalidatePath(`/dashboard/staff/${id}`);
  return { success: true };
}

// ── Deactivate (soft) ─────────────────────────────────────────────────────

export async function setStaffStatus(
  id: string,
  status: StaffStatus
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_roster")
    .update({ status } as never)
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath("/dashboard/staff");
  revalidatePath(`/dashboard/staff/${id}`);
  return { success: true };
}

// ── Bulk import from CSV rows ─────────────────────────────────────────────

export interface StaffImportRow {
  first_name:               string;
  last_name:                string;
  email?:                   string;
  phone?:                   string;
  display_title?:           string;
  primary_role?:            string;
  staff_type?:              string;
  start_date?:              string;
  background_check_status?: string;
  background_check_date?:   string;
  background_check_expires?:string;
  training_status?:         string;
  training_completed_at?:   string;
  training_expires_at?:     string;
  cpr_status?:              string;
  cpr_expires_at?:          string;
  bio?:                     string;
  compliance_notes?:        string;
}

export async function importStaffRows(rows: StaffImportRow[]): Promise<{
  inserted: number; skipped: number; errors: string[];
}> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { inserted: 0, skipped: 0, errors: ["Not authenticated"] };
  if (!isAdminRole(role)) return { inserted: 0, skipped: 0, errors: ["Admin access required"] };

  const supabase = await createClient();
  let inserted = 0; let skipped = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (!row.first_name?.trim() || !row.last_name?.trim()) {
      skipped++; errors.push(`Row skipped: missing first or last name`); continue;
    }

    // Check for duplicate by email
    if (row.email?.trim()) {
      const { data: existing } = await supabase
        .from("staff_roster")
        .select("id")
        .eq("organization_id", orgId)
        .eq("email", row.email.trim().toLowerCase())
        .is("archived_at", null)
        .maybeSingle();
      if (existing) { skipped++; continue; }
    }

    const { error } = await supabase.from("staff_roster").insert({
      organization_id:          orgId,
      first_name:               row.first_name.trim(),
      last_name:                row.last_name.trim(),
      email:                    row.email?.trim().toLowerCase() || null,
      phone:                    row.phone?.trim() || null,
      display_title:            row.display_title?.trim() || null,
      primary_role:             row.primary_role ?? "staff",
      staff_type:               row.staff_type ?? "staff",
      start_date:               row.start_date || null,
      background_check_status:  row.background_check_status ?? "not_submitted",
      background_check_date:    row.background_check_date || null,
      background_check_expires: row.background_check_expires || null,
      training_status:          row.training_status ?? "not_started",
      training_completed_at:    row.training_completed_at || null,
      training_expires_at:      row.training_expires_at || null,
      cpr_status:               row.cpr_status ?? "not_applicable",
      cpr_expires_at:           row.cpr_expires_at || null,
      bio:                      row.bio?.trim() || null,
      compliance_notes:         row.compliance_notes?.trim() || null,
    } as never);

    if (error) { errors.push(`${row.first_name} ${row.last_name}: ${error.message}`); }
    else        { inserted++; }
  }

  revalidatePath("/dashboard/staff");
  return { inserted, skipped, errors };
}
