"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId, resolveProfileId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/types/actions";
import { ROLE_HIERARCHY } from "@/lib/constants";

// ── Types ────────────────────────────────────────────────────────────────────

export type PortalStatus = "active" | "invite_pending" | "no_login" | "disabled";

export interface StaffPortalStatus {
  staff_roster_id:  string;
  portal_status:    PortalStatus;
  profile_id:       string | null;
  profile_email:    string | null;
  invitation_id:    string | null;
  invited_at:       string | null;
  expires_at:       string | null;
  intended_roles:   string[];
  org_roles:        string[];      // current roles in organization_members
  org_member_status: string | null; // active, pending, disabled
}

export interface StaffInvitation {
  id:             string;
  organization_id: string;
  staff_roster_id: string | null;
  email:          string;
  invited_at:     string;
  expires_at:     string;
  accepted_at:    string | null;
  revoked_at:     string | null;
  status:         string;
  intended_roles: string[];
  auth_user_id:   string | null;
}

// ── Auth guard (admin only) ──────────────────────────────────────────────────

async function assertAdmin(orgId: string) {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");

  const profileId = await resolveProfileId(user.id);
  const supabase  = await createClient();

  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", profileId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const adminRoles = ["admin", "full_admin", "platform_admin"];
  if (!member || !adminRoles.includes((member as any).role)) {
    throw new Error("Admin access required");
  }

  return { supabase, user, profileId, callerRole: (member as any).role as string };
}

// ── Queries ──────────────────────────────────────────────────────────────────

// Returns portal status for every staff_roster member in the org.
// Joined with pending invitations and organization_members.
export async function getStaffPortalStatuses(): Promise<ActionResult<StaffPortalStatus[]>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };

    const user = await getUser();
    if (!user) return { success: false, error: "Unauthenticated" };
    const profileId = await resolveProfileId(user.id);
    const supabase  = await createClient();

    const { data: member } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", profileId)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .single();

    const staffRoles = ["teacher","staff","registrar","admin","full_admin","platform_admin"];
    if (!member || !staffRoles.includes((member as any).role)) {
      return { success: false, error: "Insufficient permissions" };
    }

    // Fetch all staff roster members
    const { data: rosterRows, error: rErr } = await supabase
      .from("staff_roster")
      .select("id, profile_id")
      .eq("organization_id", orgId)
      .eq("status", "active");
    if (rErr) return { success: false, error: rErr.message };

    const rosterIds    = (rosterRows ?? []).map(r => r.id);
    const profileIds   = (rosterRows ?? []).filter(r => r.profile_id).map(r => r.profile_id!);

    // Pending invitations for these roster members
    const { data: invitations } = await supabase
      .from("staff_invitations")
      .select("id, staff_roster_id, email, invited_at, expires_at, intended_roles, status")
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .in("staff_roster_id", rosterIds);

    // Organization members for linked profiles
    const { data: orgMembers } = profileIds.length > 0
      ? await supabase
          .from("organization_members")
          .select("profile_id, role, roles, status")
          .eq("organization_id", orgId)
          .in("profile_id", profileIds)
      : { data: [] };

    // Profiles for linked profile_ids (to get email)
    const { data: profiles } = profileIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, email")
          .in("id", profileIds)
      : { data: [] };

    // Build lookup maps
    const invByRoster:  Record<string, typeof invitations[0]>   = {};
    for (const inv of invitations ?? []) {
      if (inv.staff_roster_id) invByRoster[inv.staff_roster_id] = inv;
    }
    const memberByProfile: Record<string, { role: string; roles: string[]; status: string }> = {};
    for (const om of orgMembers ?? []) {
      memberByProfile[(om as any).profile_id] = {
        role:   (om as any).role,
        roles:  (om as any).roles ?? [],
        status: (om as any).status,
      };
    }
    const emailByProfile: Record<string, string> = {};
    for (const p of profiles ?? []) {
      emailByProfile[(p as any).id] = (p as any).email ?? "";
    }

    const result: StaffPortalStatus[] = (rosterRows ?? []).map(row => {
      const rid = (row as any).id as string;
      const pid = (row as any).profile_id as string | null;
      const inv = invByRoster[rid];
      const om  = pid ? memberByProfile[pid] : null;

      let portal_status: PortalStatus = "no_login";
      if (pid && om) {
        portal_status = om.status === "active" ? "active" : "disabled";
      } else if (inv) {
        portal_status = "invite_pending";
      }

      return {
        staff_roster_id:   rid,
        portal_status,
        profile_id:        pid,
        profile_email:     pid ? (emailByProfile[pid] ?? null) : null,
        invitation_id:     inv?.id ?? null,
        invited_at:        inv?.invited_at ?? null,
        expires_at:        inv?.expires_at ?? null,
        intended_roles:    inv?.intended_roles ?? [],
        org_roles:         om ? [om.role, ...(om.roles ?? [])].filter(Boolean) : [],
        org_member_status: om?.status ?? null,
      };
    });

    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Mutations ────────────────────────────────────────────────────────────────

