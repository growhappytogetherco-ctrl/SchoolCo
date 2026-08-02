import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BadgeCheck, Clock, ChevronRight, GraduationCap, Calendar } from "lucide-react";
import {
  getUser, getProfile, getGuardianChildren, getStudentForParent, getActiveOrgId,
} from "@/lib/supabase/server";
import { getParentConversationsForWidget } from "@/app/actions/messages";
import { ParentMessagesWidget } from "@/components/messages/ParentMessagesWidget";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Family Portal" };

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TodayStatusChip({ att }: {
  att: {
    status: string;
    check_in_at: string | null;
    check_out_at: string | null;
    is_late: boolean;
  } | null;
}) {
  if (!att) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sc-gray-100 px-3 py-1 text-label-sm text-sc-gray-500">
        <Clock className="size-3.5" /> Not yet recorded
      </span>
    );
  }
  if (att?.check_out_at) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sc-navy/10 border border-sc-navy/20 px-3 py-1 text-label-sm text-sc-navy font-medium">
        <Clock className="size-3.5" /> Checked out {fmtTime(att.check_out_at)}
      </span>
    );
  }
  if (att?.check_in_at) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-label-sm font-medium",
        att.is_late
          ? "bg-sc-gold-50 border-sc-gold-200 text-sc-gold-700"
          : "bg-sc-teal-50 border-sc-teal-200 text-sc-teal-700"
      )}>
        <BadgeCheck className="size-3.5" />
        On campus {att.is_late ? "· Late" : `since ${fmtTime(att.check_in_at)}`}
      </span>
    );
  }
  if (att?.status === "absent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sc-rose-50 border border-sc-rose-200 px-3 py-1 text-label-sm text-sc-rose-700 font-medium">
        <Clock className="size-3.5" /> Absent today
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sc-gray-100 px-3 py-1 text-label-sm text-sc-gray-500">
      <Clock className="size-3.5" /> Not yet recorded
    </span>
  );
}

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

  // Fetch today's status for each child (in parallel, max 4 children)
  const childDetails = await Promise.all(
    children.slice(0, 4).map((c) => getStudentForParent(c.id, user.id, orgId))
  );

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

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/portal/children"
          className="flex flex-col gap-2 rounded-2xl bg-sc-teal p-4 text-white hover:bg-sc-teal-700 transition-colors"
        >
          <GraduationCap className="size-5 opacity-80" />
          <span className="font-serif text-heading-3">My Children</span>
          <span className="text-label-sm opacity-75">Student overview</span>
        </Link>
        <Link
          href="/portal/attendance"
          className="flex flex-col gap-2 rounded-2xl bg-white border border-sc-gray-100 p-4 text-sc-navy hover:border-sc-teal transition-colors"
        >
          <Calendar className="size-5 text-sc-teal" />
          <span className="font-serif text-heading-3">Attendance</span>
          <span className="text-label-sm text-sc-gray">Recent check-ins</span>
        </Link>
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
          <h2 className="font-serif text-heading-2 text-sc-navy">Today&apos;s Status</h2>
          {childDetails.map((detail, i) => {
            const child = children[i];
            if (!detail) return null;
            return (
              <Link
                key={child.id}
                href={`/portal/children/${child.id}`}
                className="flex items-center gap-4 rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 hover:border-sc-teal transition-colors group"
              >
                {detail.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={detail.avatar_url}
                    alt={detail.first_name}
                    className="h-12 w-12 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sc-teal text-white font-serif text-lg">
                    {detail.first_name.charAt(0)}{detail.last_name.charAt(0)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-serif text-heading-3 text-sc-navy group-hover:text-sc-teal transition-colors">
                    {detail.preferred_name ?? detail.first_name} {detail.last_name}
                  </p>
                  <div className="mt-1.5">
                    <TodayStatusChip att={detail.today_attendance} />
                  </div>
                </div>

                <ChevronRight className="size-5 text-sc-gray-300 group-hover:text-sc-teal transition-colors shrink-0" />
              </Link>
            );
          })}
        </div>
      )}

      {/* Messages widget */}
      <ParentMessagesWidget
        conversations={msgResult.success ? msgResult.data : []}
        totalUnread={msgResult.success ? msgResult.data.reduce((n, c) => n + c.unread_count, 0) : 0}
        userId={user.id}
      />

      {/* Upcoming reminders placeholder */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 p-5">
        <h2 className="font-serif text-heading-3 text-sc-navy mb-2">Reminders</h2>
        <p className="text-body-sm text-sc-gray">
          School announcements and event reminders will appear here.
        </p>
      </div>
    </div>
  );
}
