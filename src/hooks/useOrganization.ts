"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Organization, OrganizationMember } from "@/types/database";
import type { UserRole } from "@/lib/constants";

interface OrgContext {
  org:    Pick<Organization, "id" | "name" | "slug" | "logo_url" | "primary_color" | "tagline">;
  role:   UserRole;
  status: OrganizationMember["status"];
}

/**
 * Returns the currently selected organization context for the authenticated user.
 * Reads the active org from localStorage and validates membership in Supabase.
 *
 * Usage: const { org, role, loading, error } = useOrganization();
 */
export function useOrganization() {
  const [ctx, setCtx]       = useState<OrgContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]    = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const orgId    = localStorage.getItem("sc_active_org");

      if (!orgId) {
        if (!cancelled) { setLoading(false); setError("no_org"); }
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) { setLoading(false); setError("unauthenticated"); }
        return;
      }

      const { data, error: dbError } = await supabase
        .from("organization_members")
        .select("role, status, organizations(id, name, slug, logo_url, primary_color, tagline)")
        .eq("profile_id", user.id)
        .eq("organization_id", orgId)
        .eq("status", "active")
        .single();

      if (dbError || !data?.organizations) {
        if (!cancelled) { setLoading(false); setError("not_member"); }
        return;
      }

      if (!cancelled) {
        setCtx({
          org:    data.organizations as OrgContext["org"],
          role:   data.role as UserRole,
          status: data.status,
        });
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { ...ctx, loading, error };
}
