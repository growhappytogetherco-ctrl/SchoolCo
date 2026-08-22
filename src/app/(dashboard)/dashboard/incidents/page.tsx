import { requireStaff } from "@/lib/roleGuard";
import { createClient, getActiveOrgId } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/roleGuard";
import { getRoleLevel } from "@/lib/constants";
import { IncidentsPage } from "@/components/incidents/IncidentsPage";

export default async function Page() {
  await requireStaff();
  const [orgId, role] = await Promise.all([getActiveOrgId(), getCurrentRole()]);
  if (!orgId) return <div className="p-8 text-sc-gray">No active organization.</div>;

  const isAdmin = getRoleLevel(role ?? "") >= getRoleLevel("full_admin");

  const supabase = await createClient();
  const { data } = await supabase
    .from("incidents")
    .select(`
      id, title, description, incident_type, severity, status,
      occurred_at, location, parent_notified, resolution_notes, resolved_at,
      student_id, reported_by,
      students:student_id ( first_name, last_name, preferred_name, student_display_id ),
      reporter:reported_by ( full_name )
    `)
    .eq("organization_id", orgId)
    .order("occurred_at", { ascending: false })
    .limit(200);

  return <IncidentsPage initialIncidents={(data ?? []) as unknown[]} orgId={orgId} isAdmin={isAdmin} />;
}
