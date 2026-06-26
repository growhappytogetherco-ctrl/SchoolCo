"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  UserCheck, LogOut, QrCode, StickyNote, AlertOctagon,
  Upload, Printer, Loader2,
} from "lucide-react";
import { checkInStudent, checkOutStudent } from "@/app/actions/attendance";
import type { TodayAttendance } from "./types";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  todayAttendance: TodayAttendance | null;
  attendanceQrToken: string | null;
}

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: "default" | "teal" | "rose" | "navy";
}

function ActionButton({ label, icon, onClick, href, disabled, loading, variant = "default" }: ActionButtonProps) {
  const base = "flex flex-col items-center gap-1.5 rounded-xl px-3 py-2.5 text-label-sm font-medium transition-all min-w-[72px]";
  const styles = {
    default: "bg-sc-gray-50 text-sc-gray hover:bg-sc-gray-100 border border-sc-gray-200",
    teal:    "bg-sc-teal-50 text-sc-teal hover:bg-sc-teal hover:text-white border border-sc-teal-200",
    rose:    "bg-sc-rose-50 text-sc-rose-700 hover:bg-sc-rose hover:text-white border border-sc-rose-200",
    navy:    "bg-sc-navy-50 text-sc-navy hover:bg-sc-navy hover:text-white border border-sc-navy-200",
  };

  const cls = cn(
    base,
    styles[variant],
    (disabled || loading) && "opacity-50 pointer-events-none"
  );

  const content = (
    <>
      <span className="size-5 flex items-center justify-center">
        {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      </span>
      <span className="text-center leading-tight">{label}</span>
    </>
  );

  if (href) {
    return <Link href={href} className={cls}>{content}</Link>;
  }
  return (
    <button onClick={onClick} disabled={disabled || loading} className={cls}>
      {content}
    </button>
  );
}

export function StudentQuickActions({ studentId, todayAttendance, attendanceQrToken }: Props) {
  const [pending, startTransition] = useTransition();
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const isCheckedIn  = !!todayAttendance?.check_in_at;
  const isCheckedOut = !!todayAttendance?.check_out_at;

  function handleCheckIn() {
    startTransition(async () => {
      const result = await checkInStudent(studentId, "manual");
      setActionFeedback(result.success ? "Checked in ✓" : (result.error ?? "Error"));
      setTimeout(() => setActionFeedback(null), 3000);
    });
  }

  function handleCheckOut() {
    startTransition(async () => {
      const result = await checkOutStudent(studentId, "manual");
      setActionFeedback(result.success ? "Checked out ✓" : (result.error ?? "Error"));
      setTimeout(() => setActionFeedback(null), 3000);
    });
  }

  return (
    <div className="space-y-2">
      {actionFeedback && (
        <p className="text-label-sm text-sc-teal font-medium">{actionFeedback}</p>
      )}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        <ActionButton
          label="Check In"
          icon={<UserCheck className="size-4" />}
          onClick={handleCheckIn}
          loading={pending}
          disabled={isCheckedIn}
          variant="teal"
        />
        <ActionButton
          label="Check Out"
          icon={<LogOut className="size-4" />}
          onClick={handleCheckOut}
          loading={pending}
          disabled={!isCheckedIn || isCheckedOut}
          variant="navy"
        />
        <ActionButton
          label="Scan Badge"
          icon={<QrCode className="size-4" />}
          href="/dashboard/attendance/scan"
          variant="default"
        />
        <ActionButton
          label="Add Note"
          icon={<StickyNote className="size-4" />}
          href={`/dashboard/students/${studentId}?tab=notes&action=new`}
          variant="default"
        />
        <ActionButton
          label="Incident"
          icon={<AlertOctagon className="size-4" />}
          href={`/dashboard/students/${studentId}?tab=incidents&action=new`}
          variant="rose"
        />
        <ActionButton
          label="Work Sample"
          icon={<Upload className="size-4" />}
          href={`/dashboard/students/${studentId}?tab=documents&action=upload`}
          variant="default"
        />
        <ActionButton
          label="Print Badge"
          icon={<Printer className="size-4" />}
          href={`/dashboard/students/${studentId}/badge`}
          variant="default"
        />
      </div>
    </div>
  );
}
