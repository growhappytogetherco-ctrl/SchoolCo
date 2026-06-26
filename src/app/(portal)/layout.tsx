import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { getActiveOrgId, getActiveRole } from "@/lib/supabase/org-context";
import { BookOpen, User, LogOut, Home } from "lucide-react";

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

  const role  = await getActiveRole();
  // Belt-and-suspenders: only parents/guardians access this layout.
  if (role !== "parent") redirect("/dashboard/home");

  return (
    <div className="min-h-screen bg-sc-cream flex flex-col">
      {/* ── Top nav ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-sc-gray-100 bg-white shadow-sm">
        <div className="mx-auto max-w-2xl flex h-14 items-center justify-between px-4 sm:px-6">
          <Link href="/portal/children" className="flex items-center gap-2">
            <span className="font-serif text-sc-navy font-bold text-lg">SchoolCo</span>
            <span className="text-sc-gray text-label-sm hidden sm:block">· Family Portal</span>
          </Link>
          <nav className="flex items-center gap-4">
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
              <span className="hidden sm:block">Settings</span>
            </Link>
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
