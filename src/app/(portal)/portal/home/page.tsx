import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap, ChevronRight } from "lucide-react";
import {
  getUser, getProfile, getGuardianChildren, getActiveOrgId,
} from "@/lib/supabase/server";
import { getParentConversationsForWidget } from "@/app/actions/messages";
import { ParentMessagesWidget } from "@/components/messages/ParentMessagesWidget";
import { Badge } from "@/components/ui/badge";
import { ENROLLMENT_LABELS } from "@/lib/constants";
import type { EnrollmentStatus } from "@/lib/constants";

export const metadata: Metadata = { title: "Family Portal" };

export default async function PortalHomePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const [children, profile, msgResult] = await Promise.all([
    getGuardianChildren(user.id, orgId),
    getProfile(user.id),
    getParentConversationsForWidget(),
  ]);

  const firstName = (profile?.full_name as string | null)?.split(" ")[0] ?? null;
  const today = new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div>
        <p className="text-label-sm text-sc-gray-400">{today}</p>
        <h1 className="font-serif text-heading-1 text-sc-navy mt-0.5">
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </h1>
        <p className="text-body-md text-sc-gray mt-1">
          {children.length === 0
            ? "Your account hasn't been linked to any students yet."
            : children.length === 1
              ? "Here's a quick look at how things are going."
              : `You have ${children.length} children enrolled.`}
        </p>
      </div>

      {/* Child cards */}
      {children.length === 0 ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 p-8 text-center">
          <GraduationCap className="size-10 text-sc-gray-300 mx-auto mb-3" />
          <p className="font-serif text-heading-3 text-sc-navy">No children linked yet</p>
          <p className="text-body-sm text-sc-gray mt-1">
            Contact your school office if this looks wrong.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="font-serif text-heading-2 text-sc-navy">My Children</h2>
          {children.map((child) => (
            <Link
              key={child.id}
              href={`/portal/children/${child.id}`}
              className="flex items-center gap-4 rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 hover:border-sc-teal transition-colors group"
            >
              {child.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={child.avatar_url}
                  alt={child.first_name}
                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sc-teal text-white font-serif text-lg">
                  {child.first_name.charAt(0)}{child.last_name.charAt(0)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="font-serif text-heading-3 text-sc-navy group-hover:text-sc-teal transition-colors">
                  {child.preferred_name ?? child.first_name} {child.last_name}
                </p>
                {child.grade_level && (
                  <p className="text-label-sm text-sc-gray mt-0.5">{child.grade_level}</p>
                )}
                {child.enrollment_status && child.enrollment_status !== "enrolled" && (
                  <div className="mt-1">
                    <Badge variant="muted" className="text-xs">
                      {ENROLLMENT_LABELS[child.enrollment_status as EnrollmentStatus] ?? child.enrollment_status}
                    </Badge>
                  </div>
                )}
              </div>

              <ChevronRight className="size-5 text-sc-gray-300 group-hover:text-sc-teal transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {/* Messages widget */}
      <ParentMessagesWidget
        conversations={msgResult.success ? msgResult.data : []}
        totalUnread={msgResult.success ? msgResult.data.reduce((n, c) => n + c.unread_count, 0) : 0}
        userId={user.id}
      />
    </div>
  );
}
