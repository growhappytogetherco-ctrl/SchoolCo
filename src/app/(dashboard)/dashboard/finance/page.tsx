import { redirect } from "next/navigation";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getSchoolYears } from "@/app/actions/finance";
import { FinanceDashboard } from "@/components/finance/FinanceDashboard";

export const metadata = { title: "Finance" };

export default async function FinancePage() {
  const [user, orgId] = await Promise.all([getUser(), getActiveOrgId()]);
  if (!user || !orgId) redirect("/login");

  const supabase = await createClient();

  // Check finance access flags from org membership
  const { data: memberRaw } = await supabase
    .from("organization_members")
    .select("can_view_finances, can_manage_finances")
    .eq("organization_id", orgId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const member = memberRaw as { can_view_finances: boolean; can_manage_finances: boolean } | null;

  // Fall back to auth_user_id lookup (staging profiles may use different UUID)
  let canView    = member?.can_view_finances    ?? false;
  let canManage  = member?.can_manage_finances  ?? false;

  if (!member) {
    const { data: profileRaw } = await supabase
      .from("profiles")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const profile = profileRaw as { id: string } | null;

    if (profile) {
      const { data: m2Raw } = await supabase
        .from("organization_members")
        .select("can_view_finances, can_manage_finances")
        .eq("organization_id", orgId)
        .eq("profile_id", profile.id)
        .eq("status", "active")
        .maybeSingle();
      const m2 = m2Raw as { can_view_finances: boolean; can_manage_finances: boolean } | null;
      canView   = m2?.can_view_finances   ?? false;
      canManage = m2?.can_manage_finances ?? false;
    }
  }

  if (!canView && !canManage) redirect("/dashboard/home");

  const schoolYears = await getSchoolYears(orgId);

  return (
    <FinanceDashboard
      orgId={orgId}
      canManage={canManage}
      schoolYears={schoolYears}
    />
  );
}
