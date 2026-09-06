import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getUser, getGuardianChildren, getActiveOrgId } from "@/lib/supabase/server";
import { ParentGradesView } from "@/components/portal/ParentGradesView";

export const metadata: Metadata = { title: "Grades" };

export default async function PortalGradesPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const children = await getGuardianChildren(user.id, orgId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Grades</h1>
        <p className="text-body-md text-sc-gray mt-1">Current grades for your children.</p>
      </div>
      <ParentGradesView children={children} />
    </div>
  );
}
