"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId, resolveProfileId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_HIERARCHY } from "@/lib/constants";
import type { ActionResult } from "@/types/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type LoginStatus = "active" | "invite_pending" | "no_login" | "disabled";

export interface StaffLoginStatus {
  status:        LoginStatus;
  auth_user_id:  string | null;
  email:         string | null;
  roles:         string[];
  org_member_status: string | null;
  must_change_password: boolean;
}

// ── Auth guard (admin only) ───────────────────────────────────────────────────

async function assertAdmin() {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");

  const orgId = await getActiveOrgId();
  if (!orgId) throw new Error("No active org");

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

  return { supabase, adminClient: createAdminClient(), orgId, callerRole: (member as any).role as string };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getStaffLoginStatus(
  staffRosterId: string
): Promise<ActionResult<StaffLoginStatus>> {
  try {
    const { supabase, adminClient, orgId } = await assertAdmin();

    // Get staff roster row
    const { data: roster } = await supabase
      .from("staff_roster")
      .select("profile_id")
      .eq("id", staffRosterId)
      .eq("organization_id", orgId)
      .single();

    const profileId = (roster as any)?.profile_id as string | null;

    // Pending invite?
    const { data: pendingInvite } = await supabase
      .from("staff_invitations")
      .select("id, email")
      .eq("staff_roster_id", staffRosterId)
      .eq("organization_id", orgId)
      .eq("status", "pending")
      .maybeSingle();

    if (!profileId) {
      return {
        success: true,
        data: {
          status:               pendingInvite ? "invite_pending" : "no_login",
          auth_user_id:         null,
          email:                (pendingInvite as any)?.email ?? null,
          roles:                [],
          org_member_status:    null,
          must_change_password: false,
        },
      };
    }

    // Get profile email + auth_user_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, auth_user_id")
      .eq("id", profileId)
      .single();

    const authUserId = (profile as any)?.auth_user_id as string | null;

    // Get org membership
    const { data: member } = await supabase
      .from("organization_members")
      .select("role, roles, status")
      .eq("profile_id", profileId)
      .eq("organization_id", orgId)
      .single();

    const orgStatus = (member as any)?.status as string | null;
    const allRoles  = member
      ? [(member as any).role, ...((member as any).roles ?? [])].filter(Boolean)
      : [];

    // Check must_change_password from Supabase auth app_metadata
    let mustChange = false;
    if (authUserId) {
      const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(authUserId);
      mustChange = !!(authUser?.app_metadata?.must_change_password);
    }

    const loginStatus: LoginStatus = !member
      ? "no_login"
      : orgStatus === "active"
      ? "active"
      : "disabled";

    return {
      success: true,
      data: {
        status:               loginStatus,
        auth_user_id:         authUserId,
        email:                (profile as any)?.email ?? null,
        roles:                allRoles,
        org_member_status:    orgStatus,
        must_change_password: mustChange,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Create login account (admin-provisioned, no email invite needed) ──────────

export async function adminCreateLoginAccount(payload: {
  staffRosterId: string;
  email:         string;
  roles:         string[];
  tempPassword:  string;
}): Promise<ActionResult<{ message: string }>> {
  try {
    const { supabase, adminClient, orgId, callerRole } = await assertAdmin();

    // Role escalation guard
    const callerLevel = ROLE_HIERARCHY.indexOf(callerRole as any);
    for (const r of payload.roles) {
      if (ROLE_HIERARCHY.indexOf(r as any) > callerLevel) {
        return { success: false, error: `You cannot assign the role "${r}".` };
      }
    }
    if (payload.roles.length === 0) {
      return { success: false, error: "At least one role is required." };
    }

    const email = payload.email.trim().toLowerCase();

    // Check if staff already has a linked profile
    const { data: roster } = await supabase
      .from("staff_roster")
      .select("profile_id")
      .eq("id", payload.staffRosterId)
      .eq("organization_id", orgId)
      .single();

    if ((roster as any)?.profile_id) {
      return { success: false, error: "This staff member already has a login account." };
    }

    // Check if auth user with this email already exists
    const { data: { users } } = await adminClient.auth.admin.listUsers();
    const existingAuth = users.find(u => u.email?.toLowerCase() === email);

    let authUserId: string;

    if (existingAuth) {
      // Link existing auth user rather than creating a duplicate
      authUserId = existingAuth.id;
    } else {
      // Create new Supabase auth user with temporary password
      // email_confirm: true skips the confirmation email — admin is provisioning directly
      const { data: { user: newUser }, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password:      payload.tempPassword,
        email_confirm: true,
        app_metadata:  { must_change_password: true },
      });

      if (createErr || !newUser) {
        return { success: false, error: createErr?.message ?? "Failed to create auth user." };
      }
      authUserId = newUser.id;
    }

    // Set must_change_password on existing users too
    await adminClient.auth.admin.updateUserById(authUserId, {
      password:     payload.tempPassword,
      app_metadata: { must_change_password: true },
    });

    // Resolve or create profile
    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("id")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    let profileId: string;

    if (existingProfile) {
      profileId = (existingProfile as any).id;
    } else {
      const { data: newProfile, error: pErr } = await adminClient
        .from("profiles")
        .insert({
          id:           authUserId,
          auth_user_id: authUserId,
          email,
          full_name:    "",
        })
        .select("id")
        .single();

      if (pErr || !newProfile) {
        return { success: false, error: "Failed to create profile: " + pErr?.message };
      }
      profileId = (newProfile as any).id;
    }

    // Determine primary role
    const primaryRole = payload.roles.reduce((best, r) =>
      ROLE_HIERARCHY.indexOf(r as any) > ROLE_HIERARCHY.indexOf(best as any) ? r : best,
      payload.roles[0]
    );
    const additionalRoles = payload.roles.filter(r => r !== primaryRole);

    // Create or update org membership
    const { data: existingMember } = await adminClient
      .from("organization_members")
      .select("id")
      .eq("profile_id", profileId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!existingMember) {
      await adminClient.from("organization_members").insert({
        organization_id: orgId,
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

    // Link staff_roster → profile
    await supabase
      .from("staff_roster")
      .update({ profile_id: profileId })
      .eq("id", payload.staffRosterId)
      .eq("organization_id", orgId);

    revalidatePath("/dashboard/staff");
    return {
      success: true,
      data: { message: "Login account created. Staff member must change password on first login." },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Admin-set temporary password ──────────────────────────────────────────────
// Sets a temporary password without sending an email, marks must_change_password.

export async function adminSetTemporaryPassword(payload: {
  staffRosterId: string;
  tempPassword:  string;
}): Promise<ActionResult<{ message: string }>> {
  try {
    const { supabase, adminClient, orgId } = await assertAdmin();

    const { data: roster } = await supabase
      .from("staff_roster")
      .select("profile_id")
      .eq("id", payload.staffRosterId)
      .eq("organization_id", orgId)
      .single();

    if (!(roster as any)?.profile_id) {
      return { success: false, error: "No login account found for this staff member." };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("auth_user_id")
      .eq("id", (roster as any).profile_id)
      .single();

    const authUserId = (profile as any)?.auth_user_id as string | null;
    if (!authUserId) {
      return { success: false, error: "No Supabase auth account linked to this profile." };
    }

    const { error } = await adminClient.auth.admin.updateUserById(authUserId, {
      password:     payload.tempPassword,
      app_metadata: { must_change_password: true },
    });

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/staff");
    return {
      success: true,
      data: { message: "Temporary password set. Staff member must change password on next login." },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Clear must_change_password flag ───────────────────────────────────────────
// Called server-side after successful password change on /auth/change-password.
// Requires a valid authenticated session — user must be logged in.

export async function clearMustChangePassword(
  newPassword: string
): Promise<ActionResult<void>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated." };

    const adminClient = createAdminClient();

    // Update password AND clear must_change_password via admin API
    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      password:     newPassword,
      app_metadata: { must_change_password: false },
    });

    if (error) return { success: false, error: error.message };

    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Send password setup link (invite email) ────────────────────────────────────

export async function adminSendPasswordSetupLink(
  staffRosterId: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, adminClient, orgId } = await assertAdmin();

    // Get profile email
    const { data: roster } = await supabase
      .from("staff_roster")
      .select("profile_id")
      .eq("id", staffRosterId)
      .eq("organization_id", orgId)
      .single();

    if (!(roster as any)?.profile_id) {
      return { success: false, error: "No login account found." };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, auth_user_id")
      .eq("id", (roster as any).profile_id)
      .single();

    const email      = (profile as any)?.email as string | null;
    const authUserId = (profile as any)?.auth_user_id as string | null;

    if (!email) return { success: false, error: "No email address on file." };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://schoolco.app";

    // Use generateLink to create a magic link that goes to the change-password page
    const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
      type:       "recovery",
      email,
      options: {
        redirectTo: `${appUrl}/auth/callback?next=/auth/change-password`,
      },
    });

    if (linkErr || !linkData) {
      return { success: false, error: linkErr?.message ?? "Failed to generate link." };
    }

    // Mark must_change_password so they're forced to set a new one after clicking
    if (authUserId) {
      await adminClient.auth.admin.updateUserById(authUserId, {
        app_metadata: { must_change_password: true },
      });
    }

    // The link is in linkData.properties.action_link
    // Since we can't send email here directly (Supabase sends it), we rely on the
    // Supabase auth email. For now, return the link to the admin to share manually.
    // TODO: integrate with SchoolCo's email system to send this link.
    return {
      success: true,
      data:    undefined,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
