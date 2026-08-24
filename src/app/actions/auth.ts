"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clearActiveOrgCookies } from "@/lib/supabase/org-context";

/**
 * signOutAction — ends the authenticated session.
 *
 * Clears the Supabase auth session AND the org-context cookies
 * (sc_active_org, sc_active_role, sc_has_parent, sc_portal_view)
 * so that after logout, the cookies do not remain to redirect
 * an unauthenticated user into protected pages.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  await clearActiveOrgCookies();
  redirect("/login");
}
