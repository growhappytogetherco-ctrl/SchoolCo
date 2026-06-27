import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Home, Users, GraduationCap, AlertTriangle, MapPin, Phone, Mail } from "lucide-react";
import { getUser, getFamily, getActiveOrgId } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AddHouseholdDialog } from "@/components/families/AddHouseholdDialog";
import { AddGuardianDialog } from "@/components/guardians/AddGuardianDialog";
import { RELATIONSHIP_LABELS, CUSTODY_LABELS, requiresSupervisionAlert, ENROLLMENT_LABELS } from "@/lib/constants";
import type { RelationshipType, CustodyType, EnrollmentStatus } from "@/lib/constants";

export const metadata: Metadata = { title: "Family Detail" };

/**
 * Family Detail page — Sprint 2.
 *
 * Server component. Shows:
 *   - Family info + split household flag
 *   - Households tab: address, phone, contact info, add household
 *   - Students tab: enrolled students, quick links to detail pages
 *   - Guardians tab: all guardians per student, custody alerts, add guardian
 *
 * Security: staff+ only (RLS enforces). Parents cannot access this route
 * (middleware redirects to /portal). court_order_notes never rendered here.
 */
export default async function FamilyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user   = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const family = await getFamily(id);
  if (!family) notFound();

  const households = ((family.households ?? []) as HouseholdRow[])
    .filter((h) => !h.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order);

  const students = ((family.students ?? []) as StudentRow[])
    .filter((s) => !s.archived_at);

  // All unique guardians across all students in this family
  const allGuardians = students.flatMap((s) =>
    ((s.guardianships ?? []) as GuardianshipRow[])
      .filter((g) => g.status === "active" && !g.archived_at)
      .map((g) => ({ ...g, _student: s }))
  );

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">

      {/* ── Back ──────────────────────────────────────────────── */}
      <Link
        href="/dashboard/families"
        className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
      >
        <ArrowLeft className="size-4" /> Back to Families
      </Link>

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-heading-1 text-sc-navy">{family.family_name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {family.family_display_id && (
                <span className="font-mono text-label-sm text-sc-gray bg-sc-cream px-2 py-0.5 rounded">
                  {family.family_display_id}
                </span>
              )}
              <span className="text-label-sm text-sc-gray">
                {students.length} student{students.length !== 1 ? "s" : ""} · {households.length} household{households.length !== 1 ? "s" : ""}
              </span>
              {family.is_split_household && (
                <Badge variant="gold">Split Household</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Staff notes (never shown in parent portal) */}
        {family.notes && (
          <div className="mt-4 pt-4 border-t border-sc-gray-100">
            <p className="text-label-sm text-sc-gray-400 uppercase tracking-wide font-semibold mb-1">Staff Notes</p>
            <p className="text-body-sm text-sc-gray">{family.notes}</p>
          </div>
        )}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <Tabs defaultValue="households">
        <TabsList>
          <TabsTrigger value="households">
            <Home className="size-4" />
            Households ({households.length})
          </TabsTrigger>
          <TabsTrigger value="students">
            <GraduationCap className="size-4" />
            Students ({students.length})
          </TabsTrigger>
          <TabsTrigger value="guardians">
            <Users className="size-4" />
            Guardians ({allGuardians.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Households Tab ─────────────────────────────────── */}
        <TabsContent value="households">
          <div className="flex items-center justify-between mb-4">
            <p className="text-label-sm text-sc-gray">
              {family.is_split_household
                ? "This family has multiple households. Each parent sees only their own household."
                : "Standard single-household family."}
            </p>
            <AddHouseholdDialog familyId={id} onSuccess={() => {}} />
          </div>

          {households.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sc-gray-200 p-8 text-center">
              <p className="text-body-md text-sc-gray">No households yet. Add one above.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {households.map((h, i) => (
                <div key={h.id} className="rounded-xl bg-white border border-sc-gray-100 shadow-card p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="font-serif text-heading-3 text-sc-navy">{h.household_label}</p>
                      {h.household_display_id && (
                        <span className="font-mono text-label-sm text-sc-gray-400">{h.household_display_id}</span>
                      )}
                    </div>
                    {i === 0 && <Badge variant="default">Primary</Badge>}
                  </div>

                  <div className="space-y-2 text-label-sm">
                    {h.address_json?.street1 && (
                      <div className="flex items-start gap-2 text-sc-gray">
                        <MapPin className="size-3.5 mt-0.5 shrink-0" />
                        <span>
                          {h.address_json.street1}
                          {h.address_json.city && `, ${h.address_json.city}`}
                          {h.address_json.state && `, ${h.address_json.state}`}
                          {h.address_json.zip && ` ${h.address_json.zip}`}
                        </span>
                      </div>
                    )}
                    {h.phone && (
                      <div className="flex items-center gap-2 text-sc-gray">
                        <Phone className="size-3.5 shrink-0" />
                        <a href={`tel:${h.phone}`} className="hover:text-sc-teal">{h.phone}</a>
                      </div>
                    )}
                    {h.email && (
                      <div className="flex items-center gap-2 text-sc-gray">
                        <Mail className="size-3.5 shrink-0" />
                        <a href={`mailto:${h.email}`} className="hover:text-sc-teal">{h.email}</a>
                      </div>
                    )}
                    {!h.address_json?.street1 && !h.phone && !h.email && (
                      <p className="text-sc-gray-400">No contact info added yet.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Students Tab ───────────────────────────────────── */}
        <TabsContent value="students">
          {students.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sc-gray-200 p-8 text-center">
              <p className="text-body-md text-sc-gray">
                No students yet.{" "}
                <Link href="/dashboard/students/new" className="text-sc-teal hover:underline">
                  Enroll a student
                </Link>{" "}
                to link them to this family.
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sc-gray-100 bg-sc-cream">
                    <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Student</th>
                    <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Grade / Track</th>
                    <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sc-gray-100">
                  {students.map((s) => (
                    <tr key={s.id} className="hover:bg-sc-cream/50 transition-colors">
                      <td className="py-3 px-4">
                        <Link href={`/dashboard/students/${s.id}`} className="group">
                          <p className="font-medium text-sc-navy group-hover:text-sc-teal transition-colors">
                            {s.last_name}, {s.first_name}
                            {s.preferred_name ? <span className="text-sc-gray font-normal"> ({s.preferred_name})</span> : null}
                          </p>
                          {s.student_display_id && (
                            <p className="font-mono text-label-sm text-sc-gray-400">{s.student_display_id}</p>
                          )}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-sc-gray">
                        {s.grade_level ?? "–"}
                        {s.track && <span className="text-sc-gray-400"> · {s.track}</span>}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={s.enrollment_status === "enrolled" ? "green" : "muted"}>
                          {ENROLLMENT_LABELS[s.enrollment_status as EnrollmentStatus] ?? s.enrollment_status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex">
            <Link
              href={`/dashboard/students/new?family_id=${id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-sc-teal bg-white px-4 py-2 text-label-md font-medium text-sc-teal hover:bg-sc-teal hover:text-white transition-colors"
            >
              <GraduationCap className="size-4" />
              Enroll Student in this Family
            </Link>
          </div>
        </TabsContent>

        {/* ── Guardians Tab ──────────────────────────────────── */}
        <TabsContent value="guardians">
          <div className="flex items-center justify-between mb-4">
            <p className="text-label-sm text-sc-gray">
              Guardians are linked per student. Each guardian has their own visibility and custody settings.
            </p>
            {students.length > 0 && (
              <AddGuardianDialog
                studentId={students[0].id}
                familyId={id}
                households={households.map((h) => ({ id: h.id, household_label: h.household_label }))}
                onSuccess={() => {}}
              />
            )}
          </div>

          {allGuardians.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sc-gray-200 p-8 text-center">
              <p className="text-body-md text-sc-gray">No guardians added yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {allGuardians.map((g) => {
                const profile  = g.profiles as ProfileRow | null;
                const needsAlert = requiresSupervisionAlert(g.custody_type as CustodyType);

                return (
                  <div
                    key={g.id}
                    className={`rounded-xl border p-4 ${needsAlert ? "border-sc-rose-200 bg-sc-rose-50" : "bg-white border-sc-gray-100"}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-serif text-heading-3 text-sc-navy">{profile?.full_name ?? "Unknown"}</p>
                        <p className="text-label-sm text-sc-gray capitalize mt-0.5">
                          {RELATIONSHIP_LABELS[g.relationship_type as RelationshipType] ?? g.relationship_type}
                          {" · "}
                          <Link href={`/dashboard/students/${g._student.id}`} className="hover:text-sc-teal transition-colors">
                            {g._student.first_name} {g._student.last_name}
                          </Link>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {g.is_legal_guardian    && <Badge variant="navy">Legal Guardian</Badge>}
                        {g.is_primary_contact   && <Badge variant="green">Primary Contact</Badge>}
                        {!g.can_pickup          && <Badge variant="rose">No Pickup</Badge>}
                        {g.court_order_on_file  && <Badge variant="gold">Court Order on File</Badge>}
                      </div>
                    </div>

                    {needsAlert && (
                      <div className="flex items-start gap-2 rounded-lg bg-sc-rose-100 border border-sc-rose-200 p-3 mb-3">
                        <AlertTriangle className="size-4 text-sc-rose shrink-0 mt-0.5" />
                        <p className="text-label-sm text-sc-rose-700 font-medium">
                          {CUSTODY_LABELS[g.custody_type as CustodyType]}
                          {g.pickup_restrictions ? ` — ${g.pickup_restrictions}` : ""}
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-label-sm">
                      <div>
                        <span className="text-sc-gray-400 block">Custody</span>
                        <span className="text-sc-navy font-medium">
                          {CUSTODY_LABELS[g.custody_type as CustodyType] ?? g.custody_type}
                        </span>
                      </div>
                      <div>
                        <span className="text-sc-gray-400 block">Can Pickup</span>
                        <span className={`font-medium ${g.can_pickup ? "text-sc-green" : "text-sc-rose"}`}>
                          {g.can_pickup ? "Yes" : "No"}
                        </span>
                      </div>
                      {profile?.email && (
                        <div>
                          <span className="text-sc-gray-400 block">Email</span>
                          <a href={`mailto:${profile.email}`} className="text-sc-teal hover:underline">{profile.email}</a>
                        </div>
                      )}
                      {profile?.phone && (
                        <div>
                          <span className="text-sc-gray-400 block">Phone</span>
                          <a href={`tel:${profile.phone}`} className="text-sc-navy font-medium">{profile.phone}</a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Local Types (narrowing the Supabase join response) ───────────────────

interface HouseholdRow {
  id:                   string;
  household_display_id: string | null;
  household_label:      string;
  sort_order:           number;
  address_json:         { street1?: string; city?: string; state?: string; zip?: string } | null;
  phone:                string | null;
  email:                string | null;
  archived_at:          string | null;
}

interface GuardianshipRow {
  id:                      string;
  relationship_type:        string;
  custody_type:             string;
  is_legal_guardian:        boolean;
  is_primary_contact:       boolean;
  is_emergency_contact:     boolean;
  emergency_contact_order:  number | null;
  can_pickup:               boolean;
  pickup_restrictions:      string | null;
  court_order_on_file:      boolean;
  household_id:             string | null;
  status:                   string;
  archived_at:              string | null;
  profiles:                 ProfileRow | null;
  _student:                 StudentRow;
}

interface ProfileRow {
  id:         string;
  full_name:  string;
  email:      string;
  phone:      string | null;
}

interface StudentRow {
  id:                 string;
  student_display_id: string | null;
  first_name:         string;
  last_name:          string;
  preferred_name:     string | null;
  grade_level:        string | null;
  enrollment_status:  string;
  track:              string | null;
  archived_at:        string | null;
  guardianships:      GuardianshipRow[] | null;
}
