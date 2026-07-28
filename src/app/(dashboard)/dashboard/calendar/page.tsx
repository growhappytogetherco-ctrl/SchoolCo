import { format, subMonths, addMonths } from "date-fns";
import { getCalendarEvents, getOrCreatePreferences } from "@/app/actions/planning";
import { PlanningCalendar } from "@/components/planning/PlanningCalendar";
import { requireStaff } from "@/lib/roleGuard";

export const metadata = { title: "Calendar" };

export default async function CalendarPage() {
  await requireStaff();

  const now = new Date();
  const startDate = format(subMonths(now, 1), "yyyy-MM-dd");
  const endDate = format(addMonths(now, 3), "yyyy-MM-dd");

  const [eventsRes, prefs] = await Promise.all([
    getCalendarEvents({ startDate, endDate }),
    getOrCreatePreferences(),
  ]);

  const events = eventsRes.success ? eventsRes.data : [];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <h1 className="font-serif text-heading-1 text-sc-navy mb-6">Calendar</h1>
      <PlanningCalendar
        initialEvents={events}
        defaultView={(prefs.default_view as any) ?? "month"}
      />
    </div>
  );
}
