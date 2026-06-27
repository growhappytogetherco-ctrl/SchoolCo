"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import { isAdminRole, type UserRole } from "@/lib/constants";
import { logAudit } from "@/lib/audit";

// ── Types ─────────────────────────────────────────────────────────────────

export type BgStatus  = "not_submitted" | "pending" | "cleared" | "expired" | "flagged";
export type TrainingStatus = "not_started" | "in_progress" | "completed" | "expired";
export type CprStatus = "not_applicable" | "current" | "expired";
export type StaffType = "staff" | "volunteer" | "contractor";

export interface StaffDirectoryRow {
  // organization_members
  member_id:   string;
  profile_id:  string;
  primary_role: UserRole;
  member_status: string;
  display_id:  string | null;
  joined_at:   string | null;
  // profiles
  full_name:   string;
  email:       string;
  phone:       string | null;
  avatar_url:  string | null;
  // staff_profiles (may be null if not yet created)
  sp_id:                   string | null;
  display_title:           string | null;
  staff_type:              StaffType;
  additional_roles:        string[];
  background_check_status: BgStatus;
  background_check_expires: string | null;
  training_status:         TrainingStatus;
  training_expires_at:     string | null;
  cpr_status:              CprStatus;
  cpr_expires_at:          string | null;
  start_date:              string | null;
  bio:                     string | null;
  compliance_notes:        string | null;
  emergency_contact_name:  string | null;
  emergency_contact_phone: string | null;
  emergency_contact_rel:   string | null;
}

export interface StaffUpsertPayload {
  // profiles fields
  full_name:    string;
  email:        string;
  phone:        string | null;
  // organization_members fields
  primary_role: UserRole;
  member_status?: "active" | "suspended";
  // staff_profiles fields
  display_title:           string | null;
  staff_type:              StaffType;
  additional_roles:        string[];
  bio:                     string | null;
  start_date:              string | null;
  background_check_status: BgStatus;
  background_check_date:   string | null;
  background_check_expires: string | null;
  training_status:         TrainingStatus;
  training_completed_at:   string | null;
  training_expires_at:     string | null;
  cpr_status:              CprStatus;
  cpr_expires_at:          string | null;
  emergency_contact_name:  string | null;
  emergency_contact_phone: string | null;
  emergency_contact_rel:   string | null;
  compliance_notes:        string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function mapRow(raw: Record<string, unknown>): StaffDirectoryRow {
  const prof = (raw.profiles as Record<string, unknown> | null) ?? {};
  const sp   = (raw.staff_profiles as Record<string, unknown> | null) ?? {};
  return {
    member_id:    raw.id as string,
    profile_id:   raw.profile_id as string,
    primary_role: raw.role as UserRole,
    member_status: raw.status as string,
    display_id:   raw.display_id as string | null,
    joined_at:    raw.joined_at as string | null,
    full_name:    (prof.full_name as string) ?? "Unknown",
    email:        (prof.email as string) ?? "",
    phone:        (prof.phone as string | null) ?? null,
    avatar_url:   (prof.avatar_url as string | null) ?? null,
    sp_id:                   (sp.id as string | null) ?? null,
    display_title:           (sp.display_title as string | null) ?? null,
    staff_type:              (sp.staff_type as StaffType) ?? "staff",
    additional_roles:        (sp.additional_roles as string[]) ?? [],
    background_check_status: (sp.background_check_status as BgStatus) ?? "not_submitted",
    background_check_date:   (sp.background_check_date as string | null) ?? null,
    background_check_expires: (sp.background_check_expires as string | null) ?? null,
    training_status:         (sp.training_status as TrainingStatus) ?? "not_started",
    training_completed_at:   (sp.training_completed_at as string | null) ?? null,
    training_expires_at:     (sp.training_expires_at as string | null) ?? null,
    cpr_status:              (sp.cpr_status as CprStatus) ?? "not_applicable",
    cpr_expires_at:          (sp.cpr_expires_at as string | null) ?? null,
    start_date:              (sp.start_date as string | null) ?? null,
    bio:                     (sp.bio as string | null) ?? null,
    compliance_notes:        (sp.compliance_notes as string | null) ?? null,
    emergency_contact_name:  (sp.emergency_contact_name as string | null) ?? null,
    emergency_contact_phone: (sp.emergency_contact_phone as string | null) ?? null,
    emergency_contact_rel:   (sp.emergency_contact_rel as string | null) ?? null,
  };
}

// ── Get all staff ─────────────────────────────────────────────────────────

export async function getStaffDirectory(): Promise<StaffDirectoryRow[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select(`
      id, profile_id, role, status, display_id, joined_at,
      profiles:profile_id ( full_name, email, phone, avatar_url ),
      staff_profiles ( id, display_title, staff_type, additional_roles, bio, start_date,
        background_check_status, background_check_date, background_check_expires,
        training_status, training_completed_at, training_expires_at,
        cpr_status, cpr_expires_at,
        emergency_contact_name, emergency_contact_phone, emergency_contact_rel,
        compliance_notes
      )
    `)
    .eq("organization_id", orgId)
    .neq("role", "parent")
    .neq("role", "student_future")
    .order("joined_at");

  if (error) {
    console.error("[getStaffDirectory]", error.message);
    return [];
  }

  return ((data ?? []) as unknown[]).map((raw) => mapRow(raw as Record<string, unknown>));
}

// ── Get single staff member ───────────────────────────────────────────────

export async function getStaffMember(memberId: string): Promise<StaffDirectoryRow | null> {
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select(`
      id, profile_id, role, status, display_id, joined_at,
      profiles:profile_id ( full_name, email, phone, avatar_url ),
      staff_profiles ( id, display_title, staff_type, additional_roles, bio, start_date,
        background_check_status, background_check_date, background_check_expires,
        training_status, training_completed_at, training_expires_at,
        cpr_status, cpr_expires_at,
        emergency_contact_name, emergency_contact_phone, emergency_contact_rel,
        compliance_notes
      )
    `)
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error || !data) return null;
  return mapRow(data as unknown as Record<string, unknown>);
}

