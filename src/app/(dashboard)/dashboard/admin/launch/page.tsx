import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getActiveOrgId, createClient } from "@/lib/supabase/server";
import {
  getLaunchChecklist,
  getImportJobs,
  getQrBadgeStatus,
  getImportValidationSummary,
  getPilotFamilies,
} from "@/app/actions/launch";
import { LaunchCenter } from "@/components/launch/LaunchCenter";

export const metadata: Metadata = { title: "Launch Readiness Center" };

const ALLOWED_ROLES = new Set(["admin", "full_admin", "platform_admin"]);

export default async function LaunchPage() {
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

  const [checklist, importJobsResult, qrStatusResult, validationResult, pilotResult] =
    await Promise.all([
      getLaunchChecklist(),
      getImportJobs(),
      getQrBadgeStatus(),
      getImportValidationSummary(),
      getPilotFamilies(),
    ]);

  return (
    <LaunchCenter
      initialChecklist={checklist}
      initialImportJobs={importJobsResult.success ? importJobsResult.data : []}
      initialQrStatus={
        qrStatusResult.success
          ? qrStatusResult.data
          : { total: 0, hasQr: 0, missingQr: 0, byGrade: {} }
      }
      initialValidation={
        validationResult.success
          ? validationResult.data
          : null
      }
      initialPilotFamilies={pilotResult.success ? pilotResult.data : []}
    />
  );
}
