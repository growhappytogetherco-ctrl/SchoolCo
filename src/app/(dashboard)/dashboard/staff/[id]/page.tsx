import { notFound, redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/roleGuard";
import { getStaffMember } from "@/app/actions/staffActions";
import { StaffProfileView } from "@/components/staff/StaffProfileView";

export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user   = await getUser();
  if (!user) redirect("/login");

  const role   = await requireStaff();
  const member = await getStaffMember(id);
  if (!member) notFound();

  return (
    <div className="animate-fade-in">
      <StaffProfileView member={member} currentRole={role} />
    </div>
  );
}
