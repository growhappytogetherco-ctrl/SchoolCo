import Link from "next/link";
import { format, parseISO, startOfDay, endOfDay, addDays, isAfter, isBefore } from "date-fns";
import { Calendar, Plus, ClipboardList, BookTemplate, ArrowRight, AlertTriangle } from "lucide-react";
import { getCalendarEvents, getTasks } from "@/app/actions/planning";
import { EventCard } from "@/components/planning/EventCard";
import { TaskCard } from "@/components/planning/TaskCard";
import { requireStaff } from "@/lib/roleGuard";

export const metadata = { title: "Planning Center" };

export default async function PlanningPage() {
  await requireStaff();

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const weekEndStr = format(addDays(today, 7), "yyyy-MM-dd");

  const [eventsRes, tasksRes] = await Promise.all([
    getCalendarEvents({ startDate: todayStr, endDate: weekEndStr }),
    getTasks(),
  ]);

  const events = eventsRes.success ? eventsRes.data : [];
  const allTasks = tasksRes.success ? tasksRes.data : [];

  const todayEvents = events.filter((e) => {
    const d = parseISO(e.start_at);
    return d >= startOfDay(today) && d <= endOfDay(today);
  }).slice(0, 5);

  const upcomingEvents = events.filter((e) => {
    const d = parseISO(e.start_at);
    return d > endOfDay(today);
  }).slice(0, 5);

  const todayTasks = allTasks.filter((t) =>
    t.status !== "completed" && t.status !== "cancelled" &&
    t.due_at && parseISO(t.due_at) <= endOfDay(today)
  ).slice(0, 5);

  const overdueTasks = allTasks.filter((t) =>
    t.status !== "completed" && t.status !== "cancelled" &&
    t.due_at && isBefore(parseISO(t.due_at), startOfDay(today))
  );

  const quickLinks = [
    { label: "Calendar", href: "/dashboard/calendar", icon: Calendar, color: "text-sc-teal" },
    { label: "New Event", href: "/dashboard/events/new", icon: Plus, color: "text-sc-teal" },
    { label: "All Tasks", href: "/dashboard/tasks", icon: ClipboardList, color: "text-sc-gold-700" },
    { label: "Templates", href: "/dashboard/templates", icon: BookTemplate, color: "text-sc-navy" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-heading-1 text-sc-navy">Planning Center</h1>
          <p className="text-body-md text-sc-gray mt-1">{format(today, "EEEE, MMMM d, yyyy")}</p>
        </div>
        <Link href="/dashboard/events/new">
          <button className="flex items-center gap-2 rounded-xl bg-sc-teal text-white px-4 py-2 text-sm font-medium hover:bg-sc-teal-700 transition-colors">
            <Plus className="size-4" /> New Event
          </button>
        </Link>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow text-center"
          >
            <link.icon className={`size-6 ${link.color}`} />
            <span className="text-label-sm font-medium text-sc-navy">{link.label}</span>
          </Link>
        ))}
      </div>

      {/* Overdue tasks alert */}
      {overdueTasks.length > 0 && (
        <div className="flex items-center gap-3 rounded-2xl bg-sc-rose-50 border border-sc-rose-200 p-4">
          <AlertTriangle className="size-5 text-sc-rose shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sc-rose">{overdueTasks.length} overdue task{overdueTasks.length !== 1 ? "s" : ""}</p>
            <p className="text-xs text-sc-rose/80">Some tasks are past their due date</p>
          </div>
          <Link href="/dashboard/tasks?status=overdue" className="text-xs text-sc-rose font-medium flex items-center gap-1 shrink-0">
            View <ArrowRight className="size-3" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Events */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-sc-navy font-semibold">Today&apos;s Events</h2>
            <Link href="/dashboard/calendar" className="text-xs text-sc-teal hover:underline flex items-center gap-1">
              Calendar <ArrowRight className="size-3" />
            </Link>
          </div>
          {todayEvents.length === 0 ? (
            <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 text-center text-sc-gray">
              No events today
            </div>
          ) : (
            <div className="space-y-2">
              {todayEvents.map((e) => <EventCard key={e.id} event={e} showRsvpCount />)}
            </div>
          )}
        </section>

        {/* Today's Tasks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-sc-navy font-semibold">Tasks Due Today</h2>
            <Link href="/dashboard/tasks" className="text-xs text-sc-teal hover:underline flex items-center gap-1">
              All tasks <ArrowRight className="size-3" />
            </Link>
          </div>
          {todayTasks.length === 0 ? (
            <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 text-center text-sc-gray">
              No tasks due today
            </div>
          ) : (
            <div className="space-y-2">
              {todayTasks.map((t) => <TaskCard key={t.id} task={t} />)}
            </div>
          )}
        </section>
      </div>

      {/* Upcoming Events */}
      {upcomingEvents.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-sc-navy font-semibold">Upcoming Events (Next 7 Days)</h2>
            <Link href="/dashboard/events" className="text-xs text-sc-teal hover:underline flex items-center gap-1">
              All events <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {upcomingEvents.map((e) => <EventCard key={e.id} event={e} showRsvpCount />)}
          </div>
        </section>
      )}
    </div>
  );
}
