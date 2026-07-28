"use client";

import { useState } from "react";
import { CheckCircle2, Circle, ExternalLink, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Steps ─────────────────────────────────────────────────────────────────

const REHEARSAL_STEPS = [
  {
    id: 1,
    title: "Morning Arrival",
    description: "Open Daily Operations and confirm today's schedule is set up correctly.",
    link: "/dashboard/operations",
    linkLabel: "Open Daily Operations",
  },
  {
    id: 2,
    title: "QR Check-In",
    description: "Check in a test student via the QR scanner to verify attendance capture works.",
    link: "/dashboard/attendance",
    linkLabel: "Open Attendance",
  },
  {
    id: 3,
    title: "Manual Attendance",
    description: "Mark 1 student absent and 1 student tardy using the manual attendance controls.",
    link: "/dashboard/attendance",
    linkLabel: "Open Attendance",
  },
  {
    id: 4,
    title: "Student Notes",
    description: "Add a test student note. Verify it appears in the student profile.",
    link: "/dashboard/students",
    linkLabel: "Open Students",
  },
  {
    id: 5,
    title: "Medical Alert Review",
    description: "View the medical alerts panel and confirm enrolled students with alerts are visible.",
    link: "/dashboard/operations",
    linkLabel: "Open Operations",
  },
  {
    id: 6,
    title: "Incident Report",
    description: "Create a test incident report and then mark it resolved.",
    link: "/dashboard/operations",
    linkLabel: "Open Operations",
  },
  {
    id: 7,
    title: "Parent Messaging",
    description: "Send a test message to a parent (or use a test account). Confirm delivery.",
    link: "/dashboard/messages",
    linkLabel: "Open Messages",
  },
  {
    id: 8,
    title: "Calendar Event",
    description: "Create a test event on the Planning Center calendar.",
    link: "/dashboard/planning",
    linkLabel: "Open Planning Center",
  },
  {
    id: 9,
    title: "Student Dismissal",
    description: "Check out a student using the dismissal controls. Verify status updates correctly.",
    link: "/dashboard/attendance",
    linkLabel: "Open Attendance",
  },
  {
    id: 10,
    title: "Daily Operations Review",
    description: "Open the Daily Operations dashboard and review all panels — confirm no red flags.",
    link: "/dashboard/operations",
    linkLabel: "Open Operations",
  },
  {
    id: 11,
    title: "Admin Health Review",
    description: "Open Administrator Health and verify all checks are green or acknowledged.",
    link: "/dashboard/admin/health",
    linkLabel: "Open Admin Health",
  },
] as const;

// ── Step card ─────────────────────────────────────────────────────────────

function StepCard({
  step,
  checked,
  onToggle,
}: {
  step: typeof REHEARSAL_STEPS[number];
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-4 transition-all",
      checked
        ? "bg-emerald-50 border-emerald-200"
        : "bg-white border-sc-gray-100 shadow-card"
    )}>
      <div className="flex items-start gap-3">
        <button onClick={onToggle} className="mt-0.5 shrink-0">
          {checked ? (
            <CheckCircle2 className="size-5 text-emerald-500" />
          ) : (
            <Circle className="size-5 text-sc-gray-400" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-sc-gray-400 uppercase tracking-wider">
              Step {step.id}
            </span>
            <h3 className={cn(
              "font-semibold text-sm",
              checked ? "text-emerald-700 line-through" : "text-sc-navy"
            )}>
              {step.title}
            </h3>
          </div>
          <p className={cn(
            "text-[12px] mt-1",
            checked ? "text-emerald-600" : "text-sc-gray"
          )}>
            {step.description}
          </p>
        </div>
        <a
          href={step.link}
          className="shrink-0 flex items-center gap-1 rounded-lg border border-sc-gray-200 bg-white px-2 py-1.5 text-[11px] text-sc-teal hover:bg-sc-gray-100 transition-colors"
        >
          {step.linkLabel} <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function DressRehearsal() {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function resetAll() {
    setChecked(new Set());
  }

  const completedCount = checked.size;
  const totalCount = REHEARSAL_STEPS.length;
  const allDone = completedCount === totalCount;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold text-sc-navy">Dress Rehearsal</h2>
          <p className="text-label-sm text-sc-gray mt-0.5">
            Walk through a complete school day end-to-end. Check each step as you complete it.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn(
            "text-sm font-semibold tabular-nums",
            allDone ? "text-emerald-600" : "text-sc-navy"
          )}>
            {completedCount} / {totalCount} steps
          </span>
          {completedCount > 0 && (
            <button
              onClick={resetAll}
              className="text-xs text-sc-gray hover:text-sc-navy transition-colors underline"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded-full bg-sc-gray-100 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            allDone ? "bg-emerald-500" : "bg-sc-teal"
          )}
          style={{ width: `${(completedCount / totalCount) * 100}%` }}
        />
      </div>

      {allDone && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
          <PlayCircle className="size-6 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-emerald-700">Dress rehearsal complete!</p>
            <p className="text-sm text-emerald-600 mt-0.5">
              You have walked through a full school day. Move to the Go Live tab when ready.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {REHEARSAL_STEPS.map((step) => (
          <StepCard
            key={step.id}
            step={step}
            checked={checked.has(step.id)}
            onToggle={() => toggle(step.id)}
          />
        ))}
      </div>
    </div>
  );
}
