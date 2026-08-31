"use client";

import { useState, useEffect, useCallback } from "react";
import { UserCheck, RefreshCw } from "lucide-react";
import { getStaffOnDuty, type StaffOnDutyMember } from "@/app/actions/staffAttendance";
import { formatAttendanceTime } from "@/lib/format-attendance-time";
import { cn } from "@/lib/utils";

interface Props {
  date:    string;
  isToday: boolean;
}

export function StaffOnDutyPanel({ date, isToday }: Props) {
  const [staff, setStaff]       = useState<StaffOnDutyMember[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getStaffOnDuty(date);
    setStaff(result);
    setLastFetch(Date.now());
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // Refresh with the parent dashboard when it refreshes (via date change)
  useEffect(() => {
    if (lastFetch && Date.now() - lastFetch > 30_000) load();
  });

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-sc-gray-100">
        <div className="flex items-center gap-2.5">
          <UserCheck className="size-5 text-sc-teal" />
          <h2 className="font-serif text-heading-3 text-sc-navy">
            Staff on Duty
          </h2>
          {!loading && (
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              staff.length > 0
                ? "bg-sc-teal text-white"
                : "bg-sc-gray-200 text-sc-gray"
            )}>
              {staff.length}
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg p-1.5 text-sc-gray hover:bg-sc-gray-50 transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </button>
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-sc-gray-100 px-3 py-2 animate-pulse">
                <div className="h-8 w-8 rounded-full bg-sc-gray-100" />
                <div className="space-y-1">
                  <div className="h-3 w-20 rounded bg-sc-gray-100" />
                  <div className="h-2 w-12 rounded bg-sc-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : staff.length === 0 ? (
          <p className="text-label-sm text-sc-gray-400 text-center py-2">
            {isToday ? "No staff checked in yet today." : "No staff were on duty this day."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {staff.map((member) => {
              const initials = `${member.first_name[0] ?? ""}${member.last_name[0] ?? ""}`.toUpperCase();
              return (
                <div
                  key={member.roster_id}
                  className="flex items-center gap-2.5 rounded-xl border border-sc-teal/20 bg-sc-teal-50 px-3 py-2"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sc-teal text-white text-label-sm font-bold shrink-0">
                    {initials}
                  </div>
                  <div>
                    <p className="text-label-md font-semibold text-sc-navy leading-tight">
                      {member.first_name} {member.last_name}
                    </p>
                    <p className="text-label-sm text-sc-gray-400 leading-tight">
                      In {formatAttendanceTime(member.check_in_at)}
                      {member.display_title && ` · ${member.display_title}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
