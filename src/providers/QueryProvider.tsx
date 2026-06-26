"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * React Query provider.
 * Wraps the app with a QueryClient configured for SchoolCo's usage patterns.
 *
 * Config rationale:
 * - staleTime 60s: School data doesn't change second-by-second.
 * - retry 1: Fail fast on auth/permission errors; don't hammer the DB.
 * - refetchOnWindowFocus false: Prevents jarring refetches mid-form.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime:            60 * 1000, // 60 seconds
            retry:                1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
