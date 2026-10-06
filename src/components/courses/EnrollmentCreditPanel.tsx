"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { resolveEffectiveCredit } from "@/lib/enrollmentCredit";
import { updateEnrollmentCredit } from "@/app/actions/enrollmentCredit";
import type { CourseStudent } from "@/app/actions/courses";

type GradingPeriod = { id: string; name: string; semester_number: number };

type SectionDefaults = {
  countsTowardHighSchoolCredit: boolean;
  creditsAttempted: number | null;
  courseLevel: string | null;
};

type Props = {
  sectionId: string;
  sectionDefaults: SectionDefaults;
  roster: CourseStudent[];
  gradingPeriods: GradingPeriod[];
  /** If false, fields are read-only (non-staff viewer) */
  canEdit: boolean;
};

type RowState = {
  enrollmentId: string;
  hsCredit: boolean | null;       // null = inherit
  credits: string;                 // "" = inherit
  level: string;                   // "" = inherit
  gradingPeriodId: string | null;  // null = not configured
};

const LEVEL_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "honors",   label: "Honors" },
  { value: "ap",       label: "AP" },
  { value: "dual_enrollment", label: "Dual Enrollment" },
];

function initRow(s: CourseStudent): RowState {
  return {
    enrollmentId:   s.enrollment_id,
    hsCredit:       s.enr_counts_toward_hs_credit,
    credits:        s.enr_credits_attempted != null ? String(s.enr_credits_attempted) : "",
    level:          s.enr_course_level ?? "",
    gradingPeriodId: s.enr_grading_period_id ?? null,
  };
}

