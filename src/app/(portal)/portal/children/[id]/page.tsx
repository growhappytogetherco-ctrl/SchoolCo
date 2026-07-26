import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GraduationCap, Clock, BadgeCheck, CalendarDays } from "lucide-react";
import { getUser, getStudentForParent, getStudentTimelineForParent, getActiveOrgId } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { StudentJourney, FILTER_GROUPS, type FilterGroup } from "@/components/timeline/StudentJourney";
import { ENROLLMENT_LABELS } from "@/lib/constants";
import type { EnrollmentStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Student Overview" };

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AttendanceStatus({ att }: {
  att: {
    status: string;
    check_in_at: string | null;
    check_out_at: string | null;
    is_late: boolean;
    is_early_pickup: boolean;
  } | null;
}) {
  if (!att) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sc-gray-100 px-3 py-1 text-label-sm text-sc-gray-500">
        <Clock className="size-3.5" /> Not yet recorded today
      </span>
    );
  }
  if (att.check_out_at) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sc-navy/10 border border-sc-navy/20 px-3 py-1 text-label-sm text-sc-navy font-medium">
        <Clock className="size-3.5" /> Checked out {fmtTime(att.check_out_at)}
        {att.is_early_pickup && <span className="text-sc-gray-400"> · Early pickup</span>}
      </span>
    );
  }
  if (att.check_in_at) {
    return (
      <span className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-label-sm font-medium",
        att.is_late
          ? "bg-sc-gold-50 border-sc-gold-200 text-sc-gold-700"
          : "bg-sc-teal-50 border-sc-teal-200 text-sc-teal-700"
      )}>
        <BadgeCheck className="size-3.5" />
        On campus since {fmtTime(att.check_in_at)}
        {att.is_late && <span className="font-normal"> · Late</span>}
      </span>
    );
  }
  if (att.status === "absent") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sc-rose-50 border border-sc-rose-200 px-3 py-1 text-label-sm text-sc-rose-700 font-medium">
        <Clock className="size-3.5" /> Absent today
      </span>
    );
  }
  return null;
}

/**
 * Parent Portal — Individual child overview.
 *
 * Security:
 * - getStudentForParent verifies the calling user has an active guardianship
 *   for this student_id within this org. If not → null → 404.
 * - Returns ONLY parent-safe fields: no staff notes, no court orders,
 *   no internal medical details, no incident records.
 * - URL manipulation (changing the student ID) → 404, no data exposure.
 * - getStudentTimelineForParent uses RLS: staff_only=false, approved entries only.
 */
export default async function PortalChildDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { id } = await params;
  const { filter: rawFilter } = await searchParams;

  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  // getStudentForParent verifies guardianship and returns parent-safe fields only
  const student = await getStudentForParent(id, user.id, orgId);
  if (!student) notFound();

  // Parent-safe timeline (RLS-enforced: no staff_only, no unapproved entries)
  const entries = await getStudentTimelineForParent(id, orgId);

  const filter = (FILTER_GROUPS.some((g) => g.value === rawFilter)
    ? rawFilter
    : "all") as FilterGroup;

  const displayName = student.preferred_name
    ? `${student.preferred_name} ${student.last_name}`
    : `${student.first_name} ${student.last_name}`;

  const currentYear = new Date().getFullYear();
  const academicYear = new Date().getMonth() >= 7
    ? `${currentYear}–${currentYear + 1}`
    : `${currentYear - 1}–${currentYear}`;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/portal/children"
        className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
      >
        <ArrowLeft className="size-4" /> My Children
      </Link>

      {/* Student summary card */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 space-y-4">
        <div className="flex items-start gap-4">
          {student.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={student.avatar_url}
              alt={displayName}
              className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-2 ring-sc-gray-100"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sc-teal text-white font-serif text-2xl font-bold">
              {student.first_name.charAt(0)}{student.last_name.charAt(0)}
            </div>
          )}

          <div className="flex-1 min-w-0 pt-0.5">
            <h1 className="font-serif text-heading-1 text-sc-navy leading-tight">
              {displayName}
            </h1>
            {student.preferred_name && (
              <p className="text-label-sm text-sc-gray-400 mt-0.5">
                Legal name: {student.first_name} {student.last_name}
              </p>
            )}

            <div className="flex flex-wrap gap-2 mt-2">
              {student.grade_level && (
                <span className="flex items-center gap-1 text-label-sm text-sc-gray">
                  <GraduationCap className="size-3.5" />
                  {student.grade_level}
                </span>
              )}
              {student.track && (
                <span className="rounded-full bg-sc-gray-100 px-2 py-0.5 text-label-sm text-sc-gray">
                  {student.track}
                </span>
              )}
              <Badge variant={student.enrollment_status === "enrolled" ? "green" : "muted"}>
                {ENROLLMENT_LABELS[student.enrollment_status as EnrollmentStatus] ?? student.enrollment_status}
              </Badge>
            </div>
          </div>
        </div>

        {/* Info row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-sc-gray-100">
          <div>
            <p className="text-label-sm text-sc-gray-400 uppercase tracking-wide">Today&apos;s Status</p>
            <div className="mt-1.5">
              <AttendanceStatus att={student.today_attendance} />
            </div>
          </div>
          <div>
            <p className="text-label-sm text-sc-gray-400 uppercase tracking-wide">Academic Year</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-label-sm text-sc-navy font-medium">
              <CalendarDays className="size-3.5 text-sc-gray-400" />
              {academicYear}
            </p>
          </div>
        </div>
      </div>

      {/* Journey section */}
      <div>
        <h2 className="font-serif text-heading-2 text-sc-navy mb-4">
          {student.preferred_name ?? student.first_name}&apos;s Journey
        </h2>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {FILTER_GROUPS.filter((g) => g.value !== "staff").map((g) => (
            <Link
              key={g.value}
              href={`/portal/children/${id}?filter=${g.value}`}
              className={cn(
                "rounded-full px-4 py-1.5 text-label-sm font-medium transition-colors",
                filter === g.value
                  ? "bg-sc-navy text-white"
                  : "bg-sc-cream border border-sc-gray-200 text-sc-gray hover:border-sc-navy hover:text-sc-navy"
              )}
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
