"use client";

import { useState } from "react";
import { Rocket, CheckSquare, Upload, ShieldCheck, QrCode, Users, PlayCircle, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LaunchItem, ImportJob, ValidationResult, PilotFamily } from "@/app/actions/launch";
import { LaunchChecklist } from "./LaunchChecklist";
import { DataImport } from "./DataImport";
import { ImportValidation } from "./ImportValidation";
import { QrBadgeCenter } from "./QrBadgeCenter";
import { ParentPilot } from "./ParentPilot";
import { DressRehearsal } from "./DressRehearsal";
import { GoLive } from "./GoLive";

// ── Types ─────────────────────────────────────────────────────────────────

interface QrStatus {
  total: number;
  hasQr: number;
  missingQr: number;
  byGrade: Record<string, { total: number; hasQr: number }>;
}

interface LaunchCenterProps {
  initialChecklist: LaunchItem[];
  initialImportJobs: ImportJob[];
  initialQrStatus: QrStatus;
  initialValidation: ValidationResult | null;
  initialPilotFamilies: PilotFamily[];
}

// ── Tabs ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: "checklist",   label: "Launch Checklist",   icon: CheckSquare },
  { id: "import",      label: "Data Import",         icon: Upload      },
  { id: "validation",  label: "Import Validation",   icon: ShieldCheck },
  { id: "qr",          label: "QR Badges",           icon: QrCode      },
  { id: "pilot",       label: "Parent Pilot",        icon: Users       },
  { id: "rehearsal",   label: "Dress Rehearsal",     icon: PlayCircle  },
  { id: "golive",      label: "Go Live",             icon: Flag        },
] as const;

type TabId = typeof TABS[number]["id"];

// ── Component ─────────────────────────────────────────────────────────────

export function LaunchCenter({
  initialChecklist,
  initialImportJobs,
  initialQrStatus,
  initialValidation,
  initialPilotFamilies,
}: LaunchCenterProps) {
  const [activeTab, setActiveTab] = useState<TabId>("checklist");
  const [checklist, setChecklist] = useState(initialChecklist);

  const completedCount = checklist.filter((i) => i.status === "completed").length;
  const totalCount = checklist.length;
  const allReady = completedCount === totalCount;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ──────────────────────────────────────── */}
      <div className="rounded-2xl bg-sc-navy text-white p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Rocket className="size-6 text-white" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold leading-tight">
                Launch Readiness Center
              </h1>
              <p className="text-sm text-white/70 mt-0.5">
                Rising Leaders Academy · Pre-Launch Command Center
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold",
                allReady
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                  : "bg-amber-400/20 text-amber-300 border border-amber-400/30"
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  allReady ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                )}
              />
              {allReady ? "System Ready" : "In Progress"}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/70">Overall Progress</span>
            <span className="text-sm font-semibold text-white">
              {completedCount} / {totalCount} checks complete
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                allReady ? "bg-emerald-400" : "bg-sc-teal"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <p className="text-xs text-white/50 mt-1">{progressPct}% complete</p>
        </div>
      </div>

      {/* ── Tab nav ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white border border-sc-gray-100 shadow-card p-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-2 text-label-sm transition-all",
              activeTab === id
                ? "bg-sc-navy text-white shadow-sm"
                : "text-sc-gray hover:bg-sc-gray-100 hover:text-sc-navy"
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────── */}
      {activeTab === "checklist" && (
        <LaunchChecklist checklist={checklist} onUpdate={setChecklist} />
      )}
      {activeTab === "import" && (
        <DataImport initialJobs={initialImportJobs} />
      )}
      {activeTab === "validation" && (
        <ImportValidation initialResult={initialValidation} />
      )}
      {activeTab === "qr" && (
        <QrBadgeCenter initialStatus={initialQrStatus} />
      )}
      {activeTab === "pilot" && (
        <ParentPilot initialFamilies={initialPilotFamilies} />
      )}
      {activeTab === "rehearsal" && <DressRehearsal />}
      {activeTab === "golive" && (
        <GoLive onChecklistUpdate={setChecklist} />
      )}
    </div>
  );
}
