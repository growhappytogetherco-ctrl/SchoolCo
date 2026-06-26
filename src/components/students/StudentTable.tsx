"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, GraduationCap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ENROLLMENT_LABELS } from "@/lib/constants";
import type { EnrollmentStatus } from "@/lib/constants";

interface StudentRow {
  id:                   string;
  student_display_id:   string | null;
  first_name:           string;
  last_name:            string;
  preferred_name:       string | null;
  grade_level:          string | null;
  enrollment_status:    string;
  track:                string | null;
  families: {
    family_name:        string;
    family_display_id:  string | null;
    is_split_household: boolean;
  } | null;
}

interface StudentTableProps {
  students: StudentRow[];
}

const ENROLLMENT_BADGE: Record<string, "default" | "green" | "gold" | "outline" | "muted"> = {
  enrolled:   "green",
  applicant:  "gold",
  waitlisted: "gold",
  withdrawn:  "muted",
  graduated:  "outline",
  expelled:   "default",
};

export function StudentTable({ students }: StudentTableProps) {
  const [search, setSearch] = useState("");

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q) ||
      (s.student_display_id ?? "").toLowerCase().includes(q) ||
      (s.families?.family_name ?? "").toLowerCase().includes(q)
    );
  });

  if (students.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No students yet"
        description="Enrolled students will appear here. Use the Enrollment module to add your first student."
        sprintLabel="Enrollment in Sprint 2"
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
        <Input
          placeholder="Search students…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-body-md text-sc-gray">
          No students match &ldquo;{search}&rdquo;
        </p>
      ) : (
        <>
          {/* Mobile: card list */}
          <div className="sm:hidden space-y-3">
            {filtered.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/students/${s.id}`}
                className="block rounded-xl bg-white border border-sc-gray-100 shadow-card p-4 hover:shadow-card-hover transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-serif text-heading-3 text-sc-navy">
                      {s.first_name}{s.preferred_name ? ` "${s.preferred_name}"` : ""} {s.last_name}
                    </p>
                    <p className="text-label-sm text-sc-gray mt-0.5">
                      {s.student_display_id ?? "–"} · {s.grade_level ?? "–"}{s.track ? ` · ${s.track}` : ""}
                    </p>
                    {s.families && (
                      <p className="text-label-sm text-sc-gray-400 mt-0.5">
                        {s.families.family_name}
                        {s.families.is_split_household && " · Split household"}
                      </p>
                    )}
                  </div>
                  <Badge variant={ENROLLMENT_BADGE[s.enrollment_status] ?? "muted"}>
                    {ENROLLMENT_LABELS[s.enrollment_status as EnrollmentStatus] ?? s.enrollment_status}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block rounded-xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sc-gray-100 bg-sc-cream">
                  <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Student</th>
                  <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">ID</th>
                  <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Grade</th>
                  <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide hidden lg:table-cell">Family</th>
                  <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sc-gray-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-sc-cream/50 transition-colors">
                    <td className="py-3 px-4">
                      <Link href={`/dashboard/students/${s.id}`} className="group">
                        <p className="font-medium text-sc-navy group-hover:text-sc-teal transition-colors">
                          {s.last_name}, {s.first_name}
                          {s.preferred_name ? <span className="text-sc-gray font-normal"> ({s.preferred_name})</span> : null}
                        </p>
                        {s.track && (
                          <p className="text-label-sm text-sc-gray-400 capitalize">{s.track}</p>
                        )}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-label-sm text-sc-gray">
                        {s.student_display_id ?? "–"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sc-gray">{s.grade_level ?? "–"}</td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      {s.families ? (
                        <span className="text-sc-gray">
                          {s.families.family_name}
                          {s.families.is_split_household && (
                            <span className="ml-1 text-label-sm text-sc-gold-600">· Split</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-sc-gray-400">–</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={ENROLLMENT_BADGE[s.enrollment_status] ?? "muted"}>
                        {ENROLLMENT_LABELS[s.enrollment_status as EnrollmentStatus] ?? s.enrollment_status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-sc-gray-100 px-4 py-3 bg-sc-cream/50">
              <p className="text-label-sm text-sc-gray">
                Showing {filtered.length} of {students.length} student{students.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
