"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?:       string;
  description?: string;
}

/**
 * Switch — toggle switch built on native checkbox for full accessibility.
 * Visual appearance is a sliding pill; behavior is identical to a checkbox.
 */
const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const generatedId = React.useId();
    const switchId = id ?? generatedId;

    return (
      <div className="flex items-start gap-3">
        <div className="relative inline-flex items-center mt-0.5">
          <input
            type="checkbox"
            role="switch"
            ref={ref}
            id={switchId}
            className="peer sr-only"
            {...props}
          />
          {/* Track */}
          <div
            className={cn(
              "h-5 w-9 rounded-full border-2 border-transparent",
              "bg-sc-gray-200 peer-checked:bg-sc-teal",
              "peer-focus:ring-2 peer-focus:ring-sc-teal peer-focus:ring-offset-2",
              "peer-disabled:opacity-50 peer-disabled:cursor-not-allowed",
              "transition-colors duration-200",
              className
            )}
            aria-hidden="true"
          >
            {/* Thumb */}
            <div
              className={cn(
                "size-4 rounded-full bg-white shadow-sm",
                "translate-x-0 peer-checked:translate-x-4",
                "transition-transform duration-200",
              )}
            />
          </div>
        </div>
        {(label || description) && (
          <div className="flex flex-col gap-0.5">
            {label && (
              <label htmlFor={switchId} className="text-label-md font-medium text-sc-navy cursor-pointer">
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
Switch.displayName = "Switch";

export { Switch };
