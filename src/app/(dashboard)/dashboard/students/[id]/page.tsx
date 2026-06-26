import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Shield, AlertTriangle } from "lucide-react";
import { getUser, getStudentById } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { ENROLLMENT_LABELS, RELATIONSHIP_LABELS, CUSTODY_LABELS, requiresSupervisionAlert } from "@/lib/constants";
import type { EnrollmentStatus, RelationshipType, CustodyType } from "@/lib/constants";

export const metadata: Metadata = { title: "Student Profile" };

/**
 * Student detail page — Sprint 1.
 *
 * Shows: basic info, family, household(s), guardian list with custody summary.
 * Does NOT show: health records, incidents, grades, attendance (future sprints).
 *
 * Security: RLS ensures only staff+ can load student data.
 * Parents are redirected to /dashboard/children (their own children only).
 */
export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUser();
  if (!user) redirect("/login");

  const student = await getStudentById(id);
  if (!student) notFound();

  const displayName = student.preferred_name
    ? `${student.first_name} "${student.preferred_name}" ${student.last_name}`
    : `${student.first_name} ${student.last_name}`;

  const family = student.families as {
    family_name: string;
    family_display_id: string | null;
    is_split_household: boolean;
    households: Array<{
      id: string;
      household_label: string;
      household_display_id: string | null;
      address_json: { street1?: string; city?: string; state?: string; zip?: string } | null;
      phone: string | null;
      sort_order: number;
    }>;
  } | null;

  const guardianships = (student.guardianships ?? []) as Array<{
    id: string;
    relationship_type: string;
    custody_type: string;
    is_legal_guardian: boolean;
    is_primary_contact: boolean;
    is_emergency_contact: boolean;
    emergency_contact_order: number | null;
    can_pickup: boolean;
    pickup_restrictions: string | null;
    household_label: string | null;
    profiles: { id: string; full_name: string; email: string; phone: string | null } | null;
  }>;

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">

      {/* ── Back ──────────────────────────────────────────────── */}
      <Link
        href="/dashboard/students"
        className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
      >
        <ArrowLeft className="size-4" /> Back to Students
      </Link>

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-serif text-heading-1 text-sc-navy">{displayName}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {student.student_display_id && (
                <span className="font-mono text-label-sm text-sc-gray bg-sc-cream px-2 py-0.5 rounded">
                  {student.student_display_id}
                </span>
              )}
              {student.grade_level && (
                <span className="text-label-sm text-sc-gray">{student.grade_level} Grade</span>
              )}
              {student.track && (
                <span className="text-label-sm text-sc-gray capitalize">· {student.track} track</span>
              )}
            </div>
          </div>
          <Badge variant={student.enrollment_status === "enrolled" ? "green" : "muted"}>
            {ENROLLMENT_LABELS[student.enrollment_status as EnrollmentStatus] ?? student.enrollment_status}
          </Badge>
        </div>

        {/* Family link */}
        {family && (
          <div className="mt-4 pt-4 border-t border-sc-gray-100 flex items-center gap-2">
            <span className="text-label-sm text-sc-gray">Family:</span>
            <Link
              href={`/dashboard/families/${student.family_id}`}
              className="text-label-sm font-medium text-sc-teal hover:underline"
            >
              {family.family_name}
            </Link>
            {family.family_display_id && (
              <span className="font-mono text-label-sm text-sc-gray-400">({family.family_display_id})</span>
            )}
            {family.is_split_household && (
              <Badge variant="gold">Split Household</Badge>
            )}
          </div>
        )}
      </div>

      {/* ── Guardians ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
        <h2 className="font-serif text-heading-2 text-sc-navy mb-4">Guardians & Custody</h2>

        {guardianships.length === 0 ? (
          <p className="text-body-md text-sc-gray">No guardian records found for this student.</p>
        ) : (
          <div className="space-y-4">
            {guardianships.map((g) => {
              const needsAlert = requiresSupervisionAlert(g.custody_type as CustodyType);
              return (
                <div key={g.id} className={`rounded-xl border p-4 ${needsAlert ? "border-sc-rose-200 bg-sc-rose-50" : "border-sc-gray-100 bg-sc-cream/50"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-serif text-heading-3 text-sc-navy">
                        {g.profiles?.full_name ?? "Unknown Guardian"}
                      </p>
                      <p className="text-label-sm text-sc-gray capitalize mt-0.5">
                        {RELATIONSHIP_LABELS[g.relationship_type as RelationshipType] ?? g.relationship_type}
                        {g.household_label ? ` · ${g.household_label}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {g.is_legal_guardian && <Badge variant="navy">Legal Guardian</Badge>}
                      {g.is_primary_contact && <Badge variant="green">Primary Contact</Badge>}
                      {!g.can_pickup && <Badge variant="rose">No Pickup</Badge>}
                    </div>
                  </div>

                  {/* Supervision alert */}
                  {needsAlert && (
                    <div className="flex items-start gap-2 rounded-lg bg-sc-rose-100 border border-sc-rose-200 p-3 mb-3">
                      <AlertTriangle className="size-4 text-sc-rose shrink-0 mt-0.5" />
                      <p className="text-label-sm text-sc-rose-700 font-medium">
                        {CUSTODY_LABELS[g.custody_type as CustodyType]}
                        {g.pickup_restrictions ? ` — ${g.pickup_restrictions}` : ""}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-label-sm">
                    <div>
                      <span className="text-sc-gray-400 block">Custody</span>
                      <span className="text-sc-navy font-medium">
                        {CUSTODY_LABELS[g.custody_type as CustodyType] ?? g.custody_type}
                      </span>
                    </div>
                    <div>
                      <span className="text-sc-gray-400 block">Emergency Contact</span>
                      <span className="text-sc-navy font-medium">
                        {g.is_emergency_contact
                          ? `Yes (#${g.emergency_contact_order ?? "–"})`
                          : "No"}
                      </span>
                    </div>
                    <div>
                      <span className="text-sc-gray-400 block">Can Pickup</span>
                      <span className={`font-medium ${g.can_pickup ? "text-sc-green" : "text-sc-rose"}`}>
                        {g.can_pickup ? "Yes" : "No"}
                      </span>
                    </div>
                    {g.profiles?.email && (
                      <div>
                        <span className="text-sc-gray-400 block">Email</span>
                        <a href={`mailto:${g.profiles.email}`} className="text-sc-teal hover:underline">
                          {g.profiles.email}
                        </a>
                      </div>
                    )}
                    {g.profiles?.phone && (
                      <div>
                        <span className="text-sc-gray-400 block">Phone</span>
                        <a href={`tel:${g.profiles.phone}`} className="text-sc-navy font-medium">
                          {g.profiles.phone}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Court order flag */}
                  {/* court_order_notes is never rendered here — staff see a flag only */}
                  {g.pickup_restrictions && !needsAlert && (
                    <div className="flex items-center gap-2 mt-3 text-label-sm text-sc-gray">
                      <Shield className="size-3.5" />
                      Pickup note: {g.pickup_restrictions}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Future Modules (clearly marked) ───────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { title: "Attendance Record",   sprint: "Sprint 3" },
          { title: "Academic Record",      sprint: "Sprint 3" },
          { title: "Health & Allergies",   sprint: "Sprint 3" },
          { title: "Incident History",     sprint: "Sprint 3" },
          { title: "Badge Portfolio",      sprint: "Sprint 4" },
          { title: "Communications Log",   sprint: "Sprint 2" },
        ].map((mod) => (
          <div key={mod.title} className="rounded-xl border border-dashed border-sc-gray-200 p-4 flex items-center justify-between">
            <span className="text-label-md font-medium text-sc-gray">{mod.title}</span>
            <span className="text-label-sm text-sc-gray-400">{mod.sprint}</span>
          </div>
        ))}
      </div>

    </div>
  );
}
