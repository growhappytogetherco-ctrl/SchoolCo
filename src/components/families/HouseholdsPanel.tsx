"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, MapPin, Phone, Mail, Shield, User, GraduationCap, CheckCircle, Clock, XCircle, UserX, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EditHouseholdDialog } from "./EditHouseholdDialog";
import { updateGuardianProfile } from "@/app/actions/guardians";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────

export interface HouseholdGuardian {
  profile_id:    string;
  full_name:     string;
  email:         string | null;
  phone:         string | null;
  portal_status: "no_account" | "invited" | "active" | "disabled";
  relationships: {
    guardianship_id:    string;
    student_id:         string;
    student_name:       string;
    relationship_type:  string;
    is_legal_guardian:  boolean;
    is_primary_contact: boolean;
    can_pickup:         boolean;
    custody_type:       string;
  }[];
}

export interface HouseholdStudent {
  id:           string;
  display_id:   string | null;
  first_name:   string;
  last_name:    string;
  preferred_name: string | null;
  grade_level:  string | null;
  enrollment_status: string;
}

export interface HouseholdData {
  id:              string;
  family_id:       string;
  household_label: string;
  sort_order:      number;
  address_json:    { street1?: string; city?: string; state?: string; zip?: string } | null;
  phone:           string | null;
  email:           string | null;
  guardians:       HouseholdGuardian[];
  students:        HouseholdStudent[];
}

interface Props {
  households:   HouseholdData[];
  familyId:     string;
  isSplit:      boolean;
  canManage:    boolean;
  isFullAdmin:  boolean;
  familyStudents: { id: string; first_name: string; last_name: string }[];
}

// ── Inline edit contact dialog (household panel) ───────────────────────────

