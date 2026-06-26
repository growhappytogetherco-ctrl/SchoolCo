"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { MissionCard } from "@/components/mission/MissionCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { APP_TAGLINE } from "@/lib/constants";
import type { UserRole } from "@/lib/constants";

interface OrgMembership {
  role: UserRole;
  status: string;
  organizations: {
    id:            string;
    name:          string;
    slug:          string;
    logo_url:      string | null;
    tagline:       string | null;
    primary_color: string | null;
    is_active:     boolean;
  } | null;
}

export default function SelectMissionPage() {
  const router = useRouter();
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [loading, setLoading]         = useState(true);
  const [selecting, setSelecting]     = useState<string | null>(null);
  const [userName, setUserName]       = useState("");

  useEffect(() => {
    async function loadMissions() {
      const supabase = createClient();

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }

      // Get profile name
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      setUserName(profile?.full_name?.split(" ")[0] ?? "");

      // Get org memberships
      const { data } = await supabase
        .from("organization_members")
        .select(`
          role, status,
          organizations (
            id, name, slug, logo_url, tagline, primary_color, is_active
          )
        `)
        .eq("profile_id", user.id)
        .eq("status", "active");

      setMemberships((data as OrgMembership[]) ?? []);
      setLoading(false);
    }

    loadMissions();
  }, [router]);

  async function handleSelect(orgId: string) {
    setSelecting(orgId);
    // Set org in both localStorage (client reads) and server cookie (server reads)
    localStorage.setItem("sc_active_org", orgId);
    // Call server action to set httpOnly cookie and redirect
    const form = new FormData();
    form.set("orgId", orgId);
    const { setActiveOrg } = await import("@/app/actions/org");
    await setActiveOrg(form);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-sc-cream flex flex-col">
      {/* Header */}
      <header className="border-b border-sc-gray-100 bg-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sc-teal">
              <svg viewBox="0 0 24 24" fill="none" className="size-4 text-white" aria-hidden="true">
                <path
                  d="M12 21C12 21 1 14.5 1 8.5C1 5.42 3.42 3 6.5 3C8.24 3 9.91 3.81 11 5.08C12.09 3.81 13.76 3 15.5 3C18.58 3 21 5.42 21 8.5C21 14.5 12 21 12 21Z"
                  fill="currentColor"
                />
              </svg>
            </div>
            <span className="font-serif font-semibold text-lg text-sc-navy">SchoolCo.</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="size-4" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          {/* Title */}
          <div className="text-center mb-10">
            <h1 className="font-serif text-heading-1 text-sc-navy">
              {userName ? `Welcome, ${userName}!` : "Choose Your Mission"}
            </h1>
            <p className="mt-2 text-body-md text-sc-gray">
              Select the mission you'd like to work in today.
            </p>
            <p className="mt-1 text-label-sm text-sc-gray-400 italic">
              {APP_TAGLINE}
            </p>
          </div>

          {/* Mission cards */}
          <div className="space-y-4">
            {loading ? (
              <>
                <Skeleton className="h-28 w-full rounded-2xl" />
                <Skeleton className="h-28 w-full rounded-2xl" />
                <Skeleton className="h-28 w-full rounded-2xl" />
              </>
            ) : memberships.length === 0 ? (
              <div className="text-center py-16 text-sc-gray">
                <p className="text-body-lg font-medium">No active missions found.</p>
                <p className="text-body-sm mt-1">
                  Contact your organization administrator for access.
                </p>
              </div>
            ) : (
              memberships
                .filter((m) => m.organizations?.is_active)
                .map((m) => (
                  <MissionCard
                    key={m.organizations!.id}
                    id={m.organizations!.id}
                    name={m.organizations!.name}
                    tagline={m.organizations!.tagline}
                    logoUrl={m.organizations!.logo_url}
                    primaryColor={m.organizations!.primary_color}
                    role={m.role}
                    onSelect={handleSelect}
                    isLoading={selecting === m.organizations!.id}
                  />
                ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
