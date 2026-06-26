"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Home, Plus } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createHousehold } from "@/app/actions/households";

const Schema = z.object({
  household_label: z.string().min(2, "Label is required").max(120),
  sort_order:      z.number().int().min(1).default(2),
  phone:           z.string().max(30).optional().nullable(),
  email:           z.string().email("Invalid email").optional().or(z.literal("")).nullable(),
  street1:         z.string().max(200).optional(),
  city:            z.string().max(100).optional(),
  state:           z.string().max(50).optional(),
  zip:             z.string().max(20).optional(),
});

type FormData = z.infer<typeof Schema>;

export function AddHouseholdDialog({
  familyId,
  onSuccess,
}: {
  familyId:  string;
  onSuccess: () => void;
}) {
  const [open, setOpen]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: { sort_order: 2 },
  });

  async function onSubmit(data: FormData) {
    setSaving(true);
    setError(null);
    const result = await createHousehold({
      family_id:       familyId,
      household_label: data.household_label,
      sort_order:      data.sort_order,
      phone:           data.phone ?? null,
      email:           data.email || null,
      address_json:    {
        street1: data.street1 ?? undefined,
        city:    data.city    ?? undefined,
        state:   data.state   ?? undefined,
        zip:     data.zip     ?? undefined,
      },
    });
    setSaving(false);
    if (!result.success) { setError(result.error); return; }
    reset();
    setOpen(false);
    onSuccess();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Add Household
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-sc-navy/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-navy-50">
                <Home className="size-5 text-sc-navy" />
              </div>
              <div>
                <h2 className="font-serif text-heading-2 text-sc-navy">Add Household</h2>
                <p className="text-label-sm text-sc-gray">Creating a second household will mark this family as split.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="household_label">Household Label *</Label>
                <Input
                  id="household_label"
                  placeholder="e.g. Mom's Household"
                  {...register("household_label")}
                />
                {errors.household_label && <p className="text-label-sm text-sc-rose">{errors.household_label.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" type="tel" placeholder="(555) 000-0000" {...register("phone")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="home@example.com" {...register("email")} />
                  {errors.email && <p className="text-label-sm text-sc-rose">{errors.email.message}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="street1">Street Address</Label>
                <Input id="street1" placeholder="123 Main St" {...register("street1")} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" {...register("city")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">State</Label>
                  <Input id="state" maxLength={2} placeholder="TX" {...register("state")} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="zip">ZIP Code</Label>
                <Input id="zip" placeholder="75001" {...register("zip")} />
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
                  {saving ? "Saving…" : "Add Household"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
