import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/roleGuard";
import { getCourseSectionsWithEnrollmentCounts } from "@/app/actions/courses";

export const metadata: Metadata = { title: "Courses" };

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

function subjectLabel(subject: string) {
  return SUBJECT_LABELS[subject.toLowerCase()] ?? subject;
}

export default async function CoursesPage() {
  await requireStaff();
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const result = await getCourseSectionsWithEnrollmentCounts();
  const courses = result.success ? result.data : [];

  const isEmpty = courses.length === 0;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-heading-1 text-sc-navy">Courses</h1>
          <p className="text-body-md text-sc-gray mt-1">
            {isEmpty
              ? "No courses set up yet"
              : `${courses.length} course${courses.length !== 1 ? "s" : ""} this year`}
          </p>
        </div>
        <Link
          href="/dashboard/courses/new"
          className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-4 py-2 text-white text-label-md font-medium hover:bg-sc-teal-700 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          New Course
        </Link>
      </div>

      {isEmpty ? (
        /* ── Empty state / First-time setup ── */
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-12 flex flex-col items-center text-center gap-6">
          <div className="rounded-full bg-sc-teal/10 p-5">
            <BookOpen className="h-10 w-10 text-sc-teal" />
          </div>
          <div className="max-w-md">
            <h2 className="font-serif text-2xl text-sc-navy mb-2">Set up your first course</h2>
            <p className="text-body-md text-sc-gray">
              Courses connect your students and teachers to the gradebook. Create a course,
              assign a teacher, and add students to get started.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/dashboard/courses/new"
              className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-5 py-2.5 text-white text-label-md font-medium hover:bg-sc-teal-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Create Your First Course
            </Link>
          </div>
          <p className="text-label-sm text-sc-gray-400 max-w-sm">
            Tip: Start with the subjects your students are already enrolled in — we&apos;ll help you
            match them automatically.
          </p>
        </div>
      ) : (
        /* ── Course grid ── */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map(course => (
            <Link
              key={course.id}
              href={`/dashboard/courses/${course.id}`}
              className="block rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 hover:border-sc-teal/40 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="rounded-full bg-sc-teal/10 px-2.5 py-0.5 text-label-sm font-medium text-sc-teal">
                  {subjectLabel(course.subject)}
                </span>
                <BookOpen className="h-4 w-4 text-sc-gray-400 group-hover:text-sc-teal transition-colors shrink-0" />
              </div>
              <h3 className="font-serif text-lg text-sc-navy leading-snug mb-1">
                {course.course_name}
              </h3>
              <p className="text-label-sm text-sc-gray mb-4">
                {course.teacher_name ?? "No teacher assigned"}
              </p>
              <div className="flex items-center justify-between text-label-sm text-sc-gray-400">
                <span>{course.student_count} student{course.student_count !== 1 ? "s" : ""}</span>
                <span className="text-sc-teal font-medium group-hover:underline">View →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
