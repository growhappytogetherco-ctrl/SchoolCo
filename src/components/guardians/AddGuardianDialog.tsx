"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { InviteGuardianSchema, inviteGuardian } from "@/app/actions/guardians";
import { RELATIONSHIP_LABELS, CUSTODY_LABELS, requiresSupervisionAlert } from "@/lib/constants";
import type { RelationshipType, CustodyType } from "@/lib/constants";
import type { z } from "zod";

type FormData = z.infer<typeof InviteGuardianSchema>;

interface Household { id: string; household_label: string; }

export function AddGuardianDialog({
  studentId,
  familyId,
  households,
  onSuccess,
}: {
  studentId:  string;
  familyId:   string;
  households: Household[];
  onSuccess:  () => void;
}) {
  const [open, setOpen]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(InviteGuardianSchema),
    defaultValues: {
      student_id:           studentId,
      family_id:            familyId,
      custody_type:         "joint",
      is_legal_guardian:    true,
      is_primary_contact:   false,
      is_emergency_contact: false,
      can_pickup:           true,
      court_order_on_file:  false,
    },
  });

  const custodyType = watch("custody_type") as CustodyType;
  const needsAlert  = requiresSupervisionAlert(custodyType);

  async function onSubmit(data: FormData) {
    setSaving(true);
    setError(null);
    const result = await inviteGuardian(data);
    setSaving(false);
    if (!result.success) { setError(result.error); return; }
    reset();
    setOpen(false);
    onSuccess();
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="size-4" />
        Add Guardian
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-sc-navy/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="p-6 border-b border-sc-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-teal-50">
                  <UserPlus className="size-5 text-sc-teal" />
                </div>
                <div>
                  <h2 className="font-serif text-heading-2 text-sc-navy">Add Guardian</h2>
                  <p className="text-label-sm text-sc-gray">An invite will be sent to their email.</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
              {/* Hidden fields */}
              <input type="hidden" {...register("student_id")} />
              <input type="hidden" {...register("family_id")} />

              {/* Guardian info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input id="full_name" placeholder="Jane Smith" {...register("full_name")} />
                  {errors.full_name && <p className="text-label-sm text-sc-rose">{errors.full_name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" placeholder="jane@example.com" {...register("email")} />
                  {errors.email && <p className="text-label-sm text-sc-rose">{errors.email.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" placeholder="(555) 000-0000" {...register("phone")} />
                </div>
              </div>

              {/* Relationship */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="relationship_type">Relationship *</Label>
                  <Select id="relationship_type" placeholder="Select…" {...register("relationship_type")}>
                    {(Object.entries(RELATIONSHIP_LABELS) as [RelationshipType, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                  {errors.relationship_type && <p className="text-label-sm text-sc-rose">{errors.relationship_type.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="custody_type">Custody Type *</Label>
                  <Select id="custody_type" {...register("custody_type")}>
                    {(Object.entries(CUSTODY_LABELS) as [CustodyType, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Supervision alert */}
              {needsAlert && (
                <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 p-3 text-label-sm text-sc-rose-700">
                  ⚠ This custody type requires supervised visitation. Pickup will be restricted and staff will be alerted.
                </div>
              )}

              {/* Household assignment */}
              {households.length > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="household_id">Assign to Household</Label>
                  <Select id="household_id" placeholder="None (unassigned)" {...register("household_id")}>
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
                  <Checkbox
                    {...register("is_legal_guardian")}
                    label="Legal guardian"
                    description="Has legal decision-making authority"
                  />
                  <Checkbox
                    {...register("is_primary_contact")}
                    label="Primary contact"
                    description="First point of contact for this student"
                  />
                  <Checkbox
                    {...register("is_emergency_contact")}
                    label="Emergency contact"
                    description="May be contacted in an emergency"
                  />
                  <Checkbox
                    {...register("can_pickup")}
                    label="Authorized for pickup"
                    description="May pick up the student at dismissal"
                    defaultChecked={!needsAlert}
                  />
                  <Checkbox
                    {...register("court_order_on_file")}
                    label="Court order on file"
                    description="Staff has a copy of a custody court order"
                  />
                </div>
              </div>

              {/* Pickup restrictions */}
              <div className="space-y-1.5">
                <Label htmlFor="pickup_restrictions">Pickup Restrictions / Notes</Label>
                <Input
                  id="pickup_restrictions"
                  placeholder="e.g. Must show ID; may not remove from campus"
                  {...register("pickup_restrictions")}
                />
              </div>

              {error && (
                <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-2 text-label-sm text-sc-rose-700">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving ? "Sending Invite…" : "Add Guardian"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
