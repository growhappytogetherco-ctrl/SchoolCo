import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getActiveOrgId, createClient } from "@/lib/supabase/server";
import { getAdminHealthData } from "@/app/actions/admin-health";
import { AdminHealthDashboard } from "@/components/dashboard/AdminHealthDashboard";

export const metadata: Metadata = { title: "Administrator Health" };

const ALLOWED_ROLES = new Set(["admin", "full_admin", "platform_admin"]);

export default async function AdminHealthPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  // Server-side role check
  const supabase = await createClient();
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .single();

  if (!member || !ALLOWED_ROLES.has(member.role as string)) {
    redirect("/dashboard/home");
  }

  const data = await getAdminHealthData();

  return <AdminHealthDashboard initialData={data} />;
}
