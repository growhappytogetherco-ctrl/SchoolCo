"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import {
  Search, ChevronUp, ChevronDown, LogIn, LogOut,
  UserX, Eye, ShieldAlert, AlertTriangle, UserCheck, Clock,
} from "lucide-react";
import {
  type OperationsStudent,
  type CampusState,
  type ActiveFilter,
} from "@/app/actions/operations";
import { checkInStudent, checkOutStudent, markAttendance } from "@/app/actions/attendance";
import { formatAttendanceTime } from "@/lib/format-attendance-time";
import { cn } from "@/lib/utils";

interface Props {
  students:          OperationsStudent[];
  activeFilter:      ActiveFilter;
  role:              string;
  date:              string;
  onActionComplete:  () => void;
}

type SortKey = "name" | "grade" | "check_in" | "check_out" | "state";
type SortDir = "asc" | "desc";

// ── Campus state display helpers ───────────────────────────────────────────

const STATE_LABEL: Record<CampusState, string> = {
  on_campus:     "On Campus",
  checked_out:   "Checked Out",
  not_arrived:   "Not Arrived",
  absent:        "Absent",
  excused:       "Excused",
  manual_present:"Present (manual)",
};

const STATE_BADGE: Record<CampusState, string> = {
  on_campus:     "bg-sc-teal/10 text-sc-teal border-sc-teal/20",
  checked_out:   "bg-sc-gray-100 text-sc-gray border-sc-gray-200",
  not_arrived:   "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200",
  absent:        "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200",
  excused:       "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-300",
  manual_present:"bg-sc-teal/10 text-sc-teal border-sc-teal/20",
};

const formatTime = formatAttendanceTime;

function matchesFilter(s: OperationsStudent, filter: ActiveFilter): boolean {
  if (!filter) return true;
  if (filter === "on_campus")    return s.campus_state === "on_campus";
  if (filter === "checked_out")  return s.campus_state === "checked_out";
  if (filter === "absent")       return s.campus_state === "absent";
  if (filter === "excused")      return s.campus_state === "excused";
  if (filter === "checked_in")   return s.campus_state === "on_campus" || s.campus_state === "checked_out";
  if (filter === "not_arrived")  return s.campus_state === "not_arrived" || s.campus_state === "manual_present";
  if (filter === "with_alerts")  return s.has_safety_alert || s.has_emergency_medical;
  return true;
}

// ── Quick action button ────────────────────────────────────────────────────

function QuickActionButton({
  label, icon: Icon, onClick, variant = "default", disabled,
}: {
  label:    string;
  icon:     React.ComponentType<{ className?: string }>;
  onClick:  () => void;
  variant?: "default" | "danger" | "teal";
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40",
        variant === "teal"    ? "bg-sc-teal/10 text-sc-teal hover:bg-sc-teal/20" :
        variant === "danger"  ? "bg-sc-rose-50 text-sc-rose-700 hover:bg-sc-rose-100" :
        "bg-sc-gray-100 text-sc-navy hover:bg-sc-gray-200"
      )}
    >
      <Icon className="size-3" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ── Table row ──────────────────────────────────────────────────────────────

