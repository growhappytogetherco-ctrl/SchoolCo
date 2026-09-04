import { requireStaff } from "@/lib/roleGuard";
import { getStaffDirectory } from "@/app/actions/staffActions";
import { getStaffPortalStatuses } from "@/app/actions/staff-invitations";
import { StaffDirectory } from "@/components/staff/StaffDirectory";
import { StaffImportGuide } from "@/components/staff/StaffImportGuide";

export default async function StaffPage() {
  const role    = await requireStaff();
  const [members, portalResult] = await Promise.all([
    getStaffDirectory(),
    getStaffPortalStatuses(),
  ]);

  const portalStatuses = portalResult.success ? portalResult.data : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Staff Directory</h1>
        <p className="text-body-md text-sc-gray mt-1">
          {members.length} member{members.length !== 1 ? "s" : ""} · Manage staff, volunteers, and compliance.
        </p>
      </div>
      <StaffDirectory
        initialMembers={members}
        currentRole={role}
        portalStatuses={portalStatuses}
      />
      <StaffImportGuide />
    </div>
  );
}
