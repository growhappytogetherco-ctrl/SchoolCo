"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const Schema = z.object({
  family_name:      z.string().min(2, "Family name is required").max(120),
  household_label:  z.string().max(120).optional(),
  phone:            z.string().max(30).optional().nullable(),
  email:            z.string().email("Invalid email").optional().or(z.literal("")).nullable(),
  notes:            z.string().max(2000).optional().nullable(),
  address: z.object({
    street1: z.string().max(200).optional(),
    city:    z.string().max(100).optional(),
    state:   z.string().max(50).optional(),
    zip:     z.string().max(20).optional(),
  }).optional(),
});

export type FamilyStepData = z.infer<typeof Schema>;

export function FamilyStep({ onNext }: { onNext: (data: FamilyStepData) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<FamilyStepData>({
    resolver: zodResolver(Schema),
  });

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-navy-50">
          <Home className="size-5 text-sc-navy" />
        </div>
        <div>
          <h2 className="font-serif text-heading-2 text-sc-navy">Family Information</h2>
          <p className="text-label-sm text-sc-gray">Step 1 of 4</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onNext)} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="family_name">Family Name *</Label>
          <Input id="family_name" placeholder="e.g. The Thompson Family" {...register("family_name")} />
          {errors.family_name && <p className="text-label-sm text-sc-rose">{errors.family_name.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="household_label">Primary Household Label</Label>
          <Input id="household_label" placeholder="e.g. Thompson Family – Primary (auto-filled if blank)" {...register("household_label")} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" type="tel" placeholder="(555) 000-0000" {...register("phone")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="family@example.com" {...register("email")} />
            {errors.email && <p className="text-label-sm text-sc-rose">{errors.email.message}</p>}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="street1">Street Address</Label>
          <Input id="street1" placeholder="123 Main St" {...register("address.street1")} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" {...register("address.city")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="state">State</Label>
            <Input id="state" maxLength={2} placeholder="TX" {...register("address.state")} />
          </div>
        </div>

        <div className="w-32 space-y-1.5">
          <Label htmlFor="zip">ZIP</Label>
          <Input id="zip" placeholder="75001" {...register("address.zip")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Staff Notes (not visible to families)</Label>
          <textarea
            id="notes"
            rows={2}
            placeholder="Internal notes…"
            className="flex w-full rounded-lg border border-sc-gray-200 bg-white px-3 py-2 text-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal focus:border-sc-teal transition-colors resize-none"
            {...register("notes")}
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button type="submit">Next: Student →</Button>
        </div>
      </form>
    </div>
  );
}
