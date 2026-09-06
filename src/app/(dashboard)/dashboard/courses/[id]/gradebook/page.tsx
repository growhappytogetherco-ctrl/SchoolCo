import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/roleGuard";
import { getCourseDetail } from "@/app/actions/courses";
import { getSectionGradingContext } from "@/app/actions/grading";
import { GradebookView } from "@/components/gradebook/GradebookView";

const SUBJECT_LABELS: Record<string, string> = {
  art: "Art", bible: "Bible", ela: "ELA", elective: "Elective",
  entrepreneurship: "Entrepreneurship", geography: "Geography",
  history: "History", leadership: "Leadership", math: "Math",
  music: "Music", pe: "PE", science: "Science", spanish: "Spanish",
  stem: "STEM", other: "Other",
};

export default async function GradebookPage({
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

  const [detailResult, contextResult] = await Promise.all([
    getCourseDetail(id),
    getSectionGradingContext(id, orgId),
  ]);

  if (!detailResult.success) notFound();
  if (!contextResult.success) notFound();

  const { section, roster } = detailResult.data;
  const ctx = contextResult.data;

  const subjectLabel = SUBJECT_LABELS[section.subject] ?? section.subject;

  return (
    <div className="space-y-0 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4">
        <Link
          href={`/dashboard/courses/${id}`}
          className="inline-flex items-center gap-1 text-label-sm text-sc-gray hover:text-sc-navy transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {section.course_name}
        </Link>
        <span className="text-sc-gray-400 text-label-sm">/ Gradebook</span>
      </div>

      <GradebookView
        orgId={orgId}
        courseSectionId={id}
        courseName={section.course_name}
        subject={subjectLabel}
        teacherName={section.teacher_name ?? "No teacher assigned"}
        schoolYearLabel={ctx.schoolYearLabel}
        periods={ctx.periods}
        initialPeriodId={ctx.currentPeriodId}
        gradeScaleLevels={ctx.gradeScaleLevels}
        canEdit={ctx.canEdit}
        studentCount={roster.length}
      />
    </div>
  );
}
