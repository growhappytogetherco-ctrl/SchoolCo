"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, Rocket, Play, Flag, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { runGoLiveChecks } from "@/app/actions/launch";
import type { GoLiveResult, LaunchItem } from "@/app/actions/launch";

// ── Check row ─────────────────────────────────────────────────────────────

function GoLiveCheck({ label, passed, detail }: { label: string; passed: boolean; detail?: string }) {
  return (
    <div className={cn(
      "flex items-center justify-between px-4 py-3 border-b border-sc-gray-100 last:border-b-0",
      !passed && "bg-sc-rose-50/40"
    )}>
      <div className="flex items-center gap-2.5">
        {passed ? (
          <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
        ) : (
          <XCircle className="size-4 text-sc-rose shrink-0" />
        )}
        <span className={cn(
          "text-label-sm",
          passed ? "text-sc-navy/70" : "text-sc-navy font-medium"
        )}>
          {label}
        </span>
      </div>
      {detail && (
        <span className={cn(
          "text-[11px] font-semibold shrink-0 ml-3",
          passed ? "text-emerald-600" : "text-sc-rose"
        )}>
          {detail}
        </span>
      )}
    </div>
  );
}

// ── Confetti ──────────────────────────────────────────────────────────────

function Confetti() {
  const pieces = Array.from({ length: 20 }, (_, i) => i);
  const colors = ["bg-sc-teal", "bg-emerald-400", "bg-sc-gold-300", "bg-sc-navy", "bg-emerald-300"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
      {pieces.map((i) => (
        <div
          key={i}
          className={cn(
            "absolute w-2 h-2 rounded-sm animate-bounce",
            colors[i % colors.length]
          )}
          style={{
            left: `${(i * 5.3 + 3) % 95}%`,
            top: `${(i * 7.1 + 5) % 80}%`,
            animationDelay: `${(i * 137) % 600}ms`,
            animationDuration: `${800 + (i * 137) % 400}ms`,
            opacity: 0.7,
          }}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

const FIRST_DAY_ACTIONS = [
  { label: "Review today's schedule on Daily Operations", href: "/dashboard/operations" },
  { label: "Confirm all staff are logged in and active", href: "/dashboard/admin/health" },
  { label: "Check parent portal access with a pilot family", href: "/dashboard/messages" },
  { label: "Monitor attendance check-ins in real time", href: "/dashboard/attendance" },
  { label: "Keep Admin Health dashboard open", href: "/dashboard/admin/health" },
  { label: "Review Planning Center for today's events", href: "/dashboard/planning" },
];

export function GoLive({
  onChecklistUpdate,
}: {
  onChecklistUpdate?: (items: LaunchItem[]) => void;
}) {
  const [result, setResult] = useState<GoLiveResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function runChecks() {
    startTransition(async () => {
      const res = await runGoLiveChecks();
      setResult(res);
    });
  }

  const failingChecks = result ? result.checks.filter((c) => !c.passed) : [];
  const FIX_LINKS: Record<string, string> = {
    "At least 1 staff member": "/dashboard/admin/launch",
    "Families imported": "/dashboard/admin/launch",
    "Students imported": "/dashboard/admin/launch",
    "All students have QR codes": "/dashboard/admin/launch",
    "All students have a family": "/dashboard/students",
    "Guardian links present": "/dashboard/families",
    "Organization configured": "/dashboard/admin/health",
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-semibold text-sc-navy">Go Live Gate</h2>
        <p className="text-label-sm text-sc-gray mt-0.5">
          Run the final pre-launch checklist. All checks must pass before going live.
        </p>
      </div>

      {/* Run button */}
      {!result && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-8 text-center space-y-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sc-navy/5 mx-auto">
            <Flag className="size-7 text-sc-navy" />
          </div>
          <div>
            <h3 className="font-semibold text-sc-navy text-lg">Ready to check?</h3>
            <p className="text-label-sm text-sc-gray mt-1">
              We will verify critical system requirements and data integrity before you go live.
            </p>
          </div>
          <button
            onClick={runChecks}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-sc-navy text-white px-6 py-3 text-sm font-semibold hover:bg-sc-navy/90 transition-colors disabled:opacity-50"
          >
            <Play className={cn("size-4", isPending && "animate-pulse")} />
            {isPending ? "Running checks…" : "Run Pre-Launch Checks"}
          </button>
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {result.allPassed ? (
            <div className="relative rounded-2xl bg-emerald-50 border-2 border-emerald-400 p-6 text-center overflow-hidden">
              <Confetti />
              <div className="relative z-10 space-y-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500 mx-auto shadow-lg">
                  <Rocket className="size-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-emerald-800">System Ready — Go Live!</h3>
                  <p className="text-emerald-700 mt-1 text-sm">
                    All pre-launch checks passed. Rising Leaders Academy is ready for students and families.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500 text-white px-4 py-1.5 text-xs font-bold">
                  <CheckCircle2 className="size-3.5" />
                  {result.checks.length} / {result.checks.length} checks passed
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-sc-rose-50 border border-sc-rose-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="size-5 text-sc-rose shrink-0" />
                <h3 className="font-semibold text-sc-rose-700">Fix issues before going live</h3>
              </div>
              <p className="text-sm text-sc-rose-700">
                {failingChecks.length} check{failingChecks.length > 1 ? "s" : ""} failed. Resolve these issues first.
              </p>
              <ul className="mt-3 space-y-1.5">
                {failingChecks.map((check) => (
                  <li key={check.label} className="flex items-center justify-between text-sm text-sc-rose-700">
                    <span className="flex items-center gap-1.5">
                      <XCircle className="size-3.5" />
                      {check.label}
                    </span>
                    {FIX_LINKS[check.label] && (
                      <a
                        href={FIX_LINKS[check.label]}
                        className="flex items-center gap-1 text-xs text-sc-teal hover:underline"
                      >
                        Fix <ExternalLink className="size-3" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Check details */}
          <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-sc-gray-100">
              <h3 className="font-semibold text-sc-navy text-sm">Check Results</h3>
            </div>
            {result.checks.map((check) => (
              <GoLiveCheck key={check.label} label={check.label} passed={check.passed} detail={check.detail} />
            ))}
          </div>

          {/* First-day actions (shown when all pass) */}
          {result.allPassed && (
            <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5">
              <h3 className="font-semibold text-sc-navy mb-3">Recommended First-Day Actions</h3>
              <ul className="space-y-2">
                {FIRST_DAY_ACTIONS.map((action) => (
                  <li key={action.label} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm text-sc-navy">
                      <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                      {action.label}
                    </span>
                    <a
                      href={action.href}
                      className="shrink-0 flex items-center gap-1 text-xs text-sc-teal hover:text-sc-teal-700"
                    >
                      Open <ExternalLink className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Re-run */}
          <button
            onClick={() => { setResult(null); }}
            className="text-xs text-sc-gray hover:text-sc-navy underline transition-colors"
          >
            Run checks again
          </button>
        </>
      )}
    </div>
  );
}
