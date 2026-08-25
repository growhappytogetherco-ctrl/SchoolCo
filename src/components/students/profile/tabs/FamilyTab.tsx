"use client";

import { useEffect, useState } from "react";
import {
  Users, Home, Phone, Mail, Shield, AlertTriangle, ExternalLink,
  CheckCircle, Clock, XCircle, UserX,
} from "lucide-react";
import Link from "next/link";
import { getStudentFamilyData } from "@/app/actions/profileData";
import { cn } from "@/lib/utils";
import { PickupPersonsPanel } from "./PickupPersonsPanel";

interface Props { studentId: string; role?: string; isAdmin?: boolean; }

type FamData = Awaited<ReturnType<typeof getStudentFamilyData>>;

const RELATIONSHIP_LABELS: Record<string, string> = {
  mother: "Mother", father: "Father", stepmother: "Stepmother", stepfather: "Stepfather",
  grandmother: "Grandmother", grandfather: "Grandfather", aunt: "Aunt", uncle: "Uncle",
  foster_parent: "Foster Parent", legal_guardian: "Legal Guardian", other: "Other",
};

const CUSTODY_LABELS: Record<string, { label: string; cls: string }> = {
  primary:    { label: "Primary Custody",       cls: "bg-sc-teal-50 text-sc-teal border-sc-teal-200"    },
  joint:      { label: "Joint Custody",         cls: "bg-sc-navy-50 text-sc-navy border-sc-navy-200"    },
  secondary:  { label: "Secondary Custody",     cls: "bg-sc-gray-50 text-sc-gray border-sc-gray-200"    },
  supervised: { label: "Supervised Visitation", cls: "bg-sc-rose-50 text-sc-rose border-sc-rose-200"    },
  none:       { label: "No Custody",            cls: "bg-sc-rose-50 text-sc-rose border-sc-rose-200"    },
};

const PORTAL_BADGE: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  active:     { label: "Portal Active", icon: CheckCircle, cls: "bg-sc-teal-50 text-sc-teal border-sc-teal-200"    },
  invited:    { label: "Invited",       icon: Clock,       cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200" },
  no_account: { label: "No Account",   icon: UserX,       cls: "bg-sc-gray-50 text-sc-gray border-sc-gray-200"     },
  disabled:   { label: "Disabled",     icon: XCircle,     cls: "bg-sc-rose-50 text-sc-rose border-sc-rose-200"     },
};

