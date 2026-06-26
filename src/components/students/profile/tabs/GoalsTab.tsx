"use client";

import { useEffect, useState } from "react";
import { Target, Plus, ChevronDown, ChevronUp, Check, Pencil, Trash2, Loader2, AlertCircle } from "lucide-react";
import {
  getStudentGoals, createGoal, updateGoal, deleteGoal,
  type Goal, type GoalCategory, type GoalPriority, type GoalStatus,
} from "@/app/actions/studentGoals";
import { cn } from "@/lib/utils";

const CATEGORIES: { id: GoalCategory; label: string }[] = [
  { id: "confidence",       label: "Confidence"        },
  { id: "perseverance",     label: "Perseverance"      },
  { id: "independence",     label: "Independence"      },
  { id: "critical_thinking",label: "Critical Thinking" },
  { id: "math",             label: "Math"              },
  { id: "reading",          label: "Reading"           },
  { id: "writing",          label: "Writing"           },
  { id: "leadership",       label: "Leadership"        },
  { id: "organization",     label: "Organization"      },
  { id: "social",           label: "Social"            },
  { id: "behavioral",       label: "Behavioral"        },
  { id: "health",           label: "Health"            },
  { id: "family",           label: "Family"            },
  { id: "other",            label: "Other"             },
];

const PRIORITY_CFG: Record<GoalPriority, { cls: string; label: string }> = {
  low:    { cls: "bg-sc-gray-100   text-sc-gray",             label: "Low"    },
  normal: { cls: "bg-sc-teal-50    text-sc-teal",             label: "Normal" },
  high:   { cls: "bg-sc-gold-100   text-sc-gold-700",         label: "High"   },
  urgent: { cls: "bg-sc-rose-50    text-sc-rose",             label: "Urgent" },
};

const STATUS_CFG: Record<GoalStatus, { cls: string; label: string }> = {
  active:   { cls: "border-sc-teal text-sc-teal",          label: "Active"   },
  achieved: { cls: "border-sc-green text-sc-green",         label: "Achieved" },
  paused:   { cls: "border-sc-gray text-sc-gray",           label: "Paused"   },
  dropped:  { cls: "border-sc-rose-300 text-sc-rose-400",   label: "Dropped"  },
};

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-sc-gray-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-sc-green" : "bg-sc-teal")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-label-sm text-sc-gray w-8 text-right">{pct}%</span>
    </div>
  );
}

interface FormState {
  goal_text: string;
  category: GoalCategory;
  priority: GoalPriority;
  status: GoalStatus;
  progress_pct: number;
  target_review_date: string;
  staff_observations: string;
  visibility: string;
}

const BLANK: FormState = {
  goal_text: "", category: "other", priority: "normal",
  status: "active", progress_pct: 0, target_review_date: "",
  staff_observations: "", visibility: "parent_visible",
};

