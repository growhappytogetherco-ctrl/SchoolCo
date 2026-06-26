import { Skeleton } from "@/components/ui/skeleton";

export default function FamiliesLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading families">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-4 w-44" />
        </div>
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-sc-gray-100">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
