import { TimelineCard } from "./TimelineCard";
import { EmptyState } from "@/components/shared/EmptyState";
import type { TimelineEntry, TimelineEntryType } from "@/types/database";
import { BookOpen } from "lucide-react";

// ── Filter types ──────────────────────────────────────────────────────────

const FILTER_GROUPS = [
  { label: "All",           value: "all"        },
  { label: "Milestones",    value: "milestones"  },
  { label: "Academics",     value: "academics"   },
  { label: "Staff Notes",   value: "staff"       },
  { label: "Celebrations",  value: "celebrations"},
] as const;

type FilterGroup = typeof FILTER_GROUPS[number]["value"];

const GROUP_ENTRY_TYPES: Record<FilterGroup, TimelineEntryType[] | null> = {
  all:          null,
  milestones:   ["badge_earned", "service_milestone", "business_milestone", "attendance_milestone", "character_recognition", "grade_transition"],
  academics:    ["enrollment", "grade_transition", "track_change", "report_card_published"],
  staff:        ["staff_note_shared", "incident_resolved", "guardian_linked", "communication_sent"],
  celebrations: ["celebration", "badge_earned", "business_milestone", "service_milestone"],
};

// ── Props ─────────────────────────────────────────────────────────────────

interface StudentJourneyProps {
  entries:  TimelineEntry[];
  isStaff?: boolean;
  /** Active filter — controlled externally for server-side filtering, or handle client-side */
  filter?:  FilterGroup;
}

// ── Component (server-renderable — no useState) ───────────────────────────

export function StudentJourney({ entries, isStaff = false, filter = "all" }: StudentJourneyProps) {
  const allowedTypes = GROUP_ENTRY_TYPES[filter];

  const visible = allowedTypes
    ? entries.filter((e) => allowedTypes.includes(e.entry_type as TimelineEntryType))
    : entries;

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No entries yet"
        description={
          filter === "all"
            ? "This student's journey will appear here as milestones are recorded."
            : `No ${filter} entries recorded yet.`
        }
      />
    );
  }

  // Group by year
  const byYear = groupByYear(visible);

  return (
    <div className="space-y-8">
      {byYear.map(({ year, entries: yearEntries }) => (
        <div key={year}>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-sc-gray-100" />
            <span className="text-label-sm font-semibold text-sc-gray uppercase tracking-wide">{year}</span>
            <div className="h-px flex-1 bg-sc-gray-100" />
          </div>
          <div className="space-y-3 relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[17px] top-4 bottom-4 w-px bg-sc-gray-100 -z-0" />
            {yearEntries.map((entry) => (
              <TimelineCard key={entry.id} entry={entry} isStaff={isStaff} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function groupByYear(entries: TimelineEntry[]): { year: string; entries: TimelineEntry[] }[] {
  const map = new Map<string, TimelineEntry[]>();

  for (const entry of entries) {
    const year = new Date(entry.occurred_at ?? entry.created_at).getFullYear().toString();
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(entry);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([year, entries]) => ({ year, entries }));
}

// ── Export filter groups for use in the page ──────────────────────────────

export { FILTER_GROUPS };
export type { FilterGroup };
