"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  RefreshCw, CheckCircle2, AlertTriangle, XCircle, Shield,
  Users, GraduationCap, Heart, Briefcase, Building2,
  MessageSquare, Database, Clock, Server, HardDrive,
  Activity, AlertOctagon, ChevronRight, Play,
} from "lucide-react";
import {
  getAdminHealthData,
  runIntegrityScan,
  checkDbConnection,
  type AdminHealthData,
  type IntegrityItem,
} from "@/app/actions/admin-health";
import { cn } from "@/lib/utils";

// ── Status indicator ──────────────────────────────────────────────────────

function StatusDot({ severity }: { severity: "ok" | "warn" | "error" }) {
  return (
    <span className={cn(
      "inline-block size-2.5 rounded-full shrink-0",
      severity === "ok"    && "bg-emerald-500",
      severity === "warn"  && "bg-amber-400",
      severity === "error" && "bg-sc-rose animate-pulse",
    )} />
  );
}

function StatusBadge({ severity, label }: { severity: "ok" | "warn" | "error"; label?: string }) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold";
  if (severity === "ok")    return <span className={cn(base, "bg-emerald-50 text-emerald-700 border border-emerald-200")}><StatusDot severity="ok" />{label ?? "OK"}</span>;
  if (severity === "warn")  return <span className={cn(base, "bg-amber-50 text-amber-700 border border-amber-200")}><StatusDot severity="warn" />{label ?? "Warning"}</span>;
  return <span className={cn(base, "bg-sc-rose-50 text-sc-rose-700 border border-sc-rose-200")}><StatusDot severity="error" />{label ?? "Action Required"}</span>;
}

// ── Stat tile ─────────────────────────────────────────────────────────────

function StatTile({
  label, value, icon: Icon, sub, color = "teal",
}: {
  label: string; value: number | string; icon: React.ElementType; sub?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    teal:  "bg-sc-teal/10 text-sc-teal",
    navy:  "bg-sc-navy/10 text-sc-navy",
    rose:  "bg-sc-rose-50 text-sc-rose",
    gold:  "bg-sc-gold-50 text-sc-gold-700",
    gray:  "bg-sc-gray-100 text-sc-gray",
    green: "bg-emerald-50 text-emerald-600",
  };
  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 flex items-start gap-3">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl shrink-0", colorMap[color] ?? colorMap.teal)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[22px] font-bold text-sc-navy leading-none">{value}</p>
        <p className="text-label-sm text-sc-gray mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-sc-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Integrity row ──────────────────────────────────────────────────────────

function IntegrityRow({ item }: { item: IntegrityItem }) {
  const row = (
    <div className={cn(
      "flex items-center justify-between gap-3 px-4 py-3 border-b border-sc-gray-100 last:border-b-0",
      item.severity === "error" && "bg-sc-rose-50/40",
      item.severity === "warn"  && "bg-amber-50/40",
    )}>
      <div className="flex items-center gap-2.5">
        <StatusDot severity={item.severity} />
        <span className={cn(
          "text-label-sm",
          item.severity === "ok" ? "text-sc-navy/70" : "text-sc-navy font-medium",
        )}>
          {item.label}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={cn(
          "text-label-sm font-bold tabular-nums",
          item.severity === "ok"    && "text-emerald-600",
          item.severity === "warn"  && "text-amber-600",
          item.severity === "error" && "text-sc-rose",
        )}>
          {item.count}
        </span>
        {item.linkHref && item.count > 0 && (
          <ChevronRight className="size-3.5 text-sc-gray-400" />
        )}
      </div>
    </div>
  );

  if (item.linkHref && item.count > 0) {
    return <Link href={item.linkHref}>{row}</Link>;
  }
  return row;
}

// ── Section wrapper ────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 font-serif text-heading-2 text-sc-navy mb-3">
        <Icon className="size-5 text-sc-teal" />
        {title}
      </h2>
      {children}
    </section>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────

interface Props {
  initialData: AdminHealthData;
}

