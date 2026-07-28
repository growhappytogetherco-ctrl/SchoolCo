import { requireStaff } from "@/lib/roleGuard";
import { EventForm } from "@/components/planning/EventForm";

export const metadata = { title: "New Event" };

export default async function NewEventPage() {
  await requireStaff();

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">New Event</h1>
        <p className="text-body-md text-sc-gray mt-1">Create a new calendar event for your school</p>
      </div>
      <EventForm />
    </div>
  );
}
