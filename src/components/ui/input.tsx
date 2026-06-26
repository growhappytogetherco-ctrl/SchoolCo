import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border bg-white px-3 py-2",
          "text-body-md text-sc-navy placeholder:text-sc-gray-400",
          "transition-all duration-150",
          "focus:outline-none focus:ring-2 focus:ring-sc-teal focus:ring-offset-0 focus:border-sc-teal",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-sc-gray-50",
          error
            ? "border-sc-rose focus:ring-sc-rose"
            : "border-sc-gray-200",
          className
        )}
        ref={ref}
        aria-invalid={error ? "true" : undefined}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