// ── Update primary role ───────────────────────────────────────────────────

export async function updatePrimaryRole(
  memberId: string,
  newRole: UserRole
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ role: newRole } as never)
    .eq("id", memberId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  await logAudit({
    organization_id: orgId, actor_id: user.id,
    action: "member.role_changed", resource_type: "organization_member",
    resource_id: memberId, new_values: { role: newRole },
  });

  revalidatePath("/dashboard/staff");
  return { success: true };
}

// ── Update member status ──────────────────────────────────────────────────

export async function updateMemberStatus(
  memberId: string,
  status: "active" | "suspended"
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ status } as never)
    .eq("id", memberId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  await logAudit({
    organization_id: orgId, actor_id: user.id,
    action: status === "active" ? "member.reactivated" : "member.suspended",
    resource_type: "organization_member", resource_id: memberId,
  });

  revalidatePath("/dashboard/staff");
  return { success: true };
}

// ── Upsert staff_profile ──────────────────────────────────────────────────

export async function upsertStaffProfile(
  profileId: string,
  payload: Partial<StaffUpsertPayload>
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };

  const supabase = await createClient();

  const spData = {
    organization_id:          orgId,
    profile_id:               profileId,
    display_title:            payload.display_title ?? null,
    staff_type:               payload.staff_type ?? "staff",
    additional_roles:         payload.additional_roles ?? [],
    bio:                      payload.bio ?? null,
    start_date:               payload.start_date || null,
    background_check_status:  payload.background_check_status ?? "not_submitted",
    background_check_date:    payload.background_check_date || null,
    background_check_expires: payload.background_check_expires || null,
    training_status:          payload.training_status ?? "not_started",
    training_completed_at:    payload.training_completed_at || null,
    training_expires_at:      payload.training_expires_at || null,
    cpr_status:               payload.cpr_status ?? "not_applicable",
    cpr_expires_at:           payload.cpr_expires_at || null,
    emergency_contact_name:   payload.emergency_contact_name || null,
    emergency_contact_phone:  payload.emergency_contact_phone || null,
    emergency_contact_rel:    payload.emergency_contact_rel || null,
    compliance_notes:         payload.compliance_notes || null,
  };

  const { error } = await supabase
    .from("staff_profiles")
    .upsert(spData as never, { onConflict: "organization_id,profile_id" });

  if (error) return { success: false, error: error.message };

  // Also update profile phone if provided
  if (payload.phone !== undefined) {
    await supabase.from("profiles").update({ phone: payload.phone } as never).eq("id", profileId);
  }

  revalidatePath("/dashboard/staff");
  return { success: true };
}

// ── Invite new staff member ───────────────────────────────────────────────

