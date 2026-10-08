"use client";

import { useState, useTransition } from "react";
import { updateCourseCreditConfig } from "@/app/actions/courseFinalization";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const COURSE_LEVEL_OPTIONS = [
  { value: "standard",        label: "Standard" },
  { value: "honors",          label: "Honors" },
  { value: "ap",              label: "AP (Advanced Placement)" },
  { value: "dual_enrollment", label: "Dual Enrollment" },
] as const;

const PRESET_CREDITS = [0.25, 0.5, 1.0] as const;

interface GradingPeriod {
  id:              string;
  name:            string;
  period_type:     string;
  semester_number: number | null;
}

interface Props {
  courseSectionId: string;
  initial: {
    countsTowardHighSchoolCredit: boolean;
    creditsAttempted:             number | null;
    courseLevel:                  string | null;
    /** Section-level term default. Null = not specified. */
    gradingPeriodId:              string | null;
  };
  gradingPeriods: GradingPeriod[];
  canEdit: boolean;
}

export function CourseCreditConfig({ courseSectionId, initial, gradingPeriods, canEdit }: Props) {
  const [hs, setHs]                     = useState(initial.countsTowardHighSchoolCredit);
  const [credits, setCredits]           = useState<string>(initial.creditsAttempted?.toString() ?? "");
  const [level, setLevel]               = useState<string>(initial.courseLevel ?? "");
  const [gradingPeriodId, setGradingPeriodId] = useState<string>(initial.gradingPeriodId ?? "");
  const [isPending, startTransition]    = useTransition();
  const [message, setMessage]           = useState<string | null>(null);

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const parsedCredits = credits.trim() ? parseFloat(credits) : null;
      if (credits.trim() && (isNaN(parsedCredits!) || parsedCredits! <= 0)) {
        setMessage("Credits must be a positive number.");
        return;
      }
      if (hs && !parsedCredits) {
        setMessage("Credits required when high school credit is enabled.");
        return;
      }
      const result = await updateCourseCreditConfig(courseSectionId, {
        countsTowardHighSchoolCredit: hs,
        creditsAttempted:             parsedCredits,
        courseLevel:                  level || null,
        gradingPeriodId:              gradingPeriodId || null,
      });
      if (result.success) {
        setMessage("Saved.");
        setTimeout(() => setMessage(null), 2000);
      } else {
        setMessage(result.error ?? "Save failed.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="border-b border-sc-gray-100 pb-2">
        <p className="text-label-sm font-semibold tracking-widest uppercase text-sc-gray-400">
          High School Credit Configuration
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="hs-credit"
          checked={hs}
          onChange={(e) => setHs(e.target.checked)}
          disabled={!canEdit || isPending}
        />
        <Label htmlFor="hs-credit" className="text-label-md cursor-pointer">
          Counts toward high-school credit
        </Label>
      </div>

      {hs && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 pl-9">
          {/* Course Credit */}
          <div className="space-y-2">
            <Label className="text-label-sm text-sc-gray">Course Credit</Label>
            <p className="text-xs text-sc-gray-400 leading-snug">
              The amount of high-school credit this course is worth when successfully completed.
            </p>
            {canEdit && (
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_CREDITS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCredits(String(p))}
                    disabled={isPending}
                    className={`rounded-md border px-2.5 py-1 text-label-sm transition-colors ${
                      credits === String(p)
                        ? "border-sc-teal bg-sc-teal/10 text-sc-teal font-medium"
                        : "border-sc-gray-200 bg-white text-sc-gray hover:border-sc-teal hover:text-sc-teal"
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (!PRESET_CREDITS.map(String).includes(credits)) return;
                    setCredits("");
                  }}
                  disabled={isPending}
                  className={`rounded-md border px-2.5 py-1 text-label-sm transition-colors ${
                    credits && !PRESET_CREDITS.map(String).includes(credits)
                      ? "border-sc-teal bg-sc-teal/10 text-sc-teal font-medium"
                      : "border-sc-gray-200 bg-white text-sc-gray hover:border-sc-teal hover:text-sc-teal"
                  }`}
                >
                  Custom
                </button>
              </div>
            )}
            <Input
              type="number"
              min="0"
              step="0.25"
              placeholder="e.g. 0.5"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              disabled={!canEdit || isPending}
              className="w-28"
            />
          </div>

          {/* Course Term */}
          <div className="space-y-1.5">
            <Label className="text-label-sm text-sc-gray">Course Term</Label>
            <Select
              value={gradingPeriodId}
              onChange={(e) => setGradingPeriodId(e.target.value)}
              disabled={!canEdit || isPending || gradingPeriods.length === 0}
              className="w-48"
            >
              <option value="">Not specified</option>
              {gradingPeriods.map((gp) => (
                <option key={gp.id} value={gp.id}>
                  {gp.name}
                </option>
              ))}
            </Select>
            {gradingPeriods.length === 0 && (
              <p className="text-xs text-sc-gray-400">
                No grading periods configured for this school year.
              </p>
            )}
          </div>

          {/* Course Level */}
          <div className="space-y-1.5">
            <Label className="text-label-sm text-sc-gray">Course Level</Label>
            <Select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              disabled={!canEdit || isPending}
              className="w-44"
            >
              <option value="">Not specified</option>
              {COURSE_LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Explanation */}
          <div className="col-span-2">
            <p className="text-xs text-sc-gray-400 leading-snug">
              Credit is not earned until the course is completed and finalized.
              For mixed-age sections, individual student credit settings can be adjusted
              in the course roster below.
            </p>
          </div>
        </div>
      )}

      {!canEdit && (
        <p className="pl-9 text-xs text-sc-gray-400">
          Registrar or above can edit credit configuration.
        </p>
      )}

      {canEdit && (
        <div className="flex items-center gap-3 pl-9">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Save configuration"}
          </Button>
          {message && (
            <span className={`text-label-sm ${message === "Saved." ? "text-sc-teal-700" : "text-sc-rose-700"}`}>
              {message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
