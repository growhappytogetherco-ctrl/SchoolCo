"use client";

import { useState, useTransition } from "react";
import { RefreshCw, CheckCircle2, Clock, AlertTriangle, XCircle, MinusCircle, Zap, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { runAutoChecks, updateChecklistItem } from "@/app/actions/launch";
import type { LaunchItem } from "@/app/actions/launch";
// CHECKLIST_DEFINITION is not needed in UI — sections come from the LaunchItem data

// ── Status helpers ────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  completed:   { label: "Completed",   icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  in_progress: { label: "In Progress", icon: Clock,          color: "text-amber-600",   bg: "bg-amber-50",   dot: "bg-amber-400 animate-pulse" },
  blocked:     { label: "Blocked",     icon: XCircle,        color: "text-sc-rose",     bg: "bg-sc-rose-50", dot: "bg-sc-rose" },
  pending:     { label: "Pending",     icon: MinusCircle,    color: "text-sc-gray",     bg: "bg-sc-gray-100",dot: "bg-sc-gray-400" },
  skipped:     { label: "Skipped",     icon: MinusCircle,    color: "text-blue-500",    bg: "bg-blue-50",    dot: "bg-blue-400" },
} as const;

// ── Section component ─────────────────────────────────────────────────────

function SectionGroup({
  section,
  items,
  onUpdate,
}: {
  section: string;
  items: LaunchItem[];
  onUpdate: (key: string, data: { status?: string; owner_name?: string; notes?: string }) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const completed = items.filter((i) => i.status === "completed").length;
  const allDone = completed === items.length;

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-sc-gray-100/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="size-4 text-sc-gray" /> : <ChevronRight className="size-4 text-sc-gray" />}
          <span className="font-semibold text-sc-navy">{section}</span>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            allDone ? "bg-emerald-50 text-emerald-700" : "bg-sc-gray-100 text-sc-gray"
          )}>
            {completed}/{items.length}
          </span>
        </div>
        {allDone && <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />}
      </button>
      {expanded && (
        <div className="border-t border-sc-gray-100">
          {items.map((item) => (
            <ChecklistRow key={item.key} item={item} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Row component ─────────────────────────────────────────────────────────

function ChecklistRow({
  item,
  onUpdate,
}: {
  item: LaunchItem;
  onUpdate: (key: string, data: { status?: string; owner_name?: string; notes?: string }) => Promise<void>;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [isPending, startTransition] = useTransition();
  const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;

  function handleStatus(status: string) {
    startTransition(async () => {
      await onUpdate(item.key, { status });
    });
  }

  function handleOwner(e: React.FocusEvent<HTMLInputElement>) {
    startTransition(async () => {
      await onUpdate(item.key, { owner_name: e.target.value });
    });
  }

  function handleNotes(e: React.FocusEvent<HTMLTextAreaElement>) {
    startTransition(async () => {
      await onUpdate(item.key, { notes: e.target.value });
    });
  }

  return (
    <div className={cn(
      "border-b border-sc-gray-100 last:border-b-0 px-4 py-3",
      isPending && "opacity-60",
      item.status === "blocked" && "bg-sc-rose-50/30",
    )}>
      <div className="flex flex-wrap items-center gap-3">
        {/* Status dot */}
        <span className={cn("size-2.5 rounded-full shrink-0", cfg.dot)} />

        {/* Label */}
        <span className={cn(
          "flex-1 min-w-0 text-label-sm",
          item.status === "completed" ? "text-sc-navy/60 line-through" : "text-sc-navy font-medium",
        )}>
          {item.label}
        </span>

        {/* Auto badge */}
        {item.auto && (
          <span className="inline-flex items-center gap-1 rounded-full bg-sc-teal/10 text-sc-teal px-2 py-0.5 text-[10px] font-semibold shrink-0">
            <Zap className="size-2.5" /> Auto
          </span>
        )}

        {/* Owner */}
        <input
          defaultValue={item.owner_name ?? ""}
          onBlur={handleOwner}
          placeholder="Owner"
          className="w-28 rounded-lg border border-sc-gray-200 px-2 py-1 text-[11px] text-sc-navy placeholder-sc-gray-400 focus:outline-none focus:ring-1 focus:ring-sc-teal"
        />

        {/* Completed date */}
        {item.completed_at && (
          <span className="text-[10px] text-sc-gray-400 shrink-0">
            {new Date(item.completed_at).toLocaleDateString()}
          </span>
        )}

        {/* Status select */}
        <select
          value={item.status}
          onChange={(e) => handleStatus(e.target.value)}
          className="rounded-lg border border-sc-gray-200 px-2 py-1 text-[11px] text-sc-navy focus:outline-none focus:ring-1 focus:ring-sc-teal"
        >
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="skipped">Skipped</option>
          <option value="blocked">Blocked</option>
        </select>

        {/* Quick complete */}
        {item.status !== "completed" && (
          <button
            onClick={() => handleStatus("completed")}
            disabled={isPending}
            className="shrink-0 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 text-[11px] font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            Mark Done
          </button>
        )}

        {/* Notes toggle */}
        <button
          onClick={() => setShowNotes((v) => !v)}
          className="shrink-0 text-sc-gray-400 hover:text-sc-gray transition-colors"
        >
          <Icon className="size-3.5" />
        </button>
      </div>

      {/* Notes */}
      {showNotes && (
        <div className="mt-2 ml-5">
          <textarea
            defaultValue={item.notes ?? ""}
            onBlur={handleNotes}
            placeholder="Add notes…"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-[12px] text-sc-navy placeholder-sc-gray-400 focus:outline-none focus:ring-1 focus:ring-sc-teal resize-none"
          />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function LaunchChecklist({
  checklist,
  onUpdate,
}: {
  checklist: LaunchItem[];
  onUpdate: (items: LaunchItem[]) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate(
    key: string,
    data: { status?: string; owner_name?: string; notes?: string }
  ) {
    const result = await updateChecklistItem(key, data);
    if (!result.success) {
      setError(result.error);
      return;
    }
    // Optimistic update
    onUpdate(
      checklist.map((item) => {
        if (item.key !== key) return item;
        return {
          ...item,
          ...(data.status !== undefined ? {
            status: data.status as LaunchItem["status"],
            completed_at: data.status === "completed" ? new Date().toISOString() : item.completed_at,
          } : {}),
          ...(data.owner_name !== undefined ? { owner_name: data.owner_name } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
        };
      })
    );
  }

  function handleAutoCheck() {
    setError(null);
    startTransition(async () => {
      const updated = await runAutoChecks();
      onUpdate(updated);
    });
  }

  // Group by section
  const sections = Array.from(new Set(checklist.map((i) => i.section)));
  const bySection = sections.reduce<Record<string, LaunchItem[]>>((acc, s) => {
    acc[s] = checklist.filter((i) => i.section === s);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-sc-navy">Launch Checklist</h2>
          <p className="text-label-sm text-sc-gray mt-0.5">
            Track every step before going live. Auto items are verified against live data.
          </p>
        </div>
        <button
          onClick={handleAutoCheck}
          disabled={isPending}
          className="flex items-center gap-2 rounded-xl bg-sc-teal text-white px-4 py-2 text-label-sm font-medium hover:bg-sc-teal-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} />
          {isPending ? "Checking…" : "Run Auto-Checks"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose-700">
          {error}
        </div>
      )}

      {sections.map((section) => (
        <SectionGroup
          key={section}
          section={section}
          items={bySection[section] ?? []}
          onUpdate={handleUpdate}
        />
      ))}
    </div>
  );
}
