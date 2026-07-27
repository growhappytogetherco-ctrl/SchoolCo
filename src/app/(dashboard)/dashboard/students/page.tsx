import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getUser, getStudents, getActiveOrgId } from "@/lib/supabase/server";
import { StudentTable } from "@/components/students/StudentTable";
import { requireStaff } from "@/lib/roleGuard";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage() {
  await requireStaff();
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const students = await getStudents(orgId, { limit: 100 });

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-heading-1 text-sc-navy">Students</h1>
          <p className="text-body-md text-sc-gray mt-1">
            {students.length > 0
              ? `${students.length} enrolled student${students.length !== 1 ? "s" : ""}`
              : "No students enrolled yet"}
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

      {/* ── Student Table ────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
        <StudentTable students={students as Parameters<typeof StudentTable>[0]["students"]} />
      </div>

    </div>
  );
}
