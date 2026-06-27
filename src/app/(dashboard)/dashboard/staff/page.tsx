import { ComingSoonPage } from "@/components/shared/ComingSoonPage";
import { requireAdmin } from "@/lib/roleGuard";

export default async function Page() {
  await requireAdmin();
  return <ComingSoonPage title="Staff Directory" description="Manage staff members and roles." />;
}