// Send a portal invite. Prevents duplicate pending invites.
// If email already has a SchoolCo account, links it instead of sending invite.
export async function sendStaffInvite(payload: {
  staffRosterId: string;
  email:         string;
  roles:         string[];
}): Promise<ActionResult<{ linked: boolean; message: string }>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };

    const { user, profileId, callerRole } = await assertAdmin(orgId);

    // Validate roles — caller cannot grant higher than their own role
    const callerLevel = ROLE_HIERARCHY.indexOf(callerRole as any);
    for (const r of payload.roles) {
      const rLevel = ROLE_HIERARCHY.indexOf(r as any);
      if (rLevel > callerLevel) {
        return { success: false, error: `You cannot assign the role "${r}" — it exceeds your own access level.` };
      }
    }
    if (payload.roles.length === 0) {
      return { success: false, error: "At least one role is required." };
    }

    const email = payload.email.trim().toLowerCase();
    const adminClient = createAdminClient();
    const supabase    = await createClient();

    // Check for existing pending invite (duplicate guard)
    const { data: existing } = await supabase
      .from("staff_invitations")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("staff_roster_id", payload.staffRosterId)
      .eq("status", "pending")
      .maybeSingle();

    if (existing) {
      return { success: false, error: "A pending invite already exists for this staff member. Use Resend or Revoke it first." };
    }

    // Check if this email already has a Supabase auth account
    const { data: { users: existingUsers }, error: lookupErr } = await adminClient.auth.admin.listUsers();
    const existingAuthUser = (existingUsers ?? []).find(
      u => u.email?.toLowerCase() === email
    );

    if (existingAuthUser) {
      // Email already has an account — link it
      const existingProfileId = await resolveProfileId(existingAuthUser.id);

      // Check if already in this org
      const { data: existingMember } = await supabase
        .from("organization_members")
        .select("id, role, status")
        .eq("profile_id", existingProfileId)
        .eq("organization_id", orgId)
        .maybeSingle();

      if (!existingMember) {
        // Add to org with intended roles
        const primaryRole = payload.roles.reduce((best, r) => {
          return ROLE_HIERARCHY.indexOf(r as any) > ROLE_HIERARCHY.indexOf(best as any) ? r : best;
        }, payload.roles[0]);
        const additionalRoles = payload.roles.filter(r => r !== primaryRole);

        await supabase.from("organization_members").insert({
          organization_id: orgId,
          profile_id:      existingProfileId,
          role:            primaryRole,
          roles:           additionalRoles,
          status:          "active",
          joined_at:       new Date().toISOString(),
        });
      }

      // Link staff_roster to this profile
      await supabase
        .from("staff_roster")
        .update({ profile_id: existingProfileId })
        .eq("id", payload.staffRosterId)
        .eq("organization_id", orgId);

      revalidatePath("/dashboard/staff");
      return {
        success: true,
        data: {
          linked: true,
          message: "This email already has a SchoolCo account. It has been linked to this staff profile.",
        },
      };
    }

    // No existing account — create a staff_invitation record first
    const { data: invitation, error: invErr } = await supabase
      .from("staff_invitations")
      .insert({
        organization_id: orgId,
        staff_roster_id: payload.staffRosterId,
        email,
        invited_by:      profileId,
        intended_roles:  payload.roles,
        status:          "pending",
        expires_at:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (invErr || !invitation) {
      return { success: false, error: invErr?.message ?? "Failed to create invitation record" };
    }

    // Send invite email via Supabase auth
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://schoolco.app";
    const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/auth/set-password&invitation_id=${invitation.id}&org_id=${orgId}`,
      data: {
        staff_invitation_id: invitation.id,
        org_id:              orgId,
        full_name:           "", // filled in profile on acceptance
      },
    });

    if (inviteErr) {
      // Roll back invitation record
      await supabase.from("staff_invitations").delete().eq("id", invitation.id);
      return { success: false, error: inviteErr.message };
    }

    revalidatePath("/dashboard/staff");
    return { success: true, data: { linked: false, message: "Invite sent successfully." } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function resendStaffInvite(invitationId: string): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    await assertAdmin(orgId);

    const supabase    = await createClient();
    const adminClient = createAdminClient();

    const { data: inv, error: fetchErr } = await supabase
      .from("staff_invitations")
      .select("*")
      .eq("id", invitationId)
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .single();

    if (fetchErr || !inv) return { success: false, error: "Invitation not found or already accepted/revoked" };

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://schoolco.app";

    const { error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail((inv as any).email, {
      redirectTo: `${siteUrl}/auth/callback?next=/auth/set-password&invitation_id=${invitationId}&org_id=${orgId}`,
      data: {
        staff_invitation_id: invitationId,
        org_id:              orgId,
      },
    });

    if (inviteErr) return { success: false, error: inviteErr.message };

    // Extend expiry
    await supabase
      .from("staff_invitations")
      .update({
        invited_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", invitationId);

    revalidatePath("/dashboard/staff");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function revokeStaffInvite(invitationId: string): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    await assertAdmin(orgId);

    const supabase = await createClient();

    const { error } = await supabase
      .from("staff_invitations")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", invitationId)
      .eq("organization_id", orgId)
      .eq("status", "pending");

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/staff");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Update org_member roles for an already-linked staff member
export async function updateStaffPortalRoles(
  staffRosterId: string,
  roles: string[]
): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    const { callerRole } = await assertAdmin(orgId);

    if (roles.length === 0) return { success: false, error: "At least one role is required." };

    // Validate no role escalation
    const callerLevel = ROLE_HIERARCHY.indexOf(callerRole as any);
    for (const r of roles) {
      if (ROLE_HIERARCHY.indexOf(r as any) > callerLevel) {
        return { success: false, error: `You cannot assign the role "${r}".` };
      }
    }

    const supabase = await createClient();

    // Get profile_id from staff_roster
    const { data: roster } = await supabase
      .from("staff_roster")
      .select("profile_id")
      .eq("id", staffRosterId)
      .eq("organization_id", orgId)
      .single();

    if (!(roster as any)?.profile_id) return { success: false, error: "Staff member has no linked account" };
    const pid = (roster as any).profile_id as string;

    const primaryRole = roles.reduce((best, r) => {
      return ROLE_HIERARCHY.indexOf(r as any) > ROLE_HIERARCHY.indexOf(best as any) ? r : best;
    }, roles[0]);
    const additionalRoles = roles.filter(r => r !== primaryRole);

    const { error } = await supabase
      .from("organization_members")
      .update({ role: primaryRole, roles: additionalRoles })
      .eq("profile_id", pid)
      .eq("organization_id", orgId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/staff");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function disableStaffPortalAccess(staffRosterId: string): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    await assertAdmin(orgId);

    const supabase = await createClient();
    const { data: roster } = await supabase
      .from("staff_roster")
      .select("profile_id")
      .eq("id", staffRosterId)
      .eq("organization_id", orgId)
      .single();

    if (!(roster as any)?.profile_id) return { success: false, error: "No linked account" };

    await supabase
      .from("organization_members")
      .update({ status: "pending" })   // "pending" effectively disables access in org context
      .eq("profile_id", (roster as any).profile_id)
      .eq("organization_id", orgId);

    revalidatePath("/dashboard/staff");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function enableStaffPortalAccess(staffRosterId: string): Promise<ActionResult<void>> {
  try {
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active org" };
    await assertAdmin(orgId);

    const supabase = await createClient();
    const { data: roster } = await supabase
      .from("staff_roster")
      .select("profile_id")
      .eq("id", staffRosterId)
      .eq("organization_id", orgId)
      .single();

    if (!(roster as any)?.profile_id) return { success: false, error: "No linked account" };

    await supabase
      .from("organization_members")
      .update({ status: "active", joined_at: new Date().toISOString() })
      .eq("profile_id", (roster as any).profile_id)
      .eq("organization_id", orgId);

    revalidatePath("/dashboard/staff");
    return { success: true, data: undefined };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Called from the auth callback after invite acceptance.
// Uses admin client — bypasses RLS intentionally.
// SECURITY: roles come from DB (staff_invitations), NOT from user input.
export async function provisionInvitedStaffAccount(payload: {
  authUserId:    string;
  email:         string;
  invitationId:  string;
  orgId:         string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const adminClient = createAdminClient();

    // Fetch invitation — roles come from here (server-side, not user-controlled)
    const { data: inv, error: invErr } = await adminClient
      .from("staff_invitations")
      .select("*")
      .eq("id", payload.invitationId)
      .eq("organization_id", payload.orgId)
      .eq("status", "pending")
      .single();

    if (invErr || !inv) {
      return { ok: false, error: "Invitation not found, already used, or revoked." };
    }

    // Check expiry
    if (new Date((inv as any).expires_at) < new Date()) {
      await adminClient
        .from("staff_invitations")
        .update({ status: "expired" })
        .eq("id", payload.invitationId);
      return { ok: false, error: "Invitation has expired. Ask your administrator to resend." };
    }

    // Resolve or create profile
    let profileId = await resolveProfileId(payload.authUserId);

    // If resolveProfileId returned the authUserId itself (no existing profile), create one
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", profileId)
      .maybeSingle();

    if (!existingProfile) {
      const { data: newProfile, error: pErr } = await adminClient
        .from("profiles")
        .insert({
          id:           payload.authUserId,
          auth_user_id: payload.authUserId,
          email:        payload.email,
          full_name:    "",
        })
        .select("id")
        .single();

      if (pErr || !newProfile) return { ok: false, error: "Failed to create profile: " + pErr?.message };
      profileId = (newProfile as any).id;
    } else {
      // Ensure auth_user_id is linked
      await adminClient
        .from("profiles")
        .update({ auth_user_id: payload.authUserId, email: payload.email })
        .eq("id", profileId);
    }

    // Derive roles from invitation (server-controlled — not user input)
    const intendedRoles: string[] = (inv as any).intended_roles ?? [];
    const primaryRole = intendedRoles.reduce((best: string, r: string) => {
      return ROLE_HIERARCHY.indexOf(r as any) > ROLE_HIERARCHY.indexOf(best as any) ? r : best;
    }, intendedRoles[0] ?? "staff");
    const additionalRoles = intendedRoles.filter(r => r !== primaryRole);

    // Create or update organization membership
    const { data: existingMember } = await adminClient
      .from("organization_members")
      .select("id")
      .eq("profile_id", profileId)
      .eq("organization_id", payload.orgId)
      .maybeSingle();

    if (!existingMember) {
      await adminClient.from("organization_members").insert({
        organization_id: payload.orgId,
        profile_id:      profileId,
        role:            primaryRole,
        roles:           additionalRoles,
        status:          "active",
        joined_at:       new Date().toISOString(),
      });
    } else {
      await adminClient
        .from("organization_members")
        .update({ role: primaryRole, roles: additionalRoles, status: "active" })
        .eq("id", (existingMember as any).id);
    }

    // Link staff_roster to profile (the critical linking step)
    if ((inv as any).staff_roster_id) {
      await adminClient
        .from("staff_roster")
        .update({ profile_id: profileId })
        .eq("id", (inv as any).staff_roster_id);
    }

    // Mark invitation accepted
    await adminClient
      .from("staff_invitations")
      .update({
        status:       "accepted",
        accepted_at:  new Date().toISOString(),
        auth_user_id: payload.authUserId,
      })
      .eq("id", payload.invitationId);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
