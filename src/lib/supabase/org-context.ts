/**
 * Server-side organization context.
 *
 * Stores the active org ID + role in httpOnly cookies so server components
 * and server actions can read them without a database round-trip.
 *
 * Cookie names:
 *   sc_active_org   — the active organization UUID
 *   sc_active_role  — the user's role in that org (for middleware routing)
 *
 * Security notes:
 *   - These cookies are supplementary — server helpers always re-validate
 *     membership against the database before returning sensitive data.
 *   - Cookie values are NOT trusted as a sole authorization mechanism.
 *     RLS enforces the real access control.
 *   - httpOnly: prevents JavaScript access
 *   - SameSite=lax: CSRF protection
 *   - Secure: HTTPS only in production
 */

import { cookies } from "next/headers";

export const ORG_COOKIE_NAME         = "sc_active_org";
export const ROLE_COOKIE_NAME        = "sc_active_role";
// Portal view for multi-role users (staff who are also parents)
export const PORTAL_VIEW_COOKIE_NAME = "sc_portal_view";   // "staff" | "parent"
export const HAS_PARENT_COOKIE_NAME  = "sc_has_parent";    // "1" when user has parent in roles

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure:   process.env.NODE_ENV === "production",
  path:     "/",
  maxAge:   60 * 60 * 24 * 7, // 7 days
};

/**
 * Read the active org ID from cookie.
 * Returns null if no cookie is set.
 */
export async function getActiveOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ORG_COOKIE_NAME)?.value ?? null;
}

/**
 * Read the active role from cookie.
 * Returns null if no cookie is set.
 */
export async function getActiveRole(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ROLE_COOKIE_NAME)?.value ?? null;
}

/**
 * Set the active org and role cookies.
 * Called from setActiveOrg server action.
 * Pass hasParent=true for multi-role users who also hold a parent role.
 */
export async function setActiveOrgCookies(
  orgId: string,
  role: string,
  hasParent = false
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE_NAME,  orgId, COOKIE_OPTIONS);
  cookieStore.set(ROLE_COOKIE_NAME, role,  COOKIE_OPTIONS);
  if (hasParent && role !== "parent") {
    cookieStore.set(HAS_PARENT_COOKIE_NAME, "1", COOKIE_OPTIONS);
  } else {
    cookieStore.delete(HAS_PARENT_COOKIE_NAME);
  }
}

/**
 * Read the active portal view (for multi-role users).
 * Returns "staff" | "parent" | null.
 */
export async function getPortalView(): Promise<"staff" | "parent" | null> {
  const cookieStore = await cookies();
  const v = cookieStore.get(PORTAL_VIEW_COOKIE_NAME)?.value;
  if (v === "staff" || v === "parent") return v;
  return null;
}

/**
 * Set the portal view cookie for multi-role users.
 */
export async function setPortalViewCookie(view: "staff" | "parent"): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(PORTAL_VIEW_COOKIE_NAME, view, COOKIE_OPTIONS);
}

/**
 * Clear org context cookies (on sign-out or org de-selection).
 */
export async function clearActiveOrgCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ORG_COOKIE_NAME);
  cookieStore.delete(ROLE_COOKIE_NAME);
  cookieStore.delete(HAS_PARENT_COOKIE_NAME);
  cookieStore.delete(PORTAL_VIEW_COOKIE_NAME);
}