export function EnrollmentCreditPanel({
  sectionDefaults,
  roster,
  gradingPeriods,
  canEdit,
}: Props) {
  const [rows, setRows] = useState<RowState[]>(() => roster.map(initRow));
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  function updateRow(enrollmentId: string, patch: Partial<RowState>) {
    setRows(prev =>
      prev.map(r => r.enrollmentId === enrollmentId ? { ...r, ...patch } : r)
    );
    setSaved(prev => ({ ...prev, [enrollmentId]: false }));
    setErrors(prev => ({ ...prev, [enrollmentId]: "" }));
  }

  function getStudent(enrollmentId: string): CourseStudent | undefined {
    return roster.find(s => s.enrollment_id === enrollmentId);
  }

  function handleSave(enrollmentId: string) {
    const row = rows.find(r => r.enrollmentId === enrollmentId);
    if (!row) return;

    const creditsNum = row.credits !== "" ? parseFloat(row.credits) : null;
    if (row.credits !== "" && (isNaN(creditsNum!) || creditsNum! < 0)) {
      setErrors(prev => ({ ...prev, [enrollmentId]: "Credits must be a non-negative number" }));
      return;
    }

    setSaving(prev => ({ ...prev, [enrollmentId]: true }));
    startTransition(async () => {
      const result = await updateEnrollmentCredit({
        enrollmentId,
        countsTowardHighSchoolCredit: row.hsCredit,
        creditsAttempted:             creditsNum,
        courseLevel:                  row.level || null,
        gradingPeriodId:              row.gradingPeriodId,
      });
      setSaving(prev => ({ ...prev, [enrollmentId]: false }));
      if (result.success) {
        setSaved(prev => ({ ...prev, [enrollmentId]: true }));
      } else {
        setErrors(prev => ({ ...prev, [enrollmentId]: result.error ?? "Save failed" }));
      }
    });
  }

  if (roster.length === 0) {
    return <p className="text-label-sm text-sc-gray">No students enrolled.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-label-sm">
        <thead>
          <tr className="border-b border-sc-gray-100 text-sc-gray text-left">
            <th className="py-2 pr-4 font-medium w-40">Student</th>
            <th className="py-2 pr-4 font-medium w-16">Grade</th>
            <th className="py-2 pr-4 font-medium w-24">HS Credit</th>
            <th className="py-2 pr-4 font-medium w-24">Credits</th>
            <th className="py-2 pr-4 font-medium w-32">Level</th>
            <th className="py-2 pr-4 font-medium w-32">Term</th>
            <th className="py-2 font-medium w-20"></th>
          </tr>
        </thead>
        <tbody>
          {roster.map(student => {
            const row = rows.find(r => r.enrollmentId === student.enrollment_id);
            if (!row) return null;

            // Resolve effective values for display (greyed = inherited, not overridden)
            const effective = resolveEffectiveCredit(
              {
                counts_toward_high_school_credit: row.hsCredit,
                credits_attempted: row.credits !== "" ? parseFloat(row.credits) : null,
                course_level:      row.level || null,
                grading_period_id: row.gradingPeriodId,
                grading_period_name: gradingPeriods.find(g => g.id === row.gradingPeriodId)?.name ?? null,
              },
              {
                counts_toward_high_school_credit: sectionDefaults.countsTowardHighSchoolCredit,
                credits_attempted:                sectionDefaults.creditsAttempted,
                course_level:                     sectionDefaults.courseLevel,
              },
            );

            const isFinalized = !!student.finalized_at;
            const canEditRow = canEdit && !isFinalized;
            const isDirty = !saved[student.enrollment_id];
            const rowError = errors[student.enrollment_id];
            const isSaving = saving[student.enrollment_id];
            const wasSaved = saved[student.enrollment_id];

            return (
              <tr key={student.enrollment_id} className="border-b border-sc-gray-100 last:border-0">
                <td className="py-2 pr-4">
                  <span className="font-medium text-sc-navy">{student.student_name}</span>
                  {isFinalized && (
                    <span className="ml-1 text-sc-gray text-xs">(finalized)</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-sc-gray">{student.grade_level ?? "—"}</td>

                {/* HS Credit toggle */}
                <td className="py-2 pr-4">
                  {canEditRow ? (
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={effective.countsTowardHsCredit}
                        onCheckedChange={v =>
                          updateRow(student.enrollment_id, { hsCredit: v })
                        }
                        aria-label="HS Credit"
                      />
                      <span className={effective.countsTowardHsCredit ? "text-sc-teal font-medium" : "text-sc-gray"}>
                        {effective.countsTowardHsCredit ? "Yes" : "No"}
                      </span>
                      {!effective.isHsCreditOverridden && (
                        <span className="text-sc-gray-400 text-xs">(default)</span>
                      )}
                    </div>
                  ) : (
                    <span className={effective.countsTowardHsCredit ? "text-sc-teal font-medium" : "text-sc-gray"}>
                      {effective.countsTowardHsCredit ? "Yes" : "No"}
                    </span>
                  )}
                </td>

                {/* Credits */}
                <td className="py-2 pr-4">
                  {canEditRow ? (
                    <div>
                      <Input
                        type="number"
                        step="0.25"
                        min="0"
                        value={row.credits}
                        placeholder={
                          sectionDefaults.creditsAttempted != null
                            ? String(sectionDefaults.creditsAttempted)
                            : "—"
                        }
                        onChange={e => updateRow(student.enrollment_id, { credits: e.target.value })}
                        className="h-7 w-20 text-xs"
                        disabled={!effective.countsTowardHsCredit}
                      />
                      {!effective.isCreditAmtOverridden && effective.creditsAttempted != null && (
                        <span className="text-sc-gray-400 text-xs">(default)</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sc-gray">
                      {effective.creditsAttempted != null ? effective.creditsAttempted : "—"}
                    </span>
                  )}
                </td>

                {/* Level */}
                <td className="py-2 pr-4">
                  {canEditRow ? (
                    <Select
                      value={row.level || ""}
                      onChange={e =>
                        updateRow(student.enrollment_id, { level: e.target.value })
                      }
                      disabled={!effective.countsTowardHsCredit}
                      className="h-7 w-28 text-xs"
                    >
                      <option value="">
                        {sectionDefaults.courseLevel
                          ? `${sectionDefaults.courseLevel} (default)`
                          : "— (inherit)"}
                      </option>
                      {LEVEL_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  ) : (
                    <span className="text-sc-gray capitalize">
                      {effective.courseLevel ?? "—"}
                    </span>
                  )}
                </td>

                {/* Term */}
                <td className="py-2 pr-4">
                  {canEditRow ? (
                    <Select
                      value={row.gradingPeriodId ?? ""}
                      onChange={e =>
                        updateRow(student.enrollment_id, {
                          gradingPeriodId: e.target.value || null,
                        })
                      }
                      disabled={!effective.countsTowardHsCredit}
                      className="h-7 w-28 text-xs"
                    >
                      <option value="">Not set</option>
                      {gradingPeriods.map(gp => (
                        <option key={gp.id} value={gp.id}>{gp.name}</option>
                      ))}
                    </Select>
                  ) : (
                    <span className="text-sc-gray">
                      {effective.termLabel ?? "—"}
                    </span>
                  )}
                </td>

                {/* Save button */}
                <td className="py-2">
                  {canEditRow ? (
                    <div className="flex flex-col items-start gap-0.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2"
                        onClick={() => handleSave(student.enrollment_id)}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving…" : "Save"}
                      </Button>
                      {wasSaved && !isDirty && (
                        <span className="text-sc-teal text-xs">Saved</span>
                      )}
                      {rowError && (
                        <span className="text-sc-rose text-xs">{rowError}</span>
                      )}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
