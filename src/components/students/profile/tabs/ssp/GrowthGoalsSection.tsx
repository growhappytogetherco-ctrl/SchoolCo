"use client";

import { useState, useTransition } from "react";
import {
  Target, Plus, Pencil, Archive, ChevronDown, ChevronUp,
  CheckCircle, Clock, PauseCircle, Circle,
} from "lucide-react";
import {
  createGrowthGoal, updateGrowthGoal, archiveGrowthGoal,
  type GrowthGoal, type GoalCategory, type GoalPriority, type GoalStatus,
  type GrowthGoalPayload,
} from "@/app/actions/successPlanActions";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  initial:   GrowthGoal[];
  isAdmin:   boolean;
}

const CATEGORIES: { id: GoalCategory; label: string }[] = [
  { id: "academic",           label: "Academic"          },
  { id: "leadership",         label: "Leadership"        },
  { id: "behavior",           label: "Behavior"          },
  { id: "executive_function", label: "Executive Function"},
  { id: "social",             label: "Social"            },
  { id: "emotional",          label: "Emotional"         },
  { id: "independence",       label: "Independence"      },
  { id: "faith",              label: "Faith"             },
  { id: "communication",      label: "Communication"     },
  { id: "entrepreneurship",   label: "Entrepreneurship"  },
  { id: "other",              label: "Other"             },
];

const PRIORITY_CFG: Record<GoalPriority, { cls: string; label: string }> = {
  low:    { cls: "bg-sc-gray-100 text-sc-gray-600",        label: "Low"    },
  medium: { cls: "bg-sc-teal-50 text-sc-teal-700",         label: "Medium" },
  high:   { cls: "bg-sc-gold-100 text-sc-gold-700",        label: "High"   },
};

const STATUS_CFG: Record<GoalStatus, { cls: string; label: string; Icon: React.ElementType }> = {
  not_started: { cls: "text-sc-gray",       label: "Not Started", Icon: Circle        },
  in_progress: { cls: "text-sc-teal",       label: "In Progress", Icon: Clock         },
  completed:   { cls: "text-sc-green-600",  label: "Completed",   Icon: CheckCircle   },
  on_hold:     { cls: "text-sc-gold-700",   label: "On Hold",     Icon: PauseCircle   },
};

