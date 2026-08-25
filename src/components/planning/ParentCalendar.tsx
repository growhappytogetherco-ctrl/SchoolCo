"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO, isToday, isFuture } from "date-fns";
import { MapPin, Calendar, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/app/actions/planning";
import { rsvpEvent } from "@/app/actions/planning";
import { EVENT_CATEGORY_CONFIG } from "@/lib/planning-config";
import { PlanningCategoryBadge } from "./PlanningCategoryBadge";
import { toast } from "sonner";

interface ParentCalendarProps {
  events: CalendarEvent[];
}

function UpcomingEventCard({ event }: { event: CalendarEvent }) {
  const config = EVENT_CATEGORY_CONFIG[event.category];
  const [rsvping, setRsvping] = useState(false);

  async function handleRsvp(status: string) {
    setRsvping(true);
    const result = await rsvpEvent(event.id, status);
    if (result.success) {
      toast.success(status === "confirmed" ? "RSVP confirmed!" : "RSVP updated");
    } else {
      toast.error(result.error);
    }
    setRsvping(false);
  }

  return (
    <div className={cn(
      "rounded-2xl bg-white border shadow-card p-4",
      config?.borderColor ?? "border-sc-gray-100"
    )}>
      <div className="flex items-start gap-3">
        <div className={cn("w-1.5 rounded-full shrink-0 self-stretch", config?.color ?? "bg-sc-gray-200")} />
        <div className="flex-1 min-w-0">
          <PlanningCategoryBadge category={event.category} />
          <h3 className="font-semibold text-sc-navy mt-1.5">{event.title}</h3>
          <div className="mt-1 space-y-0.5">
            <p className="text-label-sm text-sc-gray flex items-center gap-1">
              <Calendar className="size-3 shrink-0" />
              {event.is_all_day
                ? format(parseISO(event.start_at.slice(0, 10)), "MMMM d, yyyy")
                : `${format(parseISO(event.start_at), "MMMM d, yyyy")} · ${format(parseISO(event.start_at), "h:mm a")}`}
            </p>
            {event.location && (
              <p className="text-label-sm text-sc-gray flex items-center gap-1">
                <MapPin className="size-3 shrink-0" />
                {event.location}
              </p>
            )}
          </div>
          {event.requires_rsvp && (
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                className="bg-sc-teal hover:bg-sc-teal-700 text-white text-xs"
                disabled={rsvping}
                onClick={() => handleRsvp("confirmed")}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                disabled={rsvping}
                onClick={() => handleRsvp("declined")}
              >
                Can't attend
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ParentCalendar({ events }: ParentCalendarProps) {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const upcoming = events.filter((e) => {
    // For all-day events, compare date strings directly to avoid UTC→local shift
    if (e.is_all_day) return e.start_at.slice(0, 10) >= todayStr;
    return isFuture(parseISO(e.start_at)) || isToday(parseISO(e.start_at));
  });
  const nextThree = upcoming.slice(0, 3);

  // Group all by date; expand multi-day all-day events across every covered date
  const groups = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    if (e.is_all_day && e.end_at) {
      const start = e.start_at.slice(0, 10);
      const end = e.end_at.slice(0, 10);
      let cur = start;
      while (cur <= end) {
        const arr = groups.get(cur) ?? [];
        arr.push(e);
        groups.set(cur, arr);
        // Advance by one calendar day without timezone conversion
        const d = new Date(cur + "T12:00:00");
        d.setDate(d.getDate() + 1);
        cur = format(d, "yyyy-MM-dd");
      }
    } else {
      const key = e.is_all_day ? e.start_at.slice(0, 10) : format(parseISO(e.start_at), "yyyy-MM-dd");
      const arr = groups.get(key) ?? [];
      arr.push(e);
      groups.set(key, arr);
    }
  }
  const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      {/* What's next */}
      {nextThree.length > 0 && (
        <section>
          <h2 className="font-serif text-sc-navy font-semibold text-lg mb-3">What&apos;s Next</h2>
          <div className="space-y-3">
            {nextThree.map((e) => <UpcomingEventCard key={e.id} event={e} />)}
          </div>
        </section>
      )}

      {/* All events by date */}
      <section>
        <h2 className="font-serif text-sc-navy font-semibold text-lg mb-3">Upcoming Calendar</h2>
        {sortedGroups.length === 0 ? (
          <p className="text-sc-gray text-center py-10 rounded-2xl bg-white border border-sc-gray-100 shadow-card">
            No upcoming events yet.
          </p>
        ) : (
          <div className="space-y-6">
            {sortedGroups.map(([dateKey, dayEvents]) => {
              const date = parseISO(dateKey);
              return (
                <div key={dateKey}>
                  <div className={cn(
                    "flex items-center gap-3 mb-3",
                    isToday(date) && "text-sc-teal"
                  )}>
                    <div className={cn(
                      "flex flex-col items-center justify-center w-10 h-10 rounded-full shrink-0 text-xs",
                      isToday(date) ? "bg-sc-teal text-white" : "bg-sc-gray-100 text-sc-navy"
                    )}>
                      <span className="font-medium leading-none">{format(date, "EEE")}</span>
                      <span className="font-bold leading-none mt-0.5">{format(date, "d")}</span>
                    </div>
                    <span className="font-medium text-sc-navy">{format(date, "MMMM d, yyyy")}</span>
                  </div>
                  <div className="space-y-2 pl-13" style={{ paddingLeft: "52px" }}>
                    {dayEvents.map((e) => (
                      <div key={e.id} className="flex items-start gap-3 rounded-xl border border-sc-gray-100 bg-white p-3">
                        <div className={cn("w-1 rounded-full shrink-0 self-stretch", EVENT_CATEGORY_CONFIG[e.category]?.color ?? "bg-sc-gray-200")} />
                        <div className="flex-1 min-w-0">
                          <PlanningCategoryBadge category={e.category} />
                          <p className="font-medium text-sc-navy mt-0.5">{e.title}</p>
                          <p className="text-xs text-sc-gray mt-0.5">
                            {e.is_all_day ? "All day" : `${format(parseISO(e.start_at), "h:mm a")}`}
                            {e.location ? ` · ${e.location}` : ""}
                          </p>
                        </div>
                        {e.requires_rsvp && (
                          <span className="text-xs text-sc-teal font-medium shrink-0">RSVP needed</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
