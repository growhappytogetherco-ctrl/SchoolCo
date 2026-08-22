"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { InviteGuardianSchema, AddGuardianRecordSchema, inviteGuardian, addGuardianRecord } from "@/app/actions/guardians";
import { RELATIONSHIP_LABELS, CUSTODY_LABELS, requiresSupervisionAlert } from "@/lib/constants";
import type { RelationshipType, CustodyType } from "@/lib/constants";
import type { z } from "zod";

type InviteFormData  = z.infer<typeof InviteGuardianSchema>;
type RecordFormData  = z.infer<typeof AddGuardianRecordSchema>;

interface Student  { id: string; first_name: string; last_name: string; }
interface Household { id: string; household_label: string; }

export function AddGuardianDialog({
  students,
  familyId,
  households,
  onSuccess,
}: {
  students:   Student[];
  familyId:   string;
  households: Household[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [sendInvite, setSendInvite] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);

  const sharedDefaults = {
    family_id:            familyId,
    custody_type:         "joint" as CustodyType,
    is_legal_guardian:    true,
    is_primary_contact:   false,
    is_emergency_contact: false,
    can_pickup:           true,
    court_order_on_file:  false,
  };

  const inviteForm = useForm<InviteFormData>({
    resolver: zodResolver(InviteGuardianSchema),
    defaultValues: { ...sharedDefaults, student_id: "", email: "" },
  });

  const recordForm = useForm<RecordFormData>({
    resolver: zodResolver(AddGuardianRecordSchema),
    defaultValues: { ...sharedDefaults, student_ids: [] },
  });

  const custodyType = sendInvite
    ? (inviteForm.watch("custody_type") as CustodyType)
    : (recordForm.watch("custody_type") as CustodyType);
  const needsAlert = requiresSupervisionAlert(custodyType);

  function toggleStudent(id: string) {
    setSelectedStudents((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  async function onSubmitInvite(data: InviteFormData) {
    if (!selectedStudents[0]) { setError("Select a student."); return; }
    setSaving(true); setError(null);
    const result = await inviteGuardian({ ...data, student_id: selectedStudents[0] });
    setSaving(false);
    if (!result.success) { setError(result.error); return; }
    handleClose(true);
  }

  async function onSubmitRecord(data: RecordFormData) {
    if (selectedStudents.length === 0) { setError("Select at least one student."); return; }
    setSaving(true); setError(null);
    const result = await addGuardianRecord({ ...data, student_ids: selectedStudents });
    setSaving(false);
    if (!result.success) { setError(result.error); return; }
    handleClose(true);
  }

  function handleClose(success = false) {
    setOpen(false);
    setSelectedStudents([]);
    setSendInvite(false);
    inviteForm.reset();
    recordForm.reset();
    if (success) {
      if (onSuccess) onSuccess();
      else router.refresh();
    }
  }

  const custodyReg = sendInvite ? inviteForm.register("custody_type") : recordForm.register("custody_type");
  const householdReg = sendInvite ? inviteForm.register("household_id") : recordForm.register("household_id");
  const legalReg = sendInvite ? inviteForm.register("is_legal_guardian") : recordForm.register("is_legal_guardian");
  const primaryReg = sendInvite ? inviteForm.register("is_primary_contact") : recordForm.register("is_primary_contact");
  const emergencyReg = sendInvite ? inviteForm.register("is_emergency_contact") : recordForm.register("is_emergency_contact");
  const pickupReg = sendInvite ? inviteForm.register("can_pickup") : recordForm.register("can_pickup");
  const courtReg = sendInvite ? inviteForm.register("court_order_on_file") : recordForm.register("court_order_on_file");
  const pickupRestrictionsReg = sendInvite ? inviteForm.register("pickup_restrictions") : recordForm.register("pickup_restrictions");

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Add Guardian
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-sc-navy/40" onClick={() => handleClose()} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="p-6 border-b border-sc-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-teal-50">
                  <UserPlus className="size-5 text-sc-teal" />
                </div>
                <div>
                  <h2 className="font-serif text-heading-2 text-sc-navy">Add Guardian</h2>
                  <p className="text-label-sm text-sc-gray">
                    {sendInvite ? "A portal invite will be sent to their email." : "Record only — no portal account will be created."}
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={sendInvite
                ? inviteForm.handleSubmit(onSubmitInvite)
                : recordForm.handleSubmit(onSubmitRecord)
              }
              className="p-6 space-y-5"
            >
              {/* Student selector */}
              <div className="space-y-2">
                <Label>Student{sendInvite ? " *" : "s *"}</Label>
                <div className="space-y-1.5 rounded-xl border border-sc-gray-100 bg-sc-cream/40 p-3">
                  {students.length === 0 ? (
                    <p className="text-label-sm text-sc-gray-400">No students in this family.</p>
                  ) : students.map((s) => (
                    <label key={s.id} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type={sendInvite ? "radio" : "checkbox"}
                        name="student_selector"
                        value={s.id}
                        checked={selectedStudents.includes(s.id)}
                        onChange={() => {
                          if (sendInvite) setSelectedStudents([s.id]);
                          else toggleStudent(s.id);
                        }}
                        className="accent-sc-teal"
                      />
                      <span className="text-label-sm text-sc-navy">
                        {s.first_name} {s.last_name}
                      </span>
                    </label>
                  ))}
                </div>
                {sendInvite && selectedStudents.length === 0 && (
                  <p className="text-label-sm text-sc-gray-400">Select one student for the portal invite.</p>
                )}
              </div>

              {/* Guardian info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input
                    id="full_name"
                    placeholder="Jane Smith"
                    {...(sendInvite ? inviteForm.register("full_name") : recordForm.register("full_name"))}
                  />
                  {(sendInvite ? inviteForm.formState.errors.full_name : recordForm.formState.errors.full_name) && (
                    <p className="text-label-sm text-sc-rose">
                      {(sendInvite ? inviteForm.formState.errors.full_name : recordForm.formState.errors.full_name)?.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email {sendInvite ? "*" : ""}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="jane@example.com"
                    {...(sendInvite ? inviteForm.register("email") : recordForm.register("email"))}
                  />
                  {sendInvite && inviteForm.formState.errors.email && (
                    <p className="text-label-sm text-sc-rose">{inviteForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="(555) 000-0000"
                    {...(sendInvite ? inviteForm.register("phone") : recordForm.register("phone"))}
                  />
                </div>
              </div>

              {/* Relationship + Custody */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="relationship_type">Relationship *</Label>
                  <Select
                    id="relationship_type"
                    placeholder="Select…"
                    {...(sendInvite ? inviteForm.register("relationship_type") : recordForm.register("relationship_type"))}
                  >
                    {(Object.entries(RELATIONSHIP_LABELS) as [RelationshipType, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="custody_type">Custody Type *</Label>
                  <Select id="custody_type" {...custodyReg}>
                    {(Object.entries(CUSTODY_LABELS) as [CustodyType, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                </div>
              </div>

              {needsAlert && (
                <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 p-3 text-label-sm text-sc-rose-700">
                  ⚠ This custody type requires supervised visitation. Pickup will be restricted and staff will be alerted.
                </div>
              )}

              {/* Household assignment */}
              {households.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="household_id">Assign to Household</Label>
                  <Select id="household_id" placeholder="None (unassigned)" {...householdReg}>
                    {households.map((h) => (
                      <option key={h.id} value={h.id}>{h.household_label}</option>
                    ))}
                  </Select>
                </div>
              )}

              {/* Permissions */}
              <div className="space-y-3 rounded-xl border border-sc-gray-100 bg-sc-cream/50 p-4">
                <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">Permissions</p>
                <div className="space-y-2.5">
                  <Checkbox {...legalReg}     label="Legal guardian"        description="Has legal decision-making authority" />
                  <Checkbox {...primaryReg}   label="Primary contact"       description="First point of contact for this student" />
                  <Checkbox {...emergencyReg} label="Emergency contact"     description="May be contacted in an emergency" />
                  <Checkbox {...pickupReg}    label="Authorized for pickup" description="May pick up the student at dismissal" />
                  <Checkbox {...courtReg}     label="Court order on file"   description="Staff has a copy of a custody court order" />
                </div>
              </div>

              {/* Pickup restrictions */}
              <div className="space-y-1.5">
                <Label htmlFor="pickup_restrictions">Pickup Restrictions / Notes</Label>
                <Input
                  id="pickup_restrictions"
                  placeholder="e.g. Must show ID; may not remove from campus"
                  {...pickupRestrictionsReg}
                />
              </div>

              {/* Invite toggle */}
              <div className="rounded-xl border border-sc-gray-100 bg-sc-cream/30 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendInvite}
                    onChange={(e) => {
                      setSendInvite(e.target.checked);
                      setSelectedStudents([]);
                    }}
                    className="mt-0.5 accent-sc-teal"
                  />
                  <div>
                    <p className="text-label-sm font-semibold text-sc-navy">Invite to Portal</p>
                    <p className="text-label-sm text-sc-gray">Send an email invite to create a portal login. Requires a valid email address.</p>
                  </div>
                </label>
              </div>

              {error && (
                <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-2 text-label-sm text-sc-rose-700">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => handleClose()}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving
                    ? (sendInvite ? "Sending Invite…" : "Saving…")
                    : (sendInvite ? "Add Guardian & Send Invite" : "Add Guardian")}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