function StudentRow({
  student,
  role,
  onActionComplete,
}: {
  student:          OperationsStudent;
  role:             string;
  onActionComplete: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  const isStaff   = !["parent", "student_future", "volunteer"].includes(role);
  const canEdit   = isStaff;
  const state     = student.campus_state;

  function doAction(fn: () => Promise<{ success: boolean; error?: string }>) {
    startTransition(async () => {
      setRowError(null);
      const res = await fn();
      if (!res.success) setRowError(res.error ?? "Failed");
      else onActionComplete();
    });
  }

  return (
    <tr className="border-b border-sc-gray-100 hover:bg-sc-gray-50/50 transition-colors">
      {/* Name */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-col min-w-0">
            <span className="text-label-sm font-semibold text-sc-navy truncate">
              {student.preferred_name ?? student.first_name} {student.last_name}
            </span>
            {student.preferred_name && (
              <span className="text-[11px] text-sc-gray truncate">
                {student.first_name} {student.last_name}
              </span>
            )}
          </div>
          {/* Alert indicators */}
          {student.has_safety_alert && (
            <span title="Safety alert on file">
              <ShieldAlert className="size-3.5 text-sc-rose shrink-0" />
            </span>
          )}
          {student.has_emergency_medical && (
            <span title="Emergency medical alert">
              <AlertTriangle className="size-3.5 text-sc-gold-600 shrink-0" />
            </span>
          )}
          {student.has_pickup_restriction && (
            <span title="Pickup restriction on file">
              <UserX className="size-3.5 text-sc-rose shrink-0" />
            </span>
          )}
        </div>
      </td>

      {/* Grade */}
      <td className="hidden sm:table-cell px-4 py-3">
        <span className="text-label-sm text-sc-gray">
          {student.grade_level ?? "—"}
        </span>
      </td>

      {/* Campus status */}
      <td className="px-4 py-3">
        <span className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
          STATE_BADGE[state]
        )}>
          {STATE_LABEL[state]}
          {student.record?.is_late && state === "on_campus" && (
            <span className="ml-1 text-sc-gold-600">· Late</span>
          )}
        </span>
      </td>

      {/* Check-in time */}
      <td className="hidden md:table-cell px-4 py-3">
        <span className="text-label-sm text-sc-gray">
          {formatTime(student.record?.check_in_at)}
        </span>
      </td>

      {/* Check-out time */}
      <td className="hidden md:table-cell px-4 py-3">
        <span className="text-label-sm text-sc-gray">
          {formatTime(student.record?.check_out_at)}
          {student.record?.checkout_released_to && (
            <span className="ml-1 text-[11px] text-sc-gray-400">
              → {student.record.checkout_released_to}
            </span>
          )}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {rowError && (
            <span className="text-[11px] text-sc-rose-700">{rowError}</span>
          )}

          {canEdit && state === "not_arrived" && (
            <>
              <QuickActionButton
                label="Check In" icon={LogIn} variant="teal"
                disabled={pending}
                onClick={() => doAction(() => checkInStudent(student.student_id, "manual"))}
              />
              <QuickActionButton
                label="Absent" icon={UserX} variant="danger"
                disabled={pending}
                onClick={() => doAction(() => markAttendance(student.student_id, "absent"))}
              />
            </>
          )}

          {canEdit && state === "on_campus" && (
            <QuickActionButton
              label="Check Out" icon={LogOut} variant="default"
              disabled={pending}
              onClick={() => doAction(() => checkOutStudent(student.student_id, "manual"))}
            />
          )}

          {canEdit && (state === "absent" || state === "excused") && (
            <QuickActionButton
              label="Check In" icon={LogIn} variant="teal"
              disabled={pending}
              onClick={() => doAction(() => checkInStudent(student.student_id, "manual"))}
            />
          )}

          {canEdit && state === "checked_out" && (
            <QuickActionButton
              label="Re-check In" icon={LogIn} variant="teal"
              disabled={pending}
              onClick={() => doAction(() => checkInStudent(student.student_id, "manual"))}
            />
          )}

          <Link
            href={`/dashboard/students/${student.student_id}`}
            className="flex items-center gap-1 rounded-lg bg-sc-gray-100 px-2 py-1 text-[11px] font-medium text-sc-navy hover:bg-sc-gray-200 transition-colors"
          >
            <Eye className="size-3" />
            <span className="hidden sm:inline">View</span>
          </Link>
        </div>
      </td>
    </tr>
  );
}

// ── Main table ─────────────────────────────────────────────────────────────

