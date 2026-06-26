import { Skeleton } from "@/components/ui/skeleton";

export default function FamilyDetailLoading() {
  return (
    <div className="space-y-6 max-w-5xl">
      <Skeleton className="h-4 w-32" />
      <div className="rounded-2xl bg-white border border-sc-gray-100 p-6 space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-10 w-80 rounded-xl" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
