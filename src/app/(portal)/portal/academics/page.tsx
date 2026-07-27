import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import {
  getUser, getGuardianChildren, getProgressCheckinsForParent,
  getStudentGoalsForParent, getActiveOrgId,
} from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Academics" };

function fmtDate(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export default async function PortalAcademicsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const children = await getGuardianChildren(user.id, orgId);

  const childData = await Promise.all(
    children.map(async (c) => ({
      child: c,
      checkins: await getProgressCheckinsForParent(c.id, user.id, orgId, 10),
      goals: await getStudentGoalsForParent(c.id, user.id, orgId),
    }))
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Academics</h1>
        <p className="text-body-md text-sc-gray mt-1">Teacher updates and learning goals.</p>
      </div>

      {children.length === 0 ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 p-8 text-center">
          <BookOpen className="size-10 text-sc-gray-300 mx-auto mb-3" />
          <p className="text-body-sm text-sc-gray">No children linked to your account.</p>
        </div>
      ) : (
        childData.map(({ child, checkins, goals }) => (
          <section key={child.id} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-heading-2 text-sc-navy">
                {child.preferred_name ?? child.first_name} {child.last_name}
              </h2>
              <Link
                href={`/portal/children/${child.id}`}
                className="flex items-center gap-1 text-label-sm text-sc-teal hover:underline"
              >
                Full profile <ChevronRight className="size-3.5" />
              </Link>
            </div>

            {/* Goals */}
            {goals.length > 0 && (
              <div>
                <p className="text-label-sm text-sc-gray-400 uppercase tracking-wide mb-2">Learning Goals</p>
                <div className="space-y-2">
                  {goals.map((g) => (
                    <div key={g.id} className="rounded-xl bg-white border border-sc-gray-100 px-4 py-3 flex items-center justify-between gap-3">
                      <p className="text-body-sm text-sc-navy">{g.goal_text}</p>
                      <div className="shrink-0 flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-sc-gray-100">
                          <div className="h-1.5 rounded-full bg-sc-teal" style={{ width: `${g.progress_pct}%` }} />
                        </div>
                        <span className="text-label-sm text-sc-gray-400">{g.progress_pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Teacher check-ins */}
            <div>
              <p className="text-label-sm text-sc-gray-400 uppercase tracking-wide mb-2">Teacher Updates</p>
              {checkins.length === 0 ? (
                <div className="rounded-2xl bg-white border border-sc-gray-100 p-5 text-center text-body-sm text-sc-gray">
                  No academic updates available yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {checkins.map((c) => (
                    <div key={c.id} className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-serif text-heading-3 text-sc-navy">
                          {c.lesson_topic ?? c.subject_area ?? "Progress Update"}
                        </p>
                        <span className="shrink-0 text-label-sm text-sc-gray-400">{fmtDate(c.recorded_date)}</span>
                      </div>
                      {c.what_was_worked_on && (
                        <p className="text-body-sm text-sc-gray">{c.what_was_worked_on}</p>
                      )}
                      {c.progress_observed && (
                        <p className="text-body-sm text-sc-navy">{c.progress_observed}</p>
                      )}
                      {c.parent_follow_up_notes && (
                        <div className="rounded-lg bg-sc-gold-50 border border-sc-gold-200 px-3 py-2 text-label-sm text-sc-gold-700">
                          <span className="font-medium">Home follow-up: </span>
                          {c.parent_follow_up_notes}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
