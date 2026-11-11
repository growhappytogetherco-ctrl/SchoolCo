"use client";

import { useState, useTransition } from "react";
import { Pencil, X, Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  updatePlanEntry,
  removePlanEntry,
  type GraduationPlanEntry,
  type ManualCredit,
} from "@/app/actions/graduationPlan";
import { ManualCreditReviewPanel } from "./ManualCreditReviewPanel";
import { ManualCreditForm } from "./ManualCreditForm";

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
  entry: FullEntry;
  planId: string;
  onUpdate: () => void;
  isSlot?: boolean; // true = pre-defined slot; false = manually added extra
}

function inferStatus(entry: FullEntry): "Verified" | "In Progress" | "Completed" | "Pending" | "Duplicate" | "Planned" {
  if (entry.course_record) {
    if (entry.course_record.verification_status === "verified" && entry.course_record.completion_status === "completed") return "Verified";
    if (["in_progress", "enrolled"].includes(entry.course_record.completion_status)) return "In Progress";
    if (entry.course_record.completion_status === "completed") return "Completed";
    return "Planned";
  }
  const mc = entry.manual_credits[0];
  if (mc) {
    if (mc.duplicate_status === "confirmed_duplicate") return "Duplicate";
    if (mc.verification_status === "verified" && mc.duplicate_status === "confirmed_unique") return "Verified";
    return "Pending";
  }
  if (entry.entry_status === "in_progress") return "In Progress";
  if (entry.entry_status === "completed") return "Completed";
  return "Planned";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Verified") return <Badge className="bg-sc-teal/10 text-sc-teal border-sc-teal/20 text-[10px] px-1.5 py-0 shrink-0">Verified</Badge>;
  if (status === "In Progress") return <Badge className="bg-sc-teal/5 text-sc-teal-700 border-sc-teal/20 text-[10px] px-1.5 py-0 shrink-0">In Progress</Badge>;
  if (status === "Completed") return <Badge className="bg-sc-gold-50 text-sc-gold-700 border-sc-gold-300 text-[10px] px-1.5 py-0 shrink-0">Completed</Badge>;
  if (status === "Pending") return <Badge className="bg-sc-gold-50 text-sc-gold-700 border-sc-gold-300 text-[10px] px-1.5 py-0 shrink-0">Pending</Badge>;
  if (status === "Duplicate") return <Badge className="bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200 text-[10px] px-1.5 py-0 shrink-0">Duplicate</Badge>;
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 text-sc-gray-400">Planned</Badge>;
}

const INST_OPTIONS = ["", "RLA", "REC", "COL", "other"] as const;
const GRADE_OPTIONS = [
  { value: "", label: "—" },
  { value: "pre_9th", label: "Pre-9th" },
  { value: "9th", label: "9th" },
  { value: "10th", label: "10th" },
  { value: "11th", label: "11th" },
  { value: "12th", label: "12th" },
];
const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "verified", label: "Verified" },
  { value: "withdrawn", label: "Withdrawn" },
];

