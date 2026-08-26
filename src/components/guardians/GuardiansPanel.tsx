"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Pencil, Trash2, UserPlus, UserMinus, Phone, Mail, AlertTriangle,
  ChevronDown, ChevronUp, User, ShieldCheck, Car,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { GuardianPortalControls } from "@/components/guardians/GuardianPortalControls";
import type { PortalPreviewStudent } from "@/components/guardians/GuardianPortalControls";
import {
  updateGuardianship, linkGuardianToStudent,
  removeGuardianship, deleteGuardianProfile,
} from "@/app/actions/guardians";
import { RELATIONSHIP_LABELS, CUSTODY_LABELS, requiresSupervisionAlert } from "@/lib/constants";
import type { RelationshipType, CustodyType } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GuardianRelationship {
  guardianship_id:      string;
  student_id:           string;
  student_first:        string;
  student_last:         string;
  student_display_id:   string | null;
  relationship_type:    string;
  custody_type:         string;
  is_legal_guardian:    boolean;
  is_primary_contact:   boolean;
  is_emergency_contact: boolean;
  can_pickup:           boolean;
  pickup_restrictions:  string | null;
  court_order_on_file:  boolean;
  household_id:         string | null;
  household_label:      string | null;
}

export interface GuardianGroup {
  profile_id:    string;
  full_name:     string;
  email:         string | null;
  phone:         string | null;
  has_auth:      boolean;
  portal_status: "no_account" | "invited" | "active" | "disabled";
  portal_role:   string | null;   // role in organization_members (null = no membership)
  is_pickup_only: boolean; // relationship_type === "other" for ALL relationships
  relationships: GuardianRelationship[];
}

interface Household { id: string; household_label: string; }
interface Student   { id: string; first_name: string; last_name: string; }

