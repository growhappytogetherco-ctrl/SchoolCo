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

export const ORG_COOKIE_NAME  = "sc_active_org";
export const ROLE_COOKIE_NAME = "sc_active_role";

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
 */
export async function setActiveOrgCookies(orgId: string, role: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ORG_COOKIE_NAME,  orgId, COOKIE_OPTIONS);
  cookieStore.set(ROLE_COOKIE_NAME, role,  COOKIE_OPTIONS);
}

/**
 * Clear org context cookies (on sign-out or org de-selection).
 */
export async function clearActiveOrgCookies(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ORG_COOKIE_NAME);
  cookieStore.delete(ROLE_COOKIE_NAME);
}
