"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, AlertTriangle, Pill, User, Phone, CreditCard, Plus, Pencil } from "lucide-react";
import { getStudentMedicalData } from "@/app/actions/profileData";
import type { StudentProfileData } from "../types";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  data: StudentProfileData;
}

type MedicalData = Awaited<ReturnType<typeof getStudentMedicalData>>;

export function MedicalTab({ studentId, data }: Props) {
  const [medical, setMedical] = useState<MedicalData>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentMedicalData(studentId).then((d) => {
      setMedical(d);
      setLoading(false);
    });
  }, [studentId]);

  if (loading) return <MedicalSkeleton />;

  const hasEmergencyMed = data.medication_alerts.some((m) => m.is_emergency);
  const allergies = medical?.allergies ?? data.allergies;
  const medAlerts = medical?.medication_alerts ?? data.medication_alerts;
  const conditions = medical?.medical?.medical_conditions ?? [];
  const accommodations = medical?.medical?.special_accommodations ?? [];

  return (
    <div className="space-y-5 max-w-3xl">

      {/* ── Emergency medication — always first ─────────────── */}
      {medAlerts.filter((m) => m.is_emergency).length > 0 && (
        <div className="rounded-2xl border-2 border-sc-rose bg-sc-rose-50 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-sc-rose" />
            <h2 className="font-serif text-heading-3 text-sc-rose font-bold">Emergency Medications</h2>
          </div>
          {medAlerts.filter((m) => m.is_emergency).map((m) => (
            <div key={m.id} className="rounded-xl bg-white border border-sc-rose-200 p-4 space-y-2">
              <p className="font-bold text-sc-rose text-heading-3">{m.medication_name}</p>
              {m.dosage && <p className="text-label-sm text-sc-navy"><span className="font-semibold">Dosage:</span> {m.dosage}</p>}
              {m.instructions && <p className="text-label-sm text-sc-navy"><span className="font-semibold">Instructions:</span> {m.instructions}</p>}
              {m.storage_location && (
                <p className="text-label-sm text-sc-rose-700 font-semibold">
                  ⚑ Stored at: {m.storage_location}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Allergies ─────────────────────────────────────────── */}
      <Section title="Allergies" icon={<AlertTriangle className="size-4 text-sc-gold" />}
        empty={allergies.length === 0} emptyText="No allergies on file.">
        <div className="flex flex-wrap gap-2">
          {allergies.map((a) => (
            <span key={a} className="rounded-full border border-sc-gold-200 bg-sc-gold-50 px-3 py-1 text-label-sm text-sc-gold-700 font-medium">
              {a}
            </span>
          ))}
        </div>
      </Section>

      {/* ── Regular medications ───────────────────────────────── */}
      {medAlerts.filter((m) => !m.is_emergency).length > 0 && (
        <Section title="Medications" icon={<Pill className="size-4 text-sc-teal" />}
          empty={false} emptyText="">
          <div className="divide-y divide-sc-gray-100">
            {medAlerts.filter((m) => !m.is_emergency).map((m) => (
              <div key={m.id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-label-md font-semibold text-sc-navy">{m.medication_name}</p>
                {m.dosage && <p className="text-label-sm text-sc-gray">{m.dosage}</p>}
                {m.instructions && <p className="text-label-sm text-sc-gray">{m.instructions}</p>}
                {m.storage_location && <p className="text-label-sm text-sc-gray">Stored: {m.storage_location}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Medical conditions ────────────────────────────────── */}
      <Section title="Medical Conditions" icon={<AlertTriangle className="size-4 text-sc-gray" />}
        empty={conditions.length === 0} emptyText="No conditions on file.">
        <div className="flex flex-wrap gap-2">
          {conditions.map((c: string) => (
            <span key={c} className="rounded-full border border-sc-gray-200 bg-sc-gray-50 px-3 py-1 text-label-sm text-sc-gray">
              {c}
            </span>
          ))}
        </div>
      </Section>

      {/* ── Special accommodations ────────────────────────────── */}
      {accommodations.length > 0 && (
        <Section title="Special Accommodations" icon={<AlertTriangle className="size-4 text-sc-teal" />}
          empty={false} emptyText="">
          <ul className="space-y-1">
            {accommodations.map((a: string) => (
              <li key={a} className="flex items-start gap-2 text-label-sm text-sc-navy">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-sc-teal shrink-0" />
                {a}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Medical notes ─────────────────────────────────────── */}
      {(medical?.medical_notes ?? data.medical_notes) && (
        <Section title="Medical Notes" icon={<Pill className="size-4 text-sc-gray" />}
          empty={false} emptyText="">
          <p className="text-body-md text-sc-navy whitespace-pre-wrap">
            {medical?.medical_notes ?? data.medical_notes}
          </p>
        </Section>
      )}

      {/* ── Doctor & insurance ───────────────────────────────── */}
      <div className="grid sm:grid-cols-2 gap-5">
        <Section title="Primary Doctor" icon={<User className="size-4 text-sc-teal" />}
          empty={!medical?.medical?.primary_doctor_name} emptyText="Not on file.">
          {medical?.medical?.primary_doctor_name && (
            <div className="space-y-1">
              <p className="text-label-md font-semibold text-sc-navy">{medical.medical.primary_doctor_name}</p>
              {medical.medical.primary_doctor_phone && (
                <a href={`tel:${medical.medical.primary_doctor_phone}`}
                  className="flex items-center gap-1 text-label-sm text-sc-teal">
                  <Phone className="size-3" /> {medical.medical.primary_doctor_phone}
                </a>
              )}
              {medical.medical.primary_doctor_fax && (
                <p className="text-label-sm text-sc-gray">Fax: {medical.medical.primary_doctor_fax}</p>
              )}
            </div>
          )}
        </Section>

        <Section title="Insurance" icon={<CreditCard className="size-4 text-sc-teal" />}
          empty={!medical?.medical?.insurance_provider} emptyText="Not on file.">
          {medical?.medical?.insurance_provider && (
            <div className="space-y-1 text-label-sm text-sc-navy">
              <p className="font-semibold">{medical.medical.insurance_provider}</p>
              {medical.medical.insurance_policy_number && (
                <p className="text-sc-gray">Policy #: {medical.medical.insurance_policy_number}</p>
              )}
              {medical.medical.insurance_group_number && (
                <p className="text-sc-gray">Group #: {medical.medical.insurance_group_number}</p>
              )}
              {medical.medical.insurance_phone && (
                <a href={`tel:${medical.medical.insurance_phone}`} className="flex items-center gap-1 text-sc-teal">
                  <Phone className="size-3" /> {medical.medical.insurance_phone}
                </a>
              )}
            </div>
          )}
        </Section>
      </div>

      {/* ── Add/edit prompt ──────────────────────────────────── */}
      <div className="rounded-xl border border-dashed border-sc-gray-200 p-4 text-center">
        <p className="text-label-sm text-sc-gray">
          To update medical information, contact your school administrator or use the edit button above.
        </p>
      </div>
    </div>
  );
}

// ── Section wrapper ──────────────────────────────────────────

function Section({
  title, icon, children, empty, emptyText,
}: {
  title: string; icon: React.ReactNode; children?: React.ReactNode; empty: boolean; emptyText: string;
}) {
  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
      <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
        {icon} {title}
      </h2>
      {empty ? (
        <p className="text-body-sm text-sc-gray-400">{emptyText}</p>
      ) : children}
    </div>
  );
}

function MedicalSkeleton() {
  return (
    <div className="space-y-5">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
          <div className="h-5 w-40 rounded-lg bg-sc-gray-100 animate-pulse" />
          <div className="h-4 w-full rounded-lg bg-sc-gray-100 animate-pulse" />
          <div className="h-4 w-2/3 rounded-lg bg-sc-gray-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}
