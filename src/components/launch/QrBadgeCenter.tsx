"use client";

import { useState, useTransition } from "react";
import { QrCode, RefreshCw, Wand2, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateMissingQrCodes,
  getStudentsForBadge,
} from "@/app/actions/launch";
import type { StudentBadge } from "@/app/actions/launch";

// ── Stat card ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div className={cn(
      "rounded-2xl border p-4 flex flex-col gap-1",
      color === "green" ? "bg-emerald-50 border-emerald-200" :
      color === "rose"  ? "bg-sc-rose-50 border-sc-rose-200" :
                          "bg-white border-sc-gray-100 shadow-card"
    )}>
      <p className={cn(
        "text-2xl font-bold tabular-nums",
        color === "green" ? "text-emerald-700" :
        color === "rose"  ? "text-sc-rose-700" :
                            "text-sc-navy"
      )}>{value}</p>
      <p className="text-label-sm text-sc-gray">{label}</p>
      {sub && <p className="text-[10px] text-sc-gray-400">{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function QrBadgeCenter({
  initialStatus,
}: {
  initialStatus: {
    total: number;
    hasQr: number;
    missingQr: number;
    byGrade: Record<string, { total: number; hasQr: number }>;
  };
}) {
  const [status, setStatus] = useState(initialStatus);
  const [students, setStudents] = useState<StudentBadge[]>([]);
  const [filter, setFilter] = useState<"all" | "missing" | string>("all");
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function generate() {
    setError(null);
    setGenResult(null);
    startTransition(async () => {
      const res = await generateMissingQrCodes();
      if (res.success) {
        setGenResult(`Generated ${res.data.generated} QR codes.`);
        // Update local stats
        setStatus((prev) => ({
          ...prev,
          hasQr: prev.hasQr + res.data.generated,
          missingQr: prev.missingQr - res.data.generated,
        }));
      } else {
        setError(res.error);
      }
    });
  }

  async function loadStudents(f: string) {
    setFilter(f as "all" | "missing" | string);
    setLoadingStudents(true);
    const res = await getStudentsForBadge(f);
    if (res.success) setStudents(res.data);
    else setError(res.error);
    setLoadingStudents(false);
  }

  const grades = Object.keys(status.byGrade).sort();

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-sc-navy">QR Badge Center</h2>
          <p className="text-label-sm text-sc-gray mt-0.5">
            Manage student attendance QR codes. Every student needs one before Day 1.
          </p>
        </div>
        {status.missingQr > 0 && (
          <button
            onClick={generate}
            disabled={isPending}
            className="flex items-center gap-2 rounded-xl bg-sc-teal text-white px-4 py-2 text-label-sm font-medium hover:bg-sc-teal-700 transition-colors disabled:opacity-50"
          >
            <Wand2 className={cn("size-3.5", isPending && "animate-spin")} />
            {isPending ? "Generating…" : `Generate ${status.missingQr} Missing`}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose-700">{error}</div>
      )}
      {genResult && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-label-sm text-emerald-700">{genResult}</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Students" value={status.total} />
        <StatCard label="Have QR Code" value={status.hasQr} color="green" sub={status.total > 0 ? `${Math.round((status.hasQr / status.total) * 100)}%` : undefined} />
        <StatCard label="Missing QR Code" value={status.missingQr} color={status.missingQr > 0 ? "rose" : undefined} />
      </div>

      {/* By grade */}
      {grades.length > 0 && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-sc-gray-100">
            <h3 className="font-semibold text-sc-navy text-sm">By Grade Level</h3>
          </div>
          <div className="divide-y divide-sc-gray-100">
            {grades.map((grade) => {
              const g = status.byGrade[grade];
              const pct = g.total > 0 ? Math.round((g.hasQr / g.total) * 100) : 0;
              return (
                <div key={grade} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-20 text-label-sm font-medium text-sc-navy shrink-0">{grade}</span>
                  <div className="flex-1 h-2 bg-sc-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-sc-teal")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-label-sm text-sc-gray shrink-0 tabular-nums w-20 text-right">
                    {g.hasQr}/{g.total}
                    {g.total - g.hasQr > 0 && (
                      <span className="text-sc-rose ml-1">({g.total - g.hasQr} missing)</span>
                    )}
                  </span>
                  <button
                    onClick={() => loadStudents(grade)}
                    className="shrink-0 text-xs text-sc-teal hover:text-sc-teal-700"
                  >
                    <Printer className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-label-sm text-sc-gray">View:</span>
        {["all", "missing", ...grades].map((f) => (
          <button
            key={f}
            onClick={() => loadStudents(f)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              filter === f ? "bg-sc-navy text-white" : "bg-white border border-sc-gray-200 text-sc-gray hover:bg-sc-gray-100"
            )}
          >
            {f === "all" ? "All Students" : f === "missing" ? "Missing QR" : `Grade: ${f}`}
          </button>
        ))}
      </div>

      {/* Student table */}
      {loadingStudents ? (
        <div className="text-center py-8 text-sc-gray text-label-sm">Loading students…</div>
      ) : students.length > 0 && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
          <div className="px-4 py-3 border-b border-sc-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-sc-navy text-sm">{students.length} students</h3>
            <p className="text-[10px] text-sc-gray-400">
              QR token shown — use any QR generator to print badges
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-sc-gray-100 border-b border-sc-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-sc-navy">Name</th>
                  <th className="px-4 py-2 text-left font-semibold text-sc-navy">Grade</th>
                  <th className="px-4 py-2 text-left font-semibold text-sc-navy">Display ID</th>
                  <th className="px-4 py-2 text-left font-semibold text-sc-navy">QR Token</th>
                  <th className="px-4 py-2 text-left font-semibold text-sc-navy">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sc-gray-100">
                {students.map((s) => (
                  <tr key={s.id} className={cn(!s.attendance_qr_token && "bg-sc-rose-50/30")}>
                    <td className="px-4 py-2 text-sc-navy font-medium">{s.full_name}</td>
                    <td className="px-4 py-2 text-sc-gray">{s.grade_level ?? "—"}</td>
                    <td className="px-4 py-2 text-sc-gray font-mono">{s.student_display_id ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-[10px] text-sc-gray">
                      {s.attendance_qr_token
                        ? `${s.attendance_qr_token.slice(0, 12)}…`
                        : <span className="text-sc-rose font-semibold">Missing</span>}
                    </td>
                    <td className="px-4 py-2">
                      {s.attendance_qr_token ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <QrCode className="size-3" /> Ready
                        </span>
                      ) : (
                        <span className="text-sc-rose">No QR</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
