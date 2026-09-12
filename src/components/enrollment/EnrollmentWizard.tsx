"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StudentStep, type StudentStepData } from "./steps/StudentStep";
import { GuardianStep, type GuardianStepData } from "./steps/GuardianStep";
import { ReviewStep } from "./steps/ReviewStep";
import { FamilyStep, type FamilyStepData } from "./steps/FamilyStep";
import { createFamily } from "@/app/actions/families";
import { createHousehold } from "@/app/actions/households";
import { createStudent } from "@/app/actions/students";
import { inviteGuardian } from "@/app/actions/guardians";

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
    setSaving(true);
    setError(null);

    try {
      let familyId: string;
      let householdId: string | null = null;

      if (isExistingFamily) {
        // ── Existing family path: skip family/household creation ──────────
        familyId = prefillFamily!.id;
      } else {
        // ── New family path: create family + primary household ────────────
        if (!familyData) {
          setError("Family information is missing. Please go back to step 1.");
          return;
        }

        const familyResult = await createFamily({
          family_name:        familyData.family_name,
          is_split_household: false,
          notes:              familyData.notes ?? undefined,
        });
        if (!familyResult.success) {
          throw new Error(familyResult.error ?? "Failed to create family.");
        }
        familyId = familyResult.data.id;

        const householdResult = await createHousehold({
          family_id:       familyId,
          household_label: familyData.household_label || `${familyData.family_name} – Primary`,
          sort_order:      1,
          phone:           familyData.phone ?? null,
          email:           familyData.email || null,
          address_json:    familyData.address?.street1 ? {
            country: "US",
            street1: familyData.address.street1 ?? undefined,
            city:    familyData.address.city    ?? undefined,
            state:   familyData.address.state   ?? undefined,
            zip:     familyData.address.zip     ?? undefined,
          } : undefined,
        });
        if (!householdResult.success) {
          throw new Error(householdResult.error ?? "Failed to create household.");
        }
        householdId = householdResult.data.id;
      }

      // ── Create student ────────────────────────────────────────────────────
      const studentResult = await createStudent({
        family_id:         familyId,
        first_name:        studentData.first_name,
        last_name:         studentData.last_name,
        preferred_name:    studentData.preferred_name ?? null,
        grade_level:       studentData.grade_level    ?? null,
        enrollment_status: "enrolled",
        enrollment_date:   new Date().toISOString().slice(0, 10),
        track:             studentData.track ?? null,
      });
      if (!studentResult.success) {
        throw new Error(studentResult.error ?? "Failed to create student record.");
      }
      const studentId = studentResult.data.id;

      // ── Invite guardian (non-fatal) ───────────────────────────────────────
      if (guardianData?.email && guardianData.full_name) {
        try {
          await inviteGuardian({
            student_id:           studentId,
            family_id:            familyId,
            household_id:         householdId ?? null,
            full_name:            guardianData.full_name,
            email:                guardianData.email,
            phone:                guardianData.phone ?? null,
            relationship_type:    (guardianData.relationship_type || "parent") as Parameters<typeof inviteGuardian>[0]["relationship_type"],
            custody_type:         (guardianData.custody_type || "primary") as Parameters<typeof inviteGuardian>[0]["custody_type"],
            is_legal_guardian:    guardianData.is_legal_guardian ?? true,
            is_primary_contact:   true,
            is_emergency_contact: guardianData.is_emergency_contact ?? false,
            can_pickup:           guardianData.can_pickup ?? true,
            court_order_on_file:  false,
          });
        } catch (guardianErr) {
          console.warn("[Enrollment] Guardian invite failed:", guardianErr);
        }
      }

      // ── Navigate immediately — don't rely on React state surviving a
      //    router refresh triggered by revalidatePath inside the server actions.
      router.push(`/dashboard/students/${studentId}?enrolled=1`);

    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
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
