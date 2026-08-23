import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Home, Users, GraduationCap, Pencil } from "lucide-react";
import { getUser, getFamily, getActiveOrgId, createClient } from "@/lib/supabase/server";
import { getCurrentRole } from "@/lib/roleGuard";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AddHouseholdDialog } from "@/components/families/AddHouseholdDialog";
import { AddGuardianDialog } from "@/components/guardians/AddGuardianDialog";
import { GuardiansPanel } from "@/components/guardians/GuardiansPanel";
import { HouseholdsPanel } from "@/components/families/HouseholdsPanel";
import type { HouseholdData, HouseholdGuardian, HouseholdStudent } from "@/components/families/HouseholdsPanel";
import { ENROLLMENT_LABELS, getRoleLevel } from "@/lib/constants";
import type { EnrollmentStatus } from "@/lib/constants";
import type { GuardianGroup } from "@/components/guardians/GuardiansPanel";

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

  const [family, role] = await Promise.all([getFamily(id), getCurrentRole()]);
  if (!family) notFound();

  const canManage = getRoleLevel(role ?? "") >= getRoleLevel("registrar");

  const households = ((family.households ?? []) as HouseholdRow[])
    .filter((h) => !h.archived_at)
    .sort((a, b) => a.sort_order - b.sort_order);

  const allStudents = ((family.students ?? []) as StudentRow[])
    .filter((s) => !s.archived_at);
  const students        = allStudents.filter((s) => s.enrollment_status === "enrolled");
  const formerStudents  = allStudents.filter((s) => s.enrollment_status !== "enrolled");

  // Build flat list of active guardianship rows with student info
  const activeGships = allStudents.flatMap((s) =>
    ((s.guardianships ?? []) as GuardianshipRow[])
      .filter((g) => g.status === "active" && !g.archived_at)
      .map((g) => ({ ...g, _student: s }))
  );

  // Fetch portal status for all guardian profiles
  const profileIds = Array.from(new Set(
    activeGships.map((g) => (g.profiles as ProfileRow | null)?.id).filter(Boolean) as string[]
  ));
  let portalStatusMap: Record<string, "no_account" | "invited" | "active" | "disabled"> = {};
  let portalRoleMap:   Record<string, string> = {};
  if (profileIds.length > 0) {
    const supabase = await createClient();
    const { data: members } = await supabase
      .from("organization_members")
      .select("profile_id, status, role")
      .eq("organization_id", orgId)
      .in("profile_id", profileIds);
    for (const m of (members ?? []) as { profile_id: string; status: string; role: string }[]) {
      portalStatusMap[m.profile_id] = m.status === "active" ? "active" : m.status === "invited" ? "invited" : m.status === "disabled" ? "disabled" : "no_account";
      portalRoleMap[m.profile_id]   = m.role;
    }
    for (const pid of profileIds) {
      if (!portalStatusMap[pid]) portalStatusMap[pid] = "no_account";
    }
  }

  // Group guardianships by person → GuardianGroup[]
  const groupMap = new Map<string, GuardianGroup>();
  for (const g of activeGships) {
    const profile = g.profiles as ProfileRow | null;
    if (!profile) continue;
    if (!groupMap.has(profile.id)) {
      groupMap.set(profile.id, {
        profile_id:    profile.id,
        full_name:     profile.full_name ?? "Unknown",
        email:         profile.email ?? null,
        phone:         profile.phone ?? null,
        has_auth:      !!(profile as any).auth_user_id,
        portal_status: portalStatusMap[profile.id] ?? "no_account",
        portal_role:   portalRoleMap[profile.id]   ?? null,
        is_pickup_only: true, // will be updated below
        relationships:  [],
      });
    }
    const group = groupMap.get(profile.id)!;
    group.relationships.push({
      guardianship_id:      g.id,
      student_id:           g._student.id,
      student_first:        g._student.first_name,
      student_last:         g._student.last_name,
      student_display_id:   g._student.student_display_id,
      relationship_type:    g.relationship_type,
      custody_type:         g.custody_type,
      is_legal_guardian:    g.is_legal_guardian,
      is_primary_contact:   g.is_primary_contact,
      is_emergency_contact: g.is_emergency_contact,
      can_pickup:           g.can_pickup,
      pickup_restrictions:  g.pickup_restrictions,
      court_order_on_file:  g.court_order_on_file,
      household_id:         g.household_id,
      household_label:      households.find((h) => h.id === g.household_id)?.household_label ?? null,
    });
    // If any relationship is NOT "other", this is a real guardian (not pickup-only)
    if (g.relationship_type !== "other") {
      group.is_pickup_only = false;
    }
  }
  const guardianGroups = Array.from(groupMap.values());
  const isFullAdmin = getRoleLevel(role ?? "") >= getRoleLevel("full_admin");

  // Build per-household data for HouseholdsPanel
  const householdDataList: HouseholdData[] = households.map((h) => {
    const hhGships = activeGships.filter((g) => g.household_id === h.id);

    // Unique guardians in this household
    const guardianMap = new Map<string, HouseholdGuardian>();
    for (const g of hhGships) {
      const profile = g.profiles as ProfileRow | null;
      if (!profile) continue;
      if (!guardianMap.has(profile.id)) {
        guardianMap.set(profile.id, {
          profile_id:    profile.id,
          full_name:     profile.full_name ?? "Unknown",
          email:         profile.email ?? null,
          phone:         (profile as any).phone ?? null,
          portal_status: portalStatusMap[profile.id] ?? "no_account",
          relationships: [],
        });
      }
      guardianMap.get(profile.id)!.relationships.push({
        guardianship_id:    g.id,
        student_id:         g._student.id,
        student_name:       (g._student.preferred_name ?? g._student.first_name) + " " + g._student.last_name,
        relationship_type:  g.relationship_type,
        is_legal_guardian:  g.is_legal_guardian,
        is_primary_contact: g.is_primary_contact,
        can_pickup:         g.can_pickup,
        custody_type:       g.custody_type,
      });
    }

    // Unique students in this household
    const studentMap = new Map<string, HouseholdStudent>();
    for (const g of hhGships) {
      const s = g._student;
      if (!studentMap.has(s.id)) {
        studentMap.set(s.id, {
          id:               s.id,
          display_id:       s.student_display_id,
          first_name:       s.first_name,
          last_name:        s.last_name,
          preferred_name:   s.preferred_name,
          grade_level:      s.grade_level,
          enrollment_status: s.enrollment_status,
        });
      }
    }

    return {
      id:              h.id,
      family_id:       id,
      household_label: h.household_label,
      sort_order:      h.sort_order,
      address_json:    h.address_json,
      phone:           h.phone,
      email:           h.email,
      guardians:       Array.from(guardianMap.values()),
      students:        Array.from(studentMap.values()),
    };
  });

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
                {students.length} enrolled · {formerStudents.length > 0 ? `${formerStudents.length} former · ` : ""}{households.length} household{households.length !== 1 ? "s" : ""}
              </span>
              {family.is_split_household && (
                <Badge variant="gold">Split Household</Badge>
              )}
            </div>
          </div>
          {canManage && (
            <Link
              href={`/dashboard/families/${id}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sc-gray-200 bg-white px-3 py-1.5 text-label-sm font-medium text-sc-navy hover:border-sc-teal hover:text-sc-teal transition-colors"
            >
              <Pencil className="size-3.5" /> Edit Family
            </Link>
          )}
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
            Students ({allStudents.length})
          </TabsTrigger>
          <TabsTrigger value="guardians">
            <Users className="size-4" />
            Guardians ({guardianGroups.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Households Tab ─────────────────────────────────── */}
        <TabsContent value="households">
          <div className="flex items-center justify-between mb-4">
            <p className="text-label-sm text-sc-gray">
              {family.is_split_household
                ? "Split household — each parent portal account shows only their own household."
                : "Standard single-household family."}
            </p>
            {canManage && <AddHouseholdDialog familyId={id} />}
          </div>
          <HouseholdsPanel
            households={householdDataList}
            familyId={id}
            isSplit={family.is_split_household}
            canManage={canManage}
            isFullAdmin={isFullAdmin}
            familyStudents={allStudents.map((s) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name }))}
          />
        </TabsContent>

        {/* ── Students Tab ───────────────────────────────────── */}
        <TabsContent value="students">
          {allStudents.length === 0 ? (
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
            <div className="space-y-6">
              {/* Active students */}
              {students.length > 0 && (
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
                            <Badge variant="green">
                              {ENROLLMENT_LABELS["enrolled"]}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Former students */}
              {formerStudents.length > 0 && (
                <div>
                  <h3 className="text-label-sm font-semibold text-sc-gray-400 uppercase tracking-wide mb-3">Former Students</h3>
                  <div className="rounded-xl bg-white border border-sc-gray-100 shadow-card overflow-hidden opacity-80">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-sc-gray-100 bg-sc-cream">
                          <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Student</th>
                          <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Grade / Track</th>
                          <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-sc-gray-100">
                        {formerStudents.map((s) => (
                          <tr key={s.id} className="hover:bg-sc-cream/50 transition-colors">
                            <td className="py-3 px-4">
                              <Link href={`/dashboard/students/${s.id}`} className="group">
                                <p className="font-medium text-sc-gray group-hover:text-sc-teal transition-colors">
                                  {s.last_name}, {s.first_name}
                                  {s.preferred_name ? <span className="text-sc-gray-400 font-normal"> ({s.preferred_name})</span> : null}
                                </p>
                                {s.student_display_id && (
                                  <p className="font-mono text-label-sm text-sc-gray-400">{s.student_display_id}</p>
                                )}
                              </Link>
                            </td>
                            <td className="py-3 px-4 text-sc-gray-400">
                              {s.grade_level ?? "–"}
                              {s.track && <span className="text-sc-gray-400"> · {s.track}</span>}
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant="muted">
                                {ENROLLMENT_LABELS[s.enrollment_status as EnrollmentStatus] ?? s.enrollment_status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
              Guardians are linked per student. Authorized pickup contacts are listed separately below.
            </p>
            {allStudents.length > 0 && canManage && (
              <AddGuardianDialog
                students={allStudents.map((s) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name }))}
                familyId={id}
                households={households.map((h) => ({ id: h.id, household_label: h.household_label }))}
              />
            )}
          </div>
          <GuardiansPanel
            groups={guardianGroups}
            familyId={id}
            households={households.map((h) => ({ id: h.id, household_label: h.household_label }))}
            students={allStudents.map((s) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name }))}
            canManage={canManage}
            isFullAdmin={isFullAdmin}
          />
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
  full_name:  string | null;
  email:      string | null;
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
