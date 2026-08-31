"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  RefreshCw, Clock, Calendar, Users, UserCheck, UserX,
  LogIn, LogOut, AlertTriangle, ShieldAlert, Activity,
  ChevronDown, ChevronUp,
} from "lucide-react";
import {
  getOperationsDashboard,
  type OperationsDashboardData,
  type OperationsStudent,
  type CampusState,
} from "@/app/actions/operations";
import { StudentStatusTable } from "@/components/operations/StudentStatusTable";
import { ActionsPanel } from "@/components/operations/ActionsPanel";
import { DismissalView } from "@/components/operations/DismissalView";
import { StaffOnDutyPanel } from "@/components/operations/StaffOnDutyPanel";
import { cn } from "@/lib/utils";

interface Props {
  initialData: OperationsDashboardData;
}

export type ActiveFilter =
  | null
  | "on_campus"
  | "checked_out"
  | "not_arrived"
  | "absent"
  | "excused"
  | "with_alerts"
  | "checked_in";

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes

// ── Summary card definitions ──────────────────────────────────────────────

function SummaryCard({
  label, value, icon: Icon, color, filter, activeFilter, onClick, sublabel,
}: {
  label:        string;
  value:        number;
  icon:         React.ComponentType<{ className?: string }>;
  color:        string;
  filter:       ActiveFilter;
  activeFilter: ActiveFilter;
  onClick:      (f: ActiveFilter) => void;
  sublabel?:    string;
}) {
  const isActive = activeFilter === filter;
  return (
    <button
      onClick={() => onClick(isActive ? null : filter)}
      className={cn(
        "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all",
        "hover:shadow-md active:scale-[0.98]",
        isActive
          ? "border-sc-teal bg-sc-teal text-white shadow-md"
          : "border-sc-gray-100 bg-white shadow-card hover:border-sc-teal/30"
      )}
    >
      <div className={cn("flex items-center justify-between w-full")}>
        <span className={cn(
          "text-label-sm font-medium",
          isActive ? "text-white/80" : "text-sc-gray"
        )}>
          {label}
        </span>
        <Icon className={cn(
          "size-4 shrink-0",
          isActive ? "text-white/80" : color
        )} />
      </div>
      <span className={cn(
        "text-3xl font-bold tabular-nums leading-none",
        isActive ? "text-white" : "text-sc-navy"
      )}>
        {value}
      </span>
      {sublabel && (
        <span className={cn(
          "text-label-sm",
          isActive ? "text-white/70" : "text-sc-gray"
        )}>
          {sublabel}
        </span>
      )}
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function OperationsDashboard({ initialData }: Props) {
  const router           = useRouter();
  const searchParams     = useSearchParams();
  const [data, setData]  = useState<OperationsDashboardData>(initialData);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>(null);
  const [dismissalMode, setDismissalMode] = useState(false);
  const [showActions, setShowActions]     = useState(true);
  const [isRefreshing, startRefresh]      = useTransition();
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date(initialData.fetched_at));
  const [now, setNow]    = useState<Date>(new Date());

  // Live clock — update every 30 seconds
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Refresh function
  const refresh = useCallback((targetDate?: string) => {
    startRefresh(async () => {
      const d = targetDate ?? data.date;
      const fresh = await getOperationsDashboard(d);
      if (!("error" in fresh)) {
        setData(fresh);
        setLastRefreshTime(new Date(fresh.fetched_at));
      }
    });
  }, [data.date]);

  // Auto-refresh every 5 minutes when tab is visible
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      timer = setTimeout(() => {
        if (!document.hidden) refresh();
        schedule();
      }, AUTO_REFRESH_MS);
    }
    schedule();
    return () => clearTimeout(timer);
  }, [refresh]);

  // Pause auto-refresh when tab is hidden
  useEffect(() => {
    const handler = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [refresh]);

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newDate = e.target.value;
    router.push(`/dashboard/operations?date=${newDate}`);
    refresh(newDate);
  }

  function handleFilterClick(f: ActiveFilter) {
    setActiveFilter(f);
    setDismissalMode(false);
  }

  const { summary, students, org_settings } = data;
  const isToday = data.date === new Date().toISOString().split("T")[0];

  // Compute today's action items
  const actionStudents = computeActionItems(students, org_settings, now, isToday);

  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
    timeZone: org_settings.timezone,
  });
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric",
    timeZone: org_settings.timezone,
  });

  return (
    <div className="animate-fade-in space-y-6">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-heading-1 text-sc-navy">Daily Operations</h1>
          <p className="text-label-sm text-sc-gray mt-0.5">
            {dateFmt.format(new Date(data.date + "T12:00:00"))}
            {!isToday && <span className="ml-2 text-sc-gold-600 font-medium">(past date)</span>}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Current time */}
          <div className="flex items-center gap-1.5 text-label-sm text-sc-gray">
            <Clock className="size-3.5" />
            {timeFmt.format(now)}
          </div>

          {/* Date picker */}
          <div className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 bg-white px-3 py-2">
            <Calendar className="size-4 text-sc-gray" />
            <input
              type="date"
              value={data.date}
              max={new Date().toISOString().split("T")[0]}
              onChange={handleDateChange}
              className="text-label-sm text-sc-navy bg-transparent focus:outline-none"
            />
          </div>

          {/* Refresh */}
          <button
            onClick={() => refresh()}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>

          {/* Dismissal mode toggle */}
          <button
            onClick={() => { setDismissalMode(!dismissalMode); setActiveFilter(null); }}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-2 text-label-sm font-medium transition-colors",
              dismissalMode
                ? "bg-sc-navy text-white"
                : "border border-sc-gray-200 bg-white text-sc-navy hover:bg-sc-gray-50"
            )}
          >
            <LogOut className="size-4" />
            Dismissal Mode
          </button>
        </div>
      </div>

      {/* Last refresh */}
      <p className="text-label-sm text-sc-gray -mt-2">
        Last updated {formatRelativeTime(lastRefreshTime, now)}
      </p>

      {/* ── Summary Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
        <SummaryCard
          label="Total Students" value={summary.total_enrolled}
          icon={Users} color="text-sc-navy"
          filter={null} activeFilter={activeFilter} onClick={handleFilterClick}
        />
        <SummaryCard
          label="On Campus" value={summary.on_campus}
          icon={UserCheck} color="text-sc-teal"
          filter="on_campus" activeFilter={activeFilter} onClick={handleFilterClick}
          sublabel="checked in, not out"
        />
        <SummaryCard
          label="Not Arrived" value={summary.not_arrived}
          icon={UserX} color="text-sc-rose"
          filter="not_arrived" activeFilter={activeFilter} onClick={handleFilterClick}
          sublabel="no check-in today"
        />
        <SummaryCard
          label="Absent" value={summary.absent}
          icon={UserX} color="text-sc-rose"
          filter="absent" activeFilter={activeFilter} onClick={handleFilterClick}
        />
        <SummaryCard
          label="Excused" value={summary.excused}
          icon={UserX} color="text-sc-gray"
          filter="excused" activeFilter={activeFilter} onClick={handleFilterClick}
        />
        <SummaryCard
          label="Checked Out" value={summary.checked_out}
          icon={LogOut} color="text-sc-gray"
          filter="checked_out" activeFilter={activeFilter} onClick={handleFilterClick}
          sublabel="left campus"
        />
        <SummaryCard
          label="Checked In" value={summary.checked_in}
          icon={LogIn} color="text-sc-teal"
          filter="checked_in" activeFilter={activeFilter} onClick={handleFilterClick}
          sublabel="total today"
        />
        <SummaryCard
          label="With Alerts" value={summary.with_safety_alerts}
          icon={ShieldAlert} color="text-sc-rose"
          filter="with_alerts" activeFilter={activeFilter} onClick={handleFilterClick}
          sublabel="safety / medical"
        />
      </div>

      {/* ── Dismissal Mode ────────────────────────────────────────────── */}
      {dismissalMode ? (
        <DismissalView
          students={students}
          orgSettings={org_settings}
          role={data.role}
          onClose={() => setDismissalMode(false)}
          onActionComplete={() => refresh()}
        />
      ) : (
        <>
          {/* ── Today's Actions ──────────────────────────────────────── */}
          {isToday && actionStudents.length > 0 && (
            <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
              <button
                onClick={() => setShowActions(!showActions)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-sc-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Activity className="size-5 text-sc-rose" />
                  <h2 className="font-serif text-heading-3 text-sc-navy">
                    Today&apos;s Actions
                  </h2>
                  <span className="rounded-full bg-sc-rose px-2 py-0.5 text-[11px] font-semibold text-white">
                    {actionStudents.length}
                  </span>
                </div>
                {showActions ? (
                  <ChevronUp className="size-4 text-sc-gray" />
                ) : (
                  <ChevronDown className="size-4 text-sc-gray" />
                )}
              </button>
              {showActions && (
                <div className="border-t border-sc-gray-100">
                  <ActionsPanel
                    items={actionStudents}
                    role={data.role}
                    onActionComplete={() => refresh()}
                  />
                </div>
              )}
            </div>
          )}

          {/* ── Staff on Duty ────────────────────────────────────────── */}
          <StaffOnDutyPanel date={data.date} isToday={isToday} />

          {/* ── Student Status Table ──────────────────────────────────── */}
          <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-sc-gray-100">
              <h2 className="font-serif text-heading-3 text-sc-navy">
                Student Status
                {activeFilter && (
                  <button
                    onClick={() => setActiveFilter(null)}
                    className="ml-3 text-label-sm font-normal text-sc-teal hover:underline"
                  >
                    Clear filter ×
                  </button>
                )}
              </h2>
            </div>
            <StudentStatusTable
              students={students}
              activeFilter={activeFilter}
              role={data.role}
              date={data.date}
              onActionComplete={() => refresh()}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Action item computation ────────────────────────────────────────────────

export interface ActionItem {
  student_id:    string;
  student_name:  string;
  issue:         string;
  severity:      "urgent" | "high" | "normal";
  detected_at:   string;
  next_step:     string;
  action_type:   "check_in" | "mark_absent" | "check_out" | "view_student" | "view_alert" | "resolve";
}

function computeActionItems(
  students: OperationsStudent[],
  settings: OperationsDashboardData["org_settings"],
  now: Date,
  isToday: boolean,
): ActionItem[] {
  if (!isToday) return [];

  const items: ActionItem[] = [];
  const nowStr = now.toISOString();

  // Parse dismissal time for "still on campus after dismissal" check
  const [dh, dm] = settings.dismissal_time.split(":").map(Number);
  const dismissal = new Date(now);
  dismissal.setHours(dh, dm, 0, 0);
  const pastDismissal = now > dismissal;

  // Parse arrival cutoff for "not arrived after cutoff"
  const [ah, am] = settings.arrival_cutoff.split(":").map(Number);
  const arrival = new Date(now);
  arrival.setHours(ah, am, 0, 0);
  const pastArrival = now > arrival;

  for (const s of students) {
    const name = s.preferred_name ?? `${s.first_name} ${s.last_name}`;

    // 1. Emergency medical alerts present on campus
    if (s.has_emergency_medical && (s.campus_state === "on_campus" || s.campus_state === "manual_present")) {
      items.push({
        student_id:   s.student_id,
        student_name: name,
        issue:        "Student on campus with emergency medical alert",
        severity:     "urgent",
        detected_at:  nowStr,
        next_step:    "Verify emergency protocol is in place. View full alert.",
        action_type:  "view_alert",
      });
    }

    // 2. Critical safety alerts for students on campus
    if (s.has_safety_alert && (s.campus_state === "on_campus" || s.campus_state === "manual_present")) {
      const critical = s.safety_alerts.filter((a) => a.severity === "critical");
      if (critical.length > 0) {
        items.push({
          student_id:   s.student_id,
          student_name: name,
          issue:        `Critical safety alert: ${critical[0].instruction}`,
          severity:     "urgent",
          detected_at:  nowStr,
          next_step:    "Review safety alert and confirm staff acknowledgment.",
          action_type:  "view_alert",
        });
      }
    }

    // 3. Past arrival cutoff and not checked in (not absent/excused)
    if (pastArrival && (s.campus_state === "not_arrived")) {
      items.push({
        student_id:   s.student_id,
        student_name: name,
        issue:        "Expected today but not checked in",
        severity:     "high",
        detected_at:  nowStr,
        next_step:    "Check in student or mark absent.",
        action_type:  "check_in",
      });
    }

    // 4. Still on campus past dismissal time
    if (pastDismissal && s.campus_state === "on_campus") {
      items.push({
        student_id:   s.student_id,
        student_name: name,
        issue:        `Still on campus past dismissal (${settings.dismissal_time})`,
        severity:     "high",
        detected_at:  nowStr,
        next_step:    "Check out student or confirm pickup is arranged.",
        action_type:  "check_out",
      });
    }

    // 5. Pickup restriction warning for students on campus
    if (s.has_pickup_restriction && s.campus_state === "on_campus") {
      const dnr = s.pickup_restrictions.filter(
        (p) => !p.can_pickup || p.custody_type === "none"
      );
      if (dnr.length > 0) {
        items.push({
          student_id:   s.student_id,
          student_name: name,
          issue:        `Pickup restriction on file — ${dnr[0].guardian_name} cannot pick up`,
          severity:     "high",
          detected_at:  nowStr,
          next_step:    "Verify pickup identity before releasing student.",
          action_type:  "view_student",
        });
      }
    }

    // 6. Checkout without prior check-in
    if (s.campus_state === "checked_out" && !s.record?.check_in_at) {
      items.push({
        student_id:   s.student_id,
        student_name: name,
        issue:        "Checked out without a prior check-in",
        severity:     "normal",
        detected_at:  s.record?.check_out_at ?? nowStr,
        next_step:    "Review attendance record and correct if needed.",
        action_type:  "resolve",
      });
    }
  }

  // Sort: urgent first, then high, then normal
  const SEVERITY_ORDER = { urgent: 0, high: 1, normal: 2 };
  items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return items;
}

// ── Utility ────────────────────────────────────────────────────────────────

function formatRelativeTime(past: Date, now: Date): string {
  const diff = Math.floor((now.getTime() - past.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
