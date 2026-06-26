import { formatDistanceToNow } from "date-fns";
import {
  GraduationCap, Award, Star, BookOpen, Heart, Megaphone,
  FileText, Users, Bot, Sparkles, CalendarCheck, ArrowUpRight,
  ShieldCheck, Lock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TimelineEntry, TimelineEntryType } from "@/types/database";

// ── Icon map ──────────────────────────────────────────────────────────────

const ENTRY_ICONS: Record<TimelineEntryType, React.ElementType> = {
  enrollment:           GraduationCap,
  grade_transition:     ArrowUpRight,
  track_change:         ArrowUpRight,
  report_card_published:BookOpen,
  badge_earned:         Award,
  service_milestone:    Heart,
  business_milestone:   Star,
  attendance_milestone: CalendarCheck,
  character_recognition:ShieldCheck,
  staff_note_shared:    FileText,
  announcement:         Megaphone,
  communication_sent:   Megaphone,
  incident_resolved:    ShieldCheck,
  guardian_linked:      Users,
  ai_summary:           Bot,
  celebration:          Sparkles,
  custom:               Star,
};

const ENTRY_COLORS: Record<TimelineEntryType, string> = {
  enrollment:            "bg-sc-teal-50 text-sc-teal",
  grade_transition:      "bg-sc-navy-50 text-sc-navy",
  track_change:          "bg-sc-navy-50 text-sc-navy",
  report_card_published: "bg-sc-green-50 text-sc-green",
  badge_earned:          "bg-sc-gold-50 text-sc-gold-700",
  service_milestone:     "bg-sc-rose-50 text-sc-rose",
  business_milestone:    "bg-sc-gold-50 text-sc-gold-700",
  attendance_milestone:  "bg-sc-green-50 text-sc-green",
  character_recognition: "bg-sc-teal-50 text-sc-teal",
  staff_note_shared:     "bg-sc-gray-100 text-sc-gray",
  announcement:          "bg-sc-navy-50 text-sc-navy",
  communication_sent:    "bg-sc-gray-100 text-sc-gray",
  incident_resolved:     "bg-sc-green-50 text-sc-green",
  guardian_linked:       "bg-sc-teal-50 text-sc-teal",
  ai_summary:            "bg-purple-50 text-purple-600",
  celebration:           "bg-sc-gold-50 text-sc-gold-700",
  custom:                "bg-sc-cream text-sc-gray",
};

// ── Props ─────────────────────────────────────────────────────────────────

interface TimelineCardProps {
  entry:       TimelineEntry;
  isStaff?:    boolean;
  /** If true, render a compact single-line row instead of a card */
  compact?:    boolean;
}

// ── Component ─────────────────────────────────────────────────────────────

export function TimelineCard({ entry, isStaff = false, compact = false }: TimelineCardProps) {
  const Icon      = ENTRY_ICONS[entry.entry_type] ?? Star;
  const colorCls  = entry.color_key ? resolveColorKey(entry.color_key) : (ENTRY_COLORS[entry.entry_type] ?? "bg-sc-cream text-sc-gray");
  const occurredAt = new Date(entry.occurred_at ?? entry.created_at);
  const timeAgo    = formatDistanceToNow(occurredAt, { addSuffix: true });

  // ── Compact row ──────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="flex items-start gap-3 py-2">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${colorCls}`}>
          <Icon className="size-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label-sm font-medium text-sc-navy truncate">{entry.title}</p>
          <p className="text-label-sm text-sc-gray-400">{timeAgo}</p>
        </div>
        {entry.is_celebration && <Sparkles className="size-4 text-sc-gold-700 shrink-0" />}
      </div>
    );
  }

  // ── Full card ────────────────────────────────────────────────────────────
  return (
    <div className={`rounded-xl border p-4 transition-colors ${entry.is_celebration ? "border-sc-gold-200 bg-sc-gold-50/40" : "border-sc-gray-100 bg-white"}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colorCls}`}>
          <Icon className="size-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start gap-2 justify-between">
            <div className="min-w-0">
              <p className="font-medium text-sc-navy leading-snug">{entry.title}</p>
              <p className="text-label-sm text-sc-gray-400 mt-0.5">{timeAgo}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 shrink-0">
              {entry.is_celebration && (
                <Badge variant="gold">🎉 Celebration</Badge>
              )}
              {isStaff && entry.staff_only && (
                <Badge variant="muted">
                  <Lock className="size-3 mr-0.5" />
                  Staff Only
                </Badge>
              )}
              {isStaff && entry.requires_approval && !entry.approved_at && (
                <Badge variant="rose">Pending Approval</Badge>
              )}
              {entry.entry_type === "ai_summary" && (
                <Badge variant="muted">
                  <Bot className="size-3 mr-0.5" />
                  AI Draft
                </Badge>
              )}
            </div>
          </div>

          {entry.body && (
            <p className="text-body-sm text-sc-gray mt-2 leading-relaxed">{entry.body}</p>
          )}

          {/* AI approval note */}
          {isStaff && entry.entry_type === "ai_summary" && !entry.approved_at && (
            <p className="text-label-sm text-sc-gray-400 mt-2 italic">
              This AI draft requires staff approval before parents can see it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Color key resolver ────────────────────────────────────────────────────

function resolveColorKey(key: string): string {
  const map: Record<string, string> = {
    teal:  "bg-sc-teal-50 text-sc-teal",
    navy:  "bg-sc-navy-50 text-sc-navy",
    rose:  "bg-sc-rose-50 text-sc-rose",
    green: "bg-sc-green-50 text-sc-green",
    gold:  "bg-sc-gold-50 text-sc-gold-700",
    gray:  "bg-sc-gray-100 text-sc-gray",
  };
  return map[key] ?? "bg-sc-cream text-sc-gray";
}
