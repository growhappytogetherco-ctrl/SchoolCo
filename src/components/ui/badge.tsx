import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-label-sm font-medium transition-colors",
  {
    variants: {
      variant: {
        default:     "bg-sc-teal-100 text-sc-teal-700",
        navy:        "bg-sc-navy-100 text-sc-navy-700",
        rose:        "bg-sc-rose-100 text-sc-rose-700",
        green:       "bg-sc-green-100 text-sc-green-700",
        gold:        "bg-sc-gold-100 text-sc-gold-700",
        outline:     "border border-sc-gray-300 text-sc-gray-700 bg-transparent",
        muted:       "bg-sc-gray-100 text-sc-gray-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
