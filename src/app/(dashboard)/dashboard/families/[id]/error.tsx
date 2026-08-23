"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for family detail page.
 * Shows the real digest so developers can trace the crash.
 * REMOVE after the guardian-edit crash is identified and fixed.
 */
export default function FamilyDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[FamilyDetail error boundary]", {
      message: error.message,
      digest:  error.digest,
      stack:   error.stack,
    });
  }, [error]);

  return (
    <div className="p-8 rounded-2xl bg-sc-rose-50 border border-sc-rose-200 max-w-3xl space-y-4">
      <h2 className="font-serif text-2xl text-sc-rose font-bold">Family page error — debug view</h2>
      <p className="text-sm text-sc-gray">
        An error occurred rendering this family page. Copy everything below and send to your developer.
      </p>

      <div className="rounded-lg bg-white border border-sc-rose-200 p-4 space-y-2 font-mono text-xs text-sc-gray break-all">
        <div><span className="font-bold text-sc-rose">Digest:</span> {error.digest ?? "(none)"}</div>
        <div><span className="font-bold text-sc-rose">Message:</span> {error.message || "(hidden in prod)"}</div>
        {error.stack && (
          <pre className="mt-2 whitespace-pre-wrap text-xs">{error.stack}</pre>
        )}
      </div>

      <button
        onClick={reset}
        className="rounded-lg border border-sc-rose-200 bg-white px-4 py-2 text-sm font-medium text-sc-rose hover:bg-sc-rose-50 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