export function FamilyTab({ studentId, role = "staff", isAdmin = false }: Props) {
  const [data, setData] = useState<FamData>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentFamilyData(studentId).then((d) => { setData(d); setLoading(false); });
  }, [studentId]);

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3].map((i) => <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card h-32 animate-pulse" />)}
    </div>
  );

  const family = data?.family as {
    id: string; family_name: string; family_display_id: string; is_split_household: boolean; notes?: string | null;
  } | null;

  const allHouseholds = (data?.households ?? []) as {
    id: string; household_label: string | null; sort_order: number;
    address_json: Record<string, string> | null; phone: string | null; email: string | null;
  }[];

  const guardians = (data?.guardians ?? []) as {
    id: string; relationship_type: string; household_id: string | null; custody_type: string;
    is_legal_guardian: boolean; is_primary_contact: boolean; is_emergency_contact: boolean;
    emergency_contact_order: number | null; can_pickup: boolean; pickup_restrictions: string | null;
    profiles: { id: string; full_name: string; email: string | null; phone: string | null; avatar_url: string | null } | null;
  }[];

  if (!family) {
    return (
      <div className="rounded-2xl border border-dashed border-sc-gray-200 p-8 text-center">
        <p className="text-body-md text-sc-gray-400">No family linked to this student.</p>
      </div>
    );
  }

  // Split guardians: "other" relationship_type = pickup-only contact, not a real guardian
  const realGuardians   = guardians.filter((g) => g.relationship_type !== "other");
  const pickupOnlyInHousehold = guardians.filter((g) => g.relationship_type === "other");

  // Filter to only households this student has real guardians in
  const relevantHouseholdIds = new Set(realGuardians.map((g) => g.household_id).filter(Boolean));
  const relevantHouseholds = allHouseholds
    .filter((hh) => relevantHouseholdIds.has(hh.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  // Map real guardians by household_id
  const guardiansByHousehold = new Map<string, typeof guardians>();
  for (const g of realGuardians) {
    if (!g.household_id) continue;
    if (!guardiansByHousehold.has(g.household_id)) guardiansByHousehold.set(g.household_id, []);
    guardiansByHousehold.get(g.household_id)!.push(g);
  }

  // Ungrouped real guardians (no household_id)
  const ungrouped = realGuardians.filter((g) => !g.household_id);

  const splitHousehold = family.is_split_household;

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Family summary card */}
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
            <Users className="size-4 text-sc-teal" /> {family.family_name}
          </h2>
          <Link href={`/dashboard/families/${family.id}`}
            className="flex items-center gap-1 text-label-sm text-sc-teal font-medium hover:underline">
            <ExternalLink className="size-3.5" /> View family profile
          </Link>
        </div>
        <div className="flex items-center gap-3 text-label-sm text-sc-gray">
          <span className="font-mono">{family.family_display_id}</span>
          {splitHousehold && (
            <span className="rounded-full border border-sc-gold-200 bg-sc-gold-50 px-2.5 py-0.5 text-sc-gold-700 font-medium">
              Split Household
            </span>
          )}
        </div>
        {family.notes && (
          <p className="text-body-sm text-sc-gray border-t border-sc-gray-100 pt-3">{family.notes}</p>
        )}
      </div>

      {/* ── Household cards with guardians inside ────────────── */}
      {relevantHouseholds.length > 0 && (
        <div className="space-y-4">
          {relevantHouseholds.map((hh, idx) => {
            const isPrimary = idx === 0;
            const addr = hh.address_json;
            const hhGuardians = guardiansByHousehold.get(hh.id) ?? [];
            const hasAlert = hhGuardians.some((g) => g.custody_type === "supervised" || g.custody_type === "none");

            return (
              <div key={hh.id} className={cn(
                "rounded-2xl border-2 bg-white shadow-card overflow-hidden",
                isPrimary ? "border-sc-teal-200" : "border-sc-gray-100"
              )}>
                {/* Household header */}
                <div className={cn(
                  "flex items-center justify-between px-5 py-3 border-b",
                  isPrimary ? "bg-sc-teal-50 border-sc-teal-100" : "bg-sc-gray-50 border-sc-gray-100"
                )}>
                  <div className="flex items-center gap-2">
                    <Home className={cn("size-4", isPrimary ? "text-sc-teal" : "text-sc-gray")} />
                    <h3 className="text-label-md font-semibold text-sc-navy">
                      {hh.household_label ?? (isPrimary ? "Primary Household" : "Secondary Household")}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    {isPrimary && (
                      <span className="rounded-full bg-sc-teal-50 border border-sc-teal-200 px-2 py-0.5 text-label-sm text-sc-teal font-medium">
                        Primary
                      </span>
                    )}
                    {hasAlert && <AlertTriangle className="size-4 text-sc-rose" />}
                  </div>
                </div>

                {/* Household contact info */}
                {(addr?.street1 || hh.phone || hh.email) && (
                  <div className="px-5 py-2 border-b border-sc-gray-100 flex flex-wrap gap-3">
                    {addr?.street1 && (
                      <span className="text-label-sm text-sc-gray">
                        {[addr.street1, addr.city, addr.state, addr.zip].filter(Boolean).join(", ")}
                      </span>
                    )}
                    {hh.phone && (
                      <a href={`tel:${hh.phone}`} className="flex items-center gap-1 text-label-sm text-sc-teal">
                        <Phone className="size-3" /> {hh.phone}
                      </a>
                    )}
                    {hh.email && (
                      <a href={`mailto:${hh.email}`} className="flex items-center gap-1 text-label-sm text-sc-teal">
                        <Mail className="size-3" /> {hh.email}
                      </a>
                    )}
                  </div>
                )}

                {/* Guardians in this household */}
                <div className="p-5 space-y-3">
                  {hhGuardians.map((g) => {
                    const profile = g.profiles;
                    const custody = CUSTODY_LABELS[g.custody_type];
                    const notAuth = g.custody_type === "none";
                    const supervised = g.custody_type === "supervised";
                    const needsAlert = notAuth || supervised;

                    return (
                      <div key={g.id} className={cn(
                        "rounded-xl border bg-white p-4 space-y-2",
                        needsAlert ? "border-sc-rose-200" : "border-sc-gray-100"
                      )}>
                        {needsAlert && (
                          <div className="flex items-start gap-2 rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2">
                            <AlertTriangle className="size-4 text-sc-rose shrink-0 mt-0.5" />
                            <p className="text-label-sm font-bold text-sc-rose">
                              {supervised ? "Supervised Visitation Only" : "No Custody Rights"}
                            </p>
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sc-navy text-white text-label-sm font-bold">
                              {profile?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) ?? "?"}
                            </div>
                            <div>
                              <p className="text-label-md font-semibold text-sc-navy">{profile?.full_name ?? "Unknown"}</p>
                              <p className="text-label-sm text-sc-gray capitalize">
                                {RELATIONSHIP_LABELS[g.relationship_type] ?? g.relationship_type}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {custody && (
                            <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium", custody.cls)}>
                              {custody.label}
                            </span>
                          )}
                          {g.is_legal_guardian && (
                            <span className="flex items-center gap-1 rounded-full bg-sc-navy-50 border border-sc-navy-200 px-2.5 py-0.5 text-label-sm text-sc-navy font-medium">
                              <Shield className="size-3" /> Legal Guardian
                            </span>
                          )}
                          {g.is_primary_contact && (
                            <span className="rounded-full bg-sc-teal-50 border border-sc-teal-200 px-2.5 py-0.5 text-label-sm text-sc-teal font-medium">
                              Primary Contact
                            </span>
                          )}
                          {g.is_emergency_contact && (
                            <span className="rounded-full bg-sc-rose-50 border border-sc-rose-200 px-2.5 py-0.5 text-label-sm text-sc-rose font-medium">
                              Emergency #{g.emergency_contact_order ?? ""}
                            </span>
                          )}
                          {!g.can_pickup && (
                            <span className="rounded-full bg-sc-rose-50 border border-sc-rose-200 px-2.5 py-0.5 text-label-sm text-sc-rose font-medium">
                              Cannot Pick Up
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-3">
                          {profile?.phone && (
                            <a href={`tel:${profile.phone}`} className="flex items-center gap-1 text-label-sm text-sc-teal">
                              <Phone className="size-3" /> {profile.phone}
                            </a>
                          )}
                          {profile?.email && (
                            <a href={`mailto:${profile.email}`} className="flex items-center gap-1 text-label-sm text-sc-teal">
                              <Mail className="size-3" /> {profile.email}
                            </a>
                          )}
                        </div>

                        {g.pickup_restrictions && !needsAlert && (
                          <p className="text-label-sm text-sc-gray border-t border-sc-gray-100 pt-2.5">
                            Pickup note: {g.pickup_restrictions}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ungrouped guardians (fallback if household_id is null) */}
      {ungrouped.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-serif text-heading-3 text-sc-navy">Other Contacts</h2>
          {ungrouped.map((g) => {
            const profile = g.profiles;
            const custody = CUSTODY_LABELS[g.custody_type];
            const needsAlert = g.custody_type === "supervised" || g.custody_type === "none";
            return (
              <div key={g.id} className={cn(
                "rounded-2xl border bg-white shadow-card p-5 space-y-3",
                needsAlert ? "border-sc-rose-200" : "border-sc-gray-100"
              )}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sc-navy text-white text-label-sm font-bold">
                    {profile?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) ?? "?"}
                  </div>
                  <div>
                    <p className="text-label-md font-semibold text-sc-navy">{profile?.full_name ?? "Unknown"}</p>
                    <p className="text-label-sm text-sc-gray capitalize">
                      {RELATIONSHIP_LABELS[g.relationship_type] ?? g.relationship_type}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {custody && (
                    <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium", custody.cls)}>
                      {custody.label}
                    </span>
                  )}
                  {g.is_legal_guardian && (
                    <span className="flex items-center gap-1 rounded-full bg-sc-navy-50 border border-sc-navy-200 px-2.5 py-0.5 text-label-sm text-sc-navy font-medium">
                      <Shield className="size-3" /> Legal Guardian
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  {profile?.phone && <a href={`tel:${profile.phone}`} className="flex items-center gap-1 text-label-sm text-sc-teal"><Phone className="size-3" /> {profile.phone}</a>}
                  {profile?.email && <a href={`mailto:${profile.email}`} className="flex items-center gap-1 text-label-sm text-sc-teal"><Mail className="size-3" /> {profile.email}</a>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Authorized pickup notes */}
      {data?.authorized_pickup_notes && (
        <div className="rounded-2xl border border-sc-gold-200 bg-sc-gold-50 p-5">
          <h2 className="font-serif text-heading-3 text-sc-gold-700 mb-2">Authorized Pickup Notes</h2>
          <p className="text-body-sm text-sc-navy">{data.authorized_pickup_notes}</p>
        </div>
      )}

      {/* Authorized Pickup Contacts (relationship_type = "other" in guardianships) */}
      {pickupOnlyInHousehold.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-serif text-heading-3 text-sc-navy">Authorized Pickup Contacts</h2>
          {pickupOnlyInHousehold.map((g) => {
            const profile = g.profiles;
            return (
              <div key={g.id} className="rounded-xl border border-sc-gray-100 bg-white p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sc-gray-200 text-sc-gray text-label-sm font-bold">
                    {profile?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) ?? "?"}
                  </div>
                  <div>
                    <p className="text-label-md font-semibold text-sc-navy">{profile?.full_name ?? "Unknown"}</p>
                    <p className="text-label-sm text-sc-gray">Authorized Pickup Contact</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  {profile?.phone && (
                    <a href={`tel:${profile.phone}`} className="flex items-center gap-1 text-label-sm text-sc-teal">
                      <Phone className="size-3" /> {profile.phone}
                    </a>
                  )}
                  {profile?.email && (
                    <a href={`mailto:${profile.email}`} className="flex items-center gap-1 text-label-sm text-sc-teal">
                      <Mail className="size-3" /> {profile.email}
                    </a>
                  )}
                </div>
                {g.pickup_restrictions && (
                  <p className="text-label-sm text-sc-gray border-t border-sc-gray-100 pt-2.5">
                    Pickup note: {g.pickup_restrictions}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Authorized Pickup Persons — full CRUD panel */}
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5">
        <PickupPersonsPanel studentId={studentId} role={role} isAdmin={isAdmin} />
      </div>

      {/* Scholarship */}
      {data?.scholarship_info && Object.keys(data.scholarship_info as object).length > 0 && (
        <div className="rounded-2xl border border-sc-teal-200 bg-sc-teal-50 p-5">
          <h2 className="font-serif text-heading-3 text-sc-teal mb-2">Scholarship Information</h2>
          <div className="space-y-1">
            {Object.entries(data.scholarship_info as Record<string, string>).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-label-sm">
                <span className="text-sc-gray capitalize">{k.replace(/_/g, " ")}:</span>
                <span className="text-sc-navy font-medium">{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
