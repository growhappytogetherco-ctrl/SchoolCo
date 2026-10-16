import { redirect } from "next/navigation";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { OrdersPage } from "@/components/finance/orders/OrdersPage";

export const metadata = { title: "Orders & Invoices" };

export default async function OrdersRoute() {
  const [user, orgId] = await Promise.all([getUser(), getActiveOrgId()]);
  if (!user || !orgId) redirect("/login");

  const supabase = await createClient();

  const { data: memberRaw } = await supabase
    .from("organization_members")
    .select("can_view_finances, can_manage_finances, role")
    .eq("organization_id", orgId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const member = memberRaw as { can_view_finances: boolean; can_manage_finances: boolean; role: string } | null;
  const isFullAdmin = member?.role === "full_admin" || member?.role === "platform_admin";
  const canView     = isFullAdmin || (member?.can_view_finances ?? false) || (member?.can_manage_finances ?? false);
  const canManage   = isFullAdmin || (member?.can_manage_finances ?? false);

  if (!canView) redirect("/dashboard/home");

  return <OrdersPage canManage={canManage} />;
}
