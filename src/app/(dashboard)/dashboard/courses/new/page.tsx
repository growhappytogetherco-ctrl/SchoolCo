import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/roleGuard";
import { getStaffForTeacherSelect, getActiveSchoolYear } from "@/app/actions/courses";
import { CreateCourseForm } from "@/components/courses/CreateCourseForm";

export const metadata: Metadata = { title: "New Course" };

export default async function NewCoursePage() {
  await requireStaff();
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const [staffResult, yearResult] = await Promise.all([
    getStaffForTeacherSelect(),
    getActiveSchoolYear(),
  ]);

  const staff = staffResult.success ? staffResult.data : [];
  const schoolYear = yearResult.success ? yearResult.data : { id: "", label: "Current Year" };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/courses"
          className="inline-flex items-center gap-1 text-label-sm text-sc-gray hover:text-sc-navy transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Courses
        </Link>
      </div>

      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">New Course</h1>
        <p className="text-body-md text-sc-gray mt-1">
          Set up a class, assign a teacher, and add students.
        </p>
      </div>

      <CreateCourseForm
        staff={staff}
        schoolYearId={schoolYear.id}
        schoolYearLabel={schoolYear.label}
      />
    </div>
  );
}
