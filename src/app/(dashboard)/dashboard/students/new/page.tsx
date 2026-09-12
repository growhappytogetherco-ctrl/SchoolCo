import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getUser, getActiveOrgId, createClient } from "@/lib/supabase/server";
import { EnrollmentWizard } from "@/components/enrollment/EnrollmentWizard";
import type { PrefillFamily } from "@/components/enrollment/EnrollmentWizard";

export const metadata: Metadata = { title: "Enroll Student" };

export default async function EnrollStudentPage({
  searchParams,
}: {
  searchParams: Promise<{ family_id?: string }>;
}) {
  const user  = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const { family_id } = await searchParams;

  // When linking from a family page, look up the existing family so we can
  // skip the Family step and attach the student directly.
  let prefillFamily: PrefillFamily | undefined;
  if (family_id) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("families")
      .select("id, family_name")
      .eq("id", family_id)
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .single();
    if (data) {
      const row = data as any;
      prefillFamily = { id: row.id as string, family_name: row.family_name as string };
    }
  }

  const backHref = prefillFamily
    ? `/dashboard/families/${prefillFamily.id}`
    : "/dashboard/families";

  const pageTitle = prefillFamily
    ? `Enroll Student in ${prefillFamily.family_name}`
    : "Enroll a Student";

  const pageDescription = prefillFamily
    ? `Add a new student to the ${prefillFamily.family_name} family.`
    : "Create a new family and student record, then optionally invite a guardian.";

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
      >
        <ArrowLeft className="size-4" /> {prefillFamily ? `Back to ${prefillFamily.family_name}` : "Back to Families"}
      </Link>

      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">{pageTitle}</h1>
        <p className="text-body-md text-sc-gray mt-1">{pageDescription}</p>
      </div>

      <EnrollmentWizard prefillFamily={prefillFamily} />
    </div>
  );
}
