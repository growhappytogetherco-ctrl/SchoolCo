import { redirect } from "next/navigation";
import { getUser, getActiveOrgId, getActiveRole, resolveProfileId, createClient } from "@/lib/supabase/server";
import { FinanceReports } from "@/components/finance/FinanceReports";

export default async function ReportsPage() {
  const [user, orgId, role] = await Promise.all([getUser(), getActiveOrgId(), getActiveRole()]);
  if (!user) redirect("/login");
  if (!orgId) redirect("/select-mission");

  const FINANCE_FULL_ROLES = new Set(["full_admin", "platform_admin"]);
  let canView = false;
  let canManage = false;

  if (FINANCE_FULL_ROLES.has(role ?? "")) {
    canView = true;
    canManage = true;
  } else {
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
    canView   = !!(memData?.can_view_finances || memData?.can_manage_finances);
    canManage = !!memData?.can_manage_finances;
  }

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
