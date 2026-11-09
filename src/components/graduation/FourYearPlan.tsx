"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraduationPlanEntry, StudentGraduationRequirement, ManualCredit } from "@/app/actions/graduationPlan";

type FullEntry = GraduationPlanEntry & {
  course_record: { course_name: string; credits_earned: number | null; school_year: string | null } | null;
  manual_credits: ManualCredit[];
};

interface Props {
  planId: string;
  entries: FullEntry[];
  requirements: StudentGraduationRequirement[];
  onUpdate: () => void;
}

const GRADE_SLOTS = [
  { id: "pre_9th", label: "Pre-9th / Middle School" },
  { id: "9th",     label: "9th Grade" },
  { id: "10th",    label: "10th Grade" },
  { id: "11th",    label: "11th Grade" },
  { id: "12th",    label: "12th Grade" },
  { id: null,      label: "Unscheduled" },
] as const;

export function FourYearPlan({ planId, entries, requirements, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(true);

  const reqMap = Object.fromEntries(requirements.map((r) => [r.id, r]));

  const bySlot = new Map<string | null, FullEntry[]>();
  for (const slot of GRADE_SLOTS) {
    bySlot.set(slot.id, []);
  }
  for (const entry of entries) {
    const slot = entry.grade_level_slot ?? null;
    if (!bySlot.has(slot)) bySlot.set(slot, []);
    bySlot.get(slot)!.push(entry);
  }

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-6 pb-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <h3 className="text-label-md font-semibold text-sc-navy">Four-Year Plan</h3>
        {expanded ? <ChevronUp className="size-4 text-sc-gray-400" /> : <ChevronDown className="size-4 text-sc-gray-400" />}
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4">
          {GRADE_SLOTS.map((slot) => {
            const slotEntries = bySlot.get(slot.id) ?? [];
            if (slotEntries.length === 0 && slot.id === null) return null;
            return (
              <GradeSection
                key={slot.id ?? "unscheduled"}
                label={slot.label}
                entries={slotEntries}
                reqMap={reqMap}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function GradeSection({
  label,
  entries,
  reqMap,
}: {
  label: string;
  entries: FullEntry[];
  reqMap: Record<string, StudentGraduationRequirement>;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h4 className="text-label-sm font-semibold text-sc-navy">{label}</h4>
        {entries.length > 0 && (
          <span className="text-xs text-sc-gray-400">
            {entries.reduce((sum, e) => {
              const cr = e.course_record?.credits_earned ?? 0;
              return sum + cr;
            }, 0).toFixed(1)} credits
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-sc-gray-400 italic">No courses scheduled</p>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => {
            const name = entry.display_name ?? entry.course_record?.course_name ?? "Unnamed course";
            const credits = entry.display_credits_planned ?? entry.course_record?.credits_earned ?? 0;
            const req = entry.student_requirement_id ? reqMap[entry.student_requirement_id] : null;
            const isVerified = entry.course_record?.verification_status === "verified";
            return (
              <div
                key={entry.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
                  isVerified ? "bg-sc-teal/5 border border-sc-teal/20" : "bg-sc-cream border border-sc-gray-100"
                )}
              >
                <span className="flex-1 font-medium text-sc-navy truncate">{name}</span>
                <span className="text-xs text-sc-gray-400 shrink-0">{Number(credits).toFixed(1)} cr</span>
                {req && (
                  <span className="text-xs text-sc-teal shrink-0 truncate max-w-[120px]">
                    {req.custom_name ?? "Req"}
                  </span>
                )}
                {entry.school_year_label && (
                  <span className="text-xs text-sc-gray-400 shrink-0">{entry.school_year_label}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
