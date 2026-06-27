"use client";

import { useForm } from "react-hook-form";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RELATIONSHIP_LABELS } from "@/lib/constants";
import type { RelationshipType } from "@/lib/constants";


export type GuardianStepData = {
  full_name?:           string;
  email?:               string;
  phone?:               string | null;
  relationship_type?:   string;
  custody_type?:        string;
  is_legal_guardian?:   boolean;
  is_emergency_contact?: boolean;
  can_pickup?:          boolean;
};

export function GuardianStep({
  onNext,
  onBack,
}: {
  onNext: (data: GuardianStepData) => void;
  onBack: () => void;
}) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      full_name:            "",
      email:                "",
      phone:                "",
      relationship_type:    "",
      custody_type:         "primary",
      is_legal_guardian:    true,
      is_emergency_contact: false,
      can_pickup:           true,
    },
  });

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-green-50">
          <Users className="size-5 text-sc-green" />
        </div>
        <div>
          <h2 className="font-serif text-heading-2 text-sc-navy">Guardian Information</h2>
          <p className="text-label-sm text-sc-gray">Step 3 of 4 · An invite email will be sent.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit((data) => onNext(data as GuardianStepData))} className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="full_name">Guardian Full Name *</Label>
            <Input id="full_name" placeholder="Jane Thompson" {...register("full_name", { required: "Name is required" })} />
            {errors.full_name && <p className="text-label-sm text-sc-rose">{String(errors.full_name.message)}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email Address *</Label>
            <Input id="email" type="email" placeholder="jane@example.com" {...register("email", { required: "Email is required" })} />
            {errors.email && <p className="text-label-sm text-sc-rose">{String(errors.email.message)}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" placeholder="(555) 000-0000" {...register("phone")} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="relationship_type">Relationship *</Label>
            <Select id="relationship_type" placeholder="Select…" {...register("relationship_type", { required: true })}>
              {(Object.entries(RELATIONSHIP_LABELS) as [RelationshipType, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custody_type">Custody Type</Label>
            <Select id="custody_type" {...register("custody_type")}>
              <option value="primary">Primary Custody</option>
              <option value="joint">Joint Custody</option>
              <option value="secondary">Secondary / Visitation</option>
              <option value="supervised">Supervised Visitation</option>
              <option value="none">No Custody (Emergency Contact Only)</option>
            </Select>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-sc-gray-100 bg-sc-cream/50 p-4">
          <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">Permissions</p>
          <Checkbox {...register("is_legal_guardian")} label="Legal guardian" defaultChecked />
          <Checkbox {...register("is_emergency_contact")} label="Emergency contact" />
          <Checkbox {...register("can_pickup")} label="Authorized for pickup" defaultChecked />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onBack}>← Back</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onNext({})}
            className="text-sc-gray border-sc-gray-200"
          >
            Skip for Now
          </Button>
          <Button type="submit" className="flex-1">Next: Review →</Button>
        </div>
      </form>
    </div>
  );
}
