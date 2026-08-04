import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser, getActiveOrgId, createClient } from "@/lib/supabase/server";
import { listImportJobs } from "@/app/actions/importData";
import { getDriveStatus } from "@/app/actions/drive";
import { ImportCenter } from "@/components/import/ImportCenter";

export const metadata: Metadata = { title: "Import Center" };

const ALLOWED_ROLES = new Set(["admin", "full_admin", "platform_admin"]);

export default async function ImportCenterPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

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

  const [jobs, driveStatus] = await Promise.all([listImportJobs(), getDriveStatus()]);

  return <ImportCenter previousJobs={jobs} driveStatus={driveStatus} />;
}
