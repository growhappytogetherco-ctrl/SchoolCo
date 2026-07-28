import { cn } from "@/lib/utils";
import type { EventCategory } from "@/app/actions/planning";
import { EVENT_CATEGORY_CONFIG } from "@/lib/planning-config";

interface PlanningCategoryBadgeProps {
  category: EventCategory;
  size?: "sm" | "md";
  className?: string;
}

export function PlanningCategoryBadge({ category, size = "sm", className }: PlanningCategoryBadgeProps) {
  const config = EVENT_CATEGORY_CONFIG[category];
  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium border",
        config.color,
        config.textColor,
        config.borderColor,
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        className
      )}
    >
      {config.label}
    </span>
  );
}
