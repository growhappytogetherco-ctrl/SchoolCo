"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Trash2, Home, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateHousehold, deleteHousehold } from "@/app/actions/households";

const Schema = z.object({
  household_label: z.string().min(2, "Label is required").max(120),
  sort_order:      z.number().int().min(1),
  phone:           z.string().max(30).optional().nullable(),
  email:           z.string().email("Invalid email").optional().or(z.literal("")).nullable(),
  street1:         z.string().max(200).optional(),
  city:            z.string().max(100).optional(),
  state:           z.string().max(50).optional(),
  zip:             z.string().max(20).optional(),
});

type FormData = z.infer<typeof Schema>;

interface Props {
  household: {
    id: string;
    family_id: string;
    household_label: string;
    sort_order: number;
    phone: string | null;
    email: string | null;
    address_json: { street1?: string; city?: string; state?: string; zip?: string } | null;
  };
  onSuccess?: () => void;
}

export function EditHouseholdDialog({ household, onSuccess }: Props) {
  const router = useRouter();
  const [open, setOpen]         = useState(false);
  const [mode, setMode]         = useState<"edit" | "confirmDelete">("edit");
  const [error, setError]       = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      household_label: household.household_label,
      sort_order:      household.sort_order,
      phone:           household.phone ?? undefined,
      email:           household.email ?? undefined,
      street1:         household.address_json?.street1 ?? undefined,
      city:            household.address_json?.city ?? undefined,
      state:           household.address_json?.state ?? undefined,
      zip:             household.address_json?.zip ?? undefined,
    },
  });

  async function onSubmit(data: FormData) {
    setSaving(true);
    setError(null);
    const result = await updateHousehold({
      id:              household.id,
      household_label: data.household_label,
      sort_order:      data.sort_order,
      phone:           data.phone ?? null,
      email:           data.email || null,
      address_json:    {
        country: "US",
        street1: data.street1 ?? undefined,
        city:    data.city    ?? undefined,
        state:   data.state   ?? undefined,
        zip:     data.zip     ?? undefined,
      },
    });
    setSaving(false);
    if (!result.success) { setError(result.error); return; }
    setOpen(false);
    if (onSuccess) onSuccess();
    else router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const result = await deleteHousehold(household.id, household.family_id);
    setDeleting(false);
    if (!result.success) { setError(result.error); setMode("edit"); return; }
    setOpen(false);
    if (onSuccess) onSuccess();
    else router.refresh();
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setMode("edit"); setError(null); }}
        className="inline-flex items-center gap-1 rounded-lg border border-sc-gray-200 bg-white px-2.5 py-1 text-label-sm font-medium text-sc-navy hover:border-sc-teal hover:text-sc-teal transition-colors"
      >
        <Pencil className="size-3" /> Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-sc-navy/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-5">

            {mode === "confirmDelete" ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-rose-50">
                    <AlertTriangle className="size-5 text-sc-rose" />
                  </div>
                  <div>
                    <h2 className="font-serif text-heading-2 text-sc-navy">Delete Household?</h2>
                    <p className="text-label-sm text-sc-gray">This cannot be undone.</p>
                  </div>
                </div>
                <p className="text-body-sm text-sc-navy">
                  Are you sure you want to delete <strong>{household.household_label}</strong>?
                  All guardian relationships must be removed first.
                </p>
                {error && (
                  <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-2 text-label-sm text-sc-rose-700">{error}</p>
                )}
                <div className="flex gap-3">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setMode("edit")}>Cancel</Button>
                  <Button type="button" className="flex-1 bg-sc-rose hover:bg-sc-rose-700 text-white" disabled={deleting} onClick={handleDelete}>
                    {deleting ? "Deleting…" : "Delete Household"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-navy-50">
                    <Home className="size-5 text-sc-navy" />
                  </div>
                  <div>
                    <h2 className="font-serif text-heading-2 text-sc-navy">Edit Household</h2>
                    <p className="text-label-sm text-sc-gray">{household.household_label}</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="household_label">Household Label *</Label>
                    <Input id="household_label" {...register("household_label")} />
                    {errors.household_label && <p className="text-label-sm text-sc-rose">{errors.household_label.message}</p>}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="sort_order">Order (1 = primary)</Label>
                    <Input id="sort_order" type="number" min={1} {...register("sort_order", { valueAsNumber: true })} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Phone</Label>
                      <Input id="phone" type="tel" placeholder="(555) 000-0000" {...register("phone")} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" {...register("email")} />
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
                      <Input id="state" maxLength={2} placeholder="FL" {...register("state")} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="zip">ZIP Code</Label>
                    <Input id="zip" placeholder="32901" {...register("zip")} />
                  </div>

                  {error && (
                    <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-2 text-label-sm text-sc-rose-700">{error}</p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-sc-rose hover:text-sc-rose-700 hover:bg-sc-rose-50"
                      onClick={() => setMode("confirmDelete")}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                    <div className="flex-1" />
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