function EditPersonDialog({ profileId, familyId, fullName, email, phone, onClose }: {
  profileId: string;
  familyId:  string;
  fullName:  string;
  email:     string | null;
  phone:     string | null;
  onClose:   () => void;
}) {
  const router = useRouter();
  const [name,   setName]  = useState(fullName);
  const [eMail,  setEmail] = useState(email ?? "");
  const [ph,     setPh]    = useState(phone ?? "");
  const [err,    setErr]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const r = await updateGuardianProfile({
        profile_id: profileId,
        family_id:  familyId,
        full_name:  name.trim() || undefined,
        email:      eMail.trim() || null,
        phone:      ph.trim() || null,
      });
      if (!r.success) { setErr(r.error); setSaving(false); return; }
      onClose();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unexpected error. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sc-navy/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <div>
          <p className="font-serif text-heading-2 text-sc-navy">Edit Contact Info</p>
          <p className="text-label-sm text-sc-gray mt-0.5">{fullName}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ep-hh-name">Full Name</Label>
          <Input id="ep-hh-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ep-hh-email">Email</Label>
          <Input id="ep-hh-email" type="email" value={eMail} onChange={(e) => setEmail(e.target.value)} placeholder="(none)" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ep-hh-phone">Phone</Label>
          <Input id="ep-hh-phone" value={ph} onChange={(e) => setPh(e.target.value)} placeholder="(none)" />
        </div>
        {err && (
          <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{err}</p>
        )}
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Portal status badge ────────────────────────────────────────────────────

const PORTAL_STATUS: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  active:     { label: "Portal Active",  icon: CheckCircle, cls: "bg-sc-teal-50 text-sc-teal border-sc-teal-200"   },
  invited:    { label: "Invited",        icon: Clock,       cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200" },
  no_account: { label: "No Account",    icon: UserX,       cls: "bg-sc-gray-50 text-sc-gray border-sc-gray-200"    },
  disabled:   { label: "Disabled",      icon: XCircle,     cls: "bg-sc-rose-50 text-sc-rose border-sc-rose-200"    },
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  mother: "Mother", father: "Father", stepmother: "Stepmother", stepfather: "Stepfather",
  grandmother: "Grandmother", grandfather: "Grandfather", aunt: "Aunt", uncle: "Uncle",
  foster_parent: "Foster Parent", legal_guardian: "Legal Guardian", other: "Other",
};

// ── Component ─────────────────────────────────────────────────────────────

export function HouseholdsPanel({
  households, familyId, isSplit, canManage, isFullAdmin, familyStudents,
}: Props) {
  const [editingPerson, setEditingPerson] = useState<HouseholdGuardian | null>(null);
  if (households.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-sc-gray-200 p-8 text-center">
        <p className="text-body-md text-sc-gray">No households yet. Add one above.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {isSplit && (
        <p className="text-label-sm text-sc-gray">
          Split household family. Each parent portal account shows only their own household.
        </p>
      )}

      {households.map((hh, idx) => {
        const isPrimary = hh.sort_order === 1 || idx === 0;
        const addr = hh.address_json;
        const hasAddr = !!(addr?.street1 || addr?.city);

        return (
          <div
            key={hh.id}
            className={cn(
              "rounded-2xl border-2 bg-white shadow-card overflow-hidden",
              isPrimary ? "border-sc-teal-200" : "border-sc-gray-100"
            )}
          >
            {/* ── Household header ──────────────────────────────── */}
            <div className={cn(
              "flex items-center justify-between px-5 py-4 border-b",
              isPrimary ? "bg-sc-teal-50 border-sc-teal-100" : "bg-sc-gray-50 border-sc-gray-100"
            )}>
              <div className="flex items-center gap-3">
                <Home className={cn("size-5", isPrimary ? "text-sc-teal" : "text-sc-gray")} />
                <div>
                  <h3 className="font-serif text-heading-3 text-sc-navy">{hh.household_label}</h3>
                  {(hasAddr || hh.phone || hh.email) && (
                    <div className="flex flex-wrap gap-3 mt-1">
                      {hasAddr && (
                        <span className="flex items-center gap-1 text-label-sm text-sc-gray">
                          <MapPin className="size-3" />
                          {[addr?.street1, addr?.city, addr?.state, addr?.zip].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {hh.phone && (
                        <a href={`tel:${hh.phone}`} className="flex items-center gap-1 text-label-sm text-sc-teal hover:underline">
                          <Phone className="size-3" /> {hh.phone}
                        </a>
                      )}
                      {hh.email && (
                        <a href={`mailto:${hh.email}`} className="flex items-center gap-1 text-label-sm text-sc-teal hover:underline">
                          <Mail className="size-3" /> {hh.email}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                {isPrimary && <Badge variant="default">Primary</Badge>}
                {isFullAdmin && (
                  <EditHouseholdDialog household={{ ...hh, family_id: familyId }} />
                )}
              </div>
            </div>

            <div className="p-5 grid sm:grid-cols-2 gap-6">
              {/* ── Adults ──────────────────────────────────────── */}
              <div>
                <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <User className="size-3.5" /> Adults ({hh.guardians.length})
                </p>
                {hh.guardians.length === 0 ? (
                  <p className="text-label-sm text-sc-gray-400 italic">No guardians assigned.</p>
                ) : (
                  <div className="space-y-3">
                    {hh.guardians.map((g) => {
                      const ps = PORTAL_STATUS[g.portal_status] ?? PORTAL_STATUS.no_account;
                      const PsIcon = ps.icon;
                      const relSet = g.relationships.map((r) => RELATIONSHIP_LABELS[r.relationship_type] ?? r.relationship_type);
                      const relLabels = relSet.filter((v, i) => relSet.indexOf(v) === i).join(", ");
                      const hasLegal = g.relationships.some((r) => r.is_legal_guardian);
                      const hasPrimary = g.relationships.some((r) => r.is_primary_contact);
                      return (
                        <div key={g.profile_id} className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 px-4 py-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-label-md font-semibold text-sc-navy">{g.full_name}</p>
                              <p className="text-label-sm text-sc-gray capitalize">{relLabels}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {canManage && (
                                <button
                                  onClick={() => setEditingPerson(g)}
                                  className="rounded-lg p-1 text-sc-gray-400 hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
                                  title="Edit contact info"
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                              )}
                              <span className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 text-label-sm font-medium", ps.cls)}>
                                <PsIcon className="size-3" /> {ps.label}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {hasLegal && (
                              <span className="flex items-center gap-1 rounded-full bg-sc-navy-50 border border-sc-navy-200 px-2 py-0.5 text-label-sm text-sc-navy font-medium">
                                <Shield className="size-3" /> Legal Guardian
                              </span>
                            )}
                            {hasPrimary && (
                              <span className="rounded-full bg-sc-teal-50 border border-sc-teal-200 px-2 py-0.5 text-label-sm text-sc-teal font-medium">
                                Primary Contact
                              </span>
                            )}
                          </div>
                          {(g.phone || g.email) && (
                            <div className="flex flex-wrap gap-3">
                              {g.phone && (
                                <a href={`tel:${g.phone}`} className="flex items-center gap-1 text-label-sm text-sc-teal hover:underline">
                                  <Phone className="size-3" /> {g.phone}
                                </a>
                              )}
                              {g.email && (
                                <a href={`mailto:${g.email}`} className="flex items-center gap-1 text-label-sm text-sc-teal hover:underline">
                                  <Mail className="size-3" /> {g.email}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Students ────────────────────────────────────── */}
              <div>
                <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <GraduationCap className="size-3.5" /> Students ({hh.students.length})
                </p>
                {hh.students.length === 0 ? (
                  <p className="text-label-sm text-sc-gray-400 italic">No students in this household.</p>
                ) : (
                  <div className="space-y-2">
                    {hh.students.map((s) => {
                      const displayName = s.preferred_name
                        ? `${s.preferred_name} ${s.last_name}`
                        : `${s.first_name} ${s.last_name}`;
                      return (
                        <Link
                          key={s.id}
                          href={`/dashboard/students/${s.id}`}
                          className="flex items-center justify-between rounded-xl border border-sc-gray-100 bg-sc-gray-50 px-4 py-3 hover:border-sc-teal hover:bg-sc-teal-50 transition-colors group"
                        >
                          <div>
                            <p className="text-label-md font-semibold text-sc-navy group-hover:text-sc-teal">{displayName}</p>
                            {s.grade_level && (
                              <p className="text-label-sm text-sc-gray">{s.grade_level}</p>
                            )}
                          </div>
                          {s.display_id && (
                            <span className="font-mono text-label-sm text-sc-gray-400">{s.display_id}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {editingPerson && (
        <EditPersonDialog
          profileId={editingPerson.profile_id}
          familyId={familyId}
          fullName={editingPerson.full_name}
          email={editingPerson.email}
          phone={editingPerson.phone}
          onClose={() => setEditingPerson(null)}
        />
      )}
    </div>
  );
}
