import { requireAdmin } from "@/lib/roleGuard";
import { getStaffMembers } from "@/app/actions/staffManagement";
import { StaffManagementPanel } from "@/components/staff/StaffManagementPanel";

export default async function StaffPage() {
  const role = await requireAdmin();
  const members = await getStaffMembers();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Staff Directory</h1>
        <p className="text-body-md text-sc-gray mt-1">
          Manage staff members, roles, and access.
        </p>
      </div>
      <StaffManagementPanel initialMembers={members} currentRole={role} />
    </div>
  );
}