export function GoalsTab({ studentId }: { studentId: string }) {
  const [goals, setGoals]         = useState<Goal[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<Goal | null>(null);
  const [form, setForm]           = useState<FormState>(BLANK);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GoalStatus | "all">("active");

  useEffect(() => {
    getStudentGoals(studentId).then((data) => { setGoals(data); setLoading(false); });
  }, [studentId]);

  function openNew() {
    setEditing(null);
    setForm(BLANK);
    setShowForm(true);
    setError(null);
  }

  function openEdit(goal: Goal) {
    setEditing(goal);
    setForm({
      goal_text:          goal.goal_text,
      category:           goal.category,
      priority:           goal.priority,
      status:             goal.status,
      progress_pct:       goal.progress_pct,
      target_review_date: goal.target_review_date ?? "",
      staff_observations: goal.staff_observations ?? "",
      visibility:         goal.visibility,
    });
    setShowForm(true);
    setError(null);
  }

  async function handleSave() {
    if (!form.goal_text.trim()) { setError("Goal text is required"); return; }
    setSaving(true);
    setError(null);

    const payload = {
      ...form,
      progress_pct:       form.progress_pct,
      target_review_date: form.target_review_date || null,
      staff_observations: form.staff_observations || null,
    };

    const res = editing
      ? await updateGoal(editing.id, studentId, payload)
      : await createGoal(studentId, payload);

    if (!res.success) { setError(res.error); setSaving(false); return; }

    // Refresh
    const updated = await getStudentGoals(studentId);
    setGoals(updated);
    setShowForm(false);
    setSaving(false);
  }

  async function handleDelete(goalId: string) {
    const res = await deleteGoal(goalId, studentId);
    if (res.success) setGoals((prev) => prev.filter((g) => g.id !== goalId));
  }

  async function quickProgress(goal: Goal, pct: number) {
    await updateGoal(goal.id, studentId, {
      progress_pct: pct,
      status: pct === 100 ? "achieved" : goal.status,
    });
    setGoals((prev) => prev.map((g) =>
      g.id === goal.id ? { ...g, progress_pct: pct, status: pct === 100 ? "achieved" : g.status } : g
    ));
  }

  const filtered = goals.filter((g) => statusFilter === "all" || g.status === statusFilter);
  const counts   = { active: 0, achieved: 0, paused: 0, dropped: 0 } as Record<string, number>;
  goals.forEach((g) => { counts[g.status] = (counts[g.status] ?? 0) + 1; });

  if (loading) return (
    <div className="space-y-3">
      {[1,2,3].map((i) => <div key={i} className="h-24 rounded-2xl border border-sc-gray-100 bg-white animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-heading-sm text-sc-navy font-semibold">Student Success Plan</h3>
          <p className="text-label-sm text-sc-gray mt-0.5">Family goals and progress tracking</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white font-medium hover:bg-sc-teal-700 transition-colors">
          <Plus className="size-4" /> Add Goal
        </button>
      </div>

      {/* Stats row */}
      {goals.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {(["active","achieved","paused","dropped"] as GoalStatus[]).map((s) => {
            const cfg = STATUS_CFG[s];
            return (
              <button key={s} onClick={() => setStatusFilter(s === statusFilter ? "all" : s)}
                className={cn(
                  "rounded-xl border p-3 text-center transition-all",
                  statusFilter === s ? "bg-sc-navy border-sc-navy text-white" : `bg-white border-sc-gray-100 hover:border-sc-navy`
                )}>
                <p className={cn("text-heading-sm font-bold", statusFilter === s ? "text-white" : cfg.cls.split(" ")[1])}>{counts[s] ?? 0}</p>
                <p className={cn("text-label-sm capitalize mt-0.5", statusFilter === s ? "text-sc-gray-200" : "text-sc-gray")}>{s}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm && (
        <div className="rounded-2xl border border-sc-teal-200 bg-sc-teal-50 p-5 space-y-4">
          <h4 className="text-label-md font-semibold text-sc-navy">{editing ? "Edit Goal" : "New Goal"}</h4>

          <div className="space-y-3">
            <div>
              <label className="text-label-sm font-medium text-sc-gray mb-1 block">Goal *</label>
              <textarea value={form.goal_text} onChange={(e) => setForm((f) => ({ ...f, goal_text: e.target.value }))}
                rows={2} placeholder="e.g. Increase reading comprehension by one grade level"
                className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-teal focus:outline-none resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-sm font-medium text-sc-gray mb-1 block">Category</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as GoalCategory }))}
                  className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:border-sc-teal focus:outline-none">
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-label-sm font-medium text-sc-gray mb-1 block">Priority</label>
                <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as GoalPriority }))}
                  className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:border-sc-teal focus:outline-none">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-sm font-medium text-sc-gray mb-1 block">Status</label>
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as GoalStatus }))}
                  className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:border-sc-teal focus:outline-none">
                  <option value="active">Active</option>
                  <option value="achieved">Achieved</option>
                  <option value="paused">Paused</option>
                  <option value="dropped">Dropped</option>
                </select>
              </div>
              <div>
                <label className="text-label-sm font-medium text-sc-gray mb-1 block">Review Date</label>
                <input type="date" value={form.target_review_date}
                  onChange={(e) => setForm((f) => ({ ...f, target_review_date: e.target.value }))}
                  className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy focus:border-sc-teal focus:outline-none" />
              </div>
            </div>

            <div>
              <label className="text-label-sm font-medium text-sc-gray mb-1 block">Progress: {form.progress_pct}%</label>
              <input type="range" min={0} max={100} step={5} value={form.progress_pct}
                onChange={(e) => setForm((f) => ({ ...f, progress_pct: parseInt(e.target.value) }))}
                className="w-full accent-sc-teal" />
            </div>

            <div>
              <label className="text-label-sm font-medium text-sc-gray mb-1 block">Staff Observations</label>
              <textarea value={form.staff_observations} onChange={(e) => setForm((f) => ({ ...f, staff_observations: e.target.value }))}
                rows={2} placeholder="Notes visible to staff…"
                className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-teal focus:outline-none resize-none" />
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-1.5 text-label-sm text-sc-rose">
              <AlertCircle className="size-4" /> {error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-sc-navy px-5 py-2 text-label-sm text-white font-medium disabled:opacity-50">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Save Changes" : "Add Goal"}
            </button>
            <button onClick={() => setShowForm(false)} className="text-label-sm text-sc-gray hover:text-sc-navy px-3 py-2">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Goal list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center space-y-3">
          <Target className="size-10 text-sc-gray-300 mx-auto" />
          <p className="text-body-md text-sc-gray-400">
            {goals.length === 0 ? "No goals yet. Add the family's first goal to get started." : "No goals match this filter."}
          </p>
          {goals.length === 0 && (
            <button onClick={openNew}
              className="inline-flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white font-medium">
              <Plus className="size-4" /> Add First Goal
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((goal) => {
            const priorCfg  = PRIORITY_CFG[goal.priority];
            const statusCfg = STATUS_CFG[goal.status];
            const isExpanded = expanded === goal.id;
            const isOverdue  = goal.target_review_date && new Date(goal.target_review_date) < new Date() && goal.status === "active";

            return (
              <div key={goal.id} className={cn(
                "rounded-2xl border bg-white shadow-card overflow-hidden",
                isOverdue ? "border-sc-gold-300" : "border-sc-gray-100"
              )}>
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {/* Status indicator */}
                    <div className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                      statusCfg.cls
                    )}>
                      {goal.status === "achieved" && <Check className="size-3.5 stroke-[3]" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-label-md font-semibold text-sc-navy">{goal.goal_text}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                        <span className={cn("rounded-full px-2 py-0.5 text-label-sm font-medium", priorCfg.cls)}>
                          {priorCfg.label}
                        </span>
                        <span className="text-label-sm text-sc-gray capitalize">{goal.category.replace(/_/g, " ")}</span>
                        {goal.target_review_date && (
                          <span className={cn("text-label-sm", isOverdue ? "text-sc-gold-600 font-medium" : "text-sc-gray")}>
                            Review: {new Date(goal.target_review_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            {isOverdue && " — Overdue"}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEdit(goal)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-teal-50 hover:text-sc-teal transition-colors">
                        <Pencil className="size-3.5" />
                      </button>
                      <button onClick={() => handleDelete(goal.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-rose-50 hover:text-sc-rose transition-colors">
                        <Trash2 className="size-3.5" />
                      </button>
                      <button onClick={() => setExpanded(isExpanded ? null : goal.id)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:text-sc-navy">
                        {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </button>
                    </div>
                  </div>

                  <ProgressBar pct={goal.progress_pct} />

                  {/* Quick progress buttons */}
                  {goal.status === "active" && (
                    <div className="flex gap-1.5">
                      {[25, 50, 75, 100].map((pct) => (
                        <button key={pct} onClick={() => quickProgress(goal, pct)}
                          className={cn(
                            "rounded-lg border px-2.5 py-1 text-label-sm font-medium transition-colors",
                            goal.progress_pct >= pct
                              ? "border-sc-teal bg-sc-teal-50 text-sc-teal"
                              : "border-sc-gray-200 text-sc-gray hover:border-sc-teal hover:text-sc-teal"
                          )}>
                          {pct}%
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-sc-gray-100 bg-sc-gray-50 px-4 py-3 space-y-2">
                    {goal.staff_observations && (
                      <div>
                        <p className="text-label-sm font-medium text-sc-gray">Staff Observations</p>
                        <p className="text-label-sm text-sc-navy mt-0.5">{goal.staff_observations}</p>
                      </div>
                    )}
                    {goal.creator_name && (
                      <p className="text-label-sm text-sc-gray">
                        Added by {goal.creator_name} · {new Date(goal.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 text-label-sm text-sc-gray">
                      <span>Visibility:</span>
                      <span className={cn("font-medium", goal.visibility === "parent_visible" ? "text-sc-teal" : "text-sc-gray")}>
                        {goal.visibility === "parent_visible" ? "Parent Visible" : goal.visibility === "admin_only" ? "Admin Only" : "Staff Only"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
