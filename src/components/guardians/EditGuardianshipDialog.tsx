"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { UpdateGuardianshipSchema, updateGuardianship } from "@/app/actions/guardians";
import { CUSTODY_LABELS, requiresSupervisionAlert } from "@/lib/constants";
import type { CustodyType } from "@/lib/constants";
import type { z } from "zod";

type FormData = z.infer<typeof UpdateGuardianshipSchema>;

interface Household { id: string; household_label: string; }

interface Props {
  guardianship: {
    id: string;
    custody_type: string;
    is_legal_guardian: boolean;
    is_primary_contact: boolean;
    is_emergency_contact: boolean;
    can_pickup: boolean;
    pickup_restrictions: string | null;
    court_order_on_file: boolean;
    household_id: string | null;
  };
  households: Household[];
  guardianName: string;
  studentName: string;
}

export function EditGuardianshipDialog({ guardianship, households, guardianName, studentName }: Props) {
  const router = useRouter();
  const [open, setOpen]     = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(UpdateGuardianshipSchema),
    defaultValues: {
      guardianship_id:      guardianship.id,
      custody_type:         guardianship.custody_type as CustodyType,
      is_legal_guardian:    guardianship.is_legal_guardian,
      is_primary_contact:   guardianship.is_primary_contact,
      is_emergency_contact: guardianship.is_emergency_contact,
      can_pickup:           guardianship.can_pickup,
      pickup_restrictions:  guardianship.pickup_restrictions ?? "",
      court_order_on_file:  guardianship.court_order_on_file,
      household_id:         guardianship.household_id ?? undefined,
    },
  });

  const custodyType = watch("custody_type") as CustodyType;
  const needsAlert  = requiresSupervisionAlert(custodyType);

  async function onSubmit(data: FormData) {
    setSaving(true);
    setError(null);
    const result = await updateGuardianship(data);
    setSaving(false);
    if (!result.success) { setError(result.error); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-sc-gray-400 hover:text-sc-teal"
        title={`Edit guardianship for ${guardianName}`}
        onClick={() => setOpen(true)}
      >
        <Pencil className="size-3.5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-sc-navy/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl overflow-y-auto max-h-[90vh]">
            <div className="p-6 border-b border-sc-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-cream">
                  <Pencil className="size-5 text-sc-navy" />
                </div>
                <div>
                  <h2 className="font-serif text-heading-2 text-sc-navy">Edit Guardianship</h2>
                  <p className="text-label-sm text-sc-gray">{guardianName} → {studentName}</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
              <input type="hidden" {...register("guardianship_id")} />

              {/* Custody type */}
              <div className="space-y-1.5">
                <Label htmlFor="custody_type">Custody Type</Label>
                <Select id="custody_type" {...register("custody_type")}>
                  {(Object.entries(CUSTODY_LABELS) as [CustodyType, string][]).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </Select>
                {errors.custody_type && <p className="text-label-sm text-sc-rose">{errors.custody_type.message}</p>}
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
                  <Checkbox {...register("is_legal_guardian")}    label="Legal guardian"         description="Has legal decision-making authority" />
                  <Checkbox {...register("is_primary_contact")}   label="Primary contact"        description="First point of contact for this student" />
                  <Checkbox {...register("is_emergency_contact")} label="Emergency contact"      description="May be contacted in an emergency" />
                  <Checkbox {...register("can_pickup")}           label="Authorized for pickup"  description="May pick up the student at dismissal" />
                  <Checkbox {...register("court_order_on_file")}  label="Court order on file"    description="Staff has a copy of a custody court order" />
                </div>
              </div>

              {/* Pickup restrictions */}
              <div className="space-y-1.5">
                <Label htmlFor="pickup_restrictions">Pickup Restrictions / Notes</Label>
                <Input id="pickup_restrictions" placeholder="e.g. Must show ID; may not remove from campus" {...register("pickup_restrictions")} />
              </div>

              {error && (
                <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-2 text-label-sm text-sc-rose-700">{error}</p>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" className="flex-1" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