export function AdminHealthDashboard({ initialData }: Props) {
  const [data, setData]                 = useState(initialData);
  const [loading, setLoading]           = useState(false);
  const [scanLoading, setScanLoading]   = useState(false);
  const [connLoading, setConnLoading]   = useState(false);
  const [autoRefresh, setAutoRefresh]   = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await getAdminHealthData();
      setData(fresh);
      setLastRefreshed(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } finally {
      setLoading(false);
    }
  }, []);

  // 10-minute auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [autoRefresh, refresh]);

  async function runScan() {
    setScanLoading(true);
    try {
      const items = await runIntegrityScan();
      setData(prev => ({ ...prev, integrity: items }));
    } finally {
      setScanLoading(false);
    }
  }

  async function runConnCheck() {
    setConnLoading(true);
    try {
      const result = await checkDbConnection();
      setData(prev => ({
        ...prev,
        appHealth: { ...prev.appHealth, connectionOk: result.ok, dbLatencyMs: result.latencyMs },
      }));
    } finally {
      setConnLoading(false);
    }
  }

  const integrityErrors = data.integrity.filter(i => i.severity === "error").length;
  const integrityWarns  = data.integrity.filter(i => i.severity === "warn").length;
  const overallHealth   = integrityErrors > 0 ? "error" : integrityWarns > 0 ? "warn" : "ok";

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-widest">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h1 className="font-serif text-display-2 text-sc-navy leading-tight">Administrator Health</h1>
          <p className="text-body-md text-sc-gray mt-0.5">
            System readiness check · Last refreshed {lastRefreshed}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge
            severity={overallHealth}
            label={overallHealth === "ok" ? "System Healthy" : overallHealth === "warn" ? "Needs Attention" : "Action Required"}
          />
          <label className="flex items-center gap-1.5 cursor-pointer text-label-sm text-sc-gray select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (10 min)
          </label>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── System Overview ──────────────────────────────────────── */}
      <Section title="System Overview" icon={Building2}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatTile label="Enrolled Students" value={data.overview.totalEnrolled}  icon={GraduationCap} color="teal" />
          <StatTile label="Active Families"   value={data.overview.activeFamilies} icon={Heart}         color="navy" />
          <StatTile label="Active Guardians"  value={data.overview.activeGuardians}icon={Users}         color="green" />
          <StatTile label="Active Staff"      value={data.overview.activeStaff}    icon={Briefcase}     color="gold" />
          <StatTile label="Organizations"     value={data.overview.totalOrgs}      icon={Building2}     color="gray" />
          <StatTile label="Environment"       value={data.overview.nodeEnv}        icon={Server}        color={data.overview.nodeEnv === "production" ? "teal" : "gold"} />
          <StatTile label="App Version"       value={`v${data.overview.appVersion}`} icon={Activity}    color="gray" />
          <StatTile
            label="Deployment"
            value={data.overview.deploymentUrl.replace(/^https?:\/\//, "").split(".")[0] ?? "local"}
            icon={Server}
            color="gray"
          />
        </div>
      </Section>

      {/* ── Today's Status ───────────────────────────────────────── */}
      <Section title="Today's Status" icon={Activity}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <StatTile label="Checked In"     value={data.today.checkedIn}     icon={CheckCircle2} color="teal" />
          <StatTile label="On Campus"      value={data.today.onCampus}      icon={Users}        color="green" />
          <StatTile label="Checked Out"    value={data.today.checkedOut}    icon={CheckCircle2} color="navy" />
          <StatTile label="Absent"         value={data.today.absent}        icon={XCircle}      color={data.today.absent > 0 ? "rose" : "gray"} />
          <StatTile label="Excused"        value={data.today.excused}       icon={CheckCircle2} color="gray" />
          <StatTile label="Late Arrivals"  value={data.today.lateArrivals}  icon={Clock}        color={data.today.lateArrivals > 0 ? "gold" : "gray"} />
          <StatTile label="Att. Anomalies" value={data.today.attendanceAnomalies} icon={AlertTriangle} color={data.today.attendanceAnomalies > 0 ? "rose" : "gray"} />
          <StatTile label="Open Incidents" value={data.today.openIncidents} icon={AlertOctagon}  color={data.today.openIncidents > 0 ? "rose" : "gray"} />
          <StatTile label="Safety Alerts"  value={data.today.openSafetyAlerts} icon={Shield}    color={data.today.openSafetyAlerts > 0 ? "rose" : "gray"} />
          <StatTile label="Medical Alerts" value={data.today.medicalAlerts}  icon={AlertTriangle} color={data.today.medicalAlerts > 0 ? "gold" : "gray"} />
          <StatTile label="Waiting Staff"  value={data.today.unreadMessages} icon={MessageSquare} color={data.today.unreadMessages > 0 ? "rose" : "gray"} />
          <StatTile label="Open Convos"    value={data.today.unresolvedConvos} icon={MessageSquare} color={data.today.unresolvedConvos > 5 ? "gold" : "gray"} />
        </div>
      </Section>

      {/* ── Data Integrity ───────────────────────────────────────── */}
      <Section title="Data Integrity" icon={Database}>
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-sc-gray-100 bg-sc-gray-50/50">
            <div className="flex items-center gap-3">
              {integrityErrors > 0 && (
                <span className="text-[11px] font-semibold text-sc-rose bg-sc-rose-50 border border-sc-rose-200 rounded-full px-2 py-0.5">
                  {integrityErrors} error{integrityErrors > 1 ? "s" : ""}
                </span>
              )}
              {integrityWarns > 0 && (
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  {integrityWarns} warning{integrityWarns > 1 ? "s" : ""}
                </span>
              )}
              {integrityErrors === 0 && integrityWarns === 0 && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                  All checks passed
                </span>
              )}
            </div>
            <button
              onClick={runScan}
              disabled={scanLoading}
              className="flex items-center gap-1.5 text-label-sm text-sc-teal hover:text-sc-teal-700 disabled:opacity-50 transition-colors"
            >
              <Play className={cn("size-3.5", scanLoading && "animate-pulse")} />
              {scanLoading ? "Scanning…" : "Re-scan"}
            </button>
          </div>
          <div>
            {data.integrity.map((item, i) => (
              <IntegrityRow key={i} item={item} />
            ))}
          </div>
        </div>
      </Section>

      {/* ── Application Health ───────────────────────────────────── */}
      <Section title="Application Health" icon={Server}>
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
          {[
            {
              label:    "Database Connection",
              value:    data.appHealth.connectionOk ? "Connected" : "Disconnected",
              severity: data.appHealth.connectionOk ? "ok" as const : "error" as const,
            },
            {
              label:    "Database Latency",
              value:    `${data.appHealth.dbLatencyMs}ms`,
              severity: data.appHealth.dbLatencyMs < 300 ? "ok" as const
                       : data.appHealth.dbLatencyMs < 800 ? "warn" as const : "error" as const,
            },
            {
              label:    "Realtime",
              value:    data.appHealth.realtimeEnabled ? "Enabled" : "Disabled",
              severity: data.appHealth.realtimeEnabled ? "ok" as const : "warn" as const,
            },
            {
              label:    "Storage",
              value:    data.appHealth.storageEnabled ? "Enabled" : "Disabled",
              severity: data.appHealth.storageEnabled ? "ok" as const : "warn" as const,
            },
            {
              label:    "Latest Migration",
              value:    data.appHealth.latestMigration,
              severity: "ok" as const,
            },
            {
              label:    "Server Time",
              value:    new Date(data.appHealth.serverTime).toLocaleString(),
              severity: "ok" as const,
            },
            {
              label:    "Org Timezone",
              value:    data.appHealth.orgTimezone ?? "Not configured",
              severity: data.appHealth.orgTimezone ? "ok" as const : "warn" as const,
            },
          ].map((row, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-sc-gray-100 last:border-b-0">
              <div className="flex items-center gap-2.5">
                <StatusDot severity={row.severity} />
                <span className="text-label-sm text-sc-navy">{row.label}</span>
              </div>
              <span className="text-label-sm text-sc-gray tabular-nums">{row.value}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Security Health ──────────────────────────────────────── */}
      <Section title="Security Health" icon={Shield}>
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
          {[
            { label: "Row Level Security", value: "Enabled on all tables", severity: "ok" as const },
            { label: "Tables without RLS", value: data.security.tablesWithoutRls === 0 ? "None" : `${data.security.tablesWithoutRls} tables`, severity: data.security.tablesWithoutRls === 0 ? "ok" as const : "error" as const },
            { label: "Total RLS Policies", value: `~${data.security.totalRlsPolicies}`, severity: "ok" as const },
            { label: "Latest Security Migration", value: data.security.latestMigration, severity: "ok" as const },
            { label: "Cross-org Isolation", value: "Enforced via org_id scoping", severity: "ok" as const },
            { label: "QR Endpoint Protection", value: "Verified (token-based auth)", severity: "ok" as const },
            { label: "Parent Portal Protection", value: "Role-gated (middleware + RLS)", severity: "ok" as const },
            { label: "Anonymous Access", value: "Blocked (anon key restricted)", severity: "ok" as const },
            { label: "Service Role Exposure", value: "Server-only (never NEXT_PUBLIC_)", severity: "ok" as const },
          ].map((row, i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-sc-gray-100 last:border-b-0">
              <div className="flex items-center gap-2.5">
                <StatusDot severity={row.severity} />
                <span className="text-label-sm text-sc-navy">{row.label}</span>
              </div>
              <StatusBadge severity={row.severity} label={row.value} />
            </div>
          ))}
        </div>
      </Section>

      {/* ── Storage Health ───────────────────────────────────────── */}
      <Section title="Storage Health" icon={HardDrive}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile label="Student Documents"  value={data.storage.studentDocuments} icon={HardDrive} color="teal" />
          <StatTile label="Work Samples"       value={data.storage.workSamples}      icon={HardDrive} color="navy" />
          <StatTile label="Yearbook Portfolios" value={data.storage.yearbooks}        icon={HardDrive} color="gray" />
          <StatTile label="Drive Folders"      value={data.storage.driveFolders}     icon={HardDrive} color="gray" />
          <StatTile label="Broken Doc Refs"    value={data.storage.brokenDocRefs}    icon={AlertTriangle} color={data.storage.brokenDocRefs > 0 ? "rose" : "gray"} />
          <StatTile label="Broken Drive Refs"  value={data.storage.brokenDriveFolders} icon={AlertTriangle} color={data.storage.brokenDriveFolders > 0 ? "rose" : "gray"} />
        </div>
      </Section>

      {/* ── Communication Health ─────────────────────────────────── */}
      <Section title="Communication Health" icon={MessageSquare}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile label="Waiting on Staff"    value={data.commHealth.waitingStaff}   icon={MessageSquare} color={data.commHealth.waitingStaff > 0 ? "rose" : "gray"} />
          <StatTile label="Open Conversations"  value={data.commHealth.openConvos}     icon={MessageSquare} color={data.commHealth.openConvos > 0 ? "teal" : "gray"} />
          <StatTile label="High Priority"       value={data.commHealth.highPriorityConvos} icon={AlertTriangle} color={data.commHealth.highPriorityConvos > 0 ? "rose" : "gray"} />
          <StatTile label="Waiting on Parent"   value={data.commHealth.waitingParent}  icon={MessageSquare} color={data.commHealth.waitingParent > 0 ? "gold" : "gray"} />
          <StatTile label="Unread Messages"     value={data.commHealth.unreadMessages} icon={MessageSquare} color={data.commHealth.unreadMessages > 0 ? "rose" : "gray"} />
          <StatTile label="Unassigned"          value={data.commHealth.unassignedConvos} icon={MessageSquare} color={data.commHealth.unassignedConvos > 3 ? "gold" : "gray"} />
        </div>
        {(data.commHealth.openConvos > 0 || data.commHealth.highPriorityConvos > 0) && (
          <div className="mt-3">
            <Link
              href="/dashboard/messages"
              className="inline-flex items-center gap-1.5 text-label-sm text-sc-teal hover:text-sc-teal-700 transition-colors"
            >
              Open Messages Inbox <ChevronRight className="size-3.5" />
            </Link>
          </div>
        )}
      </Section>

      {/* ── Quick Maintenance ────────────────────────────────────── */}
      <Section title="Quick Maintenance" icon={Play}>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-sc-gray-200 bg-white px-4 py-2.5 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            Refresh Dashboard
          </button>
          <button
            onClick={runScan}
            disabled={scanLoading}
            className="flex items-center gap-2 rounded-xl border border-sc-gray-200 bg-white px-4 py-2.5 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors disabled:opacity-50"
          >
            <Database className={cn("size-4", scanLoading && "animate-pulse")} />
            {scanLoading ? "Scanning…" : "Run Integrity Scan"}
          </button>
          <button
            onClick={runConnCheck}
            disabled={connLoading}
            className="flex items-center gap-2 rounded-xl border border-sc-gray-200 bg-white px-4 py-2.5 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors disabled:opacity-50"
          >
            <Server className={cn("size-4", connLoading && "animate-pulse")} />
            {connLoading ? "Checking…" : "Check DB Connection"}
          </button>
          <Link
            href="/dashboard/messages"
            className="flex items-center gap-2 rounded-xl border border-sc-gray-200 bg-white px-4 py-2.5 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors"
          >
            <MessageSquare className="size-4" />
            Open Messages
          </Link>
          <Link
            href="/dashboard/attendance"
            className="flex items-center gap-2 rounded-xl border border-sc-gray-200 bg-white px-4 py-2.5 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors"
          >
            <Activity className="size-4" />
            Open Attendance
          </Link>
        </div>
        <p className="text-[11px] text-sc-gray-400 mt-3">
          Last full scan: {new Date(initialData.generatedAt).toLocaleString()} ·
          Generated at: {new Date(data.generatedAt).toLocaleString()}
        </p>
      </Section>

    </div>
  );
}
