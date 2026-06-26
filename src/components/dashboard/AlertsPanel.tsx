"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Target, BookOpen, ClipboardList, Pin, ChevronDown, ChevronUp } from "lucide-react";
import { getDashboardAlerts, type StudentAlert } from "@/app/actions/academics";
import { cn } from "@/lib/utils";

const ALERT_CFG: Record<string, { Icon: React.ElementType; cls: string; border: string; label: string }> = {
  goal_overdue:      { Icon: Target,        cls: "text-sc-rose",    border: "border-l-sc-rose",    label: "Goal Overdue"       },
  assessment_overdue:{ Icon: ClipboardList, cls: "text-sc-gold-600",border: "border-l-sc-gold-400",label: "Assessment Due"     },
  curriculum_stale:  { Icon: BookOpen,      cls: "text-sc-gray",    border: "border-l-sc-gray-300",label: "Curriculum Stale"   },
  flag_expiring:     { Icon: Pin,           cls: "text-sc-rose",    border: "border-l-sc-rose",    label: "Flag Expiring"      },
};

const SEVERITY_ORDER = { high: 0, normal: 1, low: 2 };

export function AlertsPanel() {
  const [alerts, setAlerts] = useState<StudentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    getDashboardAlerts().then((data) => {
      // Sort: severity then alpha
      const sorted = [...data].sort((a, b) => {
        const sa = SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] ?? 9;
        const sb = SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER] ?? 9;
        if (sa !== sb) return sa - sb;
        return a.student_name.localeCompare(b.student_name);
      });
      setAlerts(sorted);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5">
      <div className="h-5 w-40 rounded-lg bg-sc-gray-100 animate-pulse mb-3" />
      <div className="space-y-2">
        {[1,2,3].map((i) => <div key={i} className="h-10 rounded-xl bg-sc-gray-50 animate-pulse" />)}
      </div>
    </div>
  );

  if (alerts.length === 0) return null;

  // Group by type for summary count
  const highCount = alerts.filter((a) => a.severity === "high").length;

  return (
    <div className={cn(
      "rounded-2xl border bg-white shadow-card overflow-hidden",
      highCount > 0 ? "border-sc-rose/30" : "border-sc-gray-100"
    )}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-sc-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            highCount > 0 ? "bg-sc-rose-50 border border-sc-rose-200" : "bg-sc-gold-50 border border-sc-gold-200"
          )}>
            <AlertTriangle className={cn("size-4", highCount > 0 ? "text-sc-rose" : "text-sc-gold-600")} />
          </div>
          <div className="text-left">
            <p className="text-label-md font-semibold text-sc-navy">
              {alerts.length} Alert{alerts.length > 1 ? "s" : ""}
              {highCount > 0 && <span className="ml-2 text-sc-rose">({highCount} urgent)</span>}
            </p>
            <p className="text-label-sm text-sc-gray">Student action items requiring attention</p>
          </div>
        </div>
        {collapsed ? <ChevronDown className="size-4 text-sc-gray" /> : <ChevronUp className="size-4 text-sc-gray" />}
      </button>

      {!collapsed && (
        <div className="border-t border-sc-gray-100 divide-y divide-sc-gray-50">
          {alerts.map((alert, i) => {
            const cfg = ALERT_CFG[alert.alert_type] ?? ALERT_CFG.curriculum_stale;
            const AlertIcon = cfg.Icon;
            return (
              <Link key={i} href={alert.action_url}
                className={cn(
                  "flex items-start gap-3 px-5 py-3 border-l-4 hover:bg-sc-gray-50 transition-colors",
                  cfg.border
                )}>
                <AlertIcon className={cn("size-4 mt-0.5 shrink-0", cfg.cls)} />
                <div className="flex-1 min-w-0">
                  <p className="text-label-sm font-semibold text-sc-navy">{alert.student_name}</p>
                  <p className="text-label-sm text-sc-gray">{alert.message}</p>
                </div>
                <span className={cn(
                  "shrink-0 text-label-sm px-2 py-0.5 rounded-full font-medium",
                  alert.severity === "high"   ? "bg-sc-rose-50 text-sc-rose"       :
                  alert.severity === "normal" ? "bg-sc-gold-50 text-sc-gold-700"   :
                  "bg-sc-gray-50 text-sc-gray"
                )}>
                  {cfg.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
