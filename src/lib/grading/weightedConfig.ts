// Shared utility for weighted grading configuration validation.
// No "use server" — safe to import in client components, server actions, and pages.

import type { CategoryWeights } from "./types";

export function isWeightedConfigured(
  method: string,
  weights: CategoryWeights | null | undefined
): weights is CategoryWeights {
  if (method !== "weighted") return false;
  if (!weights || typeof weights !== "object") return false;
  const values = Object.values(weights).filter((v) => typeof v === "number");
  if (values.length === 0) return false;
  if (values.some((v) => v < 0)) return false;
  const total = values.reduce((s, v) => s + (v as number), 0);
  return Math.abs(total - 100) < 0.001;
}