const BLANK_PAYLOAD: GrowthGoalPayload = {
  title: "", category: "academic", priority: "medium", status: "not_started",
  progress_pct: 0, baseline: null, target_outcome: null,
  success_indicators: null, staff_observations: null,
  assigned_staff_id: null, target_review_date: null, completed_date: null,
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function GoalForm({ payload, onChange, onSave, onCancel, saving, label }:{
  payload: GrowthGoalPayload;
  onChange: (p: Partial<GrowthGoalPayload>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-sc-teal-200 bg-sc-teal-50 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Goal Title *</label>
          <input value={payload.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="e.g. Improve reading fluency to grade level"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Category</label>
          <select value={payload.category} onChange={(e) => onChange({ category: e.target.value as GoalCategory })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white">
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Priority</label>
          <select value={payload.priority} onChange={(e) => onChange({ priority: e.target.value as GoalPriority })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Status</label>
          <select value={payload.status} onChange={(e) => onChange({ status: e.target.value as GoalStatus })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white">
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Progress ({payload.progress_pct}%)</label>
          <input type="range" min={0} max={100} step={5}
            value={payload.progress_pct}
            onChange={(e) => onChange({ progress_pct: Number(e.target.value) })}
            className="w-full accent-sc-teal" />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Target Review Date</label>
          <input type="date" value={payload.target_review_date ?? ""}
            onChange={(e) => onChange({ target_review_date: e.target.value || null })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        {payload.status === "completed" && (
          <div>
            <label className="text-label-sm font-semibold text-sc-navy block mb-1">Completed Date</label>
            <input type="date" value={payload.completed_date ?? ""}
              onChange={(e) => onChange({ completed_date: e.target.value || null })}
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Baseline</label>
          <textarea value={payload.baseline ?? ""}
            onChange={(e) => onChange({ baseline: e.target.value || null })}
            placeholder="Where is the student starting from?"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Target Outcome</label>
          <textarea value={payload.target_outcome ?? ""}
            onChange={(e) => onChange({ target_outcome: e.target.value || null })}
            placeholder="What does success look like?"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Success Indicators</label>
          <textarea value={payload.success_indicators ?? ""}
            onChange={(e) => onChange({ success_indicators: e.target.value || null })}
            placeholder="How will we measure progress?"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Staff Observations</label>
          <textarea value={payload.staff_observations ?? ""}
            onChange={(e) => onChange({ staff_observations: e.target.value || null })}
            placeholder="Observations and notes from staff"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50">
          Cancel
        </button>
        <button onClick={onSave} disabled={saving || !payload.title.trim()}
          className="rounded-lg bg-sc-teal px-4 py-2 text-label-sm text-white hover:bg-sc-teal-700 disabled:opacity-60">
          {saving ? "Saving…" : label}
        </button>
      </div>
    </div>
  );
}

function GoalCard({ goal, studentId, isAdmin, onUpdated }:{
  goal: GrowthGoal; studentId: string; isAdmin: boolean; onUpdated: (g: GrowthGoal) => void;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [editing, setEditing]       = useState(false);
  const [draft, setDraft]           = useState<GrowthGoalPayload>(BLANK_PAYLOAD);
  const [isPending, startTransition] = useTransition();
  const [error, setError]           = useState<string | null>(null);

  const { cls: statusCls, label: statusLabel, Icon: StatusIcon } = STATUS_CFG[goal.status];
  const { cls: priCls, label: priLabel } = PRIORITY_CFG[goal.priority];
  const catLabel = CATEGORIES.find((c) => c.id === goal.category)?.label ?? goal.category;

  function startEdit() {
    setDraft({
      title:              goal.title,
      category:           goal.category,
      priority:           goal.priority,
      status:             goal.status,
      progress_pct:       goal.progress_pct,
      baseline:           goal.baseline,
      target_outcome:     goal.target_outcome,
      success_indicators: goal.success_indicators,
      staff_observations: goal.staff_observations,
      assigned_staff_id:  goal.assigned_staff_id,
      target_review_date: goal.target_review_date,
      completed_date:     goal.completed_date,
    });
    setEditing(true);
  }

  function saveEdit() {
    startTransition(async () => {
      const r = await updateGrowthGoal(goal.id, studentId, draft);
      if (!r.success) { setError(r.error); return; }
      onUpdated({ ...goal, ...draft, updated_at: new Date().toISOString() });
      setEditing(false);
    });
  }

  function doArchive() {
    if (!confirm("Archive this goal? It will no longer appear in the active list.")) return;
    startTransition(async () => {
      await archiveGrowthGoal(goal.id, studentId);
      onUpdated({ ...goal, archived_at: new Date().toISOString() });
    });
  }

  return (
    <div className="rounded-xl border border-sc-gray-100 bg-white overflow-hidden">
      {/* Summary row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 shrink-0">
          <StatusIcon className={cn("size-5", statusCls)} />
        </div>
        <div className="flex-1 min-w-0">
          <button onClick={() => setExpanded((v) => !v)} className="text-left w-full">
            <p className="font-medium text-body-md text-sc-navy">{goal.title}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <span className={cn("rounded-full px-2 py-0.5 text-label-sm font-medium", priCls)}>{priLabel}</span>
              <span className="rounded-full bg-sc-gray-100 px-2 py-0.5 text-label-sm text-sc-gray">{catLabel}</span>
              <span className={cn("text-label-sm font-medium", statusCls)}>{statusLabel}</span>
            </div>
          </button>
          {/* Progress bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-sc-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-sc-teal transition-all" style={{ width: `${goal.progress_pct}%` }} />
            </div>
            <span className="text-label-sm text-sc-gray shrink-0">{goal.progress_pct}%</span>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={startEdit}
            className="rounded-lg border border-sc-gray-200 p-1.5 text-sc-gray hover:bg-sc-gray-50 transition-colors">
            <Pencil className="size-3.5" />
          </button>
          {isAdmin && (
            <button onClick={doArchive} disabled={isPending}
              className="rounded-lg border border-sc-gray-200 p-1.5 text-sc-gray hover:bg-sc-rose-50 hover:border-sc-rose-200 hover:text-sc-rose transition-colors">
              <Archive className="size-3.5" />
            </button>
          )}
          <button onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-sc-gray-200 p-1.5 text-sc-gray hover:bg-sc-gray-50">
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Detail expansion */}
      {expanded && !editing && (
        <div className="border-t border-sc-gray-100 px-4 py-3 space-y-2 bg-sc-gray-50">
          {[
            { label: "Baseline",            value: goal.baseline            },
            { label: "Target Outcome",      value: goal.target_outcome      },
            { label: "Success Indicators",  value: goal.success_indicators  },
            { label: "Staff Observations",  value: goal.staff_observations  },
          ].filter((r) => r.value).map((r) => (
            <div key={r.label}>
              <p className="text-label-sm font-semibold text-sc-navy">{r.label}</p>
              <p className="text-body-md text-sc-gray">{r.value}</p>
            </div>
          ))}
          {goal.target_review_date && (
            <p className="text-label-sm text-sc-gray">
              Review by: <span className="text-sc-navy font-medium">{fmtDate(goal.target_review_date)}</span>
            </p>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && (
        <div className="border-t border-sc-gray-100 p-4">
          {error && <p className="mb-2 text-label-sm text-sc-rose-700">{error}</p>}
          <GoalForm
            payload={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            onSave={saveEdit}
            onCancel={() => setEditing(false)}
            saving={isPending}
            label="Save Changes"
          />
        </div>
      )}
    </div>
  );
}

export function GrowthGoalsSection({ studentId, initial, isAdmin }: Props) {
  const [goals, setGoals]           = useState<GrowthGoal[]>(initial);
  const [adding, setAdding]         = useState(false);
  const [newDraft, setNewDraft]     = useState<GrowthGoalPayload>(BLANK_PAYLOAD);
  const [collapsed, setCollapsed]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter]         = useState<GoalStatus | "all">("all");

  function handleAdd() {
    startTransition(async () => {
      const r = await createGrowthGoal(studentId, newDraft);
      if (!r.success) { setError(r.error); return; }
      const now = new Date().toISOString();
      setGoals((g) => [{
        id: r.id, student_id: studentId, archived_at: null,
        created_at: now, updated_at: now, ...newDraft,
      }, ...g]);
      setNewDraft(BLANK_PAYLOAD);
      setAdding(false);
      setError(null);
    });
  }

  function handleUpdated(updated: GrowthGoal) {
    if (updated.archived_at) {
      setGoals((g) => g.filter((x) => x.id !== updated.id));
    } else {
      setGoals((g) => g.map((x) => x.id === updated.id ? updated : x));
    }
  }

  const visible = filter === "all" ? goals : goals.filter((g) => g.status === filter);
  const active  = goals.filter((g) => ["not_started","in_progress"].includes(g.status)).length;

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-sc-gray-100 bg-sc-gold-50">
        <button onClick={() => setCollapsed((v) => !v)} className="flex items-center gap-2.5">
          <Target className="size-4 text-sc-gold-700 shrink-0" />
          <div>
            <h3 className="font-serif text-heading-3 text-sc-navy">Growth Goals</h3>
            <p className="text-label-sm text-sc-gray mt-0.5">{active} active · {goals.length} total</p>
          </div>
          {collapsed ? <ChevronDown className="size-4 text-sc-gray ml-2" /> : <ChevronUp className="size-4 text-sc-gray ml-2" />}
        </button>
        <button onClick={() => { setAdding(true); setCollapsed(false); }}
          className="flex items-center gap-1.5 rounded-lg bg-sc-gold-600 px-3 py-1.5 text-label-sm text-white hover:bg-sc-gold-700 transition-colors">
          <Plus className="size-3.5" /> Add Goal
        </button>
      </div>

      {!collapsed && (
        <div className="p-5 space-y-4">
          {error && (
            <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{error}</p>
          )}

          {/* Status filter */}
          {goals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(["all", "not_started", "in_progress", "completed", "on_hold"] as const).map((s) => (
                <button key={s} onClick={() => setFilter(s)}
                  className={cn("rounded-full px-3 py-1 text-label-sm border transition-colors",
                    filter === s
                      ? "bg-sc-navy text-white border-sc-navy"
                      : "border-sc-gray-200 text-sc-gray hover:border-sc-navy hover:text-sc-navy"
                  )}>
                  {s === "all" ? "All" : STATUS_CFG[s as GoalStatus].label}
                </button>
              ))}
            </div>
          )}

          {/* Add form */}
          {adding && (
            <GoalForm
              payload={newDraft}
              onChange={(p) => setNewDraft((d) => ({ ...d, ...p }))}
              onSave={handleAdd}
              onCancel={() => { setAdding(false); setError(null); }}
              saving={isPending}
              label="Add Goal"
            />
          )}

          {visible.length === 0 && !adding && (
            <div className="text-center py-8 text-sc-gray">
              <Target className="size-8 mx-auto mb-2 text-sc-gray-300" />
              <p className="text-body-md font-medium text-sc-navy">
                {goals.length === 0 ? "No goals yet" : "No goals match this filter"}
              </p>
              {goals.length === 0 && (
                <p className="text-label-sm mt-1">Add the first growth goal for this student.</p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {visible.map((g) => (
              <GoalCard key={g.id} goal={g} studentId={studentId} isAdmin={isAdmin} onUpdated={handleUpdated} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
