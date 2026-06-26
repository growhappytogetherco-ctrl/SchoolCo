import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getUser, getStudentById, getStudentTimelineForParent, getMyGuardianships } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { StudentJourney, FILTER_GROUPS, type FilterGroup } from "@/components/timeline/StudentJourney";
import { ENROLLMENT_LABELS } from "@/lib/constants";
import type { EnrollmentStatus } from "@/lib/constants";

export const metadata: Metadata = { title: "Child Detail" };

/**
 * Parent Portal — Individual child detail + timeline.
 *
 * Security:
 * - getStudentTimelineForParent calls get_student_timeline_for_parent() which:
 *   1. Verifies the calling user is a guardian of this student via is_guardian_of()
 *   2. Returns ONLY entries where staff_only = false AND
 *      (requires_approval = false OR approved_at IS NOT NULL)
 * - Parents NEVER see: staff notes, unapproved AI drafts, unapproved incidents.
 * - getMyGuardianships confirms the calling parent's relationship to this student.
 *   If no guardianship exists for this parent+student, we 404.
 */
export default async function PortalChildDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { id }             = await params;
  const { filter: rawFilter } = await searchParams;
  const user = await getUser();
  if (!user) redirect("/login");

  // Verify this parent has a guardianship for this student
  const guardianships = await getMyGuardianships(user.id);
  const myGuardianship = guardianships.find((g) => g.student_id === id && g.status === "active");
  if (!myGuardianship) notFound();

  const student = await getStudentById(id);
  if (!student) notFound();

  // Parent-safe timeline (RLS-enforced: no staff_only, no unapproved entries)
  const entries = await getStudentTimelineForParent(id);

  const filter = (FILTER_GROUPS.some((g) => g.value === rawFilter)
    ? rawFilter
    : "all") as FilterGroup;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/portal/children"
        className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
      >
        <ArrowLeft className="size-4" /> My Children
      </Link>

      {/* Header card */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-sc-teal text-white font-serif text-2xl">
            {student.first_name.charAt(0)}{student.last_name.charAt(0)}
          </div>
          <div>
            <h1 className="font-serif text-heading-1 text-sc-navy">
              {student.first_name} {student.last_name}
              {student.preferred_name
                ? <span className="text-sc-gray font-sans font-normal text-body-md"> ({student.preferred_name})</span>
                : null}
            </h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {student.grade_level && (
                <span className="text-label-sm text-sc-gray">{student.grade_level}</span>
              )}
              {student.track && (
                <span className="text-label-sm text-sc-gray-400">· {student.track}</span>
              )}
              <Badge variant={student.enrollment_status === "enrolled" ? "green" : "muted"}>
                {ENROLLMENT_LABELS[student.enrollment_status as EnrollmentStatus] ?? student.enrollment_status}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Journey section */}
      <div>
        <h2 className="font-serif text-heading-2 text-sc-navy mb-4">
          {student.first_name}&apos;s Journey
        </h2>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {FILTER_GROUPS.filter((g) => g.value !== "staff").map((g) => (
            <Link
              key={g.value}
              href={`/portal/children/${id}?filter=${g.value}`}
              className={`rounded-full px-4 py-1.5 text-label-sm font-medium transition-colors ${
                filter === g.value
                  ? "bg-sc-navy text-white"
                  : "bg-sc-cream border border-sc-gray-200 text-sc-gray hover:border-sc-navy hover:text-sc-navy"
              }`}
            >
              {g.label}
            </Link>
          ))}
        </div>

        <StudentJourney
          entries={entries}
          isStaff={false}
          filter={filter}
        />
      </div>
    </div>
  );
}
