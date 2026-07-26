import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser, getProfile } from "@/lib/supabase/server";
import { getActiveOrgId, getActiveRole, HAS_PARENT_COOKIE_NAME, PORTAL_VIEW_COOKIE_NAME } from "@/lib/supabase/org-context";
import { setPortalView } from "@/app/actions/org";
import { User, Home, LayoutDashboard } from "lucide-react";
import { cookies } from "next/headers";

/**
 * Parent Portal layout — Sprint 2.
 *
 * Security:
 * - Middleware already redirects non-parents away from /portal routes.
 * - This layout re-validates the role server-side as a second layer.
 * - Parents can ONLY see this layout and the pages under (portal)/.
 * - Staff pages (/dashboard/*) are never rendered here.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const role        = await getActiveRole();
  const cookieStore = await cookies();
  const hasParent   = cookieStore.get(HAS_PARENT_COOKIE_NAME)?.value === "1";
  const portalView  = cookieStore.get(PORTAL_VIEW_COOKIE_NAME)?.value;

  // Allow access if: primary role is parent, OR multi-role user in parent view mode.
  const isAllowed = role === "parent" || (hasParent && portalView === "parent");
  if (!isAllowed) redirect("/dashboard/home");

  const isMultiRole = hasParent;

  const profile = await getProfile(user.id);
  const firstName = (profile?.full_name as string | null)?.split(" ")[0] ?? null;

  return (
    <div className="min-h-screen bg-sc-cream flex flex-col">
      {/* ── Top nav ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-sc-gray-100 bg-white shadow-sm">
        <div className="mx-auto max-w-2xl flex h-14 items-center justify-between px-4 sm:px-6">
          <Link href="/portal/children" className="flex items-center gap-2">
            <span className="font-serif text-sc-navy font-bold text-lg">SchoolCo</span>
            <span className="text-sc-gray text-label-sm hidden sm:block">· Family Portal</span>
          </Link>
          <nav className="flex items-center gap-3">
            <Link
              href="/portal/children"
              className="flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
            >
              <Home className="size-4" />
              <span className="hidden sm:block">My Children</span>
            </Link>
            <Link
              href="/portal/settings"
              className="flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
            >
              <User className="size-4" />
              <span className="hidden sm:block">{firstName ?? "Settings"}</span>
            </Link>
            {isMultiRole && (
              <form action={async () => {
                "use server";
                const form = new FormData();
                form.set("view", "staff");
                await setPortalView(form);
              }}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 text-label-sm text-sc-teal font-medium hover:text-sc-teal-700 transition-colors"
                  title="Switch to Staff Dashboard"
                >
                  <LayoutDashboard className="size-4" />
                  <span className="hidden sm:block">Staff View</span>
                </button>
              </form>
            )}
          </nav>
        </div>
      </header>

      {/* ── Page content ─────────────────────────────────────────────── */}
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 sm:px-6 py-8">
        {children}
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-sc-gray-100 bg-white py-4 px-6 text-center text-label-sm text-sc-gray-400">
        SchoolCo Family Portal · Every Child Known. Every Family Connected.
      </footer>
    </div>
  );
}
