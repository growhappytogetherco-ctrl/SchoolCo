import { ComingSoonPage } from "@/components/shared/ComingSoonPage";
import { requireStaff } from "@/lib/roleGuard";

export default async function Page() {
  await requireStaff();
  return <ComingSoonPage title="Incident Reports" description="View and manage all student incidents." />;
}
