import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getStudentReport } from "@/app/actions/reports";
import { ReportPrintView } from "@/components/reports/ReportPrintView";

export const metadata: Metadata = { title: "Academic Report" };
export const dynamic = "force-dynamic";

export default async function PortalReportPage({
  params,
}: {
  params: { reportId: string };
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const result = await getStudentReport(params.reportId);

  if (!result.success) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="font-serif text-lg text-sc-navy">Report Not Found</p>
        <p className="text-label-sm text-sc-gray">This report may not be available or you may not have access.</p>
      </div>
    );
  }

  // Parents see issued reports only — enforced by assertCanViewReport in the action.
  return <ReportPrintView data={result.data} showToolbar={true} isStaff={false} />;
}
