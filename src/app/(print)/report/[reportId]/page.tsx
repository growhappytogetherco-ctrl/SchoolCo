import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getStudentReport } from "@/app/actions/reports";
import { ReportPrintView } from "@/components/reports/ReportPrintView";

export const metadata: Metadata = { title: "Academic Report" };

// Force dynamic rendering — report content depends on auth cookies.
export const dynamic = "force-dynamic";

export default async function PrintReportPage({
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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold text-gray-800">Report Not Found</p>
          <p className="text-sm text-gray-500">{result.error}</p>
        </div>
      </div>
    );
  }

  return <ReportPrintView data={result.data} showToolbar={true} isStaff={true} />;
}
