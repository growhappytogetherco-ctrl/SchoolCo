import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface EmptyStateProps {
  icon:        LucideIcon;
  title:       string;
  description: string;
  actionLabel?: string;
  actionHref?:  string;
  /** Sprint label shown on the chip, e.g. "Coming in Sprint 2" */
  sprintLabel?: string;
}

/**
 * EmptyState — shown when a feature has no data yet, or is not yet implemented.
 * Use sprintLabel to clearly communicate what's coming and when.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  sprintLabel,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sc-gray-100 mb-5">
        <Icon className="size-7 text-sc-gray-400" strokeWidth={1.5} />
      </div>

      <h3 className="font-serif text-heading-3 text-sc-navy mb-2">{title}</h3>
      <p className="text-body-md text-sc-gray max-w-sm leading-relaxed mb-5">
        {description}
      </p>

      {sprintLabel && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sc-gold-50 border border-sc-gold-200 px-3 py-1 text-label-sm text-sc-gold-700 mb-5">
          <span className="h-1.5 w-1.5 rounded-full bg-sc-gold" />
          {sprintLabel}
        </span>
      )}

      {actionLabel && actionHref && (
        <Button asChild size="sm">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