export function SlotEntryRow({ entry, planId, onUpdate, isSlot = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Edit form state
  const [editCourseName, setEditCourseName] = useState(entry.display_name ?? "");
  const [editSlotLabel, setEditSlotLabel] = useState(entry.slot_label ?? "");
  const [editCredits, setEditCredits] = useState(String(entry.display_credits_planned ?? ""));
  const [editStatus, setEditStatus] = useState(entry.entry_status ?? "planned");
  const [editInst, setEditInst] = useState(entry.institution_code ?? "");
  const [editInstOverride, setEditInstOverride] = useState(entry.institution_name_override ?? "");
  const [editGrade, setEditGrade] = useState(entry.grade_level_slot ?? "");
  const [editSchoolYear, setEditSchoolYear] = useState(entry.school_year_label ?? "");
  const [editNotes, setEditNotes] = useState(entry.notes ?? "");

  function startEdit() {
    setEditCourseName(entry.display_name ?? "");
    setEditSlotLabel(entry.slot_label ?? "");
    setEditCredits(String(entry.display_credits_planned ?? ""));
    setEditStatus(entry.entry_status ?? "planned");
    setEditInst(entry.institution_code ?? "");
    setEditInstOverride(entry.institution_name_override ?? "");
    setEditGrade(entry.grade_level_slot ?? "");
    setEditSchoolYear(entry.school_year_label ?? "");
    setEditNotes(entry.notes ?? "");
    setEditing(true);
  }

  function handleSave() {
    startTransition(async () => {
      const cr = parseFloat(editCredits);
      await updatePlanEntry(planId, entry.id, {
        slot_label: editSlotLabel || null,
        display_name: editCourseName || null,
        display_credits_planned: isNaN(cr) ? null : cr,
        entry_status: editStatus,
        institution_code: (editInst as "RLA" | "REC" | "COL" | "other" | "") || null,
        institution_name_override: editInstOverride || null,
        grade_level_slot: editGrade || null,
        school_year_label: editSchoolYear || null,
        notes: editNotes || null,
      });
      setEditing(false);
      onUpdate();
    });
  }

  function handleRemove() {
    if (!window.confirm("Remove this course from the plan?")) return;
    startTransition(async () => {
      await removePlanEntry(planId, entry.id);
      onUpdate();
    });
  }

  const courseName = entry.display_name ?? entry.course_record?.course_name ?? null;
  const credits = entry.display_credits_planned ?? entry.course_record?.credits_earned ?? 0;
  const status = inferStatus(entry);
  const hasManualCredits = entry.manual_credits.length > 0;
  const isLinked = !!entry.course_record_id || !!entry.enrollment_id;

  if (editing) {
    return (
      <div className="rounded-lg border border-sc-teal/30 bg-sc-teal/5 p-3 space-y-3 my-1">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="text-[10px] text-sc-gray-400 uppercase tracking-wide mb-1 block">Slot / Requirement</label>
            <Input
              value={editSlotLabel}
              onChange={e => setEditSlotLabel(e.target.value)}
              placeholder="e.g. English 4"
              className="h-7 text-xs"
            />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-sc-gray-400 uppercase tracking-wide mb-1 block">Actual Course Taken</label>
            <Input
              value={editCourseName}
              onChange={e => setEditCourseName(e.target.value)}
              placeholder={isLinked ? entry.course_record?.course_name ?? "(from Academic History)" : "Enter course name…"}
              className="h-7 text-xs"
            />
            {isLinked && (
              <p className="text-[10px] text-sc-gray-400 mt-0.5">
                Linked to Academic History — editing this overrides how the course appears in the planner and printed checklist only. The source record is unchanged.
                {!editCourseName && entry.course_record?.course_name && (
                  <> Leave blank to use source name: <em>{entry.course_record.course_name}</em>.</>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <label className="text-[10px] text-sc-gray-400 uppercase tracking-wide mb-1 block">Credits</label>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={editCredits}
              onChange={e => setEditCredits(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-sc-gray-400 uppercase tracking-wide mb-1 block">Status</label>
            <select
              value={editStatus}
              onChange={e => setEditStatus(e.target.value)}
              className="h-7 text-xs w-full border border-input rounded-md px-2 bg-background"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-sc-gray-400 uppercase tracking-wide mb-1 block">Institution</label>
            <select
              value={editInst}
              onChange={e => setEditInst(e.target.value)}
              className="h-7 text-xs w-full border border-input rounded-md px-2 bg-background"
            >
              {INST_OPTIONS.map(o => <option key={o} value={o}>{o || "—"}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-sc-gray-400 uppercase tracking-wide mb-1 block">Grade Level</label>
            <select
              value={editGrade}
              onChange={e => setEditGrade(e.target.value)}
              className="h-7 text-xs w-full border border-input rounded-md px-2 bg-background"
            >
              {GRADE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {editInst === "COL" && (
          <div>
            <label className="text-[10px] text-sc-gray-400 uppercase tracking-wide mb-1 block">College / Institution Name</label>
            <Input
              value={editInstOverride}
              onChange={e => setEditInstOverride(e.target.value)}
              placeholder="e.g. Valencia College"
              className="h-7 text-xs"
            />
          </div>
        )}
        <div>
          <label className="text-[10px] text-sc-gray-400 uppercase tracking-wide mb-1 block">Notes</label>
          <Input
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            placeholder="Optional notes…"
            className="h-7 text-xs"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2 className="size-3 mr-1 animate-spin" /> : <Check className="size-3 mr-1" />}
            Save
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border py-2 px-3 my-1 bg-white", hasManualCredits ? "border-sc-gray-200" : "border-sc-gray-100")}>
      {/* Main row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Slot label */}
        <span className={cn(
          "text-xs font-semibold shrink-0 w-36",
          isSlot ? "text-sc-navy" : "text-sc-gray"
        )}>
          {entry.slot_label ?? "—"}
        </span>

        {/* Actual course name */}
        <span className={cn("flex-1 text-sm min-w-0", courseName ? "text-sc-navy" : "text-sc-gray-400 italic")}>
          {courseName ?? "Enter course name…"}
        </span>

        {/* Credits */}
        <span className="text-xs text-sc-gray w-10 text-right shrink-0">
          {credits > 0 ? `${Number(credits).toFixed(1)} cr` : ""}
        </span>

        {/* Status */}
        <StatusBadge status={status} />

        {/* Institution */}
        {entry.institution_code && (
          <span className="text-[10px] text-sc-gray-400 shrink-0">{entry.institution_code}</span>
        )}

        {/* Grade */}
        {entry.grade_level_slot && (
          <span className="text-[10px] text-sc-gray-400 shrink-0">{entry.grade_level_slot.replace("_", " ")}</span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button
            onClick={startEdit}
            className="p-1 text-sc-gray-400 hover:text-sc-navy rounded"
            title={isLinked ? "Edit planner fields" : "Edit course"}
          >
            <Pencil className="size-3" />
          </button>
          {/* Add manual credit claim (only for entries without a linked course record) */}
          {!entry.course_record_id && !entry.enrollment_id && (
            <button
              onClick={() => setShowManualForm(v => !v)}
              className="text-[10px] text-sc-teal hover:underline px-1"
              title="Add manual credit claim"
            >
              {showManualForm ? "Close" : "+ Claim"}
            </button>
          )}
          <button
            onClick={handleRemove}
            disabled={isPending}
            className="p-1 text-sc-gray-400 hover:text-sc-rose-700 rounded"
            title="Remove course"
          >
            {isPending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
          </button>
        </div>
      </div>

      {/* Notes */}
      {entry.notes && (
        <p className="text-[10px] text-sc-gray-400 mt-1 ml-36">{entry.notes}</p>
      )}

      {/* Institution override for COL */}
      {entry.institution_code === "COL" && entry.institution_name_override && (
        <p className="text-[10px] text-sc-gray-400 mt-0.5 ml-36">{entry.institution_name_override}</p>
      )}

      {/* Manual credit claim form */}
      {showManualForm && (
        <div className="mt-2">
          <ManualCreditForm
            planId={planId}
            entryId={entry.id}
            onSuccess={() => { setShowManualForm(false); onUpdate(); }}
            onCancel={() => setShowManualForm(false)}
          />
        </div>
      )}

      {/* Manual credit review panel */}
      {hasManualCredits && (
        <div className="mt-2">
          <ManualCreditReviewPanel credits={entry.manual_credits} onUpdate={onUpdate} />
        </div>
      )}
    </div>
  );
}
