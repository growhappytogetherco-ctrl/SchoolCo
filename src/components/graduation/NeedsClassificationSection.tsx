"use client";

import { useState, useTransition } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { updatePlanEntry, type GraduationPlanEntry, type StudentGraduationRequirement, type ManualCredit } from "@/app/actions/graduationPlan";

type FullEntry = GraduationPlanEntry & {
  course_record: { course_name: string; credits_earned: number | null } | null;
  manual_credits: ManualCredit[];
};

interface Props {
  planId: string;
  entries: FullEntry[];
  requirements: StudentGraduationRequirement[];
  onUpdate: () => void;
}

export function NeedsClassificationSection({ planId, entries, requirements, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [assigning, setAssigning] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  async function handleAssign(entryId: string) {
    const reqId = assigning[entryId];
    if (!reqId) return;
    startTransition(async () => {
      await updatePlanEntry(planId, entryId, { student_requirement_id: reqId });
      onUpdate();
    });
  }

  return (
    <div className="rounded-2xl bg-sc-gold-50 border border-sc-gold-300 shadow-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-sc-gold-700 shrink-0" />
          <span className="text-label-md font-semibold text-sc-gold-800">
            Needs Classification ({entries.length})
          </span>
        </div>
        {expanded ? <ChevronUp className="size-4 text-sc-gold-700" /> : <ChevronDown className="size-4 text-sc-gold-700" />}
      </button>

      {expanded && (
        <div className="border-t border-sc-gold-300 divide-y divide-sc-gold-200">
          {entries.map((entry) => {
            const name = entry.display_name ?? entry.course_record?.course_name ?? "Unnamed course";
            const credits = entry.display_credits_planned ?? entry.course_record?.credits_earned ?? 0;
            return (
              <div key={entry.id} className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <p className="text-body-md font-medium text-sc-navy truncate">{name}</p>
                  <p className="text-label-sm text-sc-gray-400">{credits} credit{credits !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    className="w-[200px]"
                    value={assigning[entry.id] ?? ""}
                    placeholder="Assign to requirement…"
                    onChange={(e) => setAssigning((a) => ({ ...a, [entry.id]: e.target.value }))}
                  >
                    {requirements.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.custom_name ?? `Requirement ${r.id.slice(0, 6)}`}
                      </option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    disabled={!assigning[entry.id] || isPending}
                    onClick={() => handleAssign(entry.id)}
                  >
                    {isPending ? <Loader2 className="size-3 animate-spin" /> : "Assign"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
