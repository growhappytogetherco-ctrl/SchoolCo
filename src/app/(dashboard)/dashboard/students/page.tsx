import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { getUser, getStudents } from "@/lib/supabase/server";
import { StudentTable } from "@/components/students/StudentTable";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Students" };

/**
 * Students list page — Sprint 1.
 *
 * Server component. Loads enrolled students for the active org.
 * RLS enforces staff-only access — parents cannot reach this page
 * (middleware redirects them to /dashboard/children instead).
 *
 * Sprint 2: Add enrollment workflow, student creation form.
 * Sprint 3: Add attendance quick-view, health flag indicators.
 */
export default async function StudentsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  // Get the user's primary active org
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (!membership) redirect("/select-mission");

  const students = await getStudents(membership.organization_id, { limit: 100 });

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

        {/* Enrollment action — Sprint 2 */}
        <div title="Enrollment coming in Sprint 2" className="opacity-40 cursor-not-allowed select-none">
          <div className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-4 py-2 text-white text-label-md font-medium pointer-events-none">
            <UserPlus className="size-4" />
            Enroll Student
          </div>
        </div>
      </div>

      {/* ── Student Table ────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-1 sm:p-0 overflow-hidden">
        <div className="p-4 sm:p-6">
          <StudentTable students={students as Parameters<typeof StudentTable>[0]["students"]} />
        </div>
      </div>

      {/* ── Sprint note ─────────────────────────────────────── */}
      {students.length > 0 && (
        <p className="text-label-sm text-sc-gray-400 text-center">
          Click any student to view their full profile · Student detail pages coming in Sprint 2
        </p>
      )}

    </div>
  );
}
