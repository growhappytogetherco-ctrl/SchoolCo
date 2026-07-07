"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert, Pill, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { getMedicalDashboardAlerts } from "@/app/actions/medicalActions";
import type { MedicalDashboardAlert } from "@/app/actions/medicalActions";
import { cn } from "@/lib/utils";

const ALERT_TYPE_CONFIG: Record<MedicalDashboardAlert["alert_type"], { icon: React.ElementType; label: string; color: string }> = {
  life_threatening_allergy: { icon: ShieldAlert, label: "Life-Threatening Allergy", color: "text-sc-rose" },
  emergency_medication:     { icon: Pill,        label: "Emergency Medication",     color: "text-sc-rose" },
  emergency_condition:      { icon: AlertTriangle, label: "Emergency Condition",    color: "text-sc-gold-700" },
};

export function MedicalAlertsPanel() {
  const [alerts, setAlerts] = useState<MedicalDashboardAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    getMedicalDashboardAlerts().then((data) => {
      setAlerts(data);
      setLoading(false);
      if (data.length > 0) setExpanded(true);
    });
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 animate-pulse">
        <div className="h-5 w-40 rounded bg-sc-gray-100" />
      </div>
    );
  }

  if (alerts.length === 0) return null;

  return (
    <div className="rounded-2xl border-2 border-sc-rose-200 bg-white shadow-card overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-sc-rose-50 hover:bg-sc-rose-100/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-sc-rose" />
          <h3 className="font-serif text-heading-3 text-sc-rose font-bold">
            Medical Alerts ({alerts.length})
          </h3>
        </div>
        {expanded ? <ChevronUp className="size-4 text-sc-rose" /> : <ChevronDown className="size-4 text-sc-rose" />}
      </button>

      {expanded && (
        <div className="divide-y divide-sc-gray-100">
          {alerts.map((alert, i) => {
            const config = ALERT_TYPE_CONFIG[alert.alert_type];
            const Icon = config.icon;
            return (
              <Link
                key={`${alert.student_id}-${alert.alert_type}-${i}`}
                href={`/dashboard/students/${alert.student_id}?tab=medical`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-sc-gray-50 transition-colors"
              >
                <Icon className={cn("size-4 shrink-0", config.color)} />
                <div className="min-w-0 flex-1">
                  <p className="text-label-sm font-semibold text-sc-navy truncate">{alert.student_name}</p>
                  <p className="text-label-sm text-sc-gray truncate">{config.label}: {alert.detail}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
