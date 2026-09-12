"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StudentStep, type StudentStepData } from "./steps/StudentStep";
import { GuardianStep, type GuardianStepData } from "./steps/GuardianStep";
import { ReviewStep } from "./steps/ReviewStep";
import { FamilyStep, type FamilyStepData } from "./steps/FamilyStep";
import { enrollStudent } from "@/app/actions/enrollment";

// ── Types ─────────────────────────────────────────────────────────────────

export interface PrefillFamily {
  id:          string;
  family_name: string;
}

type NewFamilyStep = "family" | "student" | "guardian" | "review";
type ExistingFamilyStep = "student" | "guardian" | "review";

// ── Step indicators ───────────────────────────────────────────────────────

const NEW_FAMILY_STEPS: { id: NewFamilyStep; label: string }[] = [
  { id: "family",   label: "Family"   },
  { id: "student",  label: "Student"  },
  { id: "guardian", label: "Guardian" },
  { id: "review",   label: "Review"   },
];

const EXISTING_FAMILY_STEPS: { id: ExistingFamilyStep; label: string }[] = [
  { id: "student",  label: "Student"  },
  { id: "guardian", label: "Guardian" },
  { id: "review",   label: "Review"   },
];

// ── Main component ────────────────────────────────────────────────────────

export function EnrollmentWizard({ prefillFamily }: { prefillFamily?: PrefillFamily }) {
  const router = useRouter();

  // When adding to an existing family, we skip the family step entirely.
  const isExistingFamily = !!prefillFamily;
  const STEPS = isExistingFamily ? EXISTING_FAMILY_STEPS : NEW_FAMILY_STEPS;

  const [step, setStep]     = useState<string>(STEPS[0].id);
  const [familyData, setFamilyData]   = useState<FamilyStepData | null>(null);
  const [studentData, setStudentData] = useState<StudentStepData | null>(null);
  const [guardianData, setGuardianData] = useState<GuardianStepData | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  function goBack() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  }

  // ── Step handlers ─────────────────────────────────────────────────────────

  function onFamilyNext(data: FamilyStepData) {
    setFamilyData(data);
    setStep("student");
  }

  function onStudentNext(data: StudentStepData) {
    setStudentData(data);
    setStep("guardian");
  }

  function onGuardianNext(data: GuardianStepData) {
    setGuardianData(data);
    setStep("review");
  }

  // ── Final submission ──────────────────────────────────────────────────────

  async function onSubmit() {
    if (!studentData) return;
    if (!isExistingFamily && !familyData) {
      setError("Family information is missing. Please go back to step 1.");
      return;
    }
    setSaving(true);
    setError(null);

    const result = await enrollStudent({
      // Family
      ...(isExistingFamily
        ? { existing_family_id: prefillFamily!.id }
        : {
            family_name:     familyData!.family_name,
            household_label: familyData!.household_label || undefined,
            household_phone: familyData!.phone ?? null,
            household_email: familyData!.email ?? null,
            household_address: familyData!.address?.street1
              ? {
                  country: "US",
                  street1: familyData!.address.street1 ?? undefined,
                  city:    familyData!.address.city    ?? undefined,
                  state:   familyData!.address.state   ?? undefined,
                  zip:     familyData!.address.zip     ?? undefined,
                }
              : null,
            family_notes: familyData!.notes ?? null,
          }),
      // Student
      first_name:        studentData.first_name,
      last_name:         studentData.last_name,
      preferred_name:    studentData.preferred_name ?? null,
      grade_level:       studentData.grade_level    ?? null,
      track:             studentData.track          ?? null,
      enrollment_status: "enrolled",
      enrollment_date:   new Date().toISOString().slice(0, 10),
      // Guardian (optional)
      guardian_full_name:            guardianData?.full_name        ?? null,
      guardian_email:                guardianData?.email            ?? null,
      guardian_phone:                guardianData?.phone            ?? null,
      guardian_relationship_type:    (guardianData?.relationship_type as any) ?? null,
      guardian_custody_type:         (guardianData?.custody_type    as any) ?? "joint",
      guardian_is_legal_guardian:    guardianData?.is_legal_guardian    ?? true,
      guardian_is_emergency_contact: guardianData?.is_emergency_contact ?? false,
      guardian_can_pickup:           guardianData?.can_pickup            ?? true,
    });

    setSaving(false);

    if (!result.success) {
      setError(result.error ?? "An unexpected error occurred. Please try again.");
      return;
    }

    router.push(`/dashboard/students/${result.data.student_id}?enrolled=1`);
  }

  // ── Wizard ────────────────────────────────────────────────────────────────

  const displayFamilyData: FamilyStepData | null = isExistingFamily
    ? { family_name: prefillFamily!.family_name }
    : familyData;

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-label-sm font-semibold transition-colors ${
              i < stepIndex
                ? "bg-sc-teal text-white"
                : i === stepIndex
                ? "bg-sc-navy text-white"
                : "bg-sc-cream border border-sc-gray-200 text-sc-gray"
            }`}>
              {i < stepIndex ? "✓" : i + 1}
            </div>
            <span className={`text-label-sm font-medium hidden sm:block ${i === stepIndex ? "text-sc-navy" : "text-sc-gray"}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`h-px w-6 sm:w-12 transition-colors ${i < stepIndex ? "bg-sc-teal" : "bg-sc-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card">
        {!isExistingFamily && step === "family" && (
          <FamilyStep onNext={onFamilyNext} />
        )}
        {step === "student"  && (
          <StudentStep
            onNext={onStudentNext}
            onBack={isExistingFamily ? undefined : goBack}
            stepLabel={isExistingFamily ? "Step 1 of 3" : "Step 2 of 4"}
          />
        )}
        {step === "guardian" && (
          <GuardianStep
            onNext={onGuardianNext}
            onBack={goBack}
            stepLabel={isExistingFamily ? "Step 2 of 3" : "Step 3 of 4"}
          />
        )}
        {step === "review" && (
          <ReviewStep
            family={displayFamilyData ?? { family_name: prefillFamily?.family_name ?? "" }}
            student={studentData!}
            guardian={guardianData}
            onBack={goBack}
            onSubmit={onSubmit}
            saving={saving}
            error={error}
            stepLabel={isExistingFamily ? "Step 3 of 3" : "Step 4 of 4"}
          />
        )}
      </div>
    </div>
  );
}
