import { format, addMonths } from "date-fns";
import { getMyCalendarEvents } from "@/app/actions/planning";
import { ParentCalendar } from "@/components/planning/ParentCalendar";

export const metadata = { title: "Family Calendar" };

export default async function PortalCalendarPage() {
  const now = new Date();
  const startDate = format(now, "yyyy-MM-dd");
  const endDate = format(addMonths(now, 3), "yyyy-MM-dd");

  const eventsRes = await getMyCalendarEvents({ startDate, endDate });
  const events = eventsRes.success ? eventsRes.data : [];

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">School Calendar</h1>
        <p className="text-body-md text-sc-gray mt-1">Upcoming events for your family</p>
      </div>
      <ParentCalendar events={events} />
    </div>
  );
}
