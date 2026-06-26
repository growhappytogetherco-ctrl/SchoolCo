"use client";

import { useEffect, useState } from "react";
import { AlertOctagon, CheckCircle, Clock } from "lucide-react";
import { getStudentIncidentsData } from "@/app/actions/profileData";
import { cn } from "@/lib/utils";

interface Props { studentId: string }

type IncData = Awaited<ReturnType<typeof getStudentIncidentsData>>;

const TYPE_CFG: Record<string, { cls: string }> = {
  behavioral: { cls: "bg-sc-gold-50  text-sc-gold-700  border-sc-gold-200"  },
  medical:    { cls: "bg-sc-rose-50  text-sc-rose-700  border-sc-rose-200"  },
  safety:     { cls: "bg-sc-rose     text-white         border-sc-rose-700"  },
  property:   { cls: "bg-sc-navy-50  text-sc-navy       border-sc-navy-200"  },
  other:      { cls: "bg-sc-gray-50  text-sc-gray       border-sc-gray-200"  },
};

const SEVERITY_CFG: Record<string, string> = {
  low:      "bg-sc-gray-50  text-sc-gray   border-sc-gray-200",
  medium:   "bg-sc-gold-50  text-sc-gold-700 border-sc-gold-200",
  high:     "bg-sc-rose-50  text-sc-rose-700 border-sc-rose-200",
  critical: "bg-sc-rose     text-white       border-sc-rose-700",
};

const STATUS_CFG: Record<string, { icon: React.ElementType; cls: string }> = {
  open:         { icon: AlertOctagon, cls: "text-sc-rose"  },
  under_review: { icon: Clock,        cls: "text-sc-gold"  },
  resolved:     { icon: CheckCircle,  cls: "text-sc-teal"  },
  closed:       { icon: CheckCircle,  cls: "text-sc-gray"  },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function IncidentsTab({ studentId }: Props) {
  const [data, setData] = useState<IncData>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentIncidentsData(studentId).then((d) => { setData(d); setLoading(false); });
  }, [studentId]);

  if (loading) return <div className="space-y-3">{[1,2,3].map((i) => <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card h-28 animate-pulse" />)}</div>;

  const incidents = data?.incidents ?? [];
  const open = incidents.filter((i) => i.status === "open" || i.status === "under_review").length;

  return (
    <div className="space-y-5 max-w-3xl">
      {open > 0 && (
        <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 px-4 py-3">
          <p className="text-label-sm text-sc-rose-700 font-semibold">
            {open} open {open === 1 ? "incident" : "incidents"} requiring attention
          </p>
        </div>
      )}

      {incidents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sc-gray-200 p-8 text-center">
          <p className="text-body-md text-sc-gray-400">No incidents recorded for this student.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {incidents.map((inc) => {
            const type = TYPE_CFG[inc.incident_type] ?? TYPE_CFG.other;
            const StatusIcon = STATUS_CFG[inc.status]?.icon ?? AlertOctagon;
            const statusCls = STATUS_CFG[inc.status]?.cls ?? "text-sc-gray";

            return (
              <div key={inc.id} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-2 mb-1.5">
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium capitalize", type.cls)}>
                        {inc.incident_type}
                      </span>
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium", SEVERITY_CFG[inc.severity] ?? "")}>
                        {inc.severity}
                      </span>
                    </div>
                    <h3 className="text-label-md font-semibold text-sc-navy">{inc.title}</h3>
                    <p className="text-label-sm text-sc-gray">{fmtDate(inc.occurred_at)}</p>
                  </div>
                  <div className={cn("flex items-center gap-1 text-label-sm font-medium shrink-0", statusCls)}>
                    <StatusIcon className="size-4" />
                    <span className="capitalize">{inc.status.replace("_", " ")}</span>
                  </div>
                </div>

                {/* Description */}
                {inc.description && (
                  <p className="text-body-sm text-sc-navy whitespace-pre-wrap">{inc.description}</p>
                )}

                {/* Resolution */}
                {inc.resolution_notes && (
                  <div className="rounded-lg bg-sc-teal-50 border border-sc-teal-200 px-3 py-2">
                    <p className="text-label-sm font-semibold text-sc-teal-700">Resolution</p>
                    <p className="text-label-sm text-sc-navy mt-0.5">{inc.resolution_notes}</p>
                  </div>
                )}

                {/* Parent notified */}
                {inc.parent_notified && (
                  <div className="flex items-center gap-1.5 text-label-sm text-sc-teal">
                    <CheckCircle className="size-3.5" /> Parent notified
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
