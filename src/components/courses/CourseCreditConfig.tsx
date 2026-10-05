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

interface Props {
  courseSectionId: string;
  initial: {
    countsTowardHighSchoolCredit: boolean;
    creditsAttempted:             number | null;
    courseLevel:                  string | null;
  };
  canEdit: boolean;
}

export function CourseCreditConfig({ courseSectionId, initial, canEdit }: Props) {
  const [hs, setHs]               = useState(initial.countsTowardHighSchoolCredit);
  const [credits, setCredits]     = useState<string>(initial.creditsAttempted?.toString() ?? "");
  const [level, setLevel]         = useState<string>(initial.courseLevel ?? "");
  const [isPending, startTransition] = useTransition();
  const [message, setMessage]     = useState<string | null>(null);

  function handleSave() {
    setMessage(null);
    startTransition(async () => {
      const parsedCredits = credits.trim() ? parseFloat(credits) : null;
      if (credits.trim() && (isNaN(parsedCredits!) || parsedCredits! < 0)) {
        setMessage("Credits must be a positive number.");
        return;
      }
      const result = await updateCourseCreditConfig(courseSectionId, {
        countsTowardHighSchoolCredit: hs,
        creditsAttempted:             parsedCredits,
        courseLevel:                  level || null,
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
    <div className="space-y-4">
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

      <div className="grid grid-cols-2 gap-4 pl-9">
        {hs && (
          <div className="space-y-1.5">
            <Label className="text-label-sm text-sc-gray">Credits Attempted</Label>
            <Input
              type="number"
              min="0"
              step="0.25"
              placeholder="e.g. 1.0"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              disabled={!canEdit || isPending}
              className="w-28"
            />
            <p className="text-xs text-sc-gray-400">
              High-school transcript credit units. Separate from college/DE hours.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-label-sm text-sc-gray">Course Level</Label>
          <Select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            disabled={!canEdit || isPending}
            className="w-44"
            placeholder="Not specified"
          >
            <option value="">Not specified</option>
            {COURSE_LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

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
