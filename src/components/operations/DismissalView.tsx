"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { X, LogOut, ShieldAlert, AlertTriangle, UserX, CheckCircle2, Search } from "lucide-react";
import { type OperationsStudent, type OrgSettings } from "@/app/actions/operations";
import { checkOutStudent } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";

interface Props {
  students:          OperationsStudent[];
  orgSettings:       OrgSettings;
  role:              string;
  onClose:           () => void;
  onActionComplete:  () => void;
}

function formatTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(ts));
}

function DismissalRow({
  student,
  canEdit,
  onActionComplete,
}: {
  student:          OperationsStudent;
  canEdit:          boolean;
  onActionComplete: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone]   = useState(false);

  if (done) return null;

  const isOnCampus   = student.campus_state === "on_campus";
  const isCheckedOut = student.campus_state === "checked_out";

  // Pickup warnings: anyone with can_pickup=false or explicit restrictions
  const pickupWarnings = student.pickup_restrictions.filter(
    (p) => !p.can_pickup || p.custody_type === "none" || p.pickup_restrictions
  );

  function handleCheckOut() {
    startTransition(async () => {
      setError(null);
      const res = await checkOutStudent(student.student_id, "manual");
      if (res.success) {
        setDone(true);
        onActionComplete();
      } else {
        setError(res.error ?? "Checkout failed.");
      }
    });
  }

  return (
    <div className={cn(
      "border rounded-2xl p-4 space-y-3 transition-all",
      isCheckedOut
        ? "border-sc-gray-100 bg-sc-gray-50 opacity-70"
        : pickupWarnings.length > 0
        ? "border-sc-rose-200 bg-sc-rose-50"
        : "border-sc-gray-100 bg-white"
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="text-label-sm font-semibold text-sc-navy">
              {student.preferred_name ?? student.first_name} {student.last_name}
            </span>
            <span className="text-[11px] text-sc-gray">
              {student.grade_level ?? "—"}
              {student.record?.check_in_at && ` · In at ${formatTime(student.record.check_in_at)}`}
              {isCheckedOut && ` · Out at ${formatTime(student.record?.check_out_at)}`}
            </span>
          </div>
          {/* Alert icons */}
          <div className="flex gap-1 mt-0.5 shrink-0">
            {student.has_safety_alert && (
              <ShieldAlert className="size-3.5 text-sc-rose" title="Safety alert" />
            )}
            {student.has_emergency_medical && (
              <AlertTriangle className="size-3.5 text-sc-gold-600" title="Emergency medical" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isCheckedOut && (
            <span className="flex items-center gap-1 rounded-full bg-sc-gray-100 px-2.5 py-1 text-[11px] font-medium text-sc-gray">
              <CheckCircle2 className="size-3" /> Checked Out
            </span>
          )}
          {isOnCampus && canEdit && (
            <button
              onClick={handleCheckOut}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-xl bg-sc-navy px-3 py-1.5 text-label-sm font-medium text-white hover:bg-sc-navy/80 transition-colors disabled:opacity-50"
            >
              {pending ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <LogOut className="size-3.5" />
              )}
              Check Out
            </button>
          )}
          <Link
            href={`/dashboard/students/${student.student_id}`}
            className="rounded-xl border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors"
          >
            View
          </Link>
        </div>
      </div>

      {/* Pickup restrictions — prominently shown */}
      {pickupWarnings.length > 0 && (
        <div className="space-y-1.5">
          {pickupWarnings.map((p, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-xl bg-white border border-sc-rose-200 px-3 py-2"
            >
              <UserX className="size-3.5 text-sc-rose mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-label-sm font-semibold text-sc-rose-700">
                  {p.can_pickup === false ? "⚠ Cannot pick up" : "Pickup restriction"}: {p.guardian_name}
                </p>
                {p.pickup_restrictions && (
                  <p className="text-label-sm text-sc-rose-700 mt-0.5">{p.pickup_restrictions}</p>
                )}
                {p.custody_type === "none" && (
                  <p className="text-label-sm text-sc-rose-700 mt-0.5">
                    No custody — emergency contact only
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Authorized pickup notes */}
      {student.authorized_pickup_notes && !isCheckedOut && (
        <p className="text-label-sm text-sc-gray rounded-lg bg-sc-gray-50 border border-sc-gray-100 px-3 py-2">
          📋 {student.authorized_pickup_notes}
        </p>
      )}

      {/* Checkout info */}
      {isCheckedOut && student.record?.checkout_released_to && (
        <p className="text-label-sm text-sc-gray">
          Released to: {student.record.checkout_released_to}
          {student.record.checkout_override_used && (
            <span className="ml-2 text-sc-gold-600 font-medium">(override used)</span>
          )}
        </p>
      )}

      {error && (
        <p className="text-label-sm text-sc-rose-700">{error}</p>
      )}
    </div>
  );
}

export function DismissalView({ students, orgSettings, role, onClose, onActionComplete }: Props) {
  const [search, setSearch] = useState("");
  const isStaff = !["parent", "student_future", "volunteer"].includes(role);

  // Students still on campus (show first), then those checked out
  const { onCampus, checkedOut } = useMemo(() => {
    const q = search.toLowerCase().trim();

    const filtered = students.filter((s) => {
      if (s.campus_state !== "on_campus" && s.campus_state !== "checked_out") return false;
      if (q) {
        const name = `${s.first_name} ${s.last_name} ${s.preferred_name ?? ""}`.toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });

    return {
      onCampus:   filtered.filter((s) => s.campus_state === "on_campus"),
      checkedOut: filtered.filter((s) => s.campus_state === "checked_out"),
    };
  }, [students, search]);

  // Sort on-campus: pickup restrictions first
  const sortedOnCampus = useMemo(() => (
    [...onCampus].sort((a, b) => (b.has_pickup_restriction ? 1 : 0) - (a.has_pickup_restriction ? 1 : 0))
  ), [onCampus]);

  const dismissalFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const [dh, dm] = orgSettings.dismissal_time.split(":").map(Number);
  const dismissalDate = new Date();
  dismissalDate.setHours(dh, dm, 0, 0);

  return (
    <div className="space-y-6">
      {/* Dismissal header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-sc-navy p-5 text-white">
        <div>
          <h2 className="font-serif text-heading-2">Dismissal Mode</h2>
          <p className="text-label-sm text-white/70 mt-0.5">
            Dismissal at {dismissalFmt.format(dismissalDate)}
            {" · "}
            {onCampus.length} still on campus · {checkedOut.length} checked out
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-xl border border-white/20 px-3 py-2 text-label-sm text-white/80 hover:bg-white/10 transition-colors self-start sm:self-auto"
        >
          <X className="size-4" /> Exit Dismissal Mode
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 rounded-xl border border-sc-gray-200 bg-white px-3 py-2">
        <Search className="size-4 text-sc-gray shrink-0" />
        <input
          type="text"
          placeholder="Search students…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-label-sm text-sc-navy bg-transparent focus:outline-none placeholder:text-sc-gray-400"
        />
      </div>

      {/* On campus — pickup needed */}
      {onCampus.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-label-sm font-semibold text-sc-navy uppercase tracking-wider flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sc-navy text-white text-[10px] font-bold">
              {onCampus.length}
            </span>
            Still On Campus
          </h3>
          {sortedOnCampus.map((s) => (
            <DismissalRow
              key={s.student_id}
              student={s}
              canEdit={isStaff}
              onActionComplete={onActionComplete}
            />
          ))}
        </div>
      )}

      {/* Checked out */}
      {checkedOut.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-label-sm font-semibold text-sc-gray uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="size-4 text-sc-teal" />
            Checked Out ({checkedOut.length})
          </h3>
          {checkedOut.map((s) => (
            <DismissalRow
              key={s.student_id}
              student={s}
              canEdit={isStaff}
              onActionComplete={onActionComplete}
            />
          ))}
        </div>
      )}

      {onCampus.length === 0 && checkedOut.length === 0 && (
        <div className="py-12 text-center text-label-sm text-sc-gray">
          No students have checked in today.
        </div>
      )}
    </div>
  );
}
