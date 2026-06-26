import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser, getProfile } from "@/lib/supabase/server";
import { DailyOperationsDashboard } from "@/components/dashboard/DailyOperationsDashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardHomePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.id);
  const firstName = profile?.full_name?.split(" ")[0] ?? "Friend";

  // Resolve active org from server-side cookie
  let orgId: string | null = null;
  let orgName = "Rising Leaders Academy";

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("organization_members")
      .select("organization_id, organizations(name, short_name)")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (data?.organization_id) {
      orgId = data.organization_id;
      const org = data.organizations as { name: string; short_name: string } | null;
      orgName = org?.short_name ?? org?.name ?? orgName;
    }
  } catch {
    // no active membership — dashboard will show zeroed state
  }

  return (
    <DailyOperationsDashboard
      firstName={firstName}
      orgId={orgId}
      orgName={orgName}
    />
  );
}
