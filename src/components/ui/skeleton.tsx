import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-md shimmer bg-sc-gray-100", className)}
      {...props}
    />
  );
}

export { Skeleton };
