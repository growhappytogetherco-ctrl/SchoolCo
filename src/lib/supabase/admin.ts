/**
 * Supabase Admin (Service Role) Client
 *
 * SECURITY — READ CAREFULLY:
 * - This client bypasses ALL Row Level Security policies.
 * - It has unrestricted access to every table in the database.
 * - It may ONLY be imported in:
 *     - Server Actions (files named actions/*.ts)
 *     - Route Handlers (app/api/**/route.ts)
 *     - Server-only utility files (lib/supabase/admin.ts itself)
 * - NEVER import this in:
 *     - Client components ("use client")
 *     - The browser bundle
 *     - Any file prefixed with NEXT_PUBLIC_
 *
 * Use this client only when:
 * 1. Sending auth invites (auth.admin.inviteUserByEmail)
 * 2. Creating profiles for newly invited users
 * 3. System-level operations that must bypass user-scoped RLS
 *
 * For all user-facing operations, use createClient() from server.ts instead.
 */

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is not set. " +
    "This key is required for admin operations. " +
    "Never expose this key to the browser."
  );
}

/**
 * Returns a Supabase client with service role privileges.
 * Bypasses RLS — use with extreme care.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken:  false,
        persistSession:    false,
        detectSessionInUrl: false,
      },
    }
  );
}
