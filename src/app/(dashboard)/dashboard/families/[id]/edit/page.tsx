import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getUser, getFamily, getActiveOrgId } from "@/lib/supabase/server";
import { requireRole } from "@/lib/roleGuard";
import { EditFamilyForm } from "@/components/families/EditFamilyForm";

export const metadata: Metadata = { title: "Edit Family" };

export default async function EditFamilyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("registrar");
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const family = await getFamily(id);
  if (!family) notFound();

  // Find the primary household (sort_order=1, not archived)
  const households = ((family.households ?? []) as Array<{
    id: string;
    household_label: string;
    sort_order: number;
    phone: string | null;
    email: string | null;
    address_json: { street1?: string; city?: string; state?: string; zip?: string } | null;
    archived_at: string | null;
  }>)
    .filter((h) => !h.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order);

  const primaryHousehold = households[0] ?? null;

  return (
    <EditFamilyForm
      familyId={id}
      initialFamilyName={family.family_name as string}
      initialNotes={(family.notes as string | null) ?? ""}
      primaryHousehold={primaryHousehold}
    />
  );
}
