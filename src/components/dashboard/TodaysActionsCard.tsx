"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Target, LogOut, ShieldAlert, ClipboardList,
  AlertCircle, ChevronDown, ChevronUp, CheckCircle,
} from "lucide-react";
import { getTodaysActions, type TodayAction } from "@/app/actions/todaysActions";
import { getActionMeta } from "@/lib/actionMeta";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  Target, LogOut, ShieldAlert, ClipboardList, AlertCircle,
};

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function TodaysActionsCard() {
  const [actions, setActions] = useState<TodayAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    getTodaysActions().then((data) => {
      setActions(data);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5">
      <div className="h-5 w-44 bg-sc-gray-100 rounded-lg animate-pulse mb-3" />
      {[1, 2].map((i) => <div key={i} className="h-12 bg-sc-gray-50 rounded-xl animate-pulse mb-2" />)}
    </div>
  );

  const visible = actions.filter((a) => !dismissed.has(`${a.student_id}:${a.action_type}`));
  if (visible.length === 0) return null;

  const urgentCount = visible.filter((a) => a.priority === "high").length;

  return (
    <div className={cn(
      "rounded-2xl border bg-white shadow-card overflow-hidden",
      urgentCount > 0 ? "border-sc-rose/30" : "border-sc-gold-200"
    )}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-sc-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            urgentCount > 0 ? "bg-sc-rose-50 border border-sc-rose-200" : "bg-sc-gold-50 border border-sc-gold-200"
          )}>
            <AlertCircle className={cn("size-4", urgentCount > 0 ? "text-sc-rose" : "text-sc-gold-600")} />
          </div>
          <div className="text-left">
            <p className="text-label-md font-semibold text-sc-navy">
              {visible.length} Today&apos;s Action{visible.length > 1 ? "s" : ""}
              {urgentCount > 0 && <span className="ml-2 text-sc-rose">({urgentCount} urgent)</span>}
            </p>
            <p className="text-label-sm text-sc-gray">Items needing attention today</p>
          </div>
        </div>
        {collapsed ? <ChevronDown className="size-4 text-sc-gray" /> : <ChevronUp className="size-4 text-sc-gray" />}
      </button>

      {!collapsed && (
        <div className="border-t border-sc-gray-100 divide-y divide-sc-gray-50">
          {visible.map((action, i) => {
            const meta = getActionMeta(action.action_type);
            const Icon = ICON_MAP[meta.icon] ?? AlertCircle;
            const profileUrl = `/dashboard/students/${action.student_id}?tab=${action.tab_hint}`;
            const key = `${action.student_id}:${action.action_type}`;

            return (
              <div
                key={`${key}-${i}`}
                className={cn(
                  "flex items-center gap-3 px-5 py-3.5 group",
                  action.priority === "high" ? "bg-sc-rose-50/40" : "bg-white"
                )}
              >
                <div className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  action.priority === "high"
                    ? "bg-sc-rose-50 text-sc-rose border border-sc-rose-200"
                    : "bg-sc-gold-50 text-sc-gold-600 border border-sc-gold-200"
                )}>
                  <Icon className="size-3.5" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={profileUrl}
                      className="text-label-md font-semibold text-sc-navy hover:text-sc-teal hover:underline"
                    >
                      {action.student_name}
                    </Link>
                    <span className="text-label-sm text-sc-gray">{meta.label}</span>
                    {action.due_date && (
                      <span className={cn(
                        "text-label-sm font-medium",
                        action.due_date < new Date().toISOString().split("T")[0]
                          ? "text-sc-rose"
                          : "text-sc-gold-700"
                      )}>
                        {fmtDate(action.due_date)}
                      </span>
                    )}
                  </div>
                  {action.detail && (
                    <p className="text-label-sm text-sc-gray truncate mt-0.5">{action.detail}</p>
                  )}
                </div>

                <button
                  onClick={() => setDismissed((s) => new Set([...s, key]))}
                  aria-label="Dismiss"
                  className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-sc-gray-100 transition-all"
                >
                  <CheckCircle className="size-4 text-sc-gray hover:text-sc-teal" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
