"use client";

import { useState, useTransition } from "react";
import { ShieldAlert, Plus, Pencil, Trash2, Pin, ChevronDown, ChevronUp, Lock } from "lucide-react";
import {
  createSupportStrategy, updateSupportStrategy, deleteSupportStrategy,
  type SupportStrategy, type StrategyCategory, type StrategyPriority,
  type StrategyVisible, type SupportStrategyPayload,
} from "@/app/actions/successPlanActions";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  initial:   SupportStrategy[];
  isAdmin:   boolean;
}

const CATEGORIES: { id: StrategyCategory; label: string; emoji: string }[] = [
  { id: "instruction",   label: "Instruction",   emoji: "📚" },
  { id: "behavior",      label: "Behavior",      emoji: "🧠" },
  { id: "environment",   label: "Environment",   emoji: "🌿" },
  { id: "medical",       label: "Medical",       emoji: "💊" },
  { id: "social",        label: "Social",        emoji: "👥" },
  { id: "communication", label: "Communication", emoji: "💬" },
  { id: "sensory",       label: "Sensory",       emoji: "🎯" },
  { id: "transition",    label: "Transition",    emoji: "🔄" },
  { id: "safety",        label: "Safety",        emoji: "⚠️" },
  { id: "general",       label: "General",       emoji: "📌" },
];

const PRIORITY_CFG: Record<StrategyPriority, { cls: string; badge: string; label: string }> = {
  normal:   { cls: "border-sc-gray-200",   badge: "bg-sc-gray-100 text-sc-gray-600",       label: "Normal"   },
  high:     { cls: "border-sc-gold-300",   badge: "bg-sc-gold-100 text-sc-gold-700",       label: "High"     },
  critical: { cls: "border-sc-rose-300",   badge: "bg-sc-rose-50 text-sc-rose-700",        label: "Critical" },
};

