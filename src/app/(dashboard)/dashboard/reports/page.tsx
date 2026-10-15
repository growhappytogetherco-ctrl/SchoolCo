import { redirect } from "next/navigation";
import { getUser, getActiveOrgId, resolveProfileId, createClient } from "@/lib/supabase/server";
import { FinanceReports } from "@/components/finance/FinanceReports";

export default async function ReportsPage() {
  const [user, orgId] = await Promise.all([getUser(), getActiveOrgId()]);
  if (!user) redirect("/login");
  if (!orgId) redirect("/select-mission");

  const supabase = await createClient();
  const profileId = await resolveProfileId(user.id);
  const { data: mem } = await supabase
    .from("organization_members")
    .select("can_view_finances, can_manage_finances")
    .eq("profile_id", profileId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();
  const memData = mem as unknown as { can_view_finances: boolean; can_manage_finances: boolean } | null;
  const canView   = !!(memData?.can_view_finances || memData?.can_manage_finances);
  const canManage = !!memData?.can_manage_finances;

  if (!canView) redirect("/dashboard/home");

  const supabase2 = await createClient();
  const { data: syData } = await supabase2
    .from("school_years")
    .select("id, label, start_date, end_date, is_current")
    .eq("organization_id", orgId)
    .order("start_date", { ascending: false });
  const schoolYears = (syData ?? []) as unknown as { id: string; label: string; start_date: string; end_date: string; is_current: boolean }[];

  return <FinanceReports orgId={orgId} canManage={canManage} initialSchoolYears={schoolYears} />;
}
