"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { FamilyStep,  type FamilyStepData  } from "./steps/FamilyStep";
import { StudentStep, type StudentStepData } from "./steps/StudentStep";
import { GuardianStep,type GuardianStepData} from "./steps/GuardianStep";
import { ReviewStep }                         from "./steps/ReviewStep";
import { createFamily }                        from "@/app/actions/families";
import { createHousehold }                     from "@/app/actions/households";
import { createStudent }                       from "@/app/actions/students";
import { inviteGuardian }                      from "@/app/actions/guardians";

// ── Steps ─────────────────────────────────────────────────────────────────

type Step = "family" | "student" | "guardian" | "review";

const STEPS: { id: Step; label: string }[] = [
  { id: "family",   label: "Family"   },
  { id: "student",  label: "Student"  },
  { id: "guardian", label: "Guardian" },
  { id: "review",   label: "Review"   },
];

// ── Wizard state ──────────────────────────────────────────────────────────

interface WizardState {
  family:   FamilyStepData  | null;
  student:  StudentStepData | null;
  guardian: GuardianStepData | null;
  // Resolved IDs after DB writes
  familyId?:      string;
  householdId?:   string;
  studentId?:     string;
}

// ── Main component ────────────────────────────────────────────────────────

export function EnrollmentWizard({ prefillFamilyId }: { prefillFamilyId?: string }) {
  const router  = useRouter();
  const [step, setStep]     = useState<Step>("family");
  const [state, setState]   = useState<WizardState>({ family: null, student: null, guardian: null });
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  function goBack() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  }

  // ── Step handlers ────────────────────────────────────────────────────────

  function onFamilyNext(data: FamilyStepData) {
    setState((s) => ({ ...s, family: data }));
    setStep("student");
  }

  function onStudentNext(data: StudentStepData) {
    setState((s) => ({ ...s, student: data }));
    setStep("guardian");
  }

  function onGuardianNext(data: GuardianStepData) {
    setState((s) => ({ ...s, guardian: data }));
    setStep("review");
  }

  // ── Final submission ──────────────────────────────────────────────────────

  async function onSubmit() {
    if (!state.family || !state.student) return;
    setSaving(true);
    setError(null);

    try {
      // 1. Create family
      const familyResult = await createFamily({
        family_name:        state.family.family_name,
        is_split_household: false,
        notes:              state.family.notes ?? undefined,
      });
      if (!familyResult.success) throw new Error(familyResult.error);
      const familyId = familyResult.data.id;

      // 2. Create primary household
      const householdResult = await createHousehold({
        family_id:       familyId,
        household_label: state.family.household_label || `${state.family.family_name} – Primary`,
        sort_order:      1,
        phone:           state.family.phone ?? null,
        email:           state.family.email ?? null,
        address_json:    state.family.address ? {
          street1: state.family.address.street1 ?? undefined,
          city:    state.family.address.city    ?? undefined,
          state:   state.family.address.state   ?? undefined,
          zip:     state.family.address.zip     ?? undefined,
        } : undefined,
      });
      if (!householdResult.success) throw new Error(householdResult.error);
      const householdId = householdResult.data.id;

      // 3. Create student
      const studentResult = await createStudent({
        family_id:         familyId,
        first_name:        state.student.first_name,
        last_name:         state.student.last_name,
        preferred_name:    state.student.preferred_name ?? null,
        grade_level:       state.student.grade_level    ?? null,
        enrollment_status: "enrolled",
        enrollment_date:   new Date().toISOString().slice(0, 10),
        track:             state.student.track ?? null,
      });
      if (!studentResult.success) throw new Error(studentResult.error);
      const studentId = studentResult.data.id;

      // 4. Invite guardian (optional — skip if guardian step was skipped)
      if (state.guardian?.email) {
        const guardianResult = await inviteGuardian({
          student_id:           studentId,
          family_id:            familyId,
          household_id:         householdId,
          full_name:            state.guardian.full_name,
          email:                state.guardian.email,
          phone:                state.guardian.phone ?? null,
          relationship_type:    state.guardian.relationship_type as Parameters<typeof inviteGuardian>[0]["relationship_type"],
          custody_type:         state.guardian.custody_type as Parameters<typeof inviteGuardian>[0]["custody_type"],
          is_legal_guardian:    state.guardian.is_legal_guardian ?? true,
          is_primary_contact:   true,
          is_emergency_contact: state.guardian.is_emergency_contact ?? false,
          can_pickup:           state.guardian.can_pickup ?? true,
          court_order_on_file:  false,
        });
        if (!guardianResult.success) {
          // Guardian invite failure is non-fatal — family + student already created
          console.warn("[Enrollment] Guardian invite failed:", guardianResult.error);
        }
      }

      setState((s) => ({ ...s, familyId, householdId, studentId }));
      setDone(true);

    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  // ── Done screen ───────────────────────────────────────────────────────────

  if (done && state.studentId) {
    return (
      <div className="flex flex-col items-center py-16 gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sc-green-50">
          <CheckCircle className="size-8 text-sc-green" />
        </div>
        <div>
          <h2 className="font-serif text-heading-1 text-sc-navy mb-2">Student Enrolled!</h2>
          <p className="text-body-md text-sc-gray max-w-sm">
            {state.student?.first_name} {state.student?.last_name} has been enrolled
            {state.guardian?.email ? ` and an invite has been sent to ${state.guardian.email}` : ""}.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push(`/dashboard/students/${state.studentId}`)}
            className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-5 py-2.5 text-white text-label-md font-medium"
          >
            View Student
          </button>
          <button
            onClick={() => router.push(`/dashboard/families/${state.familyId}`)}
            className="inline-flex items-center gap-2 rounded-lg border border-sc-gray-200 bg-white px-5 py-2.5 text-sc-navy text-label-md font-medium"
          >
            View Family
          </button>
        </div>
      </div>
    );
  }

  // ── Wizard ────────────────────────────────────────────────────────────────

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
        {step === "family"   && <FamilyStep   onNext={onFamilyNext}   />}
        {step === "student"  && <StudentStep  onNext={onStudentNext}  onBack={goBack} />}
        {step === "guardian" && <GuardianStep onNext={onGuardianNext} onBack={goBack} />}
        {step === "review"   && (
          <ReviewStep
            family={state.family!}
            student={state.student!}
            guardian={state.guardian}
            onBack={goBack}
            onSubmit={onSubmit}
            saving={saving}
            error={error}
          />
        )}
      </div>
    </div>
  );
}
