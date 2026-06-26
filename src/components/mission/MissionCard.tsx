"use client";

import { Building2, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type UserRole } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface MissionCardProps {
  id:           string;
  name:         string;
  tagline?:     string | null;
  logoUrl?:     string | null;
  primaryColor?:string | null;
  role:         UserRole;
  onSelect:     (orgId: string) => void;
  isLoading?:   boolean;
}

export function MissionCard({
  id, name, tagline, logoUrl, primaryColor, role, onSelect, isLoading,
}: MissionCardProps) {
  const accentColor = primaryColor ?? "#046264";

  return (
    <button
      onClick={() => onSelect(id)}
      disabled={isLoading}
      className={cn(
        "group w-full text-left rounded-2xl border border-sc-gray-100 bg-white",
        "p-6 shadow-card transition-all duration-200",
        "hover:shadow-card-hover hover:border-sc-teal-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sc-teal focus-visible:ring-offset-2",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        "animate-fade-in"
      )}
    >
      <div className="flex items-start gap-4">
        {/* Logo / Icon */}
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl overflow-hidden"
          style={{ backgroundColor: `${accentColor}15` }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={`${name} logo`} className="h-full w-full object-contain p-1" />
          ) : (
            <Building2 className="size-7" style={{ color: accentColor }} />
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-heading-3 text-sc-navy truncate">
            {name}
          </h3>
          {tagline && (
            <p className="mt-0.5 text-body-sm text-sc-gray line-clamp-2 leading-snug">
              {tagline}
            </p>
          )}
          <div className="mt-3">
            <Badge variant="default" className="text-xs">
              {ROLE_LABELS[role]}
            </Badge>
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight
          className="size-5 text-sc-gray-300 group-hover:text-sc-teal group-hover:translate-x-0.5 transition-all mt-1 shrink-0"
          aria-hidden="true"
        />
      </div>
    </button>
  );
}
