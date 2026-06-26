import { Skeleton } from "@/components/ui/skeleton";

/**
 * Root loading state — shown during initial page navigation.
 * Matches the sidebar + content layout to prevent layout shift.
 */
export default function RootLoading() {
  return (
    <div className="min-h-screen flex bg-sc-cream" aria-busy="true" aria-label="Loading">
      <Skeleton className="hidden lg:block w-64 min-h-screen rounded-none" />
      <div className="flex-1 flex flex-col">
        <Skeleton className="h-16 w-full rounded-none" />
        <div className="p-8 space-y-4">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
