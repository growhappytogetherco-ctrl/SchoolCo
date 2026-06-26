"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

/**
 * Root Error Boundary (Next.js App Router)
 * Catches unhandled errors that bubble up from any page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Unhandled application error", {
      message: error.message,
      digest:  error.digest,
      stack:   error.stack,
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-sc-cream p-6 font-sans">
        <div className="max-w-md w-full text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sc-rose-50 mx-auto mb-6">
            <svg className="size-8 text-sc-rose" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>

          <h1 className="font-serif text-heading-1 text-sc-navy mb-3">
            Something went wrong
          </h1>
          <p className="text-body-md text-sc-gray mb-8 leading-relaxed">
            We ran into an unexpected issue. Our team has been notified.
            Please try again, or contact support if the problem continues.
          </p>

          {error.digest && (
            <p className="text-label-sm text-sc-gray-400 mb-6 font-mono">
              Error ID: {error.digest}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={reset}>
              Try Again
            </Button>
            <Button variant="outline" asChild>
              <a href="/login">Return to Login</a>
            </Button>
          </div>

          <p className="mt-8 text-label-sm text-sc-gray-400">
            Need help?{" "}
            <a href="mailto:help@schoolco.app" className="text-sc-teal hover:underline">
              Contact Support
            </a>
          </p>
        </div>
      </body>
    </html>
  );
}
