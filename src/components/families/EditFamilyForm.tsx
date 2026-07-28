"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2 } from "lucide-react";
import { updateFamily } from "@/app/actions/families";
import { updateHousehold } from "@/app/actions/households";

interface PrimaryHousehold {
  id: string;
  household_label: string;
  sort_order: number;
  phone: string | null;
  email: string | null;
  address_json: { street1?: string; city?: string; state?: string; zip?: string } | null;
  archived_at: string | null;
}

interface Props {
  familyId:          string;
  initialFamilyName: string;
  initialNotes:      string;
  primaryHousehold:  PrimaryHousehold | null;
}

export function EditFamilyForm({ familyId, initialFamilyName, initialNotes, primaryHousehold }: Props) {
  const router = useRouter();
  const [familyName, setFamilyName] = useState(initialFamilyName);
  const [notes, setNotes]           = useState(initialNotes);
  const [phone, setPhone]           = useState(primaryHousehold?.phone ?? "");
  const [email, setEmail]           = useState(primaryHousehold?.email ?? "");
  const [street1, setStreet1]       = useState(primaryHousehold?.address_json?.street1 ?? "");
  const [city, setCity]             = useState(primaryHousehold?.address_json?.city ?? "");
  const [state, setState]           = useState(primaryHousehold?.address_json?.state ?? "");
  const [zip, setZip]               = useState(primaryHousehold?.address_json?.zip ?? "");
  const [error, setError]           = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      // Update family record
      const familyResult = await updateFamily({
        id:          familyId,
        family_name: familyName.trim(),
        notes:       notes.trim() || undefined,
      });

      if (!familyResult.success) {
        setError(familyResult.error ?? "Failed to update family.");
        if ("fieldErrors" in familyResult && familyResult.fieldErrors) {
          setFieldErrors(familyResult.fieldErrors as Record<string, string[]>);
        }
        return;
      }

      // Update primary household if one exists
      if (primaryHousehold) {
        const address_json =
          street1.trim() || city.trim() || state.trim() || zip.trim()
            ? {
                street1: street1.trim() || undefined,
                city:    city.trim()    || undefined,
                state:   state.trim()   || undefined,
                zip:     zip.trim()     || undefined,
              }
            : null;

        const householdResult = await updateHousehold({
          id:           primaryHousehold.id,
          phone:        phone.trim() || null,
          email:        email.trim() || null,
          address_json: address_json ?? undefined,
        });

        if (!householdResult.success) {
          setError(householdResult.error ?? "Family saved, but household update failed.");
          return;
        }
      }

      router.push(`/dashboard/families/${familyId}`);
      router.refresh();
    });
  }

  return (
    <div className="animate-fade-in max-w-2xl space-y-6">
      {/* Back */}
      <Link
        href={`/dashboard/families/${familyId}`}
        className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
      >
        <ArrowLeft className="size-4" /> Back to Family
      </Link>

      {/* Header */}
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Edit Family</h1>
        <p className="text-body-md text-sc-gray mt-1">Update household name, contact info, and staff notes.</p>
      </div>

      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 space-y-6">

        {/* Family Name */}
        <div>
          <label className="block text-label-sm font-semibold text-sc-navy mb-1">
            Family / Household Name <span className="text-sc-rose">*</span>
          </label>
          <input
            type="text"
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            maxLength={120}
            className={`w-full rounded-xl border px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 ${
              fieldErrors.family_name?.length ? "border-sc-rose-300 bg-sc-rose-50" : "border-sc-gray-200 bg-white"
            }`}
          />
          {fieldErrors.family_name?.map((e) => (
            <p key={e} className="mt-1 text-label-sm text-sc-rose-700">{e}</p>
          ))}
        </div>

        {/* Primary Household Contact */}
        {primaryHousehold && (
          <>
            <div>
              <p className="text-label-sm font-semibold text-sc-navy mb-3">
                Primary Household Contact
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-label-sm font-medium text-sc-navy mb-1">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    maxLength={30}
                    className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                  />
                </div>
                <div>
                  <label className="block text-label-sm font-medium text-sc-navy mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="family@example.com"
                    maxLength={255}
                    className={`w-full rounded-xl border px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 ${
                      fieldErrors.email?.length ? "border-sc-rose-300 bg-sc-rose-50" : "border-sc-gray-200 bg-white"
                    }`}
                  />
                </div>
              </div>
            </div>

            <div>
              <p className="text-label-sm font-semibold text-sc-navy mb-3">Address</p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={street1}
                  onChange={(e) => setStreet1(e.target.value)}
                  placeholder="Street address"
                  maxLength={200}
                  className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    maxLength={100}
                    className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                  />
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="State"
                    maxLength={50}
                    className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                  />
                  <input
                    type="text"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    placeholder="ZIP"
                    maxLength={20}
                    className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Notes */}
        <div>
          <label className="block text-label-sm font-semibold text-sc-navy mb-1">
            Staff Notes <span className="text-label-sm font-normal text-sc-gray">(never shown to parents)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Internal notes about this family…"
            maxLength={2000}
            rows={3}
            className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 resize-none"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-sc-rose-50 border border-sc-rose-200 p-3">
            <AlertTriangle className="size-4 text-sc-rose shrink-0 mt-0.5" />
            <p className="text-label-sm text-sc-rose-700 font-medium">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <Link
            href={`/dashboard/families/${familyId}`}
            className="text-label-sm text-sc-gray hover:text-sc-navy transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={isPending || !familyName.trim() || familyName.trim().length < 2}
            className="inline-flex items-center gap-2 rounded-xl bg-sc-teal px-5 py-2.5 text-label-sm font-semibold text-white hover:bg-sc-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
