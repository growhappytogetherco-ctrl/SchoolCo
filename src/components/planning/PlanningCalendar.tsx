"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek,
  endOfWeek, isSameDay, isSameMonth, addMonths, subMonths,
  addWeeks, subWeeks, startOfDay, parseISO, isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarEvent, EventCategory } from "@/app/actions/planning";
import { EVENT_CATEGORY_CONFIG } from "@/lib/planning-config";
import { PlanningCategoryBadge } from "./PlanningCategoryBadge";

type View = "month" | "week" | "agenda" | "list";

interface PlanningCalendarProps {
  initialEvents: CalendarEvent[];
  defaultView?: View;
}

function EventChip({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  const config = EVENT_CATEGORY_CONFIG[event.category];
  return (
    <Link
      href={`/dashboard/events/${event.id}`}
      className={cn(
        "block rounded-md px-1.5 py-0.5 text-xs font-medium truncate border",
        config?.color ?? "bg-sc-gray-100",
        config?.textColor ?? "text-sc-gray",
        config?.borderColor ?? "border-sc-gray-200",
        "hover:opacity-80 transition-opacity"
      )}
      title={event.title}
    >
      {!compact && !event.is_all_day && (
        <span className="opacity-70 mr-1">{format(parseISO(event.start_at), "h:mm")}</span>
      )}
      {event.title}
    </Link>
  );
}

function AgendaView({ events }: { events: CalendarEvent[] }) {
  // Group by date
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = format(parseISO(e.start_at), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  if (groups.length === 0) {
    return <p className="text-center text-sc-gray py-16">No events to display.</p>;
  }

  return (
    <div className="space-y-6">
      {groups.map(([dateKey, dayEvents]) => {
        const date = parseISO(dateKey);
        return (
          <div key={dateKey}>
            <div className={cn(
              "flex items-center gap-3 mb-3",
              isToday(date) && "text-sc-teal"
            )}>
              <div className={cn(
                "flex flex-col items-center justify-center w-12 h-12 rounded-full shrink-0",
                isToday(date) ? "bg-sc-teal text-white" : "bg-sc-gray-100 text-sc-navy"
              )}>
                <span className="text-xs font-medium">{format(date, "EEE").toUpperCase()}</span>
                <span className="text-lg font-bold leading-none">{format(date, "d")}</span>
              </div>
              <div>
                <p className="font-semibold text-sc-navy">{format(date, "MMMM d, yyyy")}</p>
                <p className="text-xs text-sc-gray">{dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="ml-15 space-y-2 pl-15" style={{ paddingLeft: "60px" }}>
              {dayEvents.map((e) => (
                <Link
                  key={e.id}
                  href={`/dashboard/events/${e.id}`}
                  className="flex items-start gap-3 rounded-xl border border-sc-gray-100 bg-white p-3 hover:shadow-card transition-shadow"
                >
                  <div className={cn("w-1 rounded-full shrink-0 self-stretch", EVENT_CATEGORY_CONFIG[e.category]?.color ?? "bg-sc-gray-200")} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <PlanningCategoryBadge category={e.category} />
                    </div>
                    <p className="font-medium text-sc-navy mt-0.5">{e.title}</p>
                    <p className="text-xs text-sc-gray mt-0.5">
                      {e.is_all_day ? "All day" : `${format(parseISO(e.start_at), "h:mm a")} – ${format(parseISO(e.end_at), "h:mm a")}`}
                      {e.location ? ` · ${e.location}` : ""}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ events, currentDate }: { events: CalendarEvent[]; currentDate: Date }) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const eventsOnDay = (day: Date) =>
    events.filter((e) => isSameDay(parseISO(e.start_at), day));

  return (
    <div>
      {/* Header */}
      <div className="grid grid-cols-7 text-center mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-xs font-medium text-sc-gray py-1">{d}</div>
        ))}
      </div>
      {/* Grid */}
      <div className="grid grid-cols-7 border-l border-t border-sc-gray-100">
        {days.map((day) => {
          const dayEvents = eventsOnDay(day);
          const outside = !isSameMonth(day, currentDate);
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-[80px] border-r border-b border-sc-gray-100 p-1",
                outside && "bg-sc-gray-100/30"
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium mb-1 mx-auto",
                today ? "bg-sc-teal text-white" : outside ? "text-sc-gray-400" : "text-sc-navy"
              )}>
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <EventChip key={e.id} event={e} compact />
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-xs text-sc-gray pl-1">+{dayEvents.length - 3} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ events, currentDate }: { events: CalendarEvent[]; currentDate: Date }) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  return (
    <div className="grid grid-cols-7 gap-1">
      {days.map((day) => {
        const dayEvents = events.filter((e) => isSameDay(parseISO(e.start_at), day));
        const today = isToday(day);
        return (
          <div key={day.toISOString()} className="min-h-[200px]">
            <div className={cn(
              "text-center rounded-full py-1 mb-2 text-xs font-medium",
              today ? "bg-sc-teal text-white" : "text-sc-navy"
            )}>
              <div>{format(day, "EEE").toUpperCase()}</div>
              <div className="text-sm font-bold">{format(day, "d")}</div>
            </div>
            <div className="space-y-1">
              {dayEvents.map((e) => (
                <EventChip key={e.id} event={e} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({ events }: { events: CalendarEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-sc-gray-100">
            <th className="text-left py-2 px-3 text-label-sm text-sc-gray font-medium">Date</th>
            <th className="text-left py-2 px-3 text-label-sm text-sc-gray font-medium">Title</th>
            <th className="text-left py-2 px-3 text-label-sm text-sc-gray font-medium">Category</th>
            <th className="text-left py-2 px-3 text-label-sm text-sc-gray font-medium">Location</th>
            <th className="text-left py-2 px-3 text-label-sm text-sc-gray font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr><td colSpan={5} className="text-center text-sc-gray py-8">No events</td></tr>
          )}
          {events.map((e) => (
            <tr key={e.id} className="border-b border-sc-gray-100 hover:bg-sc-gray-100/30">
              <td className="py-2 px-3 whitespace-nowrap">{format(parseISO(e.start_at), "MMM d, yyyy")}</td>
              <td className="py-2 px-3">
                <Link href={`/dashboard/events/${e.id}`} className="text-sc-teal hover:underline font-medium">
                  {e.title}
                </Link>
              </td>
              <td className="py-2 px-3"><PlanningCategoryBadge category={e.category} /></td>
              <td className="py-2 px-3 text-sc-gray">{e.location ?? "—"}</td>
              <td className="py-2 px-3 capitalize text-sc-gray">{e.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PlanningCalendar({ initialEvents, defaultView = "month" }: PlanningCalendarProps) {
  const [view, setView] = useState<View>(defaultView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterCategory, setFilterCategory] = useState<EventCategory | "">("");

  const filteredEvents = useMemo(() =>
    filterCategory
      ? initialEvents.filter((e) => e.category === filterCategory)
      : initialEvents,
    [initialEvents, filterCategory]
  );

  function navigate(dir: "prev" | "next") {
    if (view === "month") setCurrentDate((d) => dir === "next" ? addMonths(d, 1) : subMonths(d, 1));
    else if (view === "week") setCurrentDate((d) => dir === "next" ? addWeeks(d, 1) : subWeeks(d, 1));
    else setCurrentDate((d) => {
      const delta = dir === "next" ? 30 : -30;
      return new Date(d.getTime() + delta * 24 * 60 * 60 * 1000);
    });
  }

  const VIEWS: { key: View; label: string }[] = [
    { key: "month", label: "Month" },
    { key: "week", label: "Week" },
    { key: "agenda", label: "Agenda" },
    { key: "list", label: "List" },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate("prev")}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <Button variant="outline" size="icon" onClick={() => navigate("next")}><ChevronRight className="size-4" /></Button>
          <span className="font-semibold text-sc-navy ml-2">
            {view === "week"
              ? `${format(startOfWeek(currentDate), "MMM d")} – ${format(endOfWeek(currentDate), "MMM d, yyyy")}`
              : format(currentDate, "MMMM yyyy")}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* View tabs */}
          <div className="flex rounded-lg border border-sc-gray-200 overflow-hidden">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors",
                  view === v.key ? "bg-sc-teal text-white" : "bg-white text-sc-gray hover:bg-sc-gray-100"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          <Link href="/dashboard/events/new">
            <Button size="sm" className="bg-sc-teal hover:bg-sc-teal-700 text-white">
              <Plus className="size-4 mr-1" /> New Event
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2">
        <Filter className="size-4 text-sc-gray" />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as EventCategory | "")}
          className="text-sm border border-sc-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
        >
          <option value="">All categories</option>
          {Object.entries(EVENT_CATEGORY_CONFIG).map(([val, cfg]) => (
            <option key={val} value={val}>{cfg.label}</option>
          ))}
        </select>
      </div>

      {/* Calendar body */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4">
        {view === "month" && <MonthView events={filteredEvents} currentDate={currentDate} />}
        {view === "week" && <WeekView events={filteredEvents} currentDate={currentDate} />}
        {view === "agenda" && <AgendaView events={filteredEvents} />}
        {view === "list" && <ListView events={filteredEvents} />}
      </div>
    </div>
  );
}
