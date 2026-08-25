import { getMyCalendarEvents } from "@/app/actions/planning";
import { ParentCalendar } from "@/components/planning/ParentCalendar";

export const metadata = { title: "Family Calendar" };

export default async function PortalCalendarPage() {
  // Show the full 2026-2027 academic year so parents see all upcoming dates
  const eventsRes = await getMyCalendarEvents({ startDate: "2026-08-01", endDate: "2027-06-30" });
  const events = eventsRes.success ? eventsRes.data : [];

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">School Calendar</h1>
        <p className="text-body-md text-sc-gray mt-1">2026–2027 Academic Year</p>
      </div>
      <ParentCalendar events={events} />
    </div>
  );
}
