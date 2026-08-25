import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getEventById } from "@/app/actions/planning";
import { requireStaff } from "@/lib/roleGuard";
import { EventForm } from "@/components/planning/EventForm";

export const metadata = { title: "Edit Event" };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const result = await getEventById(id);
  if (!result.success) notFound();
  const event = result.data;

  return (
    <div className="max-w-2xl mx-auto space-y-6 px-4 py-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/events/${id}`}
          className="text-sc-gray hover:text-sc-navy transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="font-serif text-heading-1 text-sc-navy">Edit Event</h1>
      </div>
      <EventForm event={event} />
    </div>
  );
}
