import { cn } from "@/lib/utils";
import type { MessageCategory } from "@/app/actions/messages";

export const CATEGORY_LABELS: Record<MessageCategory, string> = {
  general:        "General Question",
  attendance:     "Attendance",
  academics:      "Academics",
  schedule:       "Schedule",
  transportation: "Transportation / Pickup",
  billing:        "Billing / Scholarship",
  medical:        "Medical / Safety",
  technical:      "Technical Support",
  other:          "Other",
};

const CATEGORY_COLORS: Record<MessageCategory, string> = {
  general:        "bg-sc-gray-100 text-sc-navy",
  attendance:     "bg-sc-teal/10 text-sc-teal",
  academics:      "bg-sc-gold-50 text-sc-gold-700",
  schedule:       "bg-sc-teal/10 text-sc-teal",
  transportation: "bg-sc-gold-50 text-sc-gold-700",
  billing:        "bg-sc-rose-50 text-sc-rose-700",
  medical:        "bg-sc-rose-50 text-sc-rose-700",
  technical:      "bg-sc-gray-100 text-sc-navy",
  other:          "bg-sc-gray-100 text-sc-navy",
};

export function CategoryBadge({ category }: { category: MessageCategory }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
      CATEGORY_COLORS[category]
    )}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}
