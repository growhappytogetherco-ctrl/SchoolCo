"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import { isAdminRole, type UserRole } from "@/lib/constants";
import { logAudit } from "@/lib/audit";

export interface StaffMember {
  id: string;          // organization_members.id
  profile_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: string;
  display_id: string | null;
  joined_at: string | null;
}

export async function getStaffMembers(): Promise<StaffMember[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select(`
      id, profile_id, role, status, display_id, joined_at,
      profiles:profile_id ( full_name, email, phone, avatar_url )
    `)
    .eq("organization_id", orgId)
    .neq("role", "parent")
    .neq("role", "student_future")
    .order("role")
    .order("joined_at");

  return ((data ?? []) as unknown[]).map((raw) => {
    const r = raw as Record<string, unknown>;
    const prof = r.profiles as Record<string, string | null> | null;
    return {
      id:         r.id as string,
      profile_id: r.profile_id as string,
      full_name:  prof?.full_name ?? "Unknown",
      email:      prof?.email ?? null,
      phone:      prof?.phone ?? null,
      avatar_url: prof?.avatar_url ?? null,
      role:       r.role as UserRole,
      status:     r.status as string,
      display_id: r.display_id as string | null,
      joined_at:  r.joined_at as string | null,
    } as StaffMember;
  });
}

export async function updateMemberRole(
  memberId: string,
  newRole: UserRole
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getUser();
  const orgId = await getActiveOrgId();
  const role = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required to change roles" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organization_members")
    .update({ role: newRole } as never)
    .eq("id", memberId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  await logAudit({
    organization_id: orgId,
    actor_id:        user.id,
    action:          "member.role_changed",
    resource_type:   "organization_member",
    resource_id:     memberId,
    new_values:      { role: newRole },
  });

  revalidatePath("/dashboard/staff");
  return { success: true };
}

export async function updateMemberStatus(
  memberId: string,
  status: "active" | "suspended"
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getUser();
  const orgId = await getActiveOrgId();
  const role = await getActiveRole();
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
    organization_id: orgId,
    actor_id:        user.id,
    action:          status === "active" ? "member.reactivated" : "member.suspended",
    resource_type:   "organization_member",
    resource_id:     memberId,
  });

  revalidatePath("/dashboard/staff");
  return { success: true };
}

export async function inviteStaffMember(payload: {
  email: string;
  full_name: string;
  role: UserRole;
}): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getUser();
  const orgId = await getActiveOrgId();
  const role = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };
  if (!payload.email.trim()) return { success: false, error: "Email is required" };
  if (!payload.full_name.trim()) return { success: false, error: "Name is required" };

  const supabase = await createClient();

  // Check if profile exists with this email
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", payload.email.toLowerCase().trim())
    .single();

  if (existingProfile) {
    // Profile exists — check if already a member
    const profileId = (existingProfile as unknown as { id: string }).id;
    const { data: existingMember } = await supabase
      .from("organization_members")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("profile_id", profileId)
      .single();

    if (existingMember) {
      const mem = existingMember as unknown as { id: string; status: string };
      if (mem.status === "active") return { success: false, error: "This person is already an active member" };
      // Reactivate with new role
      const { error } = await supabase
        .from("organization_members")
        .update({ status: "active", role: payload.role, invited_by: user.id } as never)
        .eq("id", mem.id);
      if (error) return { success: false, error: error.message };
      revalidatePath("/dashboard/staff");
      return { success: true };
    }

    // Add as new member
    const { error } = await supabase
      .from("organization_members")
      .insert({
        organization_id: orgId,
        profile_id:      profileId,
        role:            payload.role,
        status:          "active",
        invited_by:      user.id,
        joined_at:       new Date().toISOString(),
      } as never);

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/staff");
    return { success: true };
  }

  // No profile — send Supabase auth invite
  const adminClient = await createClient();
  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(payload.email, {
    data: { full_name: payload.full_name, pending_org_id: orgId, pending_role: payload.role },
  });

  if (inviteError) return { success: false, error: inviteError.message };

  await logAudit({
    organization_id: orgId,
    actor_id:        user.id,
    action:          "member.invited",
    resource_type:   "profile",
    new_values:      { email: payload.email, role: payload.role, full_name: payload.full_name },
  });

  revalidatePath("/dashboard/staff");
  return { success: true };
}
