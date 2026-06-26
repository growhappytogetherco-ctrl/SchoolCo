/**
 * SchoolCo Error Handling Utilities
 *
 * Provides typed error classes and helpers for consistent error handling
 * across server actions, route handlers, and API boundaries.
 */

// ── Typed Error Classes ───────────────────────────────────────────────────

/** Base class for all SchoolCo application errors */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code:       string,
    public readonly statusCode: number = 500,
    public readonly context?:   Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** The user is not authenticated */
export class AuthError extends AppError {
  constructor(message = "You must be signed in to perform this action.") {
    super(message, "AUTH_REQUIRED", 401);
    this.name = "AuthError";
  }
}

/** The user does not have permission to perform this action */
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, "FORBIDDEN", 403);
    this.name = "ForbiddenError";
  }
}

/** A requested resource was not found */
export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found.`, "NOT_FOUND", 404);
    this.name = "NotFoundError";
  }
}

/** Input validation failed */
export class ValidationError extends AppError {
  constructor(message: string, public readonly fields?: Record<string, string>) {
    super(message, "VALIDATION_ERROR", 400, { fields });
    this.name = "ValidationError";
  }
}

/** A rate limit was exceeded */
export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please wait before trying again.") {
    super(message, "RATE_LIMIT", 429);
    this.name = "RateLimitError";
  }
}

// ── Server Action Result Pattern ──────────────────────────────────────────
// Use this pattern in all Server Actions to ensure type-safe results
// without throwing across the server/client boundary.

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}

export function fail(error: string, code?: string): ActionResult<never> {
  return { success: false, error, code };
}

// ── Error Message Extractor ───────────────────────────────────────────────

/** Safely extract a human-readable message from any error */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error)    return error.message;
  if (typeof error === "string") return error;
  return "An unexpected error occurred. Please try again.";
}

/** Map Supabase error codes to user-friendly messages */
export function mapSupabaseError(code: string | undefined, message: string): string {
  const map: Record<string, string> = {
    "23505": "This record already exists.",           // unique_violation
    "23503": "This record references something that no longer exists.", // foreign_key_violation
    "42501": "You do not have permission to perform this action.",     // insufficient_privilege
    "PGRST116": "Record not found.",
  };
  return map[code ?? ""] ?? map[message] ?? "A database error occurred. Please try again.";
}
