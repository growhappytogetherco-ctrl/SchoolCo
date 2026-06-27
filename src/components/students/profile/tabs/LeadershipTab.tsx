"use client";

import { useEffect, useState } from "react";
import { Award, Heart, CheckCircle } from "lucide-react";
import { getStudentLeadershipData } from "@/app/actions/profileData";
import { cn } from "@/lib/utils";

interface Props { studentId: string }

type LeadData = Awaited<ReturnType<typeof getStudentLeadershipData>>;

const BADGE_LEVEL_CFG: Record<string, { cls: string; ring: string; label: string }> = {
  platinum: { cls: "bg-gradient-to-br from-sc-gray-200 to-sc-gray-400 text-white", ring: "ring-sc-gray-300", label: "Platinum" },
  gold:     { cls: "bg-gradient-to-br from-sc-gold-300 to-sc-gold-600 text-white",  ring: "ring-sc-gold-300",  label: "Gold"     },
  silver:   { cls: "bg-gradient-to-br from-sc-gray-100 to-sc-gray-300 text-sc-gray", ring: "ring-sc-gray-200", label: "Silver"  },
  bronze:   { cls: "bg-gradient-to-br from-amber-200 to-amber-400 text-white",       ring: "ring-amber-300",   label: "Bronze"  },
};

const CATEGORY_CFG: Record<string, { label: string; cls: string }> = {
  character:       { label: "Character",     cls: "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200"    },
  academic:        { label: "Academic",      cls: "bg-sc-navy-50 text-sc-navy border-sc-navy-200"         },
  leadership:      { label: "Leadership",    cls: "bg-sc-rose-50 text-sc-rose border-sc-rose-200"         },
  service:         { label: "Service",       cls: "bg-sc-green/10 text-sc-green border-sc-green/20"       },
  entrepreneurship:{ label: "Entrepreneur",  cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200"    },
  attendance:      { label: "Attendance",    cls: "bg-sc-teal-50 text-sc-teal border-sc-teal-200"         },
  special:         { label: "Special",       cls: "bg-sc-gray-50 text-sc-gray border-sc-gray-200"         },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function LeadershipTab({ studentId }: Props) {
  const [data, setData] = useState<LeadData>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    getStudentLeadershipData(studentId).then((d) => { setData(d); setLoading(false); });
  }, [studentId]);

  if (loading) return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3].map((i) => <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card h-24 animate-pulse" />)}
      </div>
    </div>
  );

  const badges = data?.badges ?? [];
  const hours  = data?.service_hours ?? [];
  const total  = data?.total_service_hours ?? 0;

  const filtered = filter === "all" ? badges : badges.filter((b) => b.badge_category === filter);
  const categories = Array.from(new Set(badges.map((b) => b.badge_category)));

  // Level summary counts
  const levelCounts = badges.reduce((acc, b) => {
    acc[b.badge_level] = (acc[b.badge_level] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 text-center">
          <p className="font-serif text-heading-1 font-bold text-sc-teal">{badges.length}</p>
          <p className="text-label-sm text-sc-gray mt-1">Total Badges</p>
        </div>
        {["platinum","gold","silver","bronze"].map((level) => (
          levelCounts[level] ? (
            <div key={level} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 text-center">
              <p className="font-serif text-heading-1 font-bold text-sc-navy">{levelCounts[level]}</p>
              <p className="text-label-sm text-sc-gray mt-1 capitalize">{level}</p>
            </div>
          ) : null
        ))}
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 text-center">
          <p className="font-serif text-heading-1 font-bold text-sc-green">{total.toFixed(1)}</p>
          <p className="text-label-sm text-sc-gray mt-1">Service Hours</p>
        </div>
      </div>

      {/* Badges section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-heading-2 text-sc-navy flex items-center gap-2">
            <Award className="size-5 text-sc-gold" /> Badges Earned
          </h2>
        </div>

        {/* Category filter */}
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <FilterBtn active={filter === "all"} onClick={() => setFilter("all")} label="All" />
            {categories.map((cat) => (
              <FilterBtn key={cat} active={filter === cat} onClick={() => setFilter(cat)}
                label={CATEGORY_CFG[cat]?.label ?? cat} />
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState message={badges.length === 0 ? "No badges earned yet." : "No badges in this category."} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((badge) => {
              const level = BADGE_LEVEL_CFG[badge.badge_level] ?? BADGE_LEVEL_CFG.bronze;
              const cat   = CATEGORY_CFG[badge.badge_category] ?? CATEGORY_CFG.special;
              return (
                <div key={badge.id} className={cn(
                  "rounded-2xl border bg-white shadow-card p-5 space-y-3",
                  badge.featured ? "border-sc-gold-300 ring-1 ring-sc-gold-200" : "border-sc-gray-100"
                )}>
                  {/* Badge icon */}
                  <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl ring-2", level.cls, level.ring)}>
                    <Award className="size-6" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("rounded-full border px-2 py-0.5 text-label-sm font-medium", cat.cls)}>
                        {cat.label}
                      </span>
                      <span className="text-label-sm font-semibold text-sc-gray capitalize">{badge.badge_level}</span>
                    </div>
                    <p className="text-label-md font-semibold text-sc-navy mt-1.5">{badge.badge_name}</p>
                    {badge.description && (
                      <p className="text-label-sm text-sc-gray mt-1 line-clamp-2">{badge.description}</p>
                    )}
                  </div>

                  <p className="text-label-sm text-sc-gray-400">{fmtDate(badge.earned_at)}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Service hours section */}
      <div className="space-y-4">
        <h2 className="font-serif text-heading-2 text-sc-navy flex items-center gap-2">
          <Heart className="size-5 text-sc-rose" /> Community Service
        </h2>

        {hours.length === 0 ? (
          <EmptyState message="No service hours recorded yet." />
        ) : (
          <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
            <div className="divide-y divide-sc-gray-100">
              {hours.map((h) => (
                <div key={h.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sc-green/10 border border-sc-green/20">
                    <Heart className="size-4 text-sc-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-label-md font-semibold text-sc-navy truncate">{h.activity_name}</p>
                    {h.organization_name && (
                      <p className="text-label-sm text-sc-gray">{h.organization_name}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-label-md font-bold text-sc-green">{Number(h.hours).toFixed(1)} hrs</p>
                    <p className="text-label-sm text-sc-gray">{fmtDate(h.service_date)}</p>
                  </div>
                  {h.verified && (
                    <CheckCircle className="size-4 text-sc-teal shrink-0" aria-label="Verified" />
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 bg-sc-gray-50 border-t border-sc-gray-100 flex justify-between text-label-md">
              <span className="text-sc-gray">Total Hours</span>
              <span className="font-bold text-sc-green">{total.toFixed(1)} hours</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={cn("rounded-full px-3 py-1 text-label-sm font-medium border transition-colors",
        active ? "bg-sc-navy text-white border-sc-navy" : "border-sc-gray-200 text-sc-gray hover:border-sc-navy hover:text-sc-navy"
      )}>
      {label}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-sc-gray-200 p-8 text-center">
      <p className="text-body-md text-sc-gray-400">{message}</p>
    </div>
  );
}
