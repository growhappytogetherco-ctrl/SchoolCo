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

  // Resolve first name using fallback chain:
  // 1. staff_roster.first_name (most reliable — admin-entered, links via profile_id)
  // 2. profiles.full_name first word
  // 3. Supabase Auth user_metadata name fields
  // 4. Email prefix
  let firstName: string | null = null;

  const profileAny = profile as any;
  if (!firstName && profileAny?.id) {
    try {
      const supabase = await createClient();
      const { data: staffRow } = await supabase
        .from("staff_roster")
        .select("first_name")
        .eq("profile_id", profileAny.id)
        .maybeSingle();
      const fn = (staffRow as any)?.first_name as string | null | undefined;
      if (fn?.trim()) firstName = fn.trim();
    } catch { /* non-staff users have no roster row */ }
  }

  if (!firstName) {
    const fromProfile = profileAny?.full_name?.trim().split(" ")[0];
    if (fromProfile) firstName = fromProfile;
  }

  if (!firstName) {
    const meta = user.user_metadata;
    const fromMeta =
      meta?.preferred_username ||
      meta?.name?.split(" ")[0] ||
      meta?.full_name?.split(" ")[0] ||
      meta?.given_name;
    if (fromMeta?.trim()) firstName = String(fromMeta).trim();
  }

  if (!firstName) {
    const emailPrefix = user.email?.split("@")[0];
    if (emailPrefix) firstName = emailPrefix;
  }

  firstName = firstName ?? "Friend";

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
      userId={user.id}
    />
  );
}
