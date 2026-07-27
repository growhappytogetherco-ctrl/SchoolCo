import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser, getProfile, createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/supabase/server";
import { DailyOperationsDashboard } from "@/components/dashboard/DailyOperationsDashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardHomePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const [profile, orgId] = await Promise.all([
    getProfile(user.id),
    getActiveOrgId(),
  ]);

  if (!orgId) redirect("/select-mission");

  const firstName = profile?.full_name?.split(" ")[0] ?? "Friend";

  // Resolve org name from cookie-based org ID
  let orgName = "Rising Leaders Academy";
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select("name, short_name")
      .eq("id", orgId)
      .single();
    if (data) orgName = data.short_name ?? data.name ?? orgName;
  } catch {
    // keep default
  }

  return (
    <DailyOperationsDashboard
      firstName={firstName}
      orgId={orgId}
      orgName={orgName}
    />
  );
}
