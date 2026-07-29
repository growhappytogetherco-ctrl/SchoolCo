import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  ORG_COOKIE_NAME, ROLE_COOKIE_NAME,
  PORTAL_VIEW_COOKIE_NAME, HAS_PARENT_COOKIE_NAME,
} from "@/lib/supabase/org-context";

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
    const orgId      = request.cookies.get(ORG_COOKIE_NAME)?.value;
    const role       = request.cookies.get(ROLE_COOKIE_NAME)?.value;
    const pView      = request.cookies.get(PORTAL_VIEW_COOKIE_NAME)?.value;
    const hasParentC = request.cookies.get(HAS_PARENT_COOKIE_NAME)?.value === "1";

    if (orgId && role) {
      let dest: string;
      if (pView === "parent" || (role === "parent" && !hasParentC)) {
        dest = "/portal/children";
      } else if (hasParentC && !pView) {
        dest = "/select-view";
      } else {
        dest = "/dashboard/home";
      }
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.redirect(new URL("/select-mission", request.url));
  }

  // ── Role-based route guarding ───────────────────────────────
  const role        = request.cookies.get(ROLE_COOKIE_NAME)?.value;
  const orgId       = request.cookies.get(ORG_COOKIE_NAME)?.value;
  const portalView  = request.cookies.get(PORTAL_VIEW_COOKIE_NAME)?.value; // "staff" | "parent"
  const hasParent   = request.cookies.get(HAS_PARENT_COOKIE_NAME)?.value === "1";

  // Effective portal mode:
  // - Multi-role users: driven by portalView cookie
  // - Parent-only users: always parent mode
  const isParentMode =
    portalView === "parent" ||
    (role === "parent" && portalView !== "staff") ||
    (hasParent && portalView === "parent");

  const isDashboard = pathname.startsWith("/dashboard");
  const isPortal    = pathname.startsWith("/portal");
  const isSelectView = pathname.startsWith("/select-view");

  // Allow /select-view for multi-role users without redirection
  if (isSelectView) return supabaseResponse;

  // Parent-mode user trying to access staff dashboard — redirect to portal
  if (isParentMode && isDashboard) {
    return NextResponse.redirect(new URL("/portal/home", request.url));
  }

  // Non-parent user trying to access parent portal (and not a multi-role user in parent mode)
  if (!isParentMode && role && role !== "parent" && !hasParent && isPortal) {
    return NextResponse.redirect(new URL("/dashboard/home", request.url));
  }

  // Staff-mode multi-role user trying to access portal — redirect to dashboard
  if (!isParentMode && hasParent && isPortal) {
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
