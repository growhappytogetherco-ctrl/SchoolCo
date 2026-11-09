"use client";

import { useState, useEffect, useTransition } from "react";
import { X, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  addPlanEntry,
  getUnclassifiedCredits,
  type StudentGraduationRequirement,
} from "@/app/actions/graduationPlan";

interface Props {
  planId: string;
  studentId: string;
  requirementId?: string;
  requirements: StudentGraduationRequirement[];
  onClose: () => void;
  onSuccess: () => void;
}

type CourseRecord = {
  id: string;
  course_name: string;
  subject_area: string | null;
  credits_earned: number;
  school_year: string | null;
  verification_status: string;
};

type Mode = "from_record" | "manual";

const GRADE_SLOTS = [
  { value: "9th", label: "9th Grade" },
  { value: "10th", label: "10th Grade" },
  { value: "11th", label: "11th Grade" },
  { value: "12th", label: "12th Grade" },
  { value: "pre_9th", label: "Pre-9th / Middle School" },
];

const INSTITUTION_CODES = [
  { value: "RLA", label: "RLA (Co-op)" },
  { value: "REC", label: "REC (Recorded)" },
  { value: "COL", label: "College / Dual Enrollment" },
  { value: "other", label: "Other" },
];

export function AddCourseDialog({ planId, studentId, requirementId, requirements, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("from_record");
  const [availableRecords, setAvailableRecords] = useState<CourseRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string>("");
  const [selectedReqId, setSelectedReqId] = useState<string>(requirementId ?? "");
  const [gradeSlot, setGradeSlot] = useState<string>("");
  const [schoolYearLabel, setSchoolYearLabel] = useState<string>("");
  const [institutionCode, setInstitutionCode] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [creditsPlanned, setCreditsPlanned] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (mode === "from_record") {
      setLoadingRecords(true);
      getUnclassifiedCredits(studentId).then((result) => {
        if (result.success) setAvailableRecords(result.data);
        setLoadingRecords(false);
      });
    }
  }, [mode, studentId]);

  async function handleSubmit() {
    setError(null);

    if (mode === "from_record" && !selectedRecordId) {
      setError("Please select a course record");
      return;
    }
    if (mode === "manual" && !displayName.trim()) {
      setError("Course name is required for manual entry");
      return;
    }

    startTransition(async () => {
      const result = await addPlanEntry(planId, {
        student_requirement_id: selectedReqId || undefined,
        course_record_id: mode === "from_record" ? selectedRecordId : undefined,
        display_name: displayName || undefined,
        display_credits_planned: creditsPlanned ? parseFloat(creditsPlanned) : undefined,
        institution_code: institutionCode || undefined,
        grade_level_slot: gradeSlot || undefined,
        school_year_label: schoolYearLabel || undefined,
        entry_status: "planned",
        notes: notes || undefined,
      });

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 pb-4 border-b border-sc-gray-100">
          <h2 className="text-label-md font-semibold text-sc-navy">Add Course to Graduation Plan</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
            <X className="size-4" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-sc-gray-200 overflow-hidden">
            <button
              className={`flex-1 py-2 text-label-sm font-medium transition-colors ${mode === "from_record" ? "bg-sc-teal text-white" : "text-sc-gray hover:bg-sc-cream"}`}
              onClick={() => setMode("from_record")}
            >
              From Academic History
            </button>
            <button
              className={`flex-1 py-2 text-label-sm font-medium transition-colors ${mode === "manual" ? "bg-sc-teal text-white" : "text-sc-gray hover:bg-sc-cream"}`}
              onClick={() => setMode("manual")}
            >
              Manual Entry
            </button>
          </div>

          {/* Course record selection */}
          {mode === "from_record" && (
            <div>
              <Label>Course Record</Label>
              {loadingRecords ? (
                <div className="flex items-center gap-2 py-3 text-sc-gray-400 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Loading…
                </div>
              ) : availableRecords.length === 0 ? (
                <p className="text-sm text-sc-gray-400 py-2">
                  No unclassified eligible course records found. All verified, completed records may already be in the plan.
                </p>
              ) : (
                <Select
                  value={selectedRecordId}
                  placeholder="Select a course record…"
                  onChange={(e) => setSelectedRecordId(e.target.value)}
                >
                  {availableRecords.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.course_name} — {r.credits_earned} cr {r.school_year ? `(${r.school_year})` : ""}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          )}

          {/* Manual entry fields */}
          {mode === "manual" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="ac-name">Course Name *</Label>
                <Input
                  id="ac-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. AP Biology"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ac-credits">Credits Planned</Label>
                  <Input
                    id="ac-credits"
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={creditsPlanned}
                    onChange={(e) => setCreditsPlanned(e.target.value)}
                    placeholder="1.0"
                  />
                </div>
                <div>
                  <Label>Institution</Label>
                  <Select
                    value={institutionCode}
                    placeholder="Select…"
                    onChange={(e) => setInstitutionCode(e.target.value)}
                  >
                    {INSTITUTION_CODES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Common fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Requirement</Label>
              <Select
                value={selectedReqId}
                placeholder="Assign to requirement…"
                onChange={(e) => setSelectedReqId(e.target.value)}
              >
                <option value="">Unclassified</option>
                {requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.custom_name ?? `Requirement ${r.id.slice(0, 6)}`}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Grade Level Slot</Label>
              <Select
                value={gradeSlot}
                placeholder="Select grade…"
                onChange={(e) => setGradeSlot(e.target.value)}
              >
                {GRADE_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="ac-year">School Year</Label>
            <Input
              id="ac-year"
              placeholder="2026-2027"
              value={schoolYearLabel}
              onChange={(e) => setSchoolYearLabel(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ac-notes">Notes</Label>
            <Input
              id="ac-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-sc-rose-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 p-6 pt-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
            Add Course
          </Button>
        </div>
      </div>
    </div>
  );
}
