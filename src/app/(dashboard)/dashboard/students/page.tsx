import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getUser, getStudents, getActiveOrgId } from "@/lib/supabase/server";
import { StudentTable } from "@/components/students/StudentTable";
import { requireStaff } from "@/lib/roleGuard";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Students" };

const FILTERS = [
  { key: "active",   label: "Active",          statuses: ["enrolled"] },
  { key: "former",   label: "Former",           statuses: ["withdrawn", "graduated", "expelled", "inactive"] },
  { key: "all",      label: "All",              statuses: [] },
] as const;
type FilterKey = typeof FILTERS[number]["key"];

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireStaff();
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const { filter: rawFilter } = await searchParams;
  const activeFilter: FilterKey =
    rawFilter === "former" ? "former" : rawFilter === "all" ? "all" : "active";
  const filterCfg = FILTERS.find((f) => f.key === activeFilter)!;

  const students = await getStudents(orgId, {
    limit: 200,
    enrollmentStatuses: filterCfg.key === "all" ? [] : [...filterCfg.statuses],
  });

  const activeCount  = activeFilter === "active"  ? students.length : null;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-heading-1 text-sc-navy">Students</h1>
          <p className="text-body-md text-sc-gray mt-1">
            {students.length > 0
              ? `${students.length} ${activeFilter === "active" ? "enrolled" : activeFilter === "former" ? "former" : ""} student${students.length !== 1 ? "s" : ""}`
              : activeFilter === "active" ? "No enrolled students" : "No students found"}
          </p>
        </div>

        <Link
          href="/dashboard/students/new"
          className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-4 py-2 text-white text-label-md font-medium hover:bg-sc-teal-700 transition-colors shadow-sm"
        >
          <UserPlus className="size-4" />
          Enroll Student
        </Link>
      </div>

      {/* ── Filter Tabs ─────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl border border-sc-gray-100 bg-sc-cream/60 p-1 w-fit">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "active" ? "/dashboard/students" : `/dashboard/students?filter=${f.key}`}
            className={cn(
              "rounded-lg px-4 py-2 text-label-md font-medium transition-all",
              activeFilter === f.key
                ? "bg-white text-sc-navy shadow-sm"
                : "text-sc-gray hover:text-sc-navy"
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {/* ── Student Table ────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
        <StudentTable students={students as Parameters<typeof StudentTable>[0]["students"]} />
      </div>

    </div>
  );
}
