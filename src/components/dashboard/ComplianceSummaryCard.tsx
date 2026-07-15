"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield } from "lucide-react";
import { getComplianceDashboardAlerts } from "@/app/actions/staffComplianceActions";

interface Counts {
  expired: number;
  expiring_soon: number;
  missing: number;
  pending: number;
}

export function ComplianceSummaryCard() {
  const [counts, setCounts]   = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getComplianceDashboardAlerts().then((alerts) => {
      const c: Counts = { expired: 0, expiring_soon: 0, missing: 0, pending: 0 };
      for (const a of alerts) {
        if (a.alert_type === "expired")         c.expired++;
        else if (a.alert_type === "expiring_soon")  c.expiring_soon++;
        else if (a.alert_type === "missing")    c.missing++;
        else if (a.alert_type === "pending_overdue") c.pending++;
      }
      setCounts(c);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl bg-white border border-sc-gray-100 shadow-card p-4 animate-pulse">
        <div className="h-4 w-32 bg-sc-gray-100 rounded mb-3" />
        <div className="space-y-2">
          {[1,2,3].map((i) => <div key={i} className="h-3 w-full bg-sc-gray-50 rounded" />)}
        </div>
      </div>
    );
  }

  if (!counts) return null;

  const total = counts.expired + counts.expiring_soon + counts.missing + counts.pending;
  if (total === 0) return null;

  return (
    <div className="rounded-xl bg-white border border-sc-gray-100 shadow-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="size-4 text-sc-gray-400" />
        <h3 className="font-serif text-heading-3 text-sc-navy">Staff Compliance</h3>
      </div>
      <div className="space-y-1.5">
        {counts.expired > 0 && (
          <Link href="/dashboard/staff?compliance=expired"
            className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-sc-rose-50 hover:bg-sc-rose-100/60 transition-colors">
            <span className="text-label-sm text-sc-rose-700">Expired</span>
            <span className="text-label-sm font-bold text-sc-rose-700">{counts.expired}</span>
          </Link>
        )}
        {counts.expiring_soon > 0 && (
          <Link href="/dashboard/staff?compliance=expiring_soon"
            className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-sc-gold-50 hover:bg-sc-gold-100/60 transition-colors">
            <span className="text-label-sm text-sc-gold-700">Expiring Soon</span>
            <span className="text-label-sm font-bold text-sc-gold-700">{counts.expiring_soon}</span>
          </Link>
        )}
        {counts.missing > 0 && (
          <Link href="/dashboard/staff?compliance=missing"
            className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-sc-gray-50 hover:bg-sc-gray-100 transition-colors">
            <span className="text-label-sm text-sc-gray-600">Missing Items</span>
            <span className="text-label-sm font-bold text-sc-gray-600">{counts.missing}</span>
          </Link>
        )}
        {counts.pending > 0 && (
          <Link href="/dashboard/staff?compliance=pending"
            className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-sc-navy/5 hover:bg-sc-navy/10 transition-colors">
            <span className="text-label-sm text-sc-navy">Pending &gt; 7 days</span>
            <span className="text-label-sm font-bold text-sc-navy">{counts.pending}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
