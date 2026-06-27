"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/constants";

interface OrgContext {
  id:       string;
  name:     string;
  logo_url: string | null;
}

interface UserContext {
  id:        string;
  full_name: string;
  avatar_url:string | null;
  role:      UserRole;
  org:       OrgContext;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ctx, setCtx]             = useState<UserContext | null>(null);
  const [loading, setLoading]     = useState(true);
  const [sidebarOpen, setSidebar] = useState(false);

  useEffect(() => {
    async function loadContext() {
      const supabase = createClient();

      // Verify auth
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // Get active org from storage
      const orgId = localStorage.getItem("sc_active_org");
      if (!orgId) { router.push("/select-mission"); return; }

      // Fetch profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", user.id)
        .single();

      // Fetch membership + org
      const { data: membership } = await supabase
        .from("organization_members")
        .select(`role, organizations ( id, name, logo_url )`)
        .eq("profile_id", user.id)
        .eq("organization_id", orgId)
        .eq("status", "active")
        .single();

      if (!membership || !membership.organizations) {
        // User is not a member of the stored org — re-pick
        localStorage.removeItem("sc_active_org");
        router.push("/select-mission");
        return;
      }

      // Parents go to the portal, not the staff dashboard
      if (membership.role === "parent" || membership.role === "student_future") {
        router.push("/portal");
        return;
      }

      const org = membership.organizations as OrgContext;
      setCtx({
        id:         user.id,
        full_name:  profile?.full_name ?? "User",
        avatar_url: profile?.avatar_url ?? null,
        role:       membership.role as UserRole,
        org,
      });
      setLoading(false);
    }

    loadContext();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex">
        <Skeleton className="w-64 h-screen rounded-none" />
        <div className="flex-1 p-8 space-y-4">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!ctx) return null;

  return (
    <div className="min-h-screen flex bg-sc-cream">
      {/* ── Desktop Sidebar ─────────────────────── */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:z-40">
        <AppSidebar
          role={ctx.role}
          orgName={ctx.org.name}
          orgLogo={ctx.org.logo_url}
        />
      </div>

      {/* ── Mobile Sidebar Drawer ───────────────── */}
      {sidebarOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-sc-navy/50 lg:hidden"
            onClick={() => setSidebar(false)}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 flex lg:hidden">
            <AppSidebar
              role={ctx.role}
              orgName={ctx.org.name}
              orgLogo={ctx.org.logo_url}
              onClose={() => setSidebar(false)}
            />
          </div>
        </>
      )}

      {/* ── Main content area ───────────────────── */}
      <div className="flex flex-1 flex-col lg:pl-64">
        <AppHeader
          userName={ctx.full_name}
          userAvatar={ctx.avatar_url}
          orgName={ctx.org.name}
          role={ctx.role}
          onMenuToggle={() => setSidebar((o) => !o)}
        />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
