import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-xl border p-4 flex gap-3 text-body-sm",
  {
    variants: {
      variant: {
        default:     "bg-sc-teal-50  border-sc-teal-200  text-sc-teal-800",
        destructive: "bg-sc-rose-50  border-sc-rose-200  text-sc-rose-800",
        warning:     "bg-sc-gold-50  border-sc-gold-200  text-sc-gold-800",
        success:     "bg-sc-green-50 border-sc-green-200 text-sc-green-800",
        info:        "bg-sc-navy-50  border-sc-navy-200  text-sc-navy-800",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn("font-semibold leading-none tracking-tight mb-1", className)} {...props} />
  )
);
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("leading-relaxed", className)} {...props} />
  )
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
