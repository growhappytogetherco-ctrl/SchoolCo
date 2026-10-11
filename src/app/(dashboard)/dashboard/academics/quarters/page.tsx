import { requireStaff } from "@/lib/roleGuard";
import { getActiveOrgId } from "@/lib/supabase/server";
import { getQuarterDashboard } from "@/app/actions/quarterWorkflow";
import { QuarterDashboard } from "@/components/quarters/QuarterDashboard";
import { isFinalizationRole } from "@/lib/constants";
import { resolveDefaultPeriodId } from "@/lib/grading/periodSelection";

export default async function QuartersPage() {
  const role  = await requireStaff();
  const orgId = await getActiveOrgId();
  if (!orgId) return <p className="p-6 text-body-md text-sc-gray-400">No active organization.</p>;

  const result = await getQuarterDashboard(orgId);
  if (!result.success) {
    return (
      <div className="p-6">
        <p className="text-body-md text-sc-rose">Failed to load quarter data: {(result as any).error}</p>
      </div>
    );
  }

  const { data } = result;

  // Default to the most recently active/ended quarter (Q1 for today Oct 11)
  const today = new Date().toISOString().split("T")[0];
  const defaultPeriodId = resolveDefaultPeriodId(
    data.periods.map((p) => ({
      id:                   p.periodId,
      period_type:          "quarter",
      is_assignment_period: true,
      start_date:           p.startDate,
      end_date:             p.endDate,
    })),
    today,
  );

  const canFinalize = isFinalizationRole(role);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-heading-1 text-sc-navy">Quarter Management</h1>
        <p className="text-body-md text-sc-gray-400 mt-1">
          Review and finalize quarter grades for {data.schoolYearLabel}.
        </p>
      </div>

      <QuarterDashboard
        data={data}
        orgId={orgId}
        canFinalize={canFinalize}
        initialPeriodId={defaultPeriodId}
      />
    </div>
  );
}
