import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getUser } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/supabase/server";
import { EnrollmentWizard } from "@/components/enrollment/EnrollmentWizard";

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

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href="/dashboard/families"
        className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
      >
        <ArrowLeft className="size-4" /> Back to Families
      </Link>

      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Enroll a Student</h1>
        <p className="text-body-md text-sc-gray mt-1">
          Create a new family and student record, then optionally invite a guardian.
        </p>
      </div>

      <EnrollmentWizard prefillFamilyId={family_id} />
    </div>
  );
}
