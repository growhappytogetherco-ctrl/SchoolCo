/**
 * SchoolCo Audit Log Helper
 *
 * Use this to write immutable audit records for every sensitive action.
 * Audit logs are append-only — no updates, no deletes (enforced by RLS).
 *
 * Usage (Server Actions or Route Handlers only):
 *   import { writeAuditLog } from "@/lib/audit";
 *   await writeAuditLog(supabase, {
 *     organizationId: orgId,
 *     actorId:        userId,
 *     action:         "member.invited",
 *     resourceType:   "profile",
 *     resourceId:     newMemberId,
 *     newValues:      { email, role },
 *     request:        req,              // optional: extracts IP/device
 *   });
 *
 * SECURITY:
 *   - Only call from server-side code (Server Actions, Route Handlers).
 *   - Never call from client components.
 *   - The Supabase client passed in must be the server client.
 *   - actor_id must match the authenticated user (enforced by RLS).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { logger } from "@/lib/logger";

// ── Audit Action Constants ────────────────────────────────────────────────
// Define every auditable action as a typed constant.
// This prevents typos and makes audit searches predictable.

export const AUDIT_ACTIONS = {
  // Auth
  AUTH_SIGN_IN:           "auth.sign_in",
  AUTH_SIGN_OUT:          "auth.sign_out",
  AUTH_PASSWORD_RESET:    "auth.password_reset",

  // Profile
  PROFILE_UPDATED:        "profile.updated",
  PROFILE_AVATAR_CHANGED: "profile.avatar_changed",

  // Membership
  MEMBER_INVITED:         "member.invited",
  MEMBER_ROLE_CHANGED:    "member.role_changed",
  MEMBER_SUSPENDED:       "member.suspended",
  MEMBER_REACTIVATED:     "member.reactivated",

  // Organization
  ORG_SETTINGS_UPDATED:   "org.settings_updated",
  ORG_BRANDING_UPDATED:   "org.branding_updated",

  // Records (future sprints — defined now for consistency)
  RECORD_VIEWED:          "record.viewed",
  RECORD_CREATED:         "record.created",
  RECORD_UPDATED:         "record.updated",
  RECORD_ARCHIVED:        "record.archived",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

// ── Audit Log Writer ──────────────────────────────────────────────────────

interface WriteAuditLogParams {
  organizationId?: string | null;
  actorId:         string;
  action:          AuditAction | string;  // string allows custom actions not in the enum
  resourceType?:   string;
  resourceId?:     string;
  previousValues?: Record<string, unknown>;
  newValues?:      Record<string, unknown>;
  metadata?:       Record<string, unknown>;
  request?:        Request;              // Optional: extract IP and device
}

/**
 * Write a single audit log entry.
 * Call this from server-side code only.
 * Returns true on success, false on failure (never throws).
 */
export async function writeAuditLog(
  supabase: SupabaseClient<Database>,
  params: WriteAuditLogParams
): Promise<boolean> {
  const {
    organizationId,
    actorId,
    action,
    resourceType,
    resourceId,
    previousValues,
    newValues,
    metadata,
    request,
  } = params;

  // Extract IP and device from request headers if provided
  const ipAddress = request
    ? (request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
       request.headers.get("x-real-ip") ??
       null)
    : null;

  const device = request
    ? request.headers.get("user-agent")
    : null;

  const { error } = await supabase.from("audit_logs").insert({
    organization_id:  organizationId ?? null,
    actor_id:         actorId,
    action,
    resource_type:    resourceType ?? null,
    resource_id:      resourceId ?? null,
    previous_values:  previousValues ?? null,
    new_values:       newValues ?? null,
    metadata:         metadata ?? null,
    ip_address:       ipAddress,
    device:           device,
    session_id:       null, // Populated in a future sprint
  });

  if (error) {
    logger.error("Failed to write audit log", {
      error:  error.message,
      action,
      actorId,
      organizationId,
    });
    return false;
  }

  return true;
}

// ── Convenience wrapper ───────────────────────────────────────────────────
// Accepts a single snake_case payload and creates its own Supabase client.
// Used by server actions that don't pass a client to every call site.

interface LogAuditParams {
  organization_id?: string | null;
  actor_id:         string;
  action:           AuditAction | string;
  resource_type?:   string;
  resource_id?:     string;
  previous_values?: Record<string, unknown>;
  new_values?:      Record<string, unknown>;
  metadata?:        Record<string, unknown>;
  request?:         Request;
}

export async function logAudit(params: LogAuditParams): Promise<boolean> {
  // Lazy import to avoid circular deps / client-side bundling
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  return writeAuditLog(supabase, {
    organizationId: params.organization_id ?? undefined,
    actorId:        params.actor_id,
    action:         params.action,
    resourceType:   params.resource_type,
    resourceId:     params.resource_id,
    previousValues: params.previous_values,
    newValues:      params.new_values,
    metadata:       params.metadata,
    request:        params.request,
  });
}
