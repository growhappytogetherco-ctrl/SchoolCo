/**
 * Server-side role guard helpers.
 * Import these in server page.tsx files to enforce role-based access.
 * These are defense-in-depth — RLS is still the primary access control.
 */

import { redirect } from "next/navigation";
import { getActiveRole } from "@/lib/supabase/org-context";
import { isAdminRole, isStaffRole, getRoleLevel } from "@/lib/constants";

/**
 * Require a minimum role level. Redirects to /dashboard/home if not met.
 * Call at the top of a server page component.
 */
export async function requireRole(minimumRole: string): Promise<string> {
  const role = await getActiveRole();
  const { ROLE_HIERARCHY } = await import("@/lib/constants");
  const minLevel = ROLE_HIERARCHY.indexOf(minimumRole as never);
  const userLevel = role ? ROLE_HIERARCHY.indexOf(role as never) : -1;
  if (userLevel < minLevel) redirect("/dashboard/home");
  return role ?? "";
}

/** Require staff-level access (teacher or above). */
export async function requireStaff(): Promise<string> {
  const role = await getActiveRole();
  if (!isStaffRole(role)) redirect("/dashboard/home");
  return role!;
}

/** Require admin-level access. */
export async function requireAdmin(): Promise<string> {
  const role = await getActiveRole();
  if (!isAdminRole(role)) redirect("/dashboard/home");
  return role!;
}

/** Return the current role without redirecting. Used for conditional rendering. */
export async function getCurrentRole(): Promise<string | null> {
  return getActiveRole();
}
