import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { ORG_COOKIE_NAME, ROLE_COOKIE_NAME } from "@/lib/supabase/org-context";

/**
 * Next.js Middleware — runs on every matched request.
 *
 * Responsibilities:
 * 1. Refresh the Supabase auth session (required for SSR).
 * 2. Protect all /dashboard/*, /portal/*, and /select-mission routes.
 * 3. Redirect unauthenticated users to /login.
 * 4. Redirect authenticated users away from /login.
 * 5. Route-guard by role:
 *    - Parents (role='parent') → /portal only, never /dashboard
 *    - Staff/admin → /dashboard only, not /portal
 *    - Both → /select-mission when no org context is set
 *
 * Security notes:
 *   - Role cookie is supplementary — server-side DB validation is the real gate.
 *   - Layout components and server helpers always re-validate membership.
 *   - Middleware is defense-in-depth, not the sole access control.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabaseResponse, user } = await updateSession(request);

  // ── Public routes — always accessible ──────────────────────
  const PUBLIC_ROUTES = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/privacy",
    "/terms",
    "/auth/callback",
    "/attendance/scan", // native-camera QR landing — handles its own auth redirect
  ];

  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  // ── Static assets & Next internals — skip ──────────────────
  const isInternalRoute =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    (pathname.includes(".") && !pathname.startsWith("/dashboard") && !pathname.startsWith("/portal"));

  if (isInternalRoute) return supabaseResponse;

  // ── Not authenticated ───────────────────────────────────────
  if (!user) {
    if (!isPublicRoute) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      if (pathname !== "/") {
        loginUrl.searchParams.set("next", pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
    return supabaseResponse;
  }

  // ── Authenticated: redirect root and login ──────────────────
  if (pathname === "/login" || pathname === "/") {
    const orgId = request.cookies.get(ORG_COOKIE_NAME)?.value;
    const role  = request.cookies.get(ROLE_COOKIE_NAME)?.value;

    if (orgId && role) {
      const dest = role === "parent" ? "/portal/children" : "/dashboard/home";
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.redirect(new URL("/select-mission", request.url));
  }

  // ── Role-based route guarding ───────────────────────────────
  const role  = request.cookies.get(ROLE_COOKIE_NAME)?.value;
  const orgId = request.cookies.get(ORG_COOKIE_NAME)?.value;

  const isParent    = role === "parent";
  const isDashboard = pathname.startsWith("/dashboard");
  const isPortal    = pathname.startsWith("/portal");

  // Parent trying to access staff dashboard — redirect to portal
  if (isParent && isDashboard) {
    return NextResponse.redirect(new URL("/portal/children", request.url));
  }

  // Staff trying to access parent portal — redirect to dashboard
  if (!isParent && role && isPortal) {
    return NextResponse.redirect(new URL("/dashboard/home", request.url));
  }

  // Accessing protected route with no org context — pick a mission
  if ((isDashboard || isPortal) && !orgId) {
    return NextResponse.redirect(new URL("/select-mission", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
