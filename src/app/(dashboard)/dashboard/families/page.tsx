import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, Users, PlusCircle } from "lucide-react";
import { getUser, getFamilies, getActiveOrgId } from "@/lib/supabase/server";
import { requireStaff, getCurrentRole } from "@/lib/roleGuard";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { isAdminRole, getRoleLevel } from "@/lib/constants";

export const metadata: Metadata = { title: "Families" };

export default async function FamiliesPage() {
  await requireStaff();
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const [families, role] = await Promise.all([
    getFamilies(orgId, { limit: 100 }),
    getCurrentRole(),
  ]);

  const canManage = isAdminRole(role) || getRoleLevel(role ?? "") >= getRoleLevel("registrar");

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-heading-1 text-sc-navy">Families</h1>
          <p className="text-body-md text-sc-gray mt-1">
            {families.length > 0
              ? `${families.length} famil${families.length !== 1 ? "ies" : "y"} enrolled`
              : "No families enrolled yet"}
          </p>
        </div>
        {canManage && (
          <Link
            href="/dashboard/families/new"
            className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-4 py-2 text-white text-label-md font-medium hover:bg-sc-teal-700 transition-colors shadow-sm"
          >
            <PlusCircle className="size-4" />
            Add Family
          </Link>
        )}
      </div>

      {/* ── Family List ───────────────────────────────────────── */}
      {families.length === 0 ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card">
          <EmptyState
            icon={Home}
            title="No families yet"
            description={canManage ? "Create your first family using the Add Family button above, or enroll a student to create one automatically." : "Families will appear here once students are enrolled."}
            />
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="sm:hidden space-y-3">
            {families.map((family) => {
              const households = (family.households ?? []) as Array<{ id: string; household_label: string }>;
              return (
                <Link
                  key={family.id}
                  href={`/dashboard/families/${family.id}`}
                  className="block rounded-xl bg-white border border-sc-gray-100 shadow-card p-4 hover:shadow-card-hover transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="font-serif text-heading-3 text-sc-navy">{family.family_name}</p>
                      <p className="font-mono text-label-sm text-sc-gray-400 mt-0.5">{family.family_display_id}</p>
                    </div>
                    {family.is_split_household && <Badge variant="gold">Split</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-label-sm text-sc-gray">
                    <Users className="size-3.5" />
                    {households.length} household{households.length !== 1 ? "s" : ""}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden sm:block rounded-xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sc-gray-100 bg-sc-cream">
                  <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Family</th>
                  <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">ID</th>
                  <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Households</th>
                  <th className="text-left py-3 px-4 text-label-sm font-semibold text-sc-gray uppercase tracking-wide">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sc-gray-100">
                {families.map((family) => {
                  const households = (family.households ?? []) as Array<{ id: string; household_label: string }>;
                  return (
                    <tr key={family.id} className="hover:bg-sc-cream/50 transition-colors">
                      <td className="py-3 px-4">
                        <Link
                          href={`/dashboard/families/${family.id}`}
                          className="font-serif font-medium text-sc-navy hover:text-sc-teal transition-colors"
                        >
                          {family.family_name}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-label-sm text-sc-gray">{family.family_display_id ?? "–"}</span>
                      </td>
                      <td className="py-3 px-4 text-sc-gray">
                        {households.length}
                        {households.length > 0 && (
                          <span className="text-sc-gray-400 text-label-sm ml-1">
                            ({households.map((h) => h.household_label).join(", ")})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {family.is_split_household
                          ? <Badge variant="gold">Split Household</Badge>
                          : <span className="text-label-sm text-sc-gray">Standard</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-sc-gray-100 px-4 py-3 bg-sc-cream/50">
              <p className="text-label-sm text-sc-gray">
                {families.length} famil{families.length !== 1 ? "ies" : "y"}
                {families.filter((f) => f.is_split_household).length > 0 && (
                  <> · {families.filter((f) => f.is_split_household).length} split household</>
                )}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
