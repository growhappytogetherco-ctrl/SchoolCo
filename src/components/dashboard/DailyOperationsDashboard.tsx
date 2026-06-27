"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  UserCheck, UserX, Users, Clock, LogOut, Pill,
  AlertTriangle, StickyNote, QrCode, Search,
  RefreshCw, ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { TodaysBlessing } from "@/components/shared/TodaysBlessing";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { TodaysActionsCard } from "@/components/dashboard/TodaysActionsCard";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────

interface DailyStats {
  checkedIn:       number;
  checkedOut:      number;
  onCampus:        number;
  absent:          number;
  lateArrivals:    number;
  earlyPickups:    number;
  medicationAlerts: number;
  incidentsToday:  number;
  unreadNotes:     number;
  totalEnrolled:   number;
}

interface RecentIncident {
  id:         string;
  title:      string;
  occurred_at: string;
  severity:   string | null;
}

interface RecentNote {
  id:         string;
  title:      string;
  created_at: string;
}

// ── Props ─────────────────────────────────────────────────────────────────

interface Props {
  firstName: string;
  orgId:     string | null;
  orgName:   string;
}

// ── Component ─────────────────────────────────────────────────────────────

export function DailyOperationsDashboard({ firstName, orgId, orgName }: Props) {
  const [stats, setStats]             = useState<DailyStats | null>(null);
  const [incidents, setIncidents]     = useState<RecentIncident[]>([]);
  const [notes, setNotes]             = useState<RecentNote[]>([]);
  const [loading, setLoading]         = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  const loadData = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const supabase = createClient();

    // Total enrolled
    const { count: totalEnrolled } = await supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("enrollment_status", "enrolled")
      .is("archived_at", null);

    // Attendance stats — query attendance_records if table exists, else zero
    let checkedIn = 0, checkedOut = 0, onCampus = 0, absent = 0;
    let lateArrivals = 0, earlyPickups = 0;

    const { data: attRows, error: attError } = await supabase
      .from("attendance_records")
      .select("status, check_in_at, check_out_at, is_late, is_early_pickup")
      .eq("organization_id", orgId)
      .eq("date", today);

    if (!attError && attRows) {
      for (const row of attRows) {
        if (row.status === "present" || row.status === "checked_in") {
          checkedIn++;
          if (!row.check_out_at) onCampus++;
          else checkedOut++;
        }
        if (row.status === "absent") absent++;
        if (row.is_late) lateArrivals++;
        if (row.is_early_pickup) earlyPickups++;
      }
    }

    // Medical alerts — students with active medication_alerts
    let medicationAlerts = 0;
    const { count: medCount } = await supabase
      .from("medication_alerts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("is_active", true);
    if (medCount) medicationAlerts = medCount;

    // Incidents today
    let incidentsToday = 0;
    const { data: incidentRows, count: incidentCount } = await supabase
      .from("incidents")
      .select("id, title, occurred_at, severity", { count: "exact" })
      .eq("organization_id", orgId)
      .gte("occurred_at", `${today}T00:00:00`)
      .order("occurred_at", { ascending: false })
      .limit(5);

    if (incidentRows) {
      incidentsToday = incidentCount ?? incidentRows.length;
      setIncidents(incidentRows as RecentIncident[]);
    }

    // Unread staff notes (timeline entries of type staff_note, not yet read)
    let unreadNotes = 0;
    const { data: noteRows, count: noteCount } = await supabase
      .from("timeline_entries")
      .select("id, title, created_at", { count: "exact" })
      .eq("organization_id", orgId)
      .eq("entry_type", "staff_note_shared")
      .is("hidden_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (noteRows) {
      unreadNotes = noteCount ?? noteRows.length;
      setNotes(noteRows as RecentNote[]);
    }

    setStats({
      checkedIn,
      checkedOut,
      onCampus,
      absent,
      lateArrivals,
      earlyPickups,
      medicationAlerts,
      incidentsToday,
      unreadNotes,
      totalEnrolled: totalEnrolled ?? 0,
    });
    setLastRefresh(new Date());
    setLoading(false);
  }, [orgId, today]);

  useEffect(() => { loadData(); }, [loadData]);

  const refreshTime = lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-widest">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="font-serif text-display-2 text-sc-navy leading-tight">
            Good morning, {firstName}!
          </h1>
          <p className="text-body-md text-sc-gray mt-0.5">{orgName} · Daily Operations</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-gray hover:bg-sc-cream transition-colors"
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          {loading ? "Loading…" : `Updated ${refreshTime}`}
        </button>
      </div>

      {/* ── Attendance Command Center ────────────────────────── */}
      <section>
        <h2 className="font-serif text-heading-3 text-sc-navy mb-3">Today&apos;s Attendance</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <AttendanceTile
            label="Checked In"
            value={stats?.checkedIn}
            total={stats?.totalEnrolled}
            icon={UserCheck}
            color="teal"
            loading={loading}
          />
          <AttendanceTile
            label="On Campus"
            value={stats?.onCampus}
            total={stats?.totalEnrolled}
            icon={Users}
            color="green"
            loading={loading}
          />
          <AttendanceTile
            label="Checked Out"
            value={stats?.checkedOut}
            icon={LogOut}
            color="navy"
            loading={loading}
          />
          <AttendanceTile
            label="Absent"
            value={stats?.absent}
            icon={UserX}
            color="rose"
            loading={loading}
          />
          <AttendanceTile
            label="Late Arrivals"
            value={stats?.lateArrivals}
            icon={Clock}
            color="gold"
            loading={loading}
          />
          <AttendanceTile
            label="Early Pickups"
            value={stats?.earlyPickups}
            icon={LogOut}
            color="gray"
            loading={loading}
          />
        </div>
      </section>

      {/* ── Alert Row ────────────────────────────────────────── */}
      <section className="grid sm:grid-cols-2 gap-4">
        <AlertCard
          label="Medication Alerts"
          value={stats?.medicationAlerts ?? 0}
          icon={Pill}
          color="rose"
          loading={loading}
          href="/dashboard/students?filter=medication"
          emptyMessage="No active medication alerts"
        />
        <AlertCard
          label="Incident Reports Today"
          value={stats?.incidentsToday ?? 0}
          icon={AlertTriangle}
          color="gold"
          loading={loading}
          href="/dashboard/incidents"
          emptyMessage="No incidents reported today"
        />
      </section>

      {/* ── Today's per-student action items ──────────────────── */}
      <TodaysActionsCard />

      {/* ── Student alerts (goals, assessments, curriculum) ─── */}
      <AlertsPanel />

      {/* ── Bottom Row: Recent incidents + Notes + Quick Actions ─ */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Recent Incidents */}
        <div className="rounded-xl bg-white border border-sc-gray-100 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-heading-3 text-sc-navy">Recent Incidents</h3>
            <Link href="/dashboard/incidents" className="text-label-sm text-sc-teal hover:underline">
              View all
            </Link>
          </div>
          {loading ? (
            <SkeletonList />
          ) : incidents.length === 0 ? (
            <p className="text-body-sm text-sc-gray-400 py-4 text-center">No incidents today</p>
          ) : (
            <ul className="space-y-2">
              {incidents.map((inc) => (
                <li key={inc.id}>
                  <Link
                    href={`/dashboard/incidents/${inc.id}`}
                    className="flex items-start gap-3 rounded-lg p-2.5 hover:bg-sc-cream transition-colors"
                  >
                    <AlertTriangle className="size-4 text-sc-gold mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-label-md text-sc-navy truncate">{inc.title}</p>
                      <p className="text-label-sm text-sc-gray-400">
                        {new Date(inc.occurred_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {inc.severity && ` · ${inc.severity}`}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-sc-gray-300 mt-0.5 ml-auto shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Staff Notes */}
        <div className="rounded-xl bg-white border border-sc-gray-100 shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-heading-3 text-sc-navy">
              Staff Notes
              {!loading && notes.length > 0 && (
                <span className="ml-2 text-label-sm rounded-full bg-sc-teal px-2 py-0.5 text-white">
                  {stats?.unreadNotes}
                </span>
              )}
            </h3>
            <Link href="/dashboard/students" className="text-label-sm text-sc-teal hover:underline">
              View all
            </Link>
          </div>
          {loading ? (
            <SkeletonList />
          ) : notes.length === 0 ? (
            <p className="text-body-sm text-sc-gray-400 py-4 text-center">No recent notes</p>
          ) : (
            <ul className="space-y-2">
              {notes.map((note) => (
                <li key={note.id}>
                  <div className="flex items-start gap-3 rounded-lg p-2.5 hover:bg-sc-cream transition-colors">
                    <StickyNote className="size-4 text-sc-teal mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-label-md text-sc-navy truncate">{note.title}</p>
                      <p className="text-label-sm text-sc-gray-400">
                        {new Date(note.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl bg-white border border-sc-gray-100 shadow-card p-5">
          <h3 className="font-serif text-heading-3 text-sc-navy mb-4">Quick Actions</h3>
          <div className="space-y-2">
            <QuickAction
              label="Check In Student"
              icon={UserCheck}
              href="/dashboard/attendance?action=checkin"
              color="teal"
            />
            <QuickAction
              label="Check Out Student"
              icon={LogOut}
              href="/dashboard/attendance?action=checkout"
              color="navy"
            />
            <QuickAction
              label="Scan QR Code"
              icon={QrCode}
              href="/dashboard/attendance?action=scan"
              color="green"
            />
            <QuickAction
              label="Add Incident Report"
              icon={AlertTriangle}
              href="/dashboard/incidents/new"
              color="rose"
            />
            <QuickAction
              label="Search Student"
              icon={Search}
              href="/dashboard/students"
              color="gray"
            />
          </div>
        </div>
      </div>

      {/* ── Today's Blessing ────────────────────────────────── */}
      <TodaysBlessing />

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

type TileColor = "teal" | "navy" | "green" | "rose" | "gold" | "gray";

const TILE_COLORS: Record<TileColor, { bg: string; icon: string; text: string; bar: string }> = {
  teal:  { bg: "bg-sc-teal-50",  icon: "text-sc-teal",   text: "text-sc-teal-700",  bar: "bg-sc-teal" },
  navy:  { bg: "bg-sc-navy-50",  icon: "text-sc-navy",   text: "text-sc-navy-600",  bar: "bg-sc-navy" },
  green: { bg: "bg-sc-green-50", icon: "text-sc-green",  text: "text-sc-green-700", bar: "bg-sc-green" },
  rose:  { bg: "bg-sc-rose-50",  icon: "text-sc-rose",   text: "text-sc-rose-700",  bar: "bg-sc-rose" },
  gold:  { bg: "bg-sc-gold-50",  icon: "text-sc-gold",   text: "text-sc-gold-700",  bar: "bg-sc-gold" },
  gray:  { bg: "bg-sc-gray-50",  icon: "text-sc-gray",   text: "text-sc-gray-600",  bar: "bg-sc-gray" },
};

function AttendanceTile({
  label, value, total, icon: Icon, color, loading,
}: {
  label: string;
  value?: number;
  total?: number;
  icon: React.ComponentType<{ className?: string }>;
  color: TileColor;
  loading: boolean;
}) {
  const c = TILE_COLORS[color];
  const pct = total && value !== undefined && total > 0
    ? Math.round((value / total) * 100) : null;

  return (
    <div className="rounded-xl bg-white border border-sc-gray-100 shadow-card p-4">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg mb-3", c.bg)}>
        <Icon className={cn("size-4", c.icon)} />
      </div>
      {loading ? (
        <div className="h-7 w-12 bg-sc-gray-100 rounded animate-pulse mb-1" />
      ) : (
        <p className="font-serif text-2xl font-bold text-sc-navy leading-none mb-1">
          {value ?? 0}
        </p>
      )}
      <p className="text-label-sm text-sc-gray leading-tight">{label}</p>
      {pct !== null && (
        <div className="mt-2 h-1 w-full rounded-full bg-sc-gray-100">
          <div
            className={cn("h-1 rounded-full transition-all", c.bar)}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function AlertCard({
  label, value, icon: Icon, color, loading, href, emptyMessage,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: TileColor;
  loading: boolean;
  href: string;
  emptyMessage: string;
}) {
  const c = TILE_COLORS[color];
  const hasAlert = value > 0;

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-4 rounded-xl border p-5 transition-all",
        hasAlert
          ? `${c.bg} border-current/20 shadow-card hover:shadow-card-hover`
          : "bg-white border-sc-gray-100 shadow-card hover:shadow-card-hover"
      )}
    >
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", hasAlert ? "bg-white/60" : c.bg)}>
        <Icon className={cn("size-6", hasAlert ? c.icon : "text-sc-gray-400")} />
      </div>
      <div className="flex-1 min-w-0">
        {loading ? (
          <div className="h-7 w-16 bg-sc-gray-200 rounded animate-pulse mb-1" />
        ) : (
          <p className={cn("font-serif text-3xl font-bold leading-none mb-0.5", hasAlert ? c.text : "text-sc-gray-400")}>
            {value}
          </p>
        )}
        <p className={cn("text-label-sm", hasAlert ? c.text : "text-sc-gray-400")}>
          {hasAlert ? label : emptyMessage}
        </p>
      </div>
      <ChevronRight className="size-5 text-sc-gray-300 shrink-0" />
    </Link>
  );
}

function QuickAction({
  label, icon: Icon, href, color,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: TileColor;
}) {
  const c = TILE_COLORS[color];
  return (
    <Button variant="ghost" className="w-full justify-start gap-3 h-10" asChild>
      <Link href={href}>
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg shrink-0", c.bg)}>
          <Icon className={cn("size-3.5", c.icon)} />
        </span>
        <span className="text-label-md text-sc-navy">{label}</span>
        <ChevronRight className="size-4 text-sc-gray-300 ml-auto" />
      </Link>
    </Button>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-12 rounded-lg bg-sc-gray-50 animate-pulse" />
      ))}
    </div>
  );
}
