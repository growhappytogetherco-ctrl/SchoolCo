"use server";

/**
 * inviteParentPortalUser — minimal, isolated portal invitation action.
 *
 * Design rules:
 *  - No revalidatePath / redirect — caller refreshes the page after success
 *  - Audit logging is non-blocking (failure does NOT fail the invite)
 *  - All expected operational errors are returned as { success: false, error }
 *  - Unexpected errors are caught and returned as { success: false, error }
 *  - Admin client used for all DB writes (no RLS interference)
 *  - Uses status "active" immediately — Supabase Auth gates actual access, not membership_status
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/org-context";
import { writeAuditLog } from "@/lib/audit";

// Roles that grant staff-level access (must not be downgraded to parent)
const STAFF_ROLES = new Set([
  "teacher", "staff", "registrar", "admin", "full_admin", "platform_admin",
]);

// Roles allowed to send portal invitations
const INVITE_ROLES = new Set([
  "registrar", "admin", "full_admin", "platform_admin",
]);

export type InviteResult =
  | { success: true;  outcome: "invited" | "resent" | "staff_parent_added" | "already_active" }
  | { success: false; error: string };

export async function inviteParentPortalUser(rawData: {
  profile_id: string;
  family_id:  string;
}): Promise<InviteResult> {
  try {
    // ── 1. Authenticate caller ─────────────────────────────────────────────
    const supabase     = await createClient();
    const { data: { user: caller } } = await supabase.auth.getUser();
    if (!caller) return { success: false, error: "Not authenticated." };

    // ── 2. Org context ─────────────────────────────────────────────────────
    const orgId = await getActiveOrgId();
    if (!orgId) return { success: false, error: "No active organization." };

    // ── 3. Permission check ────────────────────────────────────────────────
    const { data: callerRow } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", caller.id)
      .eq("organization_id", orgId)
      .eq("status", "active")
      .maybeSingle();

    if (!callerRow || !INVITE_ROLES.has((callerRow as { role: string }).role)) {
      return { success: false, error: "Insufficient permissions. Registrar or above required." };
    }

    // ── 4. Load guardian profile (admin client — bypasses profile RLS) ─────
    const adminClient = createAdminClient();
    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select("id, email, full_name, auth_user_id")
      .eq("id", rawData.profile_id)
      .maybeSingle();

    if (profileErr || !profile) {
      return { success: false, error: "Guardian profile not found." };
    }
    if (!profile.email) {
      return { success: false, error: "Guardian has no email address on file. Add an email in Households before sending a portal invite." };
    }

    // ── 5. Check existing org_members row ─────────────────────────────────
    const { data: existingRow } = await adminClient
      .from("organization_members")
      .select("role, status, roles")
      .eq("profile_id", rawData.profile_id)
      .eq("organization_id", orgId)
      .maybeSingle();

    const existing = existingRow as { role: string; status: string; roles: string[] } | null;
    const isStaff  = !!(existing && STAFF_ROLES.has(existing.role));

    // ── 6. Staff + parent path ─────────────────────────────────────────────
    // Never change a staff member's primary role. Add "parent" to roles array.
    if (isStaff) {
      const currentRoles: string[] = (existing?.roles ?? []);
      if (!currentRoles.includes("parent")) {
        const newRoles = [...currentRoles, "parent"];
        const { error: updErr } = await adminClient
          .from("organization_members")
          .update({ roles: newRoles, updated_at: new Date().toISOString() })
          .eq("profile_id", rawData.profile_id)
          .eq("organization_id", orgId);
        if (updErr) return { success: false, error: `Failed to add parent role: ${updErr.message}` };
      }
      // Non-blocking audit
      void writeAuditLog(supabase, {
        organizationId: orgId, actorId: caller.id,
        action: "guardian.portal_invite_staff_parent_added",
        resourceType: "profile", resourceId: rawData.profile_id,
        metadata: { email: profile.email },
      }).catch((e) => console.error("[inviteParentPortalUser] audit error", e));

      return { success: true, outcome: "staff_parent_added" };
    }

    // ── 7. Already has an active portal account ────────────────────────────
    if (existing?.status === "active") {
      return { success: true, outcome: "already_active" };
    }

    // ── 8. Determine whether an Auth user already exists for this email ────
    let authUserId: string | null = (profile as any).auth_user_id ?? null;

    if (!authUserId) {
      // Check if another profile row has auth_user_id set for this email
      // (handles: user signed up before their guardian stub was created)
      const { data: linked } = await adminClient
        .from("profiles")
        .select("auth_user_id")
        .eq("email", profile.email)
        .not("auth_user_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (linked?.auth_user_id) authUserId = (linked as any).auth_user_id;
    }

    // ── 9. Send Supabase Auth invitation (or resend) ───────────────────────
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://schoolco.app"}/auth/callback?next=/portal/children`;

    if (!authUserId) {
      // No existing auth account → send invite, get new user ID from response
      const { data: inviteData, error: inviteErr } = await adminClient.auth.admin
        .inviteUserByEmail(profile.email, {
          data:       { full_name: profile.full_name ?? "" },
          redirectTo,
        });

      if (inviteErr) {
        // "already registered" variants — fall through to look up user by email
        const isAlreadyExists = inviteErr.message.toLowerCase().includes("already registered")
          || inviteErr.message.toLowerCase().includes("user already");

        if (!isAlreadyExists) {
          return { success: false, error: `Failed to send invitation email: ${inviteErr.message}` };
        }

        // Auth user exists but wasn't linked — find via listUsers
        const { data: listData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const found = listData?.users?.find(
          (u) => u.email?.toLowerCase() === profile.email!.toLowerCase()
        );
        if (found) authUserId = found.id;
        // If still not found, proceed without setting auth_user_id (they can log in and link later)
      } else {
        authUserId = inviteData.user.id;
      }
    } else {
      // Auth user exists — resend invitation to same email
      const { error: resendErr } = await adminClient.auth.admin
        .inviteUserByEmail(profile.email, { data: { full_name: profile.full_name ?? "" }, redirectTo });
      // Ignore "already registered" error on resend — the invite email was resent regardless
      if (resendErr && !resendErr.message.toLowerCase().includes("already registered")
            && !resendErr.message.toLowerCase().includes("user already")) {
        return { success: false, error: `Failed to resend invitation email: ${resendErr.message}` };
      }
    }

    // ── 10. Link auth_user_id to the guardian profile stub ────────────────
    if (authUserId && !(profile as any).auth_user_id) {
      // handle_new_user trigger may have already set this; update is idempotent
      await adminClient
        .from("profiles")
        .update({ auth_user_id: authUserId })
        .eq("id", rawData.profile_id)
        .is("auth_user_id", null); // only write if still null — avoid races
    }

    // ── 11. Create or update org_members row ──────────────────────────────
    // Use "active" immediately — Supabase Auth gates actual login, so a parent
    // only gains access after accepting the email invite. "pending" would prevent
    // the portal from loading even after acceptance.
    const now = new Date().toISOString();
    const isResend = !!existing; // row already exists from a prior invite attempt
    let outcome: "invited" | "resent" = "invited";

    if (existing) {
      // Re-invite: reset to active (re-enables disabled access too)
      const { error: updErr } = await adminClient
        .from("organization_members")
        .update({ role: "parent", roles: ["parent"], status: "active", updated_at: now })
        .eq("profile_id", rawData.profile_id)
        .eq("organization_id", orgId);
      if (updErr) return { success: false, error: `Failed to update member record: ${updErr.message}` };
      outcome = "resent";
    } else {
      // First invite: insert new row as active
      const { error: insErr } = await adminClient
        .from("organization_members")
        .insert({
          organization_id: orgId,
          profile_id:      rawData.profile_id,
          role:            "parent",
          roles:           ["parent"],
          status:          "active",
          created_at:      now,
          updated_at:      now,
        });
      if (insErr) return { success: false, error: `Failed to create member record: ${insErr.message}` };
    }

    // ── 12. Audit log (non-blocking — must not fail the invite) ───────────
    void writeAuditLog(supabase, {
      organizationId: orgId, actorId: caller.id,
      action: isResend ? "guardian.portal_reinvited" : "guardian.portal_invited",
      resourceType: "profile", resourceId: rawData.profile_id,
      metadata: { email: profile.email, authUserId },
    }).catch((e) => console.error("[inviteParentPortalUser] audit error", e));

    return { success: true, outcome };

  } catch (err) {
    console.error("[inviteParentPortalUser] unexpected error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "An unexpected error occurred. Please try again.",
    };
  }
}
