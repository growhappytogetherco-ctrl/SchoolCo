import Link from "next/link";
import { format } from "date-fns";
import { MapPin, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/app/actions/planning";
import { EVENT_CATEGORY_CONFIG } from "@/lib/planning-config";
import { PlanningCategoryBadge } from "./PlanningCategoryBadge";

interface EventCardProps {
  event: CalendarEvent;
  showRsvpCount?: boolean;
  rsvpStatus?: string | null;
  className?: string;
}

export function EventCard({ event, showRsvpCount, rsvpStatus, className }: EventCardProps) {
  const config = EVENT_CATEGORY_CONFIG[event.category];
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);

  const statusColors: Record<string, string> = {
    draft: "bg-sc-gray-100 text-sc-gray",
    published: "bg-emerald-50 text-emerald-700",
    cancelled: "bg-sc-rose-50 text-sc-rose",
    completed: "bg-sc-gray-100 text-sc-gray",
  };

  return (
    <Link
      href={`/dashboard/events/${event.id}`}
      className={cn(
        "block rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 hover:shadow-md transition-shadow",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {/* Category color bar */}
        <div className={cn("w-1 rounded-full shrink-0 mt-0.5", config?.color ?? "bg-sc-gray-200")} style={{ minHeight: "48px" }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <PlanningCategoryBadge category={event.category} />
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", statusColors[event.status])}>
                {event.status.charAt(0).toUpperCase() + event.status.slice(1)}
              </span>
            </div>
            {showRsvpCount && event.requires_rsvp && (
              <span className="flex items-center gap-1 text-xs text-sc-gray">
                <Users className="size-3" />
                {event.rsvp_count ?? 0} RSVPs
              </span>
            )}
            {rsvpStatus && (
              <span className={cn(
                "text-xs px-2 py-0.5 rounded-full font-medium",
                rsvpStatus === "confirmed" ? "bg-emerald-50 text-emerald-700" :
                rsvpStatus === "declined" ? "bg-sc-rose-50 text-sc-rose" :
                "bg-amber-50 text-amber-700"
              )}>
                {rsvpStatus.charAt(0).toUpperCase() + rsvpStatus.slice(1)}
              </span>
            )}
          </div>

          <h3 className="font-semibold text-sc-navy mt-1.5 truncate">{event.title}</h3>

          <div className="mt-1 space-y-0.5">
            <p className="text-label-sm text-sc-gray">
              {event.is_all_day
                ? format(start, "MMMM d, yyyy")
                : `${format(start, "MMM d, yyyy")} · ${format(start, "h:mm a")}–${format(end, "h:mm a")}`}
            </p>
            {event.location && (
              <p className="flex items-center gap-1 text-label-sm text-sc-gray">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{event.location}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
