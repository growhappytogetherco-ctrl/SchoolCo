/**
 * Shared return type for all SchoolCo server actions.
 *
 * Every server action returns ActionResult<T> so callers get
 * a consistent shape whether the action succeeds or fails.
 *
 * Usage:
 *   export async function createFamily(data: FormData): Promise<ActionResult<Family>> { ... }
 *
 * Client-side:
 *   const result = await createFamily(form);
 *   if (!result.success) { showError(result.error); return; }
 *   console.log(result.data); // typed as Family
 */
export type ActionResult<T = void> =
  | { success: true;  data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };
