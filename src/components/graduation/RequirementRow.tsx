"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type GraduationPlanEntry, type StudentGraduationRequirement, type ManualCredit } from "@/app/actions/graduationPlan";
import { SlotEntryRow } from "./SlotEntryRow";

type FullEntry = GraduationPlanEntry & {
  course_record: {
    course_name: string;
    subject_area: string | null;
    credits_earned: number | null;
    verification_status: string;
    completion_status: string;
    counts_toward_high_school_credit: boolean;
    school_year: string | null;
  } | null;
  enrollment: {
    status: string;
    counts_toward_high_school_credit: boolean;
    credits_attempted: number | null;
  } | null;
  manual_credits: ManualCredit[];
};

interface Props {
  requirement: StudentGraduationRequirement;
  entries: FullEntry[];
  earnedCredits: number;
  pct: number;
  planId: string;
  onAddCourse: () => void;
  onUpdate: () => void;
}

export function RequirementRow({ requirement, entries, earnedCredits, pct, planId, onAddCourse, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const met = pct >= 100;

  // Sort slot entries: primary by numeric suffix in slot_label (English 1→2→3→4),
  // secondary by sort_order. This handles DB rows where sort_order was set incorrectly.
  function slotLabelNum(label: string | null): number {
    if (!label) return 999;
    const m = label.match(/(\d+)(?:\s|$)/);
    return m ? parseInt(m[1]) : 999;
  }
  const slotEntries = entries.filter(e => e.slot_label != null).sort((a, b) => {
    const numDiff = slotLabelNum(a.slot_label) - slotLabelNum(b.slot_label);
    if (numDiff !== 0) return numDiff;
    return a.sort_order - b.sort_order;
  });
  const extraEntries = entries.filter(e => e.slot_label == null).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className={cn("rounded-xl border overflow-hidden", met ? "border-sc-teal/30 bg-sc-teal/5" : "border-sc-gray-100 bg-white")}>
      {/* Header row — click to expand */}
      <button
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-black/5 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        {met
          ? <CheckCircle2 className="size-4 text-sc-teal shrink-0" />
          : <div className="size-4 rounded-full border-2 border-sc-gray-200 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-label-sm font-medium text-sc-navy">
              {requirement.custom_name ?? `Requirement ${requirement.id.slice(0, 6)}`}
            </span>
            <span className="text-label-sm text-sc-gray-400">
              {earnedCredits.toFixed(1)} / {Number(requirement.credits_required).toFixed(1)} credits
            </span>
            {entries.length > 0 && (
              <span className="text-[10px] text-sc-gray-400">{entries.length} course{entries.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-sc-gray-100 overflow-hidden w-full max-w-xs">
            <div
              className={cn("h-full rounded-full transition-all", met ? "bg-sc-teal" : "bg-sc-teal-700")}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
        <span className="text-label-sm text-sc-gray-400 shrink-0">{pct}%</span>
        {expanded ? <ChevronUp className="size-4 text-sc-gray-400 shrink-0" /> : <ChevronDown className="size-4 text-sc-gray-400 shrink-0" />}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-sc-gray-100 px-3 pb-3 pt-2">
          {/* Column headers — only show on wider layouts */}
          <div className="hidden sm:flex items-center gap-2 mb-1 px-3">
            <span className="text-[10px] text-sc-gray-400 uppercase tracking-wide w-36 shrink-0">Slot / Course</span>
            <span className="text-[10px] text-sc-gray-400 uppercase tracking-wide flex-1">Actual Course Taken</span>
            <span className="text-[10px] text-sc-gray-400 uppercase tracking-wide w-10 text-right shrink-0" title="Earned credits for verified/completed courses; planned credits for all others">Cr</span>
            <span className="text-[10px] text-sc-gray-400 uppercase tracking-wide w-20 shrink-0">Status</span>
            <span className="text-[10px] text-sc-gray-400 uppercase tracking-wide w-12 shrink-0">Inst</span>
            <span className="text-[10px] text-sc-gray-400 uppercase tracking-wide w-16 shrink-0">Grade</span>
            <span className="w-16 shrink-0" />
          </div>

          {/* No entries yet */}
          {entries.length === 0 && (
            <p className="text-body-md text-sc-gray-400 text-sm py-2 px-3">No courses assigned yet. Click &ldquo;Add Course&rdquo; to begin.</p>
          )}

          {/* Pre-defined slot entries */}
          {slotEntries.map(entry => (
            <SlotEntryRow
              key={entry.id}
              entry={entry}
              planId={planId}
              onUpdate={onUpdate}
              isSlot={true}
            />
          ))}

          {/* Extra manually-added entries (no slot_label) */}
          {extraEntries.length > 0 && (
            <>
              {slotEntries.length > 0 && (
                <p className="text-[10px] text-sc-gray-400 uppercase tracking-wide mt-3 mb-1 px-3">Additional Courses</p>
              )}
              {extraEntries.map(entry => (
                <SlotEntryRow
                  key={entry.id}
                  entry={entry}
                  planId={planId}
                  onUpdate={onUpdate}
                  isSlot={false}
                />
              ))}
            </>
          )}

          <Button variant="outline" size="sm" className="w-full mt-2 h-8 text-xs" onClick={onAddCourse}>
            <Plus className="size-3 mr-1" />
            Add Course
          </Button>
        </div>
      )}
    </div>
  );
}
