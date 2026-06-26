"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?:       string;
  description?: string;
}

/**
 * Checkbox — styled native checkbox with optional label and description.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const checkboxId = id ?? React.useId();

    return (
      <div className="flex items-start gap-3">
        <div className="relative flex items-center mt-0.5">
          <input
            type="checkbox"
            ref={ref}
            id={checkboxId}
            className="peer sr-only"
            {...props}
          />
          <div
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-sc-gray-300 bg-white",
              "peer-checked:bg-sc-teal peer-checked:border-sc-teal",
              "peer-focus:ring-2 peer-focus:ring-sc-teal peer-focus:ring-offset-1",
              "peer-disabled:opacity-50 peer-disabled:cursor-not-allowed",
              "transition-colors",
              className
            )}
            aria-hidden="true"
          >
            <Check className="size-2.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
          </div>
        </div>
        {(label || description) && (
          <div className="flex flex-col gap-0.5">
            {label && (
              <label htmlFor={checkboxId} className="text-label-md font-medium text-sc-navy cursor-pointer">
                {label}
              </label>
            )}
            {description && (
              <p className="text-label-sm text-sc-gray leading-relaxed">{description}</p>
            )}
          </div>
        )}
      </div>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
