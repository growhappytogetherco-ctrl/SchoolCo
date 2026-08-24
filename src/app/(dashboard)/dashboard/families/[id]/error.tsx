"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FamilyDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[FamilyDetailError]", error.digest ?? error.message);
  }, [error]);

  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center p-8">
      <p className="font-serif text-heading-2 text-sc-navy">Something went wrong</p>
      <p className="text-body-md text-sc-gray max-w-sm">
        This family page could not be loaded. Please try again or go back to the families list.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg border border-sc-teal bg-white px-4 py-2 text-label-md font-medium text-sc-teal hover:bg-sc-teal hover:text-white transition-colors"
        >
          Try again
        </button>
        <button
          onClick={() => router.push("/dashboard/families")}
          className="rounded-lg border border-sc-gray-200 bg-white px-4 py-2 text-label-md font-medium text-sc-navy hover:border-sc-teal hover:text-sc-teal transition-colors"
        >
          Back to Families
        </button>
      </div>
      {error.digest && (
        <p className="text-label-sm text-sc-gray-400 font-mono">ref: {error.digest}</p>
      )}
    </div>
  );
}
