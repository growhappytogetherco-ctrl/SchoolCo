"use client";

import { useState } from "react";
import { History, ChevronDown, ChevronUp, Target, Heart, ShieldAlert, Brain, CheckCircle, Eye } from "lucide-react";
import type { SSPTimelineEntry } from "@/app/actions/successPlanActions";
import { cn } from "@/lib/utils";

interface Props {
  initial: SSPTimelineEntry[];
}

const EVENT_CFG: Record<string, { Icon: React.ElementType; color: string; label: string }> = {
  family_vision_created:    { Icon: Heart,       color: "text-sc-teal",   label: "Family Vision created"   },
  family_vision_updated:    { Icon: Heart,       color: "text-sc-teal",   label: "Family Vision updated"   },
  goal_added:               { Icon: Target,      color: "text-sc-gold-700", label: "Goal added"            },
  goal_updated:             { Icon: Target,      color: "text-sc-gold-700", label: "Goal updated"          },
  goal_completed:           { Icon: CheckCircle, color: "text-sc-green-600", label: "Goal completed"       },
  strategy_added:           { Icon: ShieldAlert, color: "text-sc-rose",   label: "Strategy added"          },
  strategy_updated:         { Icon: ShieldAlert, color: "text-sc-rose",   label: "Strategy updated"        },
  learning_profile_updated: { Icon: Brain,       color: "text-sc-navy",   label: "Learning Profile updated"},
  review_completed:         { Icon: Eye,         color: "text-sc-teal",   label: "Review completed"        },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " · " +
         d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ReviewTimelineSection({ initial }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAll, setShowAll]     = useState(false);

  const visible = showAll ? initial : initial.slice(0, 10);

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <div className="px-5 py-4 flex items-center justify-between border-b border-sc-gray-100 bg-sc-gray-50">
        <button onClick={() => setCollapsed((v) => !v)} className="flex items-center gap-2.5">
          <History className="size-4 text-sc-gray shrink-0" />
          <div>
            <h3 className="font-serif text-heading-3 text-sc-navy">Review Timeline</h3>
            <p className="text-label-sm text-sc-gray mt-0.5">{initial.length} events · auto-generated</p>
          </div>
          {collapsed ? <ChevronDown className="size-4 text-sc-gray ml-2" /> : <ChevronUp className="size-4 text-sc-gray ml-2" />}
        </button>
      </div>

      {!collapsed && (
        <div className="p-5">
          {initial.length === 0 ? (
            <div className="text-center py-8 text-sc-gray">
              <History className="size-8 mx-auto mb-2 text-sc-gray-300" />
              <p className="text-body-md font-medium text-sc-navy">No timeline events yet</p>
              <p className="text-label-sm mt-1">Events are recorded automatically as the plan is updated.</p>
            </div>
          ) : (
            <>
              <div className="relative space-y-0">
                {visible.map((entry, idx) => {
                  const cfg = EVENT_CFG[entry.event_type] ?? { Icon: History, color: "text-sc-gray", label: entry.event_type };
                  const { Icon } = cfg;
                  return (
                    <div key={entry.id} className="flex gap-3">
                      {/* Spine */}
                      <div className="flex flex-col items-center">
                        <div className={cn("rounded-full border-2 border-white bg-white p-1 shadow-sm z-10", cfg.color)}>
                          <Icon className="size-3.5" />
                        </div>
                        {idx < visible.length - 1 && (
                          <div className="w-px flex-1 bg-sc-gray-100 my-1" />
                        )}
                      </div>
                      {/* Content */}
                      <div className="pb-4 flex-1 min-w-0">
                        <p className="text-body-md text-sc-navy font-medium">{entry.title}</p>
                        {entry.description && (
                          <p className="text-label-sm text-sc-gray mt-0.5">{entry.description}</p>
                        )}
                        <p className="text-label-sm text-sc-gray-400 mt-0.5">{fmtDate(entry.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {initial.length > 10 && (
                <button onClick={() => setShowAll((v) => !v)}
                  className="mt-2 text-label-sm text-sc-teal hover:text-sc-teal-700 font-medium">
                  {showAll ? "Show less" : `Show all ${initial.length} events`}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
