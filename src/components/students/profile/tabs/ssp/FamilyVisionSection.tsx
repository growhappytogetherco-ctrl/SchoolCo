"use client";

import { useState, useTransition } from "react";
import { Heart, Pencil, Save, X, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { getFamilyVision, upsertFamilyVision, type FamilyVision } from "@/app/actions/successPlanActions";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  initial:   FamilyVision | null;
  isAdmin:   boolean;
}

const FIELDS: { key: keyof Pick<FamilyVision,
  "family_vision_summary"|"why_rla"|"parent_priorities"|"family_concerns"|"parent_hopes"|"teacher_initial_observations">;
  label: string; placeholder: string }[] = [
  { key: "family_vision_summary",         label: "Family Vision",                    placeholder: "What is the family's overarching vision for their child's education?" },
  { key: "why_rla",                        label: "Why RLA?",                         placeholder: "Why did the family choose this program?" },
  { key: "parent_priorities",             label: "Parent Priorities",                placeholder: "What are the parents' top priorities for this school year?" },
  { key: "family_concerns",               label: "Family Concerns",                  placeholder: "Are there any concerns the family has shared?" },
  { key: "parent_hopes",                  label: "Parent Hopes",                     placeholder: "What does the family hope their child accomplishes this year?" },
  { key: "teacher_initial_observations",  label: "Teacher Initial Observations",     placeholder: "Initial observations from the teacher or staff at intake." },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function FamilyVisionSection({ studentId, initial, isAdmin }: Props) {
  const [vision, setVision]         = useState<FamilyVision | null>(initial);
  const [editing, setEditing]       = useState(false);
  const [collapsed, setCollapsed]   = useState(false);
  const [draft, setDraft]           = useState<Record<string, string>>({});
  const [error, setError]           = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit() {
    const d: Record<string, string> = {};
    FIELDS.forEach((f) => { d[f.key] = vision?.[f.key] ?? ""; });
    setDraft(d);
    setEditing(true);
    setError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  function save() {
    startTransition(async () => {
      const payload: Record<string, string | null> = {};
      FIELDS.forEach((f) => { payload[f.key] = draft[f.key] || null; });
      const result = await upsertFamilyVision(studentId, payload as Parameters<typeof upsertFamilyVision>[1]);
      if (!result.success) { setError(result.error); return; }
      const fresh = await getFamilyVision(studentId);
      setVision(fresh);
      setEditing(false);
    });
  }

  function markReviewed() {
    startTransition(async () => {
      await upsertFamilyVision(studentId, { last_reviewed_at: new Date().toISOString() });
      const fresh = await getFamilyVision(studentId);
      setVision(fresh);
    });
  }

  const isEmpty = !vision || FIELDS.every((f) => !vision[f.key]);

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-sc-gray-100 bg-sc-teal-50">
        <button onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2.5 text-left">
          <Heart className="size-4 text-sc-teal shrink-0" />
          <div>
            <h3 className="font-serif text-heading-3 text-sc-navy">Family Vision</h3>
            <p className="text-label-sm text-sc-gray mt-0.5">
              Last reviewed: {fmtDate(vision?.last_reviewed_at ?? null)}
            </p>
          </div>
          {collapsed ? <ChevronDown className="size-4 text-sc-gray ml-2" /> : <ChevronUp className="size-4 text-sc-gray ml-2" />}
        </button>
        <div className="flex items-center gap-2">
          {isAdmin && vision && !editing && (
            <button onClick={markReviewed} disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg border border-sc-teal-300 px-3 py-1.5 text-label-sm text-sc-teal hover:bg-sc-teal-100 transition-colors disabled:opacity-50">
              <RefreshCw className="size-3.5" /> Mark Reviewed
            </button>
          )}
          {!editing ? (
            <button onClick={startEdit}
              className="flex items-center gap-1.5 rounded-lg bg-sc-teal px-3 py-1.5 text-label-sm text-white hover:bg-sc-teal-700 transition-colors">
              <Pencil className="size-3.5" /> {isEmpty ? "Add" : "Edit"}
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={cancelEdit}
                className="flex items-center gap-1 rounded-lg border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-gray hover:bg-sc-gray-50">
                <X className="size-3.5" /> Cancel
              </button>
              <button onClick={save} disabled={isPending}
                className="flex items-center gap-1 rounded-lg bg-sc-teal px-3 py-1.5 text-label-sm text-white hover:bg-sc-teal-700 disabled:opacity-60">
                <Save className="size-3.5" /> {isPending ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-5 space-y-5">
          {error && (
            <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{error}</p>
          )}

          {isEmpty && !editing ? (
            <div className="text-center py-8 text-sc-gray">
              <Heart className="size-8 mx-auto mb-2 text-sc-gray-300" />
              <p className="text-body-md font-medium text-sc-navy">No Family Vision yet</p>
              <p className="text-label-sm mt-1">Add the family&apos;s vision, priorities, and hopes for this student.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {FIELDS.map((f) => (
                <div key={f.key} className={cn(
                  f.key === "family_vision_summary" || f.key === "teacher_initial_observations"
                    ? "sm:col-span-2" : ""
                )}>
                  <p className="text-label-sm font-semibold text-sc-navy mb-1">{f.label}</p>
                  {editing ? (
                    <textarea
                      value={draft[f.key] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      rows={3}
                      className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-body-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none"
                    />
                  ) : (
                    <p className={cn("text-body-md", vision?.[f.key] ? "text-sc-navy" : "text-sc-gray italic")}>
                      {vision?.[f.key] ?? "Not yet recorded"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
