"use client";

import { QueryProvider } from "@/providers/QueryProvider";

/**
 * Root Providers
 * Combines all client-side providers in one component.
 * Import this in the root layout to wrap the entire app.
 *
 * Order matters: providers that depend on others go inside.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      {children}
    </QueryProvider>
  );
}
