import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser, getProfile } from "@/lib/supabase/server";
import { getActiveOrgId, getActiveRole, HAS_PARENT_COOKIE_NAME, PORTAL_VIEW_COOKIE_NAME } from "@/lib/supabase/org-context";
import { PortalHeaderAccount } from "@/components/layout/PortalHeader";
import { PortalMessagesLink } from "@/components/messages/PortalMessagesLink";
import { getParentUnreadForWidget } from "@/app/actions/messages";
import { Home, GraduationCap, Calendar, BookOpen, BarChart2, DollarSign } from "lucide-react";
import { cookies } from "next/headers";

/**
 * Parent Portal layout — Sprint 2.
 *
 * Security:
 * - Middleware already redirects non-parents away from /portal routes.
 * - This layout re-validates the role server-side as a second layer.
 * - Multi-role users (e.g. full_admin + parent) are allowed when sc_portal_view=parent.
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

  // Verify staff access via DB (not just the cookie) before offering the switch button.
  // A parent-only user will have no staff roles in the `roles` column.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const profile = await getProfile(user.id);
  const { data: membership } = await supabase
    .from("organization_members")
    .select("roles, role")
    .eq("profile_id", profile?.id ?? "")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const allRoles = (membership?.roles as string[] | null) ?? [membership?.role as string];
  const hasStaffAccess = allRoles.some(
    (r) => !["parent", "student_future"].includes(r)
  );
  // isMultiRole: user has both parent access AND at least one staff role
  const isMultiRole = hasParent && hasStaffAccess;

  const firstName = (profile?.full_name as string | null)?.split(" ")[0] ?? null;

  // Unread conversation count for the Messages badge — conversation-based, parent_visible-filtered
  const unreadResult = await getParentUnreadForWidget();
  const initialUnread = unreadResult.success ? unreadResult.data.unread_count : 0;

  return (
    <div className="min-h-screen bg-sc-cream flex flex-col">
      {/* ── Top nav ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-sc-gray-100 bg-white shadow-sm">
        <div className="mx-auto max-w-2xl flex h-14 items-center justify-between px-4 sm:px-6">
          <Link href="/portal/home" className="flex items-center gap-2 shrink-0">
            <span className="font-serif text-sc-navy font-bold text-lg">SchoolCo</span>
            <span className="text-sc-gray text-label-sm hidden sm:block">· Family Portal</span>
          </Link>

          {/* Page-nav links — 8 items fit on all screen sizes as icons */}
          <nav className="flex items-center gap-0.5 sm:gap-1">
            <Link
              href="/portal/home"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-label-sm text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
              title="Home"
            >
              <Home className="size-4" />
              <span className="hidden md:block">Home</span>
            </Link>
            <Link
              href="/portal/children"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-label-sm text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
              title="My Children"
            >
              <GraduationCap className="size-4" />
              <span className="hidden md:block">Children</span>
            </Link>
            <Link
              href="/portal/calendar"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-label-sm text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
              title="Calendar"
            >
              <Calendar className="size-4" />
              <span className="hidden md:block">Calendar</span>
            </Link>
            <Link
              href="/portal/attendance"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-label-sm text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
              title="Attendance"
            >
              <Calendar className="size-4" />
              <span className="hidden md:block">Attendance</span>
            </Link>
            <Link
              href="/portal/grades"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-label-sm text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
              title="Grades"
            >
              <BarChart2 className="size-4" />
              <span className="hidden md:block">Grades</span>
            </Link>
            <Link
              href="/portal/academics"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-label-sm text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
              title="Academics"
            >
              <BookOpen className="size-4" />
              <span className="hidden md:block">Academics</span>
            </Link>
            <Link
              href="/portal/finance"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-label-sm text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
              title="Finance"
            >
              <DollarSign className="size-4" />
              <span className="hidden md:block">Finance</span>
            </Link>
            <PortalMessagesLink userId={user.id} initialCount={initialUnread} />
          </nav>

          {/* Account dropdown — contains My Account, Switch to Staff Portal, Sign Out */}
          <PortalHeaderAccount
            userName={firstName ?? "Account"}
            isMultiRole={isMultiRole}
          />
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
