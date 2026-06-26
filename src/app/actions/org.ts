"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setActiveOrgCookies, clearActiveOrgCookies } from "@/lib/supabase/org-context";
import type { ActionResult } from "@/types/actions";

const SetActiveOrgSchema = z.object({
  orgId: z.string().uuid("Invalid organization ID"),
});

/**
 * setActiveOrg — sets the active org cookie after validating membership.
 *
 * Called from the select-mission page when a user picks an org.
 * Sets httpOnly cookies: sc_active_org + sc_active_role.
 * Redirects to /dashboard/home for staff or /portal/children for parents.
 *
 * Security: validates membership in the database before setting cookies.
 * Never trusts the orgId alone.
 */
export async function setActiveOrg(formData: FormData): Promise<ActionResult<void>> {
  const parse = SetActiveOrgSchema.safeParse({
    orgId: formData.get("orgId"),
  });

  if (!parse.success) {
    return { success: false, error: "Invalid organization." };
  }

  const { orgId } = parse.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated." };
  }

  // Validate that this user is an active member of the requested org
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  if (error || !membership) {
    return { success: false, error: "You are not a member of this organization." };
  }

  // Set cookies (server-side, httpOnly)
  await setActiveOrgCookies(orgId, membership.role);

  // Route based on role
  const isParent = membership.role === "parent";
  redirect(isParent ? "/portal/children" : "/dashboard/home");
}

/**
 * clearOrgContext — clears org cookies on sign-out.
 */
export async function clearOrgContext(): Promise<void> {
  await clearActiveOrgCookies();
}
