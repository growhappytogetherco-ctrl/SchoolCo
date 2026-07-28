import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { getCalendarEvents } from "@/app/actions/planning";
import type { EventCategory, EventStatus } from "@/app/actions/planning";
import { EventCard } from "@/components/planning/EventCard";
import { requireStaff } from "@/lib/roleGuard";
import { EVENT_CATEGORY_CONFIG } from "@/lib/planning-config";

export const metadata = { title: "Events" };

interface SearchParams {
  category?: string;
  status?: string;
  when?: string;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireStaff();
  const params = await searchParams;

  const now = new Date();
  const category = params.category as EventCategory | undefined;
  const status = params.status as EventStatus | undefined;
  const when = params.when ?? "upcoming";

  const startDate = when === "past" ? undefined : format(now, "yyyy-MM-dd");
  const endDate = when === "past" ? format(now, "yyyy-MM-dd") : undefined;

  const eventsRes = await getCalendarEvents({ startDate, endDate, category, status });
  const events = eventsRes.success ? eventsRes.data : [];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-serif text-heading-1 text-sc-navy">Events</h1>
        <Link
          href="/dashboard/events/new"
          className="flex items-center gap-2 rounded-xl bg-sc-teal text-white px-4 py-2 text-sm font-medium hover:bg-sc-teal-700 transition-colors"
        >
          <Plus className="size-4" /> New Event
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <form method="GET" className="flex flex-wrap gap-2">
          {/* When */}
          {["upcoming", "past"].map((w) => (
            <Link
              key={w}
              href={`/dashboard/events?when=${w}${category ? `&category=${category}` : ""}${status ? `&status=${status}` : ""}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                when === w
                  ? "bg-sc-teal text-white border-sc-teal"
                  : "bg-white text-sc-gray border-sc-gray-200 hover:bg-sc-gray-100"
              }`}
            >
              {w.charAt(0).toUpperCase() + w.slice(1)}
            </Link>
          ))}

          <select
            name="category"
            defaultValue={category ?? ""}
            className="text-sm border border-sc-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            onChange={(e) => {
              const url = new URL(window.location.href);
              e.target.value ? url.searchParams.set("category", e.target.value) : url.searchParams.delete("category");
              window.location.href = url.toString();
            }}
          >
            <option value="">All categories</option>
            {Object.entries(EVENT_CATEGORY_CONFIG).map(([val, cfg]) => (
              <option key={val} value={val}>{cfg.label}</option>
            ))}
          </select>

          <select
            name="status"
            defaultValue={status ?? ""}
            className="text-sm border border-sc-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            onChange={(e) => {
              const url = new URL(window.location.href);
              e.target.value ? url.searchParams.set("status", e.target.value) : url.searchParams.delete("status");
              window.location.href = url.toString();
            }}
          >
            <option value="">All statuses</option>
            {["draft", "published", "cancelled", "completed"].map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </form>
      </div>

      {/* Event list */}
      {events.length === 0 ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-12 text-center text-sc-gray">
          No events found.{" "}
          <Link href="/dashboard/events/new" className="text-sc-teal hover:underline">Create one?</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e) => <EventCard key={e.id} event={e} showRsvpCount />)}
        </div>
      )}
    </div>
  );
}
