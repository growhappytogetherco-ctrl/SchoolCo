"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { removePlanEntry, type GraduationPlanEntry, type StudentGraduationRequirement, type ManualCredit } from "@/app/actions/graduationPlan";
import { ManualCreditForm } from "./ManualCreditForm";

type FullEntry = GraduationPlanEntry & {
  course_record: {
    course_name: string;
    credits_earned: number | null;
    verification_status: string;
    completion_status: string;
    school_year: string | null;
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

function entryDisplayName(entry: FullEntry): string {
  return entry.display_name ?? entry.course_record?.course_name ?? "Unnamed course";
}

function entryCredits(entry: FullEntry): number {
  if (entry.course_record) return entry.course_record.credits_earned ?? 0;
  const mc = entry.manual_credits.find(
    (m) => m.verification_status === "verified" && m.duplicate_status === "confirmed_unique" && !m.reconciled_course_record_id
  );
  return mc?.credits_claimed ?? entry.display_credits_planned ?? 0;
}

function entryStatusBadge(entry: FullEntry) {
  if (entry.course_record) {
    if (entry.course_record.verification_status === "verified" && entry.course_record.completion_status === "completed") {
      return <Badge className="bg-sc-teal/10 text-sc-teal border-sc-teal/20 text-xs">Verified</Badge>;
    }
    return <Badge variant="outline" className="text-xs">{entry.course_record.completion_status}</Badge>;
  }
  const mc = entry.manual_credits[0];
  if (!mc) return <Badge variant="outline" className="text-xs">Manual</Badge>;
  if (mc.duplicate_status === "not_reviewed") return <Badge className="bg-sc-gold-50 text-sc-gold-700 border-sc-gold-300 text-xs">Pending review</Badge>;
  if (mc.duplicate_status === "confirmed_duplicate") return <Badge className="bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200 text-xs">Duplicate</Badge>;
  if (mc.verification_status === "verified") return <Badge className="bg-sc-teal/10 text-sc-teal border-sc-teal/20 text-xs">Verified</Badge>;
  return <Badge variant="outline" className="text-xs">Unverified</Badge>;
}

export function RequirementRow({ requirement, entries, earnedCredits, pct, planId, onAddCourse, onUpdate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showManualForm, setShowManualForm] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const met = pct >= 100;

  async function handleRemove(entryId: string) {
    startTransition(async () => {
      await removePlanEntry(planId, entryId);
      onUpdate();
    });
  }

  return (
    <div className={cn("rounded-xl border overflow-hidden", met ? "border-sc-teal/30 bg-sc-teal/5" : "border-sc-gray-100 bg-white")}>
      <button
        className="w-full flex items-center gap-3 p-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {met
          ? <CheckCircle2 className="size-4 text-sc-teal shrink-0" />
          : <div className="size-4 rounded-full border-2 border-sc-gray-200 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-label-sm font-medium text-sc-navy">
              {requirement.custom_name ?? `Requirement ${requirement.id.slice(0, 6)}`}
            </span>
            <span className="text-label-sm text-sc-gray-400">
              {earnedCredits.toFixed(1)} / {Number(requirement.credits_required).toFixed(1)} credits
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-sc-gray-100 overflow-hidden w-full max-w-xs">
            <div
              className={cn("h-full rounded-full", met ? "bg-sc-teal" : "bg-sc-teal-700")}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>
        <span className="text-label-sm text-sc-gray-400 shrink-0">{pct}%</span>
        {expanded ? <ChevronUp className="size-4 text-sc-gray-400 shrink-0" /> : <ChevronDown className="size-4 text-sc-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-sc-gray-100 p-3 space-y-2">
          {entries.length === 0 && (
            <p className="text-body-md text-sc-gray-400 text-sm">No courses assigned yet.</p>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2 group">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-body-md text-sc-navy truncate">{entryDisplayName(entry)}</span>
                <span className="text-label-sm text-sc-gray-400 shrink-0">{entryCredits(entry).toFixed(1)} cr</span>
                {entryStatusBadge(entry)}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {entry.course_record === null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowManualForm(showManualForm === entry.id ? null : entry.id)}
                  >
                    Manual credit
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-sc-rose-700 hover:text-sc-rose-700"
                  disabled={isPending}
                  onClick={() => handleRemove(entry.id)}
                >
                  {isPending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                </Button>
              </div>
            </div>
          ))}

          {showManualForm && (
            <ManualCreditForm
              planId={planId}
              entryId={showManualForm}
              onSuccess={() => { setShowManualForm(null); onUpdate(); }}
              onCancel={() => setShowManualForm(null)}
            />
          )}

          <Button variant="outline" size="sm" className="w-full mt-1" onClick={onAddCourse}>
            <Plus className="size-3 mr-1" />
            Add Course
          </Button>
        </div>
      )}
    </div>
  );
}