interface Props {
  groups:     GuardianGroup[];
  familyId:   string;
  households: Household[];
  students:   Student[];      // all students in family — for "add relationship" picker
  canManage:  boolean;        // registrar+
  isFullAdmin: boolean;       // full_admin — can delete profiles
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RELATIONSHIP_OPTIONS: RelationshipType[] = [
  "mother","father","stepmother","stepfather","grandmother","grandfather",
  "aunt","uncle","legal_guardian","foster_parent","other",
];

const CUSTODY_OPTIONS: CustodyType[] = ["primary","joint","secondary","supervised","none"];

// ── Inline modal wrapper ──────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sc-navy/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl overflow-y-auto max-h-[90vh]">
        <div className="p-5 border-b border-sc-gray-100">
          <p className="font-serif text-heading-2 text-sc-navy">{title}</p>
          {subtitle && <p className="text-label-sm text-sc-gray mt-0.5">{subtitle}</p>}
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ErrBanner({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{msg}</p>
  );
}

// ── Edit single guardianship (relationship / custody / permissions) ────────────

function EditRelationshipDialog({ rel, group, familyId, households, onClose }: {
  rel: GuardianRelationship; group: GuardianGroup; familyId: string;
  households: Household[]; onClose: () => void;
}) {
  const router = useRouter();
  const [relType,    setRelType]    = useState(rel.relationship_type);
  const [custody,    setCustody]    = useState(rel.custody_type);
  const [legal,      setLegal]      = useState(rel.is_legal_guardian);
  const [primary,    setPrimary]    = useState(rel.is_primary_contact);
  const [emergency,  setEmergency]  = useState(rel.is_emergency_contact);
  const [pickup,     setPickup]     = useState(rel.can_pickup);
  const [restrict,   setRestrict]   = useState(rel.pickup_restrictions ?? "");
  const [court,      setCourt]      = useState(rel.court_order_on_file);
  const [hhId,       setHhId]       = useState(rel.household_id ?? "");
  const [error,      setError]      = useState<string | null>(null);
  const [saving,     startSave]     = useTransition();
  const needsAlert = requiresSupervisionAlert(custody as CustodyType);

  function save() {
    startSave(async () => {
      const r = await updateGuardianship({
        guardianship_id:      rel.guardianship_id,
        relationship_type:    relType as RelationshipType,
        custody_type:         custody as CustodyType,
        is_legal_guardian:    legal,
        is_primary_contact:   primary,
        is_emergency_contact: emergency,
        can_pickup:           pickup,
        pickup_restrictions:  restrict || null,
        court_order_on_file:  court,
        household_id:         hhId || null,
      });
      if (!r.success) { setError(r.error); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      title="Edit Relationship"
      subtitle={`${group.full_name} → ${rel.student_first} ${rel.student_last}`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="er-rel">Relationship</Label>
          <Select id="er-rel" value={relType} onChange={(e) => setRelType(e.target.value)}>
            {RELATIONSHIP_OPTIONS.map((r) => (
              <option key={r} value={r}>{RELATIONSHIP_LABELS[r] ?? r}</option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="er-custody">Custody Type</Label>
          <Select id="er-custody" value={custody} onChange={(e) => setCustody(e.target.value)}>
            {CUSTODY_OPTIONS.map((c) => (
              <option key={c} value={c}>{CUSTODY_LABELS[c] ?? c}</option>
            ))}
          </Select>
        </div>

        {needsAlert && (
          <div className="rounded-lg border border-sc-rose-200 bg-sc-rose-50 px-3 py-2 text-label-sm text-sc-rose-700">
            ⚠ Supervised custody — pickup is restricted and staff will be alerted.
          </div>
        )}

        {households.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="er-hh">Household</Label>
            <Select id="er-hh" value={hhId} onChange={(e) => setHhId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {households.map((h) => <option key={h.id} value={h.id}>{h.household_label}</option>)}
            </Select>
          </div>
        )}

        <div className="space-y-2.5 rounded-xl border border-sc-gray-100 bg-sc-cream/50 p-4">
          <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">Permissions</p>
          <Checkbox checked={legal}     onChange={(e) => setLegal(e.target.checked)}     label="Legal guardian"        description="Has legal decision-making authority" />
          <Checkbox checked={primary}   onChange={(e) => setPrimary(e.target.checked)}   label="Primary contact"       description="First point of contact for this student" />
          <Checkbox checked={emergency} onChange={(e) => setEmergency(e.target.checked)} label="Emergency contact"     description="May be contacted in an emergency" />
          <Checkbox checked={pickup}    onChange={(e) => setPickup(e.target.checked)}    label="Authorized for pickup" description="May pick up at dismissal" />
          <Checkbox checked={court}     onChange={(e) => setCourt(e.target.checked)}     label="Court order on file"   description="Staff has a custody court order" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="er-restrict">Pickup Restrictions / Notes</Label>
          <Input id="er-restrict" value={restrict} onChange={(e) => setRestrict(e.target.value)} placeholder="e.g. Must show ID" />
        </div>

        <ErrBanner msg={error} />
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Add student relationship dialog ───────────────────────────────────────────

function AddRelationshipDialog({ group, familyId, households, students, existingStudentIds, onClose }: {
  group: GuardianGroup; familyId: string; households: Household[];
  students: Student[]; existingStudentIds: Set<string>; onClose: () => void;
}) {
  const router = useRouter();
  const available = students.filter((s) => !existingStudentIds.has(s.id));
  const [stuId,    setStuId]   = useState(available[0]?.id ?? "");
  const [relType,  setRelType] = useState<RelationshipType>("other");
  const [custody,  setCustody] = useState<CustodyType>("joint");
  const [legal,    setLegal]   = useState(false);
  const [pickup,   setPickup]  = useState(true);
  const [hhId,     setHhId]    = useState(households[0]?.id ?? "");
  const [error,    setError]   = useState<string | null>(null);
  const [saving,   startSave]  = useTransition();

  if (available.length === 0) {
    return (
      <Modal title="Add Student Relationship" subtitle={group.full_name} onClose={onClose}>
        <p className="text-label-sm text-sc-gray">This guardian is already linked to all students in this family.</p>
        <Button variant="outline" className="mt-4 w-full" onClick={onClose}>Close</Button>
      </Modal>
    );
  }

  function save() {
    startSave(async () => {
      const r = await linkGuardianToStudent({
        profile_id: group.profile_id, student_id: stuId, family_id: familyId,
        household_id: hhId || null, relationship_type: relType,
        custody_type: custody, is_legal_guardian: legal,
        is_primary_contact: false, is_emergency_contact: false,
        can_pickup: pickup,
      });
      if (!r.success) { setError(r.error); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal title="Add Student Relationship" subtitle={group.full_name} onClose={onClose}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ar-stu">Student</Label>
          <Select id="ar-stu" value={stuId} onChange={(e) => setStuId(e.target.value)}>
            {available.map((s) => (
              <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ar-rel">Relationship</Label>
          <Select id="ar-rel" value={relType} onChange={(e) => setRelType(e.target.value as RelationshipType)}>
            {RELATIONSHIP_OPTIONS.map((r) => (
              <option key={r} value={r}>{RELATIONSHIP_LABELS[r] ?? r}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ar-custody">Custody</Label>
          <Select id="ar-custody" value={custody} onChange={(e) => setCustody(e.target.value as CustodyType)}>
            {CUSTODY_OPTIONS.map((c) => (
              <option key={c} value={c}>{CUSTODY_LABELS[c] ?? c}</option>
            ))}
          </Select>
        </div>
        {households.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="ar-hh">Household</Label>
            <Select id="ar-hh" value={hhId} onChange={(e) => setHhId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {households.map((h) => <option key={h.id} value={h.id}>{h.household_label}</option>)}
            </Select>
          </div>
        )}
        <div className="space-y-2.5 rounded-xl border border-sc-gray-100 bg-sc-cream/50 p-4">
          <Checkbox checked={legal}  onChange={(e) => setLegal(e.target.checked)}  label="Legal guardian" />
          <Checkbox checked={pickup} onChange={(e) => setPickup(e.target.checked)} label="Authorized for pickup" />
        </div>
        <ErrBanner msg={error} />
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={saving || !stuId} onClick={save}>{saving ? "Linking…" : "Add Relationship"}</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Remove single guardianship confirm ────────────────────────────────────────

function RemoveRelationshipDialog({ rel, group, familyId, onClose }: {
  rel: GuardianRelationship; group: GuardianGroup; familyId: string; onClose: () => void;
}) {
  const router = useRouter();
  const [error,   setError]   = useState<string | null>(null);
  const [removing, startRemove] = useTransition();

  function remove() {
    startRemove(async () => {
      const r = await removeGuardianship({ guardianship_id: rel.guardianship_id, family_id: familyId });
      if (!r.success) { setError(r.error); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal title="Remove Relationship" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-body-md text-sc-gray">
          Remove <strong className="text-sc-navy">{group.full_name}</strong>'s relationship with{" "}
          <strong className="text-sc-navy">{rel.student_first} {rel.student_last}</strong>?
        </p>
        <p className="text-label-sm text-sc-gray-400">
          The guardian's profile and other student relationships are not affected.
        </p>
        <ErrBanner msg={error} />
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" className="flex-1" disabled={removing} onClick={remove}>
            {removing ? "Removing…" : "Remove"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Delete guardian profile confirm ──────────────────────────────────────────

function DeleteGuardianDialog({ group, familyId, onClose }: {
  group: GuardianGroup; familyId: string; onClose: () => void;
}) {
  const router = useRouter();
  const [error,    setError]   = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  function del() {
    startDelete(async () => {
      const r = await deleteGuardianProfile({ profile_id: group.profile_id, family_id: familyId });
      if (!r.success) { setError(r.error); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal title="Delete Guardian" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-body-md text-sc-gray">
          Permanently delete <strong className="text-sc-navy">{group.full_name}</strong>?
        </p>
        <div className="rounded-lg border border-sc-rose-200 bg-sc-rose-50 p-3 text-label-sm text-sc-rose-700">
          This will also remove their {group.relationships.length} student relationship{group.relationships.length !== 1 ? "s" : ""}:
          <ul className="mt-1 ml-3 list-disc">
            {group.relationships.map((r) => (
              <li key={r.guardianship_id}>{r.student_first} {r.student_last}</li>
            ))}
          </ul>
        </div>
        {group.has_auth && (
          <p className="rounded-lg border border-sc-gold-300 bg-sc-gold-50 px-3 py-2 text-label-sm text-sc-gold-800">
            ⚠ This person has an active login account. Use portal management to disable access instead.
          </p>
        )}
        <ErrBanner msg={error} />
        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" className="flex-1" disabled={deleting || group.has_auth} onClick={del}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const STAFF_ROLES = ["teacher", "staff", "registrar", "admin", "full_admin", "platform_admin"];

// ── Individual guardian person card ──────────────────────────────────────────

function GuardianPersonCard({
  group, familyId, households, students, canManage, isFullAdmin,
}: {
  group: GuardianGroup; familyId: string; households: Household[];
  students: Student[]; canManage: boolean; isFullAdmin: boolean;
}) {
  const router = useRouter();
  const [expanded,       setExpanded]       = useState(false);
  const [editRel,        setEditRel]        = useState<GuardianRelationship | null>(null);
  const [removeRel,      setRemoveRel]      = useState<GuardianRelationship | null>(null);
  const [addRel,         setAddRel]         = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);

  const existingStudentIds = new Set(group.relationships.map((r) => r.student_id));
  const householdsShown = Array.from(new Set(
    group.relationships.map((r) => r.household_label).filter(Boolean)
  ));
  const isStaffMember = STAFF_ROLES.includes(group.portal_role ?? "");
  const previewStudents: PortalPreviewStudent[] = group.relationships.map((r) => ({
    name:      `${r.student_first} ${r.student_last}`,
    household: r.household_label,
  }));

  return (
    <>
      <div className={cn(
        "rounded-xl border bg-white overflow-hidden",
        group.is_pickup_only ? "border-sc-teal-100" : "border-sc-gray-100"
      )}>
        {/* ── Card header ── */}
        <div className="flex items-start gap-3 px-4 py-4">
          <div className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-label-sm font-semibold",
            group.is_pickup_only ? "bg-sc-teal" : "bg-sc-navy"
          )}>
            {group.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-serif text-heading-3 text-sc-navy">{group.full_name}</p>
              {group.is_pickup_only && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sc-teal-50 border border-sc-teal-200 px-2 py-0.5 text-label-sm text-sc-teal-700">
                  <Car className="size-3" /> Pickup Contact
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-label-sm text-sc-gray">
              {householdsShown.map((h) => (
                <span key={h}>{h}</span>
              ))}
              {group.email && (
                <a href={`mailto:${group.email}`} className="hover:text-sc-teal flex items-center gap-1">
                  <Mail className="size-3" />{group.email}
                </a>
              )}
              {group.phone && (
                <a href={`tel:${group.phone}`} className="hover:text-sc-teal flex items-center gap-1">
                  <Phone className="size-3" />{group.phone}
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canManage && (
              <Link
                href={`/dashboard/families/${familyId}`}
                className="rounded-lg p-1.5 text-sc-gray-400 hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
                title="Edit contact info in Households"
              >
                <Pencil className="size-3.5" />
              </Link>
            )}
            {isFullAdmin && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg p-1.5 text-sc-gray-400 hover:text-sc-rose hover:bg-sc-rose-50 transition-colors"
                title="Delete guardian"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="rounded-lg p-1.5 text-sc-gray-400 hover:bg-sc-gray-100 transition-colors"
            >
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </div>
        </div>

        {/* ── Portal status — ALWAYS visible ── */}
        {canManage && (
          <div className="mx-4 mb-3 rounded-lg border border-sc-gray-100 bg-sc-gray-50 px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-label-sm font-semibold text-sc-gray-400 uppercase tracking-wide shrink-0">
              Parent Portal
            </p>
            <GuardianPortalControls
              profileId={group.profile_id}
              familyId={familyId}
              status={group.portal_status}
              hasEmail={!!group.email}
              guardianName={group.full_name}
              guardianEmail={group.email}
              previewStudents={previewStudents}
              isStaffMember={isStaffMember}
              isAdminViewer={isFullAdmin}
              onEditContact={() => router.push(`/dashboard/families/${familyId}`)}
            />
          </div>
        )}

        {/* ── Student relationships summary (collapsed) ── */}
        {!expanded && (
          <div className="px-4 pb-3">
            <div className="flex flex-wrap gap-1.5">
              {group.relationships.map((r) => (
                <span key={r.guardianship_id} className="inline-flex items-center gap-1 rounded-full bg-sc-gray-50 border border-sc-gray-100 px-2.5 py-0.5 text-label-sm text-sc-navy">
                  {r.student_first}
                  <span className="text-sc-gray-400 capitalize">
                    · {RELATIONSHIP_LABELS[r.relationship_type as RelationshipType] ?? r.relationship_type}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Expanded detail ── */}
        {expanded && (
          <div className="border-t border-sc-gray-100">
            {/* Per-student relationships */}
            <div className="divide-y divide-sc-gray-50">
              {group.relationships.map((r) => {
                const alertCustody = requiresSupervisionAlert(r.custody_type as CustodyType);
                return (
                  <div key={r.guardianship_id} className={cn("px-4 py-3", alertCustody && "bg-sc-rose-50")}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-label-md text-sc-navy">
                          {r.student_first} {r.student_last}
                          {r.student_display_id && (
                            <span className="ml-1.5 font-mono text-label-sm text-sc-gray-400">{r.student_display_id}</span>
                          )}
                        </p>
                        <p className="text-label-sm text-sc-gray capitalize mt-0.5">
                          {RELATIONSHIP_LABELS[r.relationship_type as RelationshipType] ?? r.relationship_type}
                          {r.household_label && <span className="text-sc-gray-400"> · {r.household_label}</span>}
                        </p>
                        {alertCustody && (
                          <div className="flex items-center gap-1 mt-1 text-label-sm text-sc-rose-700">
                            <AlertTriangle className="size-3" />
                            {CUSTODY_LABELS[r.custody_type as CustodyType]}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {r.is_legal_guardian    && <Badge variant="navy"><ShieldCheck className="size-3 mr-0.5" />Legal Guardian</Badge>}
                          {r.is_primary_contact   && <Badge variant="green">Primary Contact</Badge>}
                          {r.can_pickup           && <Badge variant="default"><Car className="size-3 mr-0.5" />Pickup</Badge>}
                          {!r.can_pickup          && <Badge variant="rose">No Pickup</Badge>}
                          {r.court_order_on_file  && <Badge variant="gold">Court Order</Badge>}
                        </div>
                        {r.pickup_restrictions && (
                          <p className="text-label-sm text-sc-gray mt-1">⚠ {r.pickup_restrictions}</p>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setEditRel(r)}
                            className="rounded p-1 text-sc-gray-400 hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
                            title="Edit relationship"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            onClick={() => setRemoveRel(r)}
                            className="rounded p-1 text-sc-gray-400 hover:text-sc-rose hover:bg-sc-rose-50 transition-colors"
                            title="Remove relationship"
                          >
                            <UserMinus className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add student relationship */}
            {canManage && students.length > group.relationships.length && (
              <div className="px-4 py-3 border-t border-sc-gray-50">
                <button
                  onClick={() => setAddRel(true)}
                  className="flex items-center gap-1.5 text-label-sm text-sc-teal hover:text-sc-teal-700 transition-colors"
                >
                  <UserPlus className="size-3.5" /> Add student relationship
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {editRel       && <EditRelationshipDialog rel={editRel} group={group} familyId={familyId} households={households} onClose={() => setEditRel(null)} />}
      {removeRel     && <RemoveRelationshipDialog rel={removeRel} group={group} familyId={familyId} onClose={() => setRemoveRel(null)} />}
      {addRel        && <AddRelationshipDialog group={group} familyId={familyId} households={households} students={students} existingStudentIds={existingStudentIds} onClose={() => setAddRel(false)} />}
      {confirmDelete && <DeleteGuardianDialog  group={group} familyId={familyId} onClose={() => setConfirmDelete(false)} />}
    </>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function GuardiansPanel({ groups, familyId, households, students, canManage, isFullAdmin }: Props) {
  const guardians    = groups.filter((g) => !g.is_pickup_only);
  const pickupOnly   = groups.filter((g) => g.is_pickup_only);

  return (
    <div className="space-y-6">
      {/* ── Legal Guardians ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <User className="size-4 text-sc-navy" />
          <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">
            Guardians ({guardians.length})
          </p>
        </div>
        {guardians.length === 0 ? (
          <p className="text-label-sm text-sc-gray italic">No guardians on file.</p>
        ) : (
          <div className="space-y-3">
            {guardians.map((g) => (
              <GuardianPersonCard
                key={g.profile_id}
                group={g}
                familyId={familyId}
                households={households}
                students={students}
                canManage={canManage}
                isFullAdmin={isFullAdmin}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Authorized Pickup Contacts ── */}
      {pickupOnly.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Car className="size-4 text-sc-teal" />
            <p className="text-label-sm font-semibold text-sc-teal-700 uppercase tracking-wide">
              Authorized Pickup Contacts ({pickupOnly.length})
            </p>
          </div>
          <p className="text-label-sm text-sc-gray mb-3">
            Authorized for pickup only. Not legal guardians. No portal access.
          </p>
          <div className="space-y-3">
            {pickupOnly.map((g) => (
              <GuardianPersonCard
                key={g.profile_id}
                group={g}
                familyId={familyId}
                households={households}
                students={students}
                canManage={canManage}
                isFullAdmin={isFullAdmin}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
