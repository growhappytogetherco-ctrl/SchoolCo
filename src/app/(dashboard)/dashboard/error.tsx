"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

/**
 * Dashboard-scoped error boundary.
 * Catches errors within the dashboard layout without crashing the entire app.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Dashboard error boundary triggered", {
      message: error.message,
      digest:  error.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sc-rose-50 mb-5">
        <AlertTriangle className="size-7 text-sc-rose" />
      </div>

      <h2 className="font-serif text-heading-2 text-sc-navy mb-2">
        Something went wrong
      </h2>
      <p className="text-body-md text-sc-gray mb-8 max-w-sm leading-relaxed">
        This section ran into an issue. Your data is safe.
        You can try refreshing or return to the dashboard.
      </p>

      {error.digest && (
        <p className="text-label-sm text-sc-gray-400 mb-6 font-mono">
          Ref: {error.digest}
        </p>
      )}

      <div className="flex gap-3">
        <Button onClick={reset} size="sm">
          <RefreshCw className="size-4" />
          Try Again
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/dashboard/home">
            <Home className="size-4" />
            Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
