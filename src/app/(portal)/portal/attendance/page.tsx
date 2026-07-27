import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Calendar, ChevronRight } from "lucide-react";
import {
  getUser, getGuardianChildren, getAttendanceHistoryForParent, getActiveOrgId,
} from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Attendance" };

function fmtDate(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AttendanceDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    present:         "bg-sc-teal",
    tardy:           "bg-sc-gold-400",
    absent:          "bg-sc-rose",
    excused:         "bg-sc-gray-300",
    checked_in:      "bg-sc-teal",
    early_dismissal: "bg-sc-gold-400",
  };
  return <span className={cn("inline-block size-2.5 rounded-full shrink-0", map[status] ?? "bg-sc-gray-200")} />;
}

export default async function PortalAttendancePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const children = await getGuardianChildren(user.id, orgId);

  // Fetch last 30 days for each child
  const histories = await Promise.all(
    children.map((c) => getAttendanceHistoryForParent(c.id, user.id, orgId, 30))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Attendance</h1>
        <p className="text-body-md text-sc-gray mt-1">Recent attendance history for your children.</p>
      </div>

      {children.length === 0 ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 p-8 text-center">
          <Calendar className="size-10 text-sc-gray-300 mx-auto mb-3" />
          <p className="text-body-sm text-sc-gray">No children linked to your account.</p>
        </div>
      ) : (
        children.map((child, i) => {
          const records = histories[i];
          return (
            <section key={child.id}>
              <div className="flex items-center justify-between mb-3">
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

              {records.length === 0 ? (
                <div className="rounded-2xl bg-white border border-sc-gray-100 p-6 text-center text-body-sm text-sc-gray">
                  No attendance records yet.
                </div>
              ) : (
                <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card divide-y divide-sc-gray-100">
                  {records.map((day) => (
                    <div key={day.date} className="flex items-center gap-3 px-5 py-3">
                      <AttendanceDot status={day.status} />
                      <span className="text-label-sm text-sc-gray-500 w-36 shrink-0">{fmtDate(day.date)}</span>
                      <span className="text-label-sm text-sc-navy capitalize flex-1">
                        {day.status.replace(/_/g, " ")}
                        {day.is_late && <span className="text-sc-gold-600"> · Late</span>}
                        {day.is_early_pickup && <span className="text-sc-gold-600"> · Early pickup</span>}
                        {day.absence_reason && (
                          <span className="text-sc-gray-400"> — {day.absence_reason}</span>
                        )}
                      </span>
                      <div className="text-label-sm text-sc-gray-400 shrink-0 text-right">
                        {day.check_in_at && <span>{fmtTime(day.check_in_at)}</span>}
                        {day.check_in_at && day.check_out_at && <span> → </span>}
                        {day.check_out_at && <span>{fmtTime(day.check_out_at)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