export async function inviteNewStaff(payload: {
  email:        string;
  full_name:    string;
  phone:        string | null;
  primary_role: UserRole;
  display_title: string | null;
  staff_type:   StaffType;
}): Promise<{ success: true; member_id?: string } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };
  if (!payload.email.trim())     return { success: false, error: "Email is required" };
  if (!payload.full_name.trim()) return { success: false, error: "Name is required" };

  const supabase = await createClient();
  const emailLc = payload.email.toLowerCase().trim();

  // Check if profile already exists
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", emailLc)
    .maybeSingle();

  let profileId: string;

  if (existingProfile) {
    profileId = (existingProfile as unknown as { id: string }).id;

    // Update name/phone on existing profile
    await supabase.from("profiles")
      .update({ full_name: payload.full_name, phone: payload.phone } as never)
      .eq("id", profileId);

    // Check existing membership
    const { data: existingMember } = await supabase
      .from("organization_members")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (existingMember) {
      const mem = existingMember as unknown as { id: string; status: string };
      if (mem.status === "active") return { success: false, error: "This person is already an active member" };
      await supabase.from("organization_members")
        .update({ status: "active", role: payload.primary_role, invited_by: user.id } as never)
        .eq("id", mem.id);

      // Upsert staff_profile
      await supabase.from("staff_profiles").upsert({
        organization_id: orgId, profile_id: profileId,
        display_title: payload.display_title,
        staff_type:    payload.staff_type,
      } as never, { onConflict: "organization_id,profile_id" });

      revalidatePath("/dashboard/staff");
      return { success: true, member_id: mem.id };
    }

    // Add as new member
    const { data: newMem, error: memErr } = await supabase
      .from("organization_members")
      .insert({
        organization_id: orgId, profile_id: profileId,
        role: payload.primary_role, status: "active",
        invited_by: user.id, joined_at: new Date().toISOString(),
      } as never)
      .select("id")
      .single();

    if (memErr) return { success: false, error: memErr.message };

    await supabase.from("staff_profiles").insert({
      organization_id: orgId, profile_id: profileId,
      display_title: payload.display_title, staff_type: payload.staff_type,
    } as never);

    revalidatePath("/dashboard/staff");
    return { success: true, member_id: (newMem as unknown as { id: string }).id };
  }

  // No profile — send Supabase invite
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(emailLc, {
    data: {
      full_name: payload.full_name,
      phone:     payload.phone,
      pending_org_id:   orgId,
      pending_role:     payload.primary_role,
      display_title:    payload.display_title,
      staff_type:       payload.staff_type,
    },
  });

  if (inviteError) return { success: false, error: inviteError.message };

  await logAudit({
    organization_id: orgId, actor_id: user.id,
    action: "member.invited", resource_type: "profile",
    new_values: { email: emailLc, role: payload.primary_role, full_name: payload.full_name },
  });

  revalidatePath("/dashboard/staff");
  return { success: true };
}

// ── Add staff manually (no invite email) ─────────────────────────────────

export async function addStaffManually(payload: StaffUpsertPayload): Promise<
  { success: true; member_id: string } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };
  if (!payload.full_name.trim()) return { success: false, error: "Name is required" };
  if (!payload.email.trim())     return { success: false, error: "Email is required" };

  const supabase = await createClient();
  const emailLc = payload.email.toLowerCase().trim();

  // Check existing profile
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", emailLc)
    .maybeSingle();

  if (existingProfile) {
    const profileId = (existingProfile as unknown as { id: string }).id;

    // Check if already a member
    const { data: existingMember } = await supabase
      .from("organization_members")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (existingMember) {
      const mem = existingMember as unknown as { id: string; status: string };
      if (mem.status === "active") return { success: false, error: "A member with this email already exists" };

      await supabase.from("organization_members")
        .update({ status: "active", role: payload.primary_role } as never)
        .eq("id", mem.id);

      await upsertStaffProfile(profileId, payload);
      revalidatePath("/dashboard/staff");
      return { success: true, member_id: mem.id };
    }

    // Insert member
    const { data: newMem, error: memErr } = await supabase
      .from("organization_members")
      .insert({
        organization_id: orgId, profile_id: profileId,
        role: payload.primary_role, status: payload.member_status ?? "active",
        invited_by: user.id, joined_at: new Date().toISOString(),
      } as never).select("id").single();

    if (memErr) return { success: false, error: memErr.message };

    await upsertStaffProfile(profileId, payload);
    revalidatePath("/dashboard/staff");
    return { success: true, member_id: (newMem as unknown as { id: string }).id };
  }

  // Create a new profile row (no auth account — they'll be invited later or log in separately)
  // We insert into profiles with a placeholder uuid linked to a temporary auth user concept
  // For now we only support adding people who already have accounts or via invite
  return { success: false, error: "No account found for this email. Use 'Invite Staff' to send an invite link instead." };
}

// ── Update staff member (edit) ────────────────────────────────────────────

export async function updateStaffMember(
  memberId:  string,
  profileId: string,
  payload:   StaffUpsertPayload
): Promise<{ success: true } | { success: false; error: string }> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };

  const supabase = await createClient();

  // Update primary role on organization_members
  const { error: roleErr } = await supabase
    .from("organization_members")
    .update({ role: payload.primary_role, status: payload.member_status ?? "active" } as never)
    .eq("id", memberId)
    .eq("organization_id", orgId);

  if (roleErr) return { success: false, error: roleErr.message };

  // Update profile name/phone
  await supabase.from("profiles").update({
    full_name: payload.full_name,
    phone:     payload.phone,
  } as never).eq("id", profileId);

  // Upsert staff_profiles
  const spResult = await upsertStaffProfile(profileId, payload);
  if (!spResult.success) return spResult;

  await logAudit({
    organization_id: orgId, actor_id: user.id,
    action: "member.updated", resource_type: "organization_member", resource_id: memberId,
  });

  revalidatePath("/dashboard/staff");
  revalidatePath(`/dashboard/staff/${memberId}`);
  return { success: true };
}
