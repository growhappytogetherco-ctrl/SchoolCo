import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, GraduationCap, Clock, BadgeCheck, CalendarDays,
  Heart, AlertTriangle, Target, BookOpen, ChevronRight,
} from "lucide-react";
import {
  getUser, getStudentForParent, getStudentTimelineForParent,
  getAttendanceHistoryForParent, getProgressCheckinsForParent,
  getStudentGoalsForParent, getMedicalSummaryForParent, getActiveOrgId,
} from "@/lib/supabase/server";
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

function fmtDate(d: string): string {
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
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
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sc-gray-100 px-3 py-1 text-label-sm text-sc-gray-500">
      <Clock className="size-3.5" /> No record today
    </span>
  );
}

function AttendanceDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    present:         "bg-sc-teal",
    tardy:           "bg-sc-gold-400",
    absent:          "bg-sc-rose",
    excused:         "bg-sc-gray-300",
    checked_in:      "bg-sc-teal",
    early_dismissal: "bg-sc-gold-400",
  };
  return <span className={cn("inline-block size-2.5 rounded-full shrink-0", map[status] ?? "bg-sc-gray-200")} />;
}

function GoalProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-sc-gray-100">
      <div
        className="h-1.5 rounded-full bg-sc-teal transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * Parent Portal — Individual child overview.
 *
 * Security:
 * - getStudentForParent verifies the calling user has an active guardianship.
 *   If not → null → 404. URL manipulation → 404, no data exposure.
 * - All data fetchers verify guardianship independently before returning data.
 * - Returns ONLY parent-safe fields: no staff notes, court orders, staff_only timelines.
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

  const student = await getStudentForParent(id, user.id, orgId);
  if (!student) notFound();

  const [entries, attendanceHistory, checkins, goals, medical] = await Promise.all([
    getStudentTimelineForParent(id, orgId),
    getAttendanceHistoryForParent(id, user.id, orgId, 14),
    getProgressCheckinsForParent(id, user.id, orgId, 5),
    getStudentGoalsForParent(id, user.id, orgId),
    getMedicalSummaryForParent(id, user.id, orgId),
  ]);

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

  const hasMedical = medical.allergies.length > 0 || medical.conditions.length > 0;
  const hasEmergency = medical.allergies.some((a) => a.emergency_medication_required)
    || medical.conditions.some((c) => c.emergency_action_needed);

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link
        href="/portal/children"
        className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
      >
        <ArrowLeft className="size-4" /> My Children
      </Link>

      {/* ── Student summary card ──────────────────────────────────── */}
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

      {/* ── Medical / Health summary ──────────────────────────────── */}
      {hasMedical && (
        <div className={cn(
          "rounded-2xl border p-5 space-y-3",
          hasEmergency
            ? "bg-sc-rose-50 border-sc-rose-200"
            : "bg-sc-gold-50 border-sc-gold-200"
        )}>
          <div className="flex items-center gap-2">
            <AlertTriangle className={cn("size-4 shrink-0", hasEmergency ? "text-sc-rose-600" : "text-sc-gold-600")} />
            <h2 className={cn("font-serif text-heading-3", hasEmergency ? "text-sc-rose-700" : "text-sc-gold-700")}>
              Health Information
            </h2>
          </div>

          {medical.allergies.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-label-sm text-sc-gray-500 uppercase tracking-wide">Allergies</p>
              {medical.allergies.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-label-sm">
                  <span className="text-sc-navy font-medium">{a.allergy_name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="capitalize text-sc-gray">{a.severity}</span>
                    {a.emergency_medication_required && (
                      <Badge variant="destructive" className="text-xs">Epi-pen</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {medical.conditions.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-label-sm text-sc-gray-500 uppercase tracking-wide">Conditions</p>
              {medical.conditions.map((c, i) => (
                <div key={i} className="text-label-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sc-navy font-medium">{c.condition_name}</span>
                    {c.emergency_action_needed && (
                      <Badge variant="destructive" className="text-xs">Emergency protocol</Badge>
                    )}
                  </div>
                  {c.action_instructions && (
                    <p className="text-sc-gray mt-0.5">{c.action_instructions}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Attendance history ────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-heading-2 text-sc-navy">Recent Attendance</h2>
          <Link
            href="/portal/attendance"
            className="flex items-center gap-1 text-label-sm text-sc-teal hover:underline"
          >
            View all <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {attendanceHistory.length === 0 ? (
          <div className="rounded-2xl bg-white border border-sc-gray-100 p-6 text-center text-body-sm text-sc-gray">
            No attendance records yet.
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card divide-y divide-sc-gray-100">
            {attendanceHistory.map((day) => (
              <div key={day.date} className="flex items-center gap-3 px-5 py-3">
                <AttendanceDot status={day.status} />
                <span className="text-label-sm text-sc-gray-500 w-32 shrink-0">{fmtDate(day.date)}</span>
                <span className="text-label-sm text-sc-navy capitalize flex-1">
                  {day.status.replace(/_/g, " ")}
                  {day.is_late && <span className="text-sc-gold-600"> · Late</span>}
                  {day.is_early_pickup && <span className="text-sc-gold-600"> · Early pickup</span>}
                </span>
                {day.check_in_at && (
                  <span className="text-label-sm text-sc-gray-400 shrink-0">{fmtTime(day.check_in_at)}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Teacher check-ins ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-heading-2 text-sc-navy">Teacher Updates</h2>
          <Link
            href="/portal/academics"
            className="flex items-center gap-1 text-label-sm text-sc-teal hover:underline"
          >
            View all <ChevronRight className="size-3.5" />
          </Link>
        </div>

        {checkins.length === 0 ? (
          <div className="rounded-2xl bg-white border border-sc-gray-100 p-6 text-center text-body-sm text-sc-gray">
            No academic updates available yet.
          </div>
        ) : (
          <div className="space-y-3">
            {checkins.map((c) => (
              <div key={c.id} className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-serif text-heading-3 text-sc-navy">
                      {c.lesson_topic ?? c.subject_area ?? "Progress Update"}
                    </p>
                    <p className="text-label-sm text-sc-gray-400">{fmtDate(c.recorded_date)}</p>
                  </div>
                  {c.confidence_level && (
                    <span className="shrink-0 rounded-full bg-sc-teal-50 border border-sc-teal-200 px-2 py-0.5 text-label-sm text-sc-teal-700 capitalize">
                      {c.confidence_level.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                {c.what_was_worked_on && (
                  <p className="text-body-sm text-sc-gray">{c.what_was_worked_on}</p>
                )}
                {c.progress_observed && (
                  <p className="text-body-sm text-sc-navy">{c.progress_observed}</p>
                )}
                {c.parent_follow_up_notes && (
                  <div className="rounded-lg bg-sc-gold-50 border border-sc-gold-200 px-3 py-2 text-label-sm text-sc-gold-700">
                    <span className="font-medium">Follow-up for home: </span>
                    {c.parent_follow_up_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Student goals ─────────────────────────────────────────── */}
      {goals.length > 0 && (
        <section>
          <h2 className="font-serif text-heading-2 text-sc-navy mb-3">
            Learning Goals
          </h2>
          <div className="space-y-3">
            {goals.map((g) => (
              <div key={g.id} className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Target className="size-4 text-sc-teal shrink-0" />
                    <p className="text-body-sm text-sc-navy font-medium">{g.goal_text}</p>
                  </div>
                  <Badge variant={g.status === "achieved" ? "green" : "default"}>
                    {g.status === "achieved" ? "Achieved" : `${g.progress_pct}%`}
                  </Badge>
                </div>
                {g.status !== "achieved" && (
                  <GoalProgressBar pct={g.progress_pct} />
                )}
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-sc-gray-100 px-2 py-0.5 text-label-sm text-sc-gray capitalize">
                    {g.category.replace(/_/g, " ")}
                  </span>
                  {g.target_review_date && (
                    <span className="text-label-sm text-sc-gray-400">
                      Review: {fmtDate(g.target_review_date)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Journey timeline ─────────────────────────────────────── */}
      <section>
        <h2 className="font-serif text-heading-2 text-sc-navy mb-4">
          {student.preferred_name ?? student.first_name}&apos;s Journey
        </h2>

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

        <StudentJourney entries={entries} isStaff={false} filter={filter} />
      </section>
    </div>
  );
}