export function StudentStatusTable({
  students, activeFilter, role, date: _date, onActionComplete,
}: Props) {
  const [search, setSearch]       = useState("");
  const [sortKey, setSortKey]     = useState<SortKey>("name");
  const [sortDir, setSortDir]     = useState<SortDir>("asc");
  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Collect unique grades
  const grades = useMemo(() => {
    const g = new Set(students.map((s) => s.grade_level).filter(Boolean));
    return Array.from(g).sort();
  }, [students]);

  // Filter + sort
  const filtered = useMemo(() => {
    let list = students.filter((s) => {
      if (!matchesFilter(s, activeFilter)) return false;

      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const full = `${s.first_name} ${s.last_name} ${s.preferred_name ?? ""}`.toLowerCase();
        if (!full.includes(q)) return false;
      }

      // Grade
      if (gradeFilter && s.grade_level !== gradeFilter) return false;

      // Status
      if (statusFilter && s.campus_state !== statusFilter) return false;

      return true;
    });

    // Sort
    list = [...list].sort((a, b) => {
      let va: string | number = "", vb: string | number = "";
      if (sortKey === "name")      { va = `${a.last_name} ${a.first_name}`; vb = `${b.last_name} ${b.first_name}`; }
      if (sortKey === "grade")     { va = a.grade_level ?? ""; vb = b.grade_level ?? ""; }
      if (sortKey === "check_in")  { va = a.record?.check_in_at ?? ""; vb = b.record?.check_in_at ?? ""; }
      if (sortKey === "check_out") { va = a.record?.check_out_at ?? ""; vb = b.record?.check_out_at ?? ""; }
      if (sortKey === "state")     { va = a.campus_state; vb = b.campus_state; }

      const cmp = String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [students, activeFilter, search, gradeFilter, statusFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortHeader({ label, skey }: { label: string; skey: SortKey }) {
    const active = sortKey === skey;
    return (
      <th
        onClick={() => toggleSort(skey)}
        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-sc-gray cursor-pointer select-none hover:text-sc-navy transition-colors"
      >
        <span className="flex items-center gap-1">
          {label}
          {active ? (
            sortDir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
          ) : (
            <ChevronUp className="size-3 opacity-20" />
          )}
        </span>
      </th>
    );
  }

  return (
    <div>
      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-sc-gray-100 bg-sc-gray-50/50">
        <div className="flex items-center gap-2 rounded-xl border border-sc-gray-200 bg-white px-3 py-1.5 flex-1 min-w-48">
          <Search className="size-3.5 text-sc-gray shrink-0" />
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-label-sm text-sc-navy bg-transparent focus:outline-none placeholder:text-sc-gray-400 min-w-0"
          />
        </div>

        {grades.length > 0 && (
          <select
            value={gradeFilter}
            onChange={(e) => setGradeFilter(e.target.value)}
            className="rounded-xl border border-sc-gray-200 bg-white px-3 py-1.5 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
          >
            <option value="">All Grades</option>
            {grades.map((g) => (
              <option key={g} value={g!}>{g}</option>
            ))}
          </select>
        )}

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-sc-gray-200 bg-white px-3 py-1.5 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
        >
          <option value="">All Statuses</option>
          <option value="on_campus">On Campus</option>
          <option value="checked_out">Checked Out</option>
          <option value="not_arrived">Not Arrived</option>
          <option value="absent">Absent</option>
          <option value="excused">Excused</option>
        </select>

        <span className="self-center text-label-sm text-sc-gray">
          {filtered.length} of {students.length}
        </span>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-label-sm text-sc-gray">
          {students.length === 0
            ? "No enrolled students found."
            : "No students match the current filters."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-sc-gray-50/80 border-b border-sc-gray-100">
              <tr>
                <SortHeader label="Student" skey="name" />
                <th className="hidden sm:table-cell px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-sc-gray">
                  Grade
                </th>
                <SortHeader label="Status" skey="state" />
                <th className="hidden md:table-cell px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-sc-gray">
                  Check-in
                </th>
                <th className="hidden md:table-cell px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-sc-gray">
                  Check-out
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-sc-gray">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <StudentRow
                  key={s.student_id}
                  student={s}
                  role={role}
                  onActionComplete={onActionComplete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
