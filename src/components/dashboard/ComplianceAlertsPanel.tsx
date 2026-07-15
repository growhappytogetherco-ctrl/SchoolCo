"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert, ShieldX, Clock, ChevronDown, ChevronUp } from "lucide-react";
import {
  getComplianceDashboardAlerts,
  type ComplianceDashboardAlert,
} from "@/app/actions/staffComplianceActions";
import { cn } from "@/lib/utils";

const URGENCY_CFG: Record<
  ComplianceDashboardAlert["urgency"],
  { cls: string; label: string }
> = {
  critical: { cls: "text-sc-rose",       label: "Critical" },
  high:     { cls: "text-sc-gold-700",   label: "High"     },
  normal:   { cls: "text-sc-gray",       label: "Normal"   },
};

const STATUS_ICON: Record<string, React.ElementType> = {
  missing:        ShieldX,
  expired:        ShieldAlert,
  expiring_soon:  Clock,
  pending_overdue: Clock,
};

export function ComplianceAlertsPanel() {
  const [alerts, setAlerts]   = useState<ComplianceDashboardAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    getComplianceDashboardAlerts().then((data) => {
      setAlerts(data);
      setLoading(false);
      if (data.length > 0) setExpanded(true);
    });
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 animate-pulse">
        <div className="h-5 w-48 rounded bg-sc-gray-100" />
      </div>
    );
  }

  if (alerts.length === 0) return null;

  const criticalCount = alerts.filter((a) => a.urgency === "critical").length;

  return (
    <div className={cn(
      "rounded-2xl border-2 bg-white shadow-card overflow-hidden",
      criticalCount > 0 ? "border-sc-rose-200" : "border-sc-gold-200"
    )}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          "w-full flex items-center justify-between px-5 py-4 hover:opacity-80 transition-opacity",
          criticalCount > 0 ? "bg-sc-rose-50" : "bg-sc-gold-50"
        )}
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className={cn("size-4", criticalCount > 0 ? "text-sc-rose" : "text-sc-gold-600")} />
          <h3 className={cn(
            "font-serif text-heading-3 font-bold",
            criticalCount > 0 ? "text-sc-rose" : "text-sc-gold-700"
          )}>
            Compliance Alerts ({alerts.length})
          </h3>
          {criticalCount > 0 && (
            <span className="rounded-full bg-sc-rose text-white px-2 py-0.5 text-[10px] font-bold">
              {criticalCount} Critical
            </span>
          )}
        </div>
        {expanded
          ? <ChevronUp className="size-4 text-sc-gray" />
          : <ChevronDown className="size-4 text-sc-gray" />}
      </button>

      {expanded && (
        <div className="divide-y divide-sc-gray-100">
          {alerts.map((alert, i) => {
            const Icon  = STATUS_ICON[alert.alert_type] ?? ShieldAlert;
            const uCfg  = URGENCY_CFG[alert.urgency];
            return (
              <Link
                key={`${alert.staff_id}-${alert.requirement_type}-${i}`}
                href={`/dashboard/staff/${alert.staff_id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-sc-gray-50 transition-colors"
              >
                <Icon className={cn("size-4 shrink-0", uCfg.cls)} />
                <div className="min-w-0 flex-1">
                  <p className="text-label-sm font-semibold text-sc-navy truncate">{alert.staff_name}</p>
                  <p className="text-label-sm text-sc-gray truncate">
                    {alert.display_label} — {alert.display_status.replace(/_/g, " ")}
                    {alert.expiration_date && ` · ${new Date(alert.expiration_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                  </p>
                </div>
                <span className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  alert.urgency === "critical"
                    ? "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200"
                    : alert.urgency === "high"
                      ? "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200"
                      : "bg-sc-gray-50 text-sc-gray-600 border-sc-gray-200"
                )}>
                  {uCfg.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
