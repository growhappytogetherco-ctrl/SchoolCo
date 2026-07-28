"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle, ShieldAlert, Clock, UserX, LogIn, LogOut,
  Eye, CheckCircle2, XCircle,
} from "lucide-react";
import { type ActionItem } from "@/components/operations/OperationsDashboard";
import { checkInStudent, checkOutStudent, markAttendance } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";

interface Props {
  items:             ActionItem[];
  role:              string;
  onActionComplete:  () => void;
}

const SEVERITY_STYLES = {
  urgent: "border-sc-rose-200 bg-sc-rose-50",
  high:   "border-sc-gold-300 bg-sc-gold-50",
  normal: "border-sc-gray-100 bg-white",
};

const SEVERITY_BADGE = {
  urgent: "bg-sc-rose text-white",
  high:   "bg-sc-gold-600 text-white",
  normal: "bg-sc-gray-200 text-sc-navy",
};

const ACTION_ICON: Record<ActionItem["action_type"], React.ComponentType<{ className?: string }>> = {
  check_in:    LogIn,
  mark_absent: UserX,
  check_out:   LogOut,
  view_student: Eye,
  view_alert:  ShieldAlert,
  resolve:     CheckCircle2,
};

function ActionRow({
  item,
  onActionComplete,
}: {
  item:             ActionItem;
  onActionComplete: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const Icon = ACTION_ICON[item.action_type];
  const loading = isPending || status === "loading";

  function handleAction() {
    if (item.action_type === "view_student" || item.action_type === "view_alert") return;

    startTransition(async () => {
      setStatus("loading");
      setErrorMsg(null);

      let result: { success: boolean; error?: string };
      if (item.action_type === "check_in") {
        result = await checkInStudent(item.student_id, "manual");
      } else if (item.action_type === "check_out") {
        result = await checkOutStudent(item.student_id, "manual");
      } else if (item.action_type === "mark_absent") {
        result = await markAttendance(item.student_id, "absent");
      } else {
        result = { success: true }; // resolve — just refresh
      }

      if (result.success) {
        setStatus("done");
        onActionComplete();
      } else {
        setStatus("error");
        setErrorMsg(result.error ?? "Action failed.");
      }
    });
  }

  if (status === "done") return null; // Remove from list on success

  const timeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });

  return (
    <div className={cn(
      "flex flex-col gap-3 border rounded-xl p-4 sm:flex-row sm:items-start sm:justify-between",
      SEVERITY_STYLES[item.severity]
    )}>
      <div className="flex items-start gap-3 min-w-0">
        <div className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          item.severity === "urgent" ? "bg-sc-rose/10" : item.severity === "high" ? "bg-sc-gold-100" : "bg-sc-gray-100"
        )}>
          <Icon className={cn(
            "size-3.5",
            item.severity === "urgent" ? "text-sc-rose" : item.severity === "high" ? "text-sc-gold-600" : "text-sc-gray"
          )} />
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-label-sm font-semibold text-sc-navy">{item.student_name}</span>
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              SEVERITY_BADGE[item.severity]
            )}>
              {item.severity}
            </span>
            <span className="text-label-sm text-sc-gray flex items-center gap-1">
              <Clock className="size-3" />
              {timeFmt.format(new Date(item.detected_at))}
            </span>
          </div>
          <p className="text-label-sm text-sc-navy mb-0.5">{item.issue}</p>
          <p className="text-label-sm text-sc-gray">{item.next_step}</p>
          {status === "error" && errorMsg && (
            <p className="mt-1 text-label-sm text-sc-rose-700 flex items-center gap-1">
              <XCircle className="size-3.5" /> {errorMsg}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 pl-10 sm:pl-0">
        {/* Primary action */}
        {item.action_type === "view_student" || item.action_type === "view_alert" ? (
          <Link
            href={`/dashboard/students/${item.student_id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sc-navy px-3 py-1.5 text-label-sm font-medium text-white hover:bg-sc-navy/80 transition-colors"
          >
            <Eye className="size-3.5" /> View Student
          </Link>
        ) : (
          <button
            onClick={handleAction}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-label-sm font-medium text-white transition-colors disabled:opacity-50",
              item.severity === "urgent" ? "bg-sc-rose hover:bg-sc-rose/80" :
              item.severity === "high"   ? "bg-sc-gold-600 hover:bg-sc-gold-700" :
              "bg-sc-navy hover:bg-sc-navy/80"
            )}
          >
            {loading ? (
              <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Icon className="size-3.5" />
            )}
            {item.action_type === "check_in"    ? "Check In" :
             item.action_type === "check_out"   ? "Check Out" :
             item.action_type === "mark_absent" ? "Mark Absent" :
             "Resolve"}
          </button>
        )}

        {/* Always available: view profile */}
        <Link
          href={`/dashboard/students/${item.student_id}`}
          className="text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
        >
          Profile
        </Link>
      </div>
    </div>
  );
}

export function ActionsPanel({ items, role: _role, onActionComplete }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sc-gray">
        <CheckCircle2 className="size-5 text-sc-teal" />
        <span className="text-label-sm">No action items — all clear.</span>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {items.map((item, i) => (
        <ActionRow
          key={`${item.student_id}-${item.action_type}-${i}`}
          item={item}
          onActionComplete={onActionComplete}
        />
      ))}
    </div>
  );
}
