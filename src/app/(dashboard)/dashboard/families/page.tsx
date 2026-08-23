import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, Users, PlusCircle } from "lucide-react";
import { getUser, getFamilies, getActiveOrgId } from "@/lib/supabase/server";
import { requireStaff, getCurrentRole } from "@/lib/roleGuard";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { isAdminRole, getRoleLevel } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Families" };

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "former", label: "Former" },
  { key: "all",    label: "All"    },
] as const;
type FilterKey = typeof FILTERS[number]["key"];

export default async function FamiliesPage({
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

  const [families, role] = await Promise.all([
    getFamilies(orgId, { limit: 200 }),
    getCurrentRole(),
  ]);

  const canManage = isAdminRole(role) || getRoleLevel(role ?? "") >= getRoleLevel("registrar");

  // Get family IDs that have at least one enrolled student
  const supabase = await createClient();
  const { data: activeFamilyRows } = await supabase
    .from("students")
    .select("family_id")
    .eq("organization_id", orgId)
    .eq("enrollment_status", "enrolled")
    .is("archived_at", null) as unknown as { data: { family_id: string | null }[] | null };

  const activeFamilyIds = new Set((activeFamilyRows ?? []).map((r) => r.family_id).filter(Boolean) as string[]);

  type FamilyRow = {
    id: string; family_name: string; family_display_id: string | null;
    is_split_household: boolean; status: string | null; created_at: string;
    households: { id: string; household_label: string; household_display_id: string | null }[] | null;
  };
  const typedFamilies = families as unknown as FamilyRow[];

  // Filter families based on selected tab
  const filteredFamilies = typedFamilies.filter((f) => {
    const hasActive = activeFamilyIds.has(f.id);
    if (activeFilter === "active")  return hasActive;
    if (activeFilter === "former")  return !hasActive;
    return true; // "all"
  });

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-heading-1 text-sc-navy">Families</h1>
          <p className="text-body-md text-sc-gray mt-1">
            {filteredFamilies.length > 0
              ? `${filteredFamilies.length} ${activeFilter === "active" ? "active " : activeFilter === "former" ? "former " : ""}famil${filteredFamilies.length !== 1 ? "ies" : "y"}`
              : activeFilter === "active" ? "No active families" : "No families found"}
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

      {/* ── Filter Tabs ─────────────────────────────────────────── */}
      <div className="flex gap-1 rounded-xl border border-sc-gray-100 bg-sc-cream/60 p-1 w-fit">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "active" ? "/dashboard/families" : `/dashboard/families?filter=${f.key}`}
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

      {/* ── Family List ───────────────────────────────────────── */}
      {filteredFamilies.length === 0 ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card">
          <EmptyState
            icon={Home}
            title={activeFilter === "active" ? "No active families" : "No families found"}
            description={
              activeFilter === "active" && canManage
                ? "Create your first family using the Add Family button above, or enroll a student to create one automatically."
                : activeFilter === "former"
                ? "No former or withdrawn families."
                : "Families will appear here once students are enrolled."
            }
            />
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="sm:hidden space-y-3">
            {filteredFamilies.map((family) => {
              const households = (family.households ?? []) as Array<{ id: string; household_label: string }>;
              const isFormer = !activeFamilyIds.has(family.id);
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
                    <div className="flex gap-1.5">
                      {isFormer && <Badge variant="outline">Former</Badge>}
                      {family.is_split_household && <Badge variant="gold">Split</Badge>}
                    </div>
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
                {filteredFamilies.map((family) => {
                  const households = (family.households ?? []) as Array<{ id: string; household_label: string }>;
                  const isFormer = !activeFamilyIds.has(family.id);
                  return (
                    <tr key={family.id} className="hover:bg-sc-cream/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/families/${family.id}`}
                            className="font-serif font-medium text-sc-navy hover:text-sc-teal transition-colors"
                          >
                            {family.family_name}
                          </Link>
                          {isFormer && <Badge variant="outline">Former</Badge>}
                        </div>
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
                {filteredFamilies.length} famil{filteredFamilies.length !== 1 ? "ies" : "y"}
                {filteredFamilies.filter((f) => f.is_split_household).length > 0 && (
                  <> · {filteredFamilies.filter((f) => f.is_split_household).length} split household</>
                )}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
