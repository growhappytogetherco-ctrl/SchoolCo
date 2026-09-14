"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId, resolveProfileId } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setActiveOrgCookies } from "@/lib/supabase/org-context";
import type { ActionResult } from "@/types/actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ParentLoginStatus = "no_login" | "setup_required" | "active" | "disabled";

export interface ParentLoginStatusData {
  status:               ParentLoginStatus;
  auth_user_id:         string | null;
  email:                string | null;
  org_member_status:    string | null;
  must_change_password: boolean;
}

// ── Auth guard (admin only) — mirrors staffLogin.ts assertAdmin ───────────────

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

  return {
    supabase,
    adminClient: createAdminClient(),
    orgId,
    callerRole: (member as any).role as string,
  };
}

// ── Get detailed login status for a guardian profile ──────────────────────────

export async function getParentLoginStatus(
  profileId: string
): Promise<ActionResult<ParentLoginStatusData>> {
  try {
    const { supabase, adminClient, orgId } = await assertAdmin();

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, auth_user_id")
      .eq("id", profileId)
      .single();

    const authUserId = (profile as any)?.auth_user_id as string | null;
    const email      = (profile as any)?.email as string | null;

    const { data: member } = await supabase
      .from("organization_members")
      .select("role, status")
      .eq("profile_id", profileId)
      .eq("organization_id", orgId)
      .maybeSingle();

    const orgStatus = (member as any)?.status as string | null;

    let mustChange = false;
    if (authUserId) {
      const { data: { user: authUser } } = await adminClient.auth.admin.getUserById(authUserId);
      mustChange = !!(authUser?.app_metadata?.must_change_password);
    }

    let status: ParentLoginStatus;
    if (!authUserId || !member) {
      status = "no_login";
    } else if (orgStatus === "inactive" || orgStatus === "suspended") {
      status = "disabled";
    } else if (orgStatus === "active") {
      status = mustChange ? "setup_required" : "active";
    } else {
      status = "setup_required";
    }

    return {
      success: true,
      data: { status, auth_user_id: authUserId, email, org_member_status: orgStatus, must_change_password: mustChange },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Create a new parent login account with admin-provisioned temp password ────

export async function adminCreateParentAccount(payload: {
  profileId:    string;
  tempPassword: string;
}): Promise<ActionResult<{ message: string }>> {
  try {
    const { adminClient, orgId } = await assertAdmin();

    const { data: profile, error: profErr } = await adminClient
      .from("profiles")
      .select("id, email, full_name, auth_user_id")
      .eq("id", payload.profileId)
      .maybeSingle();

    if (profErr || !profile) {
      return { success: false, error: "Guardian profile not found." };
    }
    if (!(profile as any).email) {
      return { success: false, error: "Guardian has no email address. Add one in Households first." };
    }
    if ((profile as any).auth_user_id) {
      return {
        success: false,
        error: "This guardian already has a login account. Use 'Set Temporary Password' instead.",
      };
    }

    const email = ((profile as any).email as string).toLowerCase().trim();

    // Check if an auth user already exists for this email
    const { data: { users } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
    const existingAuth = users.find((u) => u.email?.toLowerCase() === email);

    let authUserId: string;

    if (existingAuth) {
      // Reuse existing auth user — set temp password and must_change_password
      authUserId = existingAuth.id;
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(authUserId, {
        password:     payload.tempPassword,
        app_metadata: { must_change_password: true },
      });
      if (updateErr) {
        return { success: false, error: "Failed to update existing auth user: " + updateErr.message };
      }
    } else {
      // Create new auth user — email_confirm:true skips confirmation email
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

    // Link auth_user_id to profile stub (only if not already set — avoids races)
    await (adminClient as any)
      .from("profiles")
      .update({ auth_user_id: authUserId })
      .eq("id", payload.profileId)
      .is("auth_user_id", null);

    // Upsert org_member row as parent
    const { data: existingMember } = await adminClient
      .from("organization_members")
      .select("id, status")
      .eq("profile_id", payload.profileId)
      .eq("organization_id", orgId)
      .maybeSingle();

    const now = new Date().toISOString();
    if (existingMember) {
      await (adminClient as any)
        .from("organization_members")
        .update({ role: "parent", status: "active", updated_at: now })
        .eq("id", (existingMember as any).id);
    } else {
      await (adminClient as any)
        .from("organization_members")
        .insert({
          organization_id: orgId,
          profile_id:      payload.profileId,
          role:            "parent",
          status:          "active",
          created_at:      now,
          updated_at:      now,
        });
    }

    revalidatePath("/dashboard/families");
    return {
      success: true,
      data: { message: "Login account created. Guardian must change password on first login." },
    };
  } catch (e) {
    return { success: false, error: "Unexpected error: " + String(e) };
  }
}

// ── Set a temporary password on an existing parent auth account ───────────────

export async function adminSetParentTempPassword(payload: {
  profileId:    string;
  tempPassword: string;
}): Promise<ActionResult<{ message: string }>> {
  try {
    const { supabase, adminClient } = await assertAdmin();

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("auth_user_id")
      .eq("id", payload.profileId)
      .single();

    if (profErr) return { success: false, error: "Profile lookup failed: " + profErr.message };

    const authUserId = (profile as any)?.auth_user_id as string | null;
    if (!authUserId) {
      return { success: false, error: "No login account found. Create one first." };
    }

    const { data: updateResult, error: updateErr } = await adminClient.auth.admin.updateUserById(
      authUserId,
      { password: payload.tempPassword, app_metadata: { must_change_password: true } }
    );

    if (updateErr) {
      return { success: false, error: "Password update failed: " + updateErr.message };
    }
    if (!updateResult.user || updateResult.user.id !== authUserId) {
      return { success: false, error: "Unexpected: password update applied to wrong user." };
    }

    revalidatePath("/dashboard/families");
    return {
      success: true,
      data: { message: "Temporary password set. Guardian must change password on next login." },
    };
  } catch (e) {
    return { success: false, error: "Unexpected error: " + String(e) };
  }
}

// ── Send a password setup/recovery link via email ─────────────────────────────

export async function adminSendParentPasswordSetupLink(
  profileId: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, adminClient } = await assertAdmin();

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, auth_user_id")
      .eq("id", profileId)
      .single();

    const email      = (profile as any)?.email as string | null;
    const authUserId = (profile as any)?.auth_user_id as string | null;

    if (!email)      return { success: false, error: "No email address on file." };
    if (!authUserId) return { success: false, error: "No login account found. Create one first." };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://schoolco.app";

    const { error: linkErr } = await adminClient.auth.admin.generateLink({
      type:  "recovery",
      email,
      options: { redirectTo: `${appUrl}/auth/callback?next=/auth/change-password` },
    });

    if (linkErr) return { success: false, error: linkErr.message ?? "Failed to generate link." };

    // Ensure must_change_password is set so the change-password page is forced
    await adminClient.auth.admin.updateUserById(authUserId, {
      app_metadata: { must_change_password: true },
    });

    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Disable parent portal access ──────────────────────────────────────────────

export async function adminDisableParentLogin(
  profileId: string
): Promise<ActionResult<void>> {
  try {
    const { adminClient, orgId } = await assertAdmin();

    const { error } = await (adminClient as any)
      .from("organization_members")
      .update({ status: "inactive", updated_at: new Date().toISOString() })
      .eq("profile_id", profileId)
      .eq("organization_id", orgId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/families");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Re-enable parent portal access ────────────────────────────────────────────

export async function adminEnableParentLogin(
  profileId: string
): Promise<ActionResult<void>> {
  try {
    const { adminClient, orgId } = await assertAdmin();

    const { error } = await (adminClient as any)
      .from("organization_members")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("profile_id", profileId)
      .eq("organization_id", orgId);

    if (error) return { success: false, error: error.message };

    revalidatePath("/dashboard/families");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Complete password setup — called from /auth/change-password ───────────────
// Clears must_change_password, sets org context cookies if parent-only,
// and returns the appropriate redirect path.

export async function completePasswordSetup(
  newPassword: string
): Promise<ActionResult<{ redirectTo: string }>> {
  try {
    const user = await getUser();
    if (!user) return { success: false, error: "Not authenticated." };

    const adminClient = createAdminClient();

    // Update password AND clear must_change_password
    const { error } = await adminClient.auth.admin.updateUserById(user.id, {
      password:     newPassword,
      app_metadata: { must_change_password: false },
    });

    if (error) return { success: false, error: error.message };

    // Determine where to redirect based on org membership
    const profileId = await resolveProfileId(user.id);
    const supabase  = await createClient();

    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id, role, status")
      .eq("profile_id", profileId)
      .eq("status", "active")
      .limit(10);

    const mems = (memberships ?? []) as { organization_id: string; role: string }[];
    const isParentOnly = mems.length > 0 && mems.every((m) => m.role === "parent");

    if (isParentOnly && mems.length === 1) {
      // Auto-set org context so portal loads without select-mission
      await setActiveOrgCookies(mems[0].organization_id, "parent");
      return { success: true, data: { redirectTo: "/portal/children" } };
    }

    // Multi-org or staff/admin — go through select-mission for org context
    return { success: true, data: { redirectTo: "/select-mission" } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
