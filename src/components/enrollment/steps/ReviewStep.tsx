"use client";

import { ClipboardList, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FamilyStepData } from "./FamilyStep";
import type { StudentStepData } from "./StudentStep";
import type { GuardianStepData } from "./GuardianStep";

export function ReviewStep({
  family,
  student,
  guardian,
  onBack,
  onSubmit,
  saving,
  error,
}: {
  family:   FamilyStepData;
  student:  StudentStepData;
  guardian: GuardianStepData | null;
  onBack:   () => void;
  onSubmit: () => void;
  saving:   boolean;
  error:    string | null;
}) {
  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-gold-50">
          <ClipboardList className="size-5 text-sc-gold-700" />
        </div>
        <div>
          <h2 className="font-serif text-heading-2 text-sc-navy">Review &amp; Enroll</h2>
          <p className="text-label-sm text-sc-gray">Step 4 of 4 · Confirm the information below before submitting.</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Family */}
        <Section title="Family">
          <Row label="Family Name"    value={family.family_name} />
          {family.phone && <Row label="Phone" value={family.phone} />}
          {family.email && <Row label="Email" value={family.email} />}
          {family.address?.street1 && (
            <Row
              label="Address"
              value={[family.address.street1, family.address.city, family.address.state, family.address.zip]
                .filter(Boolean).join(", ")}
            />
          )}
        </Section>

        {/* Student */}
        <Section title="Student">
          <Row label="Full Name"  value={`${student.first_name} ${student.last_name}`} />
          {student.preferred_name && <Row label="Goes By" value={student.preferred_name} />}
          {student.grade_level   && <Row label="Grade" value={student.grade_level} />}
          {student.track         && <Row label="Track" value={student.track} />}
        </Section>

        {/* Guardian */}
        {guardian?.email ? (
          <Section title="Guardian (Invite Will Be Sent)">
            <Row label="Name"         value={guardian.full_name ?? ""} />
            <Row label="Email"        value={guardian.email} />
            {guardian.phone           && <Row label="Phone" value={guardian.phone} />}
            {guardian.relationship_type && <Row label="Relationship" value={guardian.relationship_type.replace("_", " ")} />}
            {guardian.custody_type    && <Row label="Custody" value={guardian.custody_type.replace("_", " ")} />}
          </Section>
        ) : (
          <div className="rounded-xl border border-sc-gray-200 border-dashed p-4 text-center text-label-sm text-sc-gray">
            No guardian added — you can add one from the family or student detail page.
          </div>
        )}

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-sc-rose-200 bg-sc-rose-50 p-4">
            <AlertCircle className="size-5 text-sc-rose shrink-0 mt-0.5" />
            <p className="text-label-sm text-sc-rose-700">{error}</p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onBack} disabled={saving}>
            ← Back
          </Button>
          <Button type="button" className="flex-1" onClick={onSubmit} disabled={saving}>
            {saving ? "Enrolling…" : "Enroll Student"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-sc-gray-100 bg-sc-cream/50 p-4">
      <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3">{title}</p>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <dt className="text-label-sm text-sc-gray-400 w-28 shrink-0">{label}</dt>
      <dd className="text-label-sm font-medium text-sc-navy">{value}</dd>
    </div>
  );
}