const BLANK: SupportStrategyPayload = {
  title: "", description: null, category: "general",
  priority: "normal", is_pinned: false, visible_to: "staff", expires_at: null,
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StrategyForm({ payload, onChange, onSave, onCancel, saving, label, isAdmin }:{
  payload: SupportStrategyPayload;
  onChange: (p: Partial<SupportStrategyPayload>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  label: string;
  isAdmin: boolean;
}) {
  return (
    <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50/40 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Title *</label>
          <input value={payload.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="e.g. Provide written instructions alongside verbal ones"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Category</label>
          <select value={payload.category} onChange={(e) => onChange({ category: e.target.value as StrategyCategory })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white">
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Priority</label>
          <select value={payload.priority} onChange={(e) => onChange({ priority: e.target.value as StrategyPriority })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white">
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Description</label>
          <textarea value={payload.description ?? ""}
            onChange={(e) => onChange({ description: e.target.value || null })}
            placeholder="Detailed guidance for implementing this strategy"
            rows={3}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Expiration Date</label>
          <input type="date" value={payload.expires_at ?? ""}
            onChange={(e) => onChange({ expires_at: e.target.value || null })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Visibility</label>
          <select value={payload.visible_to} onChange={(e) => onChange({ visible_to: e.target.value as StrategyVisible })}
            disabled={!isAdmin}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white disabled:bg-sc-gray-50 disabled:text-sc-gray">
            <option value="staff">All Staff</option>
            {isAdmin && <option value="admin_only">Admin Only</option>}
          </select>
        </div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={payload.is_pinned}
              onChange={(e) => onChange({ is_pinned: e.target.checked })}
              className="rounded accent-sc-teal" />
            <span className="text-label-sm text-sc-navy font-semibold">Pin to header safety banner</span>
          </label>
          {payload.is_pinned && payload.priority === "normal" && (
            <p className="text-label-sm text-sc-gold-700">⚠️ Pinned strategies should have High or Critical priority</p>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel}
          className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50">
          Cancel
        </button>
        <button onClick={onSave} disabled={saving || !payload.title.trim()}
          className="rounded-lg bg-sc-rose px-4 py-2 text-label-sm text-white hover:bg-sc-rose-700 disabled:opacity-60">
          {saving ? "Saving…" : label}
        </button>
      </div>
    </div>
  );
}

function StrategyCard({ strategy, studentId, isAdmin, onUpdated, onDeleted }:{
  strategy: SupportStrategy; studentId: string; isAdmin: boolean;
  onUpdated: (s: SupportStrategy) => void; onDeleted: (id: string) => void;
}) {
  const [editing, setEditing]        = useState(false);
  const [draft, setDraft]            = useState<SupportStrategyPayload>(BLANK);
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  const cat = CATEGORIES.find((c) => c.id === strategy.category);
  const pri = PRIORITY_CFG[strategy.priority];

  function startEdit() {
    setDraft({
      title:       strategy.title,
      description: strategy.description,
      category:    strategy.category,
      priority:    strategy.priority,
      is_pinned:   strategy.is_pinned,
      visible_to:  strategy.visible_to,
      expires_at:  strategy.expires_at,
    });
    setEditing(true);
  }

  function saveEdit() {
    startTransition(async () => {
      const r = await updateSupportStrategy(strategy.id, studentId, draft);
      if (!r.success) { setError(r.error); return; }
      onUpdated({ ...strategy, ...draft, updated_at: new Date().toISOString() });
      setEditing(false);
    });
  }

  function doDelete() {
    if (!confirm("Delete this support strategy permanently?")) return;
    startTransition(async () => {
      await deleteSupportStrategy(strategy.id, studentId);
      onDeleted(strategy.id);
    });
  }

  const isExpired = strategy.expires_at && new Date(strategy.expires_at) < new Date();

  return (
    <div className={cn("rounded-xl border bg-white", pri.cls, isExpired ? "opacity-60" : "")}>
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="text-lg shrink-0 mt-0.5">{cat?.emoji ?? "📌"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-body-md text-sc-navy">{strategy.title}</p>
            {strategy.is_pinned && (
              <span title="Pinned to safety banner"><Pin className="size-3.5 text-sc-rose fill-sc-rose shrink-0" /></span>
            )}
            {strategy.visible_to === "admin_only" && (
              <span title="Admin only"><Lock className="size-3.5 text-sc-gray shrink-0" /></span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <span className={cn("rounded-full px-2 py-0.5 text-label-sm font-medium", pri.badge)}>
              {pri.label}
            </span>
            <span className="rounded-full bg-sc-gray-100 px-2 py-0.5 text-label-sm text-sc-gray">
              {cat?.label ?? strategy.category}
            </span>
            {strategy.expires_at && (
              <span className={cn("text-label-sm", isExpired ? "text-sc-rose-700" : "text-sc-gray")}>
                {isExpired ? "Expired" : `Expires ${fmtDate(strategy.expires_at)}`}
              </span>
            )}
          </div>
          {strategy.description && (
            <p className="text-body-md text-sc-gray mt-1.5">{strategy.description}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={startEdit}
            className="rounded-lg border border-sc-gray-200 p-1.5 text-sc-gray hover:bg-sc-gray-50 transition-colors">
            <Pencil className="size-3.5" />
          </button>
          {isAdmin && (
            <button onClick={doDelete} disabled={isPending}
              className="rounded-lg border border-sc-gray-200 p-1.5 text-sc-gray hover:bg-sc-rose-50 hover:border-sc-rose-200 hover:text-sc-rose transition-colors">
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="border-t border-sc-gray-100 p-4">
          {error && <p className="mb-2 text-label-sm text-sc-rose-700">{error}</p>}
          <StrategyForm
            payload={draft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            onSave={saveEdit}
            onCancel={() => setEditing(false)}
            saving={isPending}
            label="Save Changes"
            isAdmin={isAdmin}
          />
        </div>
      )}
    </div>
  );
}

export function SupportStrategiesSection({ studentId, initial, isAdmin }: Props) {
  const [strategies, setStrategies]  = useState<SupportStrategy[]>(initial);
  const [adding, setAdding]          = useState(false);
  const [newDraft, setNewDraft]      = useState<SupportStrategyPayload>(BLANK);
  const [collapsed, setCollapsed]    = useState(false);
  const [error, setError]            = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter]          = useState<StrategyPriority | "all">("all");

  function handleAdd() {
    startTransition(async () => {
      const r = await createSupportStrategy(studentId, newDraft);
      if (!r.success) { setError(r.error); return; }
      const now = new Date().toISOString();
      setStrategies((s) => [{
        id: r.id, student_id: studentId,
        created_at: now, updated_at: now, created_by: null, last_updated_by: null,
        ...newDraft,
      }, ...s]);
      setNewDraft(BLANK);
      setAdding(false);
      setError(null);
    });
  }

  const visible = filter === "all" ? strategies : strategies.filter((s) => s.priority === filter);
  const pinned  = strategies.filter((s) => s.is_pinned).length;

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-sc-gray-100 bg-sc-rose-50">
        <button onClick={() => setCollapsed((v) => !v)} className="flex items-center gap-2.5">
          <ShieldAlert className="size-4 text-sc-rose shrink-0" />
          <div>
            <h3 className="font-serif text-heading-3 text-sc-navy">Support Strategies</h3>
            <p className="text-label-sm text-sc-gray mt-0.5">
              {strategies.length} total · {pinned} pinned to banner
            </p>
          </div>
          {collapsed ? <ChevronDown className="size-4 text-sc-gray ml-2" /> : <ChevronUp className="size-4 text-sc-gray ml-2" />}
        </button>
        <button onClick={() => { setAdding(true); setCollapsed(false); }}
          className="flex items-center gap-1.5 rounded-lg bg-sc-rose px-3 py-1.5 text-label-sm text-white hover:bg-sc-rose-700 transition-colors">
          <Plus className="size-3.5" /> Add Strategy
        </button>
      </div>

      {!collapsed && (
        <div className="p-5 space-y-4">
          {error && (
            <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{error}</p>
          )}

          {strategies.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(["all", "critical", "high", "normal"] as const).map((p) => (
                <button key={p} onClick={() => setFilter(p)}
                  className={cn("rounded-full px-3 py-1 text-label-sm border transition-colors",
                    filter === p
                      ? "bg-sc-navy text-white border-sc-navy"
                      : "border-sc-gray-200 text-sc-gray hover:border-sc-navy hover:text-sc-navy"
                  )}>
                  {p === "all" ? "All" : PRIORITY_CFG[p as StrategyPriority].label}
                </button>
              ))}
            </div>
          )}

          {adding && (
            <StrategyForm
              payload={newDraft}
              onChange={(p) => setNewDraft((d) => ({ ...d, ...p }))}
              onSave={handleAdd}
              onCancel={() => { setAdding(false); setError(null); }}
              saving={isPending}
              label="Add Strategy"
              isAdmin={isAdmin}
            />
          )}

          {visible.length === 0 && !adding && (
            <div className="text-center py-8 text-sc-gray">
              <ShieldAlert className="size-8 mx-auto mb-2 text-sc-gray-300" />
              <p className="text-body-md font-medium text-sc-navy">
                {strategies.length === 0 ? "No strategies yet" : "No strategies match this filter"}
              </p>
              {strategies.length === 0 && (
                <p className="text-label-sm mt-1">Add support strategies for staff to reference when working with this student.</p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {visible.map((s) => (
              <StrategyCard
                key={s.id} strategy={s} studentId={studentId} isAdmin={isAdmin}
                onUpdated={(u) => setStrategies((arr) => arr.map((x) => x.id === u.id ? u : x))}
                onDeleted={(id) => setStrategies((arr) => arr.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
