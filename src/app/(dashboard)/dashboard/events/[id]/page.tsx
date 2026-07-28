import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { MapPin, Clock, Users, ArrowLeft, Edit } from "lucide-react";
import { getEventById } from "@/app/actions/planning";
import { requireStaff } from "@/lib/roleGuard";
import { PlanningCategoryBadge } from "@/components/planning/PlanningCategoryBadge";
import { TaskCard } from "@/components/planning/TaskCard";
import { VISIBILITY_LABELS } from "@/lib/planning-config";

export const metadata = { title: "Event Detail" };

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;

  const result = await getEventById(id);
  if (!result.success) notFound();

  const event = result.data;
  const start = parseISO(event.start_at);
  const end = parseISO(event.end_at);

  const statusColors: Record<string, string> = {
    draft: "bg-sc-gray-100 text-sc-gray",
    published: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    cancelled: "bg-sc-rose-50 text-sc-rose border border-sc-rose-200",
    completed: "bg-sc-gray-100 text-sc-gray",
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      {/* Back nav */}
      <Link href="/dashboard/events" className="flex items-center gap-1 text-sm text-sc-gray hover:text-sc-navy">
        <ArrowLeft className="size-4" /> All Events
      </Link>

      {/* Header */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <PlanningCategoryBadge category={event.category} size="md" />
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${statusColors[event.status]}`}>
              {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
            </span>
          </div>
          <Link
            href={`/dashboard/events/${id}/edit`}
            className="flex items-center gap-1.5 text-sm text-sc-teal hover:text-sc-teal-700 font-medium"
          >
            <Edit className="size-4" /> Edit
          </Link>
        </div>

        <h1 className="font-serif text-heading-1 text-sc-navy mt-3">{event.title}</h1>

        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-sc-gray">
            <Clock className="size-4 shrink-0" />
            <span className="text-body-md">
              {event.is_all_day
                ? format(start, "MMMM d, yyyy")
                : `${format(start, "MMMM d, yyyy")} · ${format(start, "h:mm a")} – ${format(end, "h:mm a")}`}
            </span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2 text-sc-gray">
              <MapPin className="size-4 shrink-0" />
              <span className="text-body-md">{event.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-sc-gray">
            <Users className="size-4 shrink-0" />
            <span className="text-body-md">{VISIBILITY_LABELS[event.visibility]}</span>
          </div>
        </div>

        {event.description && (
          <div className="mt-4 border-t border-sc-gray-100 pt-4">
            <p className="text-body-md text-sc-navy whitespace-pre-wrap">{event.description}</p>
          </div>
        )}

        {/* Requirements */}
        {(event.requires_rsvp || event.requires_permission_slip || event.requires_transportation) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {event.requires_rsvp && (
              <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 text-xs font-medium">RSVP Required</span>
            )}
            {event.requires_permission_slip && (
              <span className="rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-xs font-medium">Permission Slip</span>
            )}
            {event.requires_transportation && (
              <span className="rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 px-2.5 py-0.5 text-xs font-medium">Transportation</span>
            )}
          </div>
        )}
      </div>

      {/* Tasks */}
      {event.tasks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-sc-navy font-semibold">Related Tasks</h2>
            <span className="text-xs text-sc-gray">{event.tasks.filter((t) => t.status === "completed").length}/{event.tasks.length} done</span>
          </div>
          <div className="space-y-2">
            {event.tasks.map((t) => <TaskCard key={t.id} task={t} />)}
          </div>
        </section>
      )}

      {/* RSVPs */}
      {event.requires_rsvp && event.rsvps.length > 0 && (
        <section>
          <h2 className="font-serif text-sc-navy font-semibold mb-3">RSVPs ({event.rsvps.length})</h2>
          <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card divide-y divide-sc-gray-100">
            {event.rsvps.map((rsvp: any) => (
              <div key={rsvp.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-sc-navy">{rsvp.profile_id}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${
                  rsvp.status === "confirmed" ? "bg-emerald-50 text-emerald-700" :
                  rsvp.status === "declined" ? "bg-sc-rose-50 text-sc-rose" :
                  "bg-amber-50 text-amber-700"
                }`}>{rsvp.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Reminders */}
      {event.reminders.length > 0 && (
        <section>
          <h2 className="font-serif text-sc-navy font-semibold mb-3">Reminders</h2>
          <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card divide-y divide-sc-gray-100">
            {event.reminders.map((r: any) => {
              const days = Math.abs(Math.round(r.offset_seconds / 86400));
              return (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-sc-navy">
                    {days} day{days !== 1 ? "s" : ""} before · {r.target_audience}
                  </span>
                  {r.sent_at && <span className="text-xs text-sc-gray">Sent</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
