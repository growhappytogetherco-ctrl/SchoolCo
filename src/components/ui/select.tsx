"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string;
}

/**
 * Select — native <select> element styled to match the SchoolCo design system.
 * Uses native browser behavior for accessibility and mobile compatibility.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, placeholder, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "flex h-10 w-full appearance-none rounded-lg border border-sc-gray-200 bg-white",
            "px-3 pr-9 py-2 text-sm text-sc-navy",
            "focus:outline-none focus:ring-2 focus:ring-sc-teal focus:border-sc-teal",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-colors",
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400"
          aria-hidden="true"
        />
      </div>
    );
  }
);
Select.displayName = "Select";

export { Select };
