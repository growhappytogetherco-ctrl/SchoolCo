import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getUser, getStudentById, getStudentTimeline, getActiveOrgId } from "@/lib/supabase/server";
import { StudentJourney, FILTER_GROUPS, type FilterGroup } from "@/components/timeline/StudentJourney";

export const metadata: Metadata = { title: "Student Journey" };

/**
 * Student Journey page — Sprint 2.
 *
 * Staff view: shows all timeline entries including staff_only.
 * RLS prevents parents from accessing this route (middleware + RLS double-enforced).
 *
 * Filter is driven by ?filter= query param so it's bookmarkable and server-rendered.
 */
export default async function StudentJourneyPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { id } = await params;
  const { filter: rawFilter } = await searchParams;

  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const student = await getStudentById(id);
  if (!student) notFound();

  const entries = await getStudentTimeline(id, orgId);

  const filter = (FILTER_GROUPS.some((g) => g.value === rawFilter)
    ? rawFilter
    : "all") as FilterGroup;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back */}
      <Link
        href={`/dashboard/students/${id}`}
        className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to {student.first_name}&apos;s Profile
      </Link>

      {/* Header */}
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">
          {student.first_name}&apos;s Journey
        </h1>
        <p className="text-body-md text-sc-gray mt-1">
          {entries.length} milestone{entries.length !== 1 ? "s" : ""} recorded
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_GROUPS.map((g) => (
          <Link
            key={g.value}
            href={`/dashboard/students/${id}/journey?filter=${g.value}`}
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

      {/* Timeline */}
      <StudentJourney
        entries={entries}
        isStaff={true}
        filter={filter}
      />
    </div>
  );
}
