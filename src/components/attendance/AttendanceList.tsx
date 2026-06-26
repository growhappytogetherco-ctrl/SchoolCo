"use client";

import { useState, useTransition } from "react";
import {
  UserCheck, LogOut, UserX, Clock, Search,
  CheckCircle, AlertTriangle, ChevronDown,
} from "lucide-react";
import { markAttendance, checkInStudent, checkOutStudent } from "@/app/actions/attendance";
import type { StudentAttendanceRow } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";

// ── Status helpers ─────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  present:         { label: "Present",        className: "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200" },
  checked_in:      { label: "Checked In",     className: "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200" },
  absent:          { label: "Absent",          className: "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200" },
  tardy:           { label: "Tardy",           className: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200" },
  excused:         { label: "Excused",         className: "bg-sc-navy-50 text-sc-navy-600 border-sc-navy-200" },
  early_dismissal: { label: "Early Dismissal", className: "bg-sc-gray-50 text-sc-gray-600 border-sc-gray-200" },
};

function StatusChip({ status }: { status: string | undefined }) {
  if (!status) {
    return (
      <span className="rounded-full border bg-sc-gray-50 text-sc-gray-400 border-sc-gray-200 px-2.5 py-0.5 text-label-sm">
        Not Recorded
      </span>
    );
  }
  const s = STATUS_LABELS[status] ?? { label: status, className: "bg-sc-gray-50 text-sc-gray border-sc-gray-200" };
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium", s.className)}>
      {s.label}
    </span>
  );
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Row component ──────────────────────────────────────────────────────────

function AttendanceRow({ row, onUpdate }: { row: StudentAttendanceRow; onUpdate: () => void }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const displayName = row.preferred_name
    ? `${row.preferred_name} ${row.last_name}`
    : `${row.first_name} ${row.last_name}`;

  const isCheckedIn  = !!row.record?.check_in_at;
  const isCheckedOut = !!row.record?.check_out_at;
  const hasMedical   = !!(row.medical_notes || (row.allergies ?? []).length > 0);

  function act(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      onUpdate();
      setOpen(false);
    });
  }

  return (
    <li className={cn(
      "rounded-xl border bg-white transition-all",
      pending ? "opacity-60 pointer-events-none" : "hover:shadow-card",
      open ? "shadow-card border-sc-teal/30" : "border-sc-gray-100"
    )}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Initials */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sc-teal text-white text-label-sm font-bold">
          {row.first_name[0]}{row.last_name[0]}
        </div>

        {/* Name + grade */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-label-md font-semibold text-sc-navy truncate">{displayName}</p>
            {hasMedical && (
              <AlertTriangle className="size-3.5 text-sc-rose shrink-0" title="Medical alert on file" />
            )}
          </div>
          {row.grade_level && (
            <p className="text-label-sm text-sc-gray">{row.grade_level}</p>
          )}
        </div>

        {/* Status chip */}
        <StatusChip status={row.record?.status} />

        {/* Times */}
        <div className="hidden sm:flex flex-col items-end gap-0.5 text-label-sm text-sc-gray min-w-[90px]">
          <span>In: {fmtTime(row.record?.check_in_at)}</span>
          <span>Out: {fmtTime(row.record?.check_out_at)}</span>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-sc-gray-100 transition-colors"
          aria-label="Toggle actions"
        >
          <ChevronDown className={cn("size-4 text-sc-gray transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {/* Expanded action panel */}
      {open && (
        <div className="border-t border-sc-gray-100 px-4 py-3 flex flex-wrap gap-2">
          <ActionBtn
            label="Check In"
            icon={<UserCheck className="size-4" />}
            color="teal"
            disabled={isCheckedIn}
            onClick={() => act(() => checkInStudent(row.student_id, "manual").then(() => {}))}
          />
          <ActionBtn
            label="Check Out"
            icon={<LogOut className="size-4" />}
            color="navy"
            disabled={!isCheckedIn || isCheckedOut}
            onClick={() => act(() => checkOutStudent(row.student_id, "manual").then(() => {}))}
          />
          <ActionBtn
            label="Absent"
            icon={<UserX className="size-4" />}
            color="rose"
            onClick={() => act(() => markAttendance(row.student_id, "absent").then(() => {}))}
          />
          <ActionBtn
            label="Excused"
            icon={<CheckCircle className="size-4" />}
            color="gray"
            onClick={() => act(() => markAttendance(row.student_id, "excused").then(() => {}))}
          />
          <ActionBtn
            label="Tardy"
            icon={<Clock className="size-4" />}
            color="gold"
            onClick={() => act(() => markAttendance(row.student_id, "tardy").then(() => {}))}
          />
        </div>
      )}
    </li>
  );
}

function ActionBtn({
  label, icon, color, onClick, disabled,
}: {
  label: string;
  icon: React.ReactNode;
  color: "teal" | "navy" | "rose" | "gold" | "gray";
  onClick: () => void;
  disabled?: boolean;
}) {
  const colors = {
    teal: "border-sc-teal-200 bg-sc-teal-50 text-sc-teal-700 hover:bg-sc-teal hover:text-white",
    navy: "border-sc-navy-200 bg-sc-navy-50 text-sc-navy-600 hover:bg-sc-navy hover:text-white",
    rose: "border-sc-rose-200 bg-sc-rose-50 text-sc-rose-700 hover:bg-sc-rose hover:text-white",
    gold: "border-sc-gold-200 bg-sc-gold-50 text-sc-gold-700 hover:bg-sc-gold hover:text-white",
    gray: "border-sc-gray-200 bg-sc-gray-50 text-sc-gray hover:bg-sc-gray-700 hover:text-white",
  }[color];

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-label-sm font-medium transition-all",
        colors,
        disabled && "opacity-40 pointer-events-none"
      )}
    >
      {icon}{label}
    </button>
  );
}

// ── Main list ──────────────────────────────────────────────────────────────

interface AttendanceListProps {
  rows: StudentAttendanceRow[];
  onUpdate: () => void;
}

export function AttendanceList({ rows, onUpdate }: AttendanceListProps) {
  const [search, setSearch] = useState("");

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.first_name.toLowerCase().includes(q) ||
      r.last_name.toLowerCase().includes(q) ||
      (r.preferred_name ?? "").toLowerCase().includes(q)
    );
  });

  // Stats bar
  const checkedIn   = rows.filter((r) => r.record?.check_in_at && !r.record?.check_out_at).length;
  const checkedOut  = rows.filter((r) => r.record?.check_out_at).length;
  const absent      = rows.filter((r) => r.record?.status === "absent").length;
  const notRecorded = rows.filter((r) => !r.record).length;

  return (
    <div className="space-y-4">
      {/* Mini stats */}
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: "On Campus", value: checkedIn, color: "text-sc-teal" },
          { label: "Checked Out", value: checkedOut, color: "text-sc-navy" },
          { label: "Absent", value: absent, color: "text-sc-rose" },
          { label: "Not Recorded", value: notRecorded, color: "text-sc-gray-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-sc-gray-100 bg-white py-2">
            <p className={cn("font-serif text-xl font-bold", s.color)}>{s.value}</p>
            <p className="text-label-sm text-sc-gray">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
        <input
          type="search"
          placeholder="Search students…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-sc-gray-200 bg-white pl-9 pr-4 py-2.5 text-body-md text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-body-md text-sc-gray-400">
          {search ? "No students match your search." : "No students enrolled."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <AttendanceRow key={row.student_id} row={row} onUpdate={onUpdate} />
          ))}
        </ul>
      )}
    </div>
  );
}
