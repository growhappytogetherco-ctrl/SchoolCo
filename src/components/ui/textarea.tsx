import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-lg border bg-white px-3 py-2",
        "text-body-md text-sc-navy placeholder:text-sc-gray-400",
        "resize-y transition-all duration-150",
        "focus:outline-none focus:ring-2 focus:ring-sc-teal focus:border-sc-teal",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-sc-gray-50",
        error ? "border-sc-rose focus:ring-sc-rose" : "border-sc-gray-200",
        className
      )}
      ref={ref}
      aria-invalid={error ? "true" : undefined}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
