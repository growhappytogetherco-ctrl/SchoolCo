"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import { createFamilyWithHousehold, checkFamilyDuplicates, type FamilyDuplicate } from "@/app/actions/families";

// ── Types ─────────────────────────────────────────────────────────────────

interface FormState {
  family_name: string;
  phone:       string;
  email:       string;
  street1:     string;
  city:        string;
  state:       string;
  zip:         string;
  notes:       string;
}

const INITIAL: FormState = {
  family_name: "",
  phone:       "",
  email:       "",
  street1:     "",
  city:        "",
  state:       "",
  zip:         "",
  notes:       "",
};

// ── Component ─────────────────────────────────────────────────────────────

export default function NewFamilyPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [duplicates, setDuplicates] = useState<FamilyDuplicate[]>([]);
  const [duplicatesDismissed, setDuplicatesDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();
  const [isChecking, startCheckTransition] = useTransition();

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: [] }));
  }

  const runDuplicateCheck = useCallback((name: string, email: string, phone: string) => {
    if (name.trim().length < 2) return;
    setDuplicatesDismissed(false);
    startCheckTransition(async () => {
      const result = await checkFamilyDuplicates(name.trim(), email.trim() || null, phone.trim() || null);
      if (result.success) setDuplicates(result.data ?? []);
    });
  }, []);

  function handleSave() {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const address_json =
        form.street1.trim() || form.city.trim() || form.state.trim() || form.zip.trim()
          ? {
              street1: form.street1.trim() || undefined,
              city:    form.city.trim()    || undefined,
              state:   form.state.trim()   || undefined,
              zip:     form.zip.trim()     || undefined,
            }
          : null;

      const result = await createFamilyWithHousehold({
        family_name:  form.family_name.trim(),
        notes:        form.notes.trim() || undefined,
        phone:        form.phone.trim() || null,
        email:        form.email.trim() || null,
        address_json,
      });

      if (!result.success) {
        setError(result.error ?? "Failed to create family.");
        if ("fieldErrors" in result && result.fieldErrors) {
          setFieldErrors(result.fieldErrors as Record<string, string[]>);
        }
        return;
      }

      router.push(`/dashboard/families/${result.data!.family_id}`);
    });
  }

  const visibleDuplicates = duplicatesDismissed ? [] : duplicates;
  const hasBlocker = visibleDuplicates.length > 0;

  return (
    <div className="animate-fade-in max-w-2xl space-y-6">
      {/* Back */}
      <Link
        href="/dashboard/families"
        className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
      >
        <ArrowLeft className="size-4" /> Back to Families
      </Link>

      {/* Header */}
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Add Family</h1>
        <p className="text-body-md text-sc-gray mt-1">
          Create a household record. Students and guardians can be added after.
        </p>
      </div>

      {/* Duplicate Warning */}
      {visibleDuplicates.length > 0 && (
        <div className="rounded-xl border border-sc-gold-300 bg-sc-gold-50 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 text-sc-gold-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-label-sm font-semibold text-sc-gold-800">
                {visibleDuplicates.length === 1 ? "A similar family already exists" : "Similar families already exist"}
              </p>
              <p className="text-label-sm text-sc-gold-700 mt-0.5">
                Review before creating to avoid duplicates.
              </p>
            </div>
          </div>
          <div className="space-y-2 pl-6">
            {visibleDuplicates.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-lg bg-white border border-sc-gold-200 px-3 py-2">
                <div>
                  <span className="text-label-sm font-medium text-sc-navy">{d.family_name}</span>
                  {d.family_display_id && (
                    <span className="text-label-sm text-sc-gray ml-2">{d.family_display_id}</span>
                  )}
                  <span className="ml-2 text-label-sm text-sc-gold-600 capitalize">
                    · Matched by {d.match_reason}
                  </span>
                </div>
                <Link
                  href={`/dashboard/families/${d.id}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 text-label-sm text-sc-teal hover:underline shrink-0"
                >
                  View <ExternalLink className="size-3" />
                </Link>
              </div>
            ))}
          </div>
          <div className="pl-6 flex gap-3">
            <button
              onClick={() => setDuplicatesDismissed(true)}
              className="text-label-sm font-medium text-sc-gold-700 hover:text-sc-gold-900 underline"
            >
              This is a different household — continue creating
            </button>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 space-y-6">

        {/* Family Name */}
        <div>
          <label className="block text-label-sm font-semibold text-sc-navy mb-1">
            Family / Household Name <span className="text-sc-rose">*</span>
          </label>
          <p className="text-label-sm text-sc-gray mb-2">
            Use the household label, for example: <span className="font-medium">Johnson Family</span> or <span className="font-medium">Martinez-Kim Family</span>
          </p>
          <input
            type="text"
            value={form.family_name}
            onChange={(e) => set("family_name", e.target.value)}
            onBlur={() => runDuplicateCheck(form.family_name, form.email, form.phone)}
            placeholder="e.g. Johnson Family"
            maxLength={120}
            className={`w-full rounded-xl border px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 ${
              fieldErrors.family_name?.length ? "border-sc-rose-300 bg-sc-rose-50" : "border-sc-gray-200 bg-white"
            }`}
          />
          {fieldErrors.family_name?.map((e) => (
            <p key={e} className="mt-1 text-label-sm text-sc-rose-700">{e}</p>
          ))}
          {isChecking && (
            <p className="mt-1 text-label-sm text-sc-gray-400">Checking for duplicates…</p>
          )}
        </div>

        {/* Contact Info */}
        <div>
          <p className="text-label-sm font-semibold text-sc-navy mb-3">Primary Contact Info <span className="text-label-sm font-normal text-sc-gray">(optional)</span></p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-label-sm font-medium text-sc-navy mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                onBlur={() => runDuplicateCheck(form.family_name, form.email, form.phone)}
                placeholder="(555) 000-0000"
                maxLength={30}
                className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
              />
            </div>
            <div>
              <label className="block text-label-sm font-medium text-sc-navy mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                onBlur={() => runDuplicateCheck(form.family_name, form.email, form.phone)}
                placeholder="family@example.com"
                maxLength={255}
                className={`w-full rounded-xl border px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 ${
                  fieldErrors.email?.length ? "border-sc-rose-300 bg-sc-rose-50" : "border-sc-gray-200 bg-white"
                }`}
              />
              {fieldErrors.email?.map((e) => (
                <p key={e} className="mt-1 text-label-sm text-sc-rose-700">{e}</p>
              ))}
            </div>
          </div>
        </div>

        {/* Address */}
        <div>
          <p className="text-label-sm font-semibold text-sc-navy mb-3">Address <span className="text-label-sm font-normal text-sc-gray">(optional)</span></p>
          <div className="space-y-3">
            <input
              type="text"
              value={form.street1}
              onChange={(e) => set("street1", e.target.value)}
              placeholder="Street address"
              maxLength={200}
              className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="City"
                maxLength={100}
                className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
              />
              <input
                type="text"
                value={form.state}
                onChange={(e) => set("state", e.target.value)}
                placeholder="State"
                maxLength={50}
                className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
              />
              <input
                type="text"
                value={form.zip}
                onChange={(e) => set("zip", e.target.value)}
                placeholder="ZIP"
                maxLength={20}
                className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
              />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-label-sm font-semibold text-sc-navy mb-1">
            Staff Notes <span className="text-label-sm font-normal text-sc-gray">(optional — never shown to parents)</span>
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
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
            href="/dashboard/families"
            className="text-label-sm text-sc-gray hover:text-sc-navy transition-colors"
          >
            Cancel
          </Link>
          <button
            onClick={handleSave}
            disabled={isPending || !form.family_name.trim() || form.family_name.trim().length < 2 || hasBlocker}
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
                Create Family
              </>
            )}
          </button>
        </div>

        {hasBlocker && (
          <p className="text-label-sm text-sc-gold-700 text-center -mt-2">
            Review the duplicate warning above before continuing.
          </p>
        )}
      </div>
    </div>
  );
}
