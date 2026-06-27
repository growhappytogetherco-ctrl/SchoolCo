"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, UserX, Clock, LogOut, Pill, ShieldAlert,
  AlertTriangle, Target, ClipboardList, Pin,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { getSchoolWideAlerts, type SchoolAlert } from "@/app/actions/todaysActions";
import { cn } from "@/lib/utils";

type Filter = "all" | "urgent" | "today" | "week";

const CATEGORY_CFG: Record<string, { Icon: React.ElementType; label: string; cls: string }> = {
  missing_checkout:    { Icon: LogOut,        label: "Not Checked Out",           cls: "text-sc-rose"     },
  absent_today:        { Icon: UserX,         label: "Absent Today",              cls: "text-sc-navy"     },
  late_today:          { Icon: Clock,         label: "Late Arrivals",             cls: "text-sc-gold-600" },
  early_pickup:        { Icon: Users,         label: "Early Pickups",             cls: "text-sc-teal"     },
  emergency_medication:{ Icon: Pill,          label: "Emergency Medication",      cls: "text-sc-rose"     },
  pickup_restriction:  { Icon: ShieldAlert,   label: "Pickup Restrictions",       cls: "text-sc-rose"     },
  goal_review_due:     { Icon: Target,        label: "Goal Reviews Due",          cls: "text-sc-gold-600" },
  flag_expiring:       { Icon: Pin,           label: "Support Flags Expiring",    cls: "text-sc-gold-600" },
  assessment_overdue:  { Icon: ClipboardList, label: "Assessments Overdue",       cls: "text-sc-gray"     },
};

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-sc-rose-50 text-sc-rose border border-sc-rose-200",
  today:  "bg-sc-gold-50 text-sc-gold-700 border border-sc-gold-200",
  week:   "bg-sc-gray-100 text-sc-gray border border-sc-gray-200",
};

export function SchoolWideAlerts() {
  const [alerts, setAlerts] = useState<SchoolAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    getSchoolWideAlerts().then((data) => {
      setAlerts(data);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5">
      <div className="h-5 w-48 bg-sc-gray-100 rounded-lg animate-pulse mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[1,2,3,4,5,6].map((i) => (
          <div key={i} className="h-20 bg-sc-gray-50 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );

  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.priority === filter);
  const urgentCount = alerts.filter((a) => a.priority === "urgent").length;

  if (alerts.length === 0) return null;

  return (
    <div className={cn(
      "rounded-2xl border bg-white shadow-card overflow-hidden",
      urgentCount > 0 ? "border-sc-rose/30" : "border-sc-gray-100"
    )}>
      {/* Header */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-sc-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl",
            urgentCount > 0 ? "bg-sc-rose-50 border border-sc-rose-200" : "bg-sc-gold-50 border border-sc-gold-200"
          )}>
            <AlertTriangle className={cn("size-4", urgentCount > 0 ? "text-sc-rose" : "text-sc-gold-600")} />
          </div>
          <div className="text-left">
            <p className="text-label-md font-semibold text-sc-navy">
              School-Wide Overview
              {urgentCount > 0 && <span className="ml-2 text-sc-rose">({urgentCount} urgent)</span>}
            </p>
            <p className="text-label-sm text-sc-gray">Attendance, safety, and follow-up summary</p>
          </div>
        </div>
        {collapsed ? <ChevronDown className="size-4 text-sc-gray" /> : <ChevronUp className="size-4 text-sc-gray" />}
      </button>

      {!collapsed && (
        <>
          {/* Filters */}
          <div className="px-5 py-2 border-t border-sc-gray-100 flex gap-2 flex-wrap">
            {(["all", "urgent", "today", "week"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-3 py-1 text-label-sm font-medium transition-colors capitalize",
                  filter === f
                    ? "bg-sc-navy text-white"
                    : "bg-sc-gray-100 text-sc-gray hover:bg-sc-gray-200"
                )}
              >
                {f === "all" ? "All" : f === "urgent" ? "Urgent" : f === "today" ? "Today" : "This Week"}
              </button>
            ))}
          </div>

          {/* Alert tiles */}
          <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((alert) => {
              const cfg = CATEGORY_CFG[alert.category];
              const Icon = cfg?.Icon ?? AlertTriangle;
              return (
                <Link
                  key={alert.category}
                  href={`/dashboard/attendance?highlight=${alert.category}`}
                  className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 hover:bg-sc-gray-100 p-4 transition-colors group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={cn("size-4", cfg?.cls ?? "text-sc-gray")} />
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-label-sm font-medium",
                      PRIORITY_BADGE[alert.priority]
                    )}>
                      {alert.priority}
                    </span>
                  </div>
                  <p className="font-serif text-heading-1 text-sc-navy leading-none mb-1">
                    {alert.count}
                  </p>
                  <p className="text-label-sm text-sc-gray leading-snug">
                    {cfg?.label ?? alert.label}
                  </p>
                </Link>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="px-5 pb-5 text-center text-label-sm text-sc-gray-400">
              No alerts for this filter.
            </div>
          )}
        </>
      )}
    </div>
  );
}
