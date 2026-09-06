import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, BookOpen, Settings } from "lucide-react";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/roleGuard";
import { getCourseDetail, getStaffForTeacherSelect } from "@/app/actions/courses";
import { CourseRoster } from "@/components/courses/CourseRoster";

export const metadata: Metadata = { title: "Course" };

const SUBJECT_LABELS: Record<string, string> = {
  bible:            "Bible",
  ela:              "ELA",
  entrepreneurship: "Entrepreneurship",
  geography:        "Geography",
  history:          "History",
  leadership:       "Leadership",
  math:             "Math",
  pe:               "PE",
  science:          "Science",
};

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireStaff();
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const { id } = await params;

  const [detailResult, staffResult] = await Promise.all([
    getCourseDetail(id),
    getStaffForTeacherSelect(),
  ]);

  if (!detailResult.success) notFound();
  const { section, roster, gradeSettings } = detailResult.data;
  const staff = staffResult.success ? staffResult.data : [];

  const subjectLabel = SUBJECT_LABELS[section.subject] ?? section.subject;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/courses"
          className="inline-flex items-center gap-1 text-label-sm text-sc-gray hover:text-sc-navy transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Courses
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-sc-teal/10 px-2.5 py-0.5 text-label-sm font-medium text-sc-teal">
              {subjectLabel}
            </span>
          </div>
          <h1 className="font-serif text-heading-1 text-sc-navy">{section.course_name}</h1>
          <p className="text-body-md text-sc-gray mt-1">
            {section.teacher_name ?? "No teacher assigned"} · {roster.length} student{roster.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Open Gradebook */}
        <div className="sm:text-right">
          <Link
            href={`/dashboard/courses/${id}/gradebook`}
            className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-4 py-2.5 text-white text-label-md font-medium hover:bg-sc-teal-700 transition-colors shadow-sm"
          >
            <BookOpen className="h-4 w-4" />
            Open Gradebook
          </Link>
        </div>
      </div>

      {/* Roster management (client component) */}
      <CourseRoster
        sectionId={section.id}
        subject={section.subject}
        courseName={section.course_name}
        staffRosterId={(section as any).staff_roster_id ?? null}
        teacherName={section.teacher_name}
        roster={roster}
        staff={staff}
      />

      {/* Grading settings summary */}
      {gradeSettings && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
          <h2 className="font-medium text-sc-navy mb-2">Grading Settings</h2>
          <p className="text-label-sm text-sc-gray capitalize">
            Method: {gradeSettings.grading_method.replace("_", " ")}
          </p>
        </div>
      )}
    </div>
  );
}
