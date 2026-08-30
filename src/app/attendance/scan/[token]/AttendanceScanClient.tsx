"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle, LogOut, X, ShieldAlert, AlertTriangle,
  Pill, Clock, RotateCcw, ScanLine,
} from "lucide-react";
import { checkInStudent, checkOutStudent, undoAttendanceAction } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";
import { formatAttendanceTime } from "@/lib/format-attendance-time";

// Rapid re-scan within this window → block checkout, show "already checked in"
const DUPLICATE_WINDOW_MS = 120_000; // 2 minutes

// ── Types ──────────────────────────────────────────────────────────────────

type Phase =
  | { name: "loading" }
  | { name: "result"; outcome: Outcome }
  | { name: "error"; message: string }
  | { name: "duplicate_block"; displayName: string; checkInAt: string }
  | { name: "checkout_confirm"; student: StudentInfo; checkInAt: string; todayRecordId?: string }
  | { name: "checkout_loading" }
  | { name: "undo_confirm" }
  | { name: "undo_loading" }
  | { name: "undo_done" };

type Action = "checkin" | "checkout" | "already_out";

interface StudentInfo {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  gradeLevel: string | null;
  medicationAlerts: { id: string; medication_name: string; is_emergency: boolean }[];
  allergies: string[];
}

interface Outcome {
  action: Action;
  studentId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  gradeLevel: string | null;
  isLate: boolean;
  isEarlyPickup: boolean;
  timestamp: string;
  medicationAlerts: { id: string; medication_name: string; is_emergency: boolean }[];
  allergies: string[];
}

// ── Component ──────────────────────────────────────────────────────────────

export function AttendanceScanClient({ token }: { token: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const AUTO_REDIRECT_MS = 2500;

  useEffect(() => {
    if (!token.startsWith("ATT-")) {
      setPhase({ name: "error", message: "This QR code is not a valid attendance badge." });
      return;
    }

    async function run() {
      try {
        const res = await fetch(`/api/attendance/qr/${encodeURIComponent(token)}`);

        if (res.status === 401) {
          setPhase({ name: "error", message: "Session expired. Please sign in again." });
          setTimeout(() => router.push(`/login?next=/attendance/scan/${token}`), 1500);
          return;
        }
        if (res.status === 404) {
          setPhase({ name: "error", message: "Badge not recognised for this school." });
          return;
        }
        if (!res.ok) {
          setPhase({ name: "error", message: "Could not reach the server. Try again." });
          return;
        }

        const { student, today_record, medication_alerts } = await res.json();

        const studentInfo: StudentInfo = {
          id:               student.id,
          firstName:        student.first_name,
          lastName:         student.last_name,
          preferredName:    student.preferred_name,
          gradeLevel:       student.grade_level,
          medicationAlerts: medication_alerts ?? [],
          allergies:        student.allergies ?? [],
        };

        const displayName = student.preferred_name
          ? `${student.preferred_name} ${student.last_name}`
          : `${student.first_name} ${student.last_name}`;

        if (today_record?.check_out_at) {
          // Already fully checked out — do nothing, show info
          setPhase({
            name: "result",
            outcome: {
              action:           "already_out",
              studentId:        student.id,
              firstName:        student.first_name,
              lastName:         student.last_name,
              preferredName:    student.preferred_name,
              gradeLevel:       student.grade_level,
              isLate:           false,
              isEarlyPickup:    false,
              timestamp:        today_record.check_out_at,
              medicationAlerts: medication_alerts ?? [],
              allergies:        student.allergies ?? [],
            },
          });
          return;
        }

        if (today_record?.check_in_at) {
          const checkInMs  = new Date(today_record.check_in_at).getTime();
          const elapsedMs  = Date.now() - checkInMs;

          if (elapsedMs < DUPLICATE_WINDOW_MS) {
            // Rapid rescan — show "already checked in", no checkout action
            setPhase({
              name:        "duplicate_block",
              displayName,
              checkInAt:   today_record.check_in_at,
            });
          } else {
            // Past the protection window — show one-tap checkout confirmation
            setPhase({
              name:          "checkout_confirm",
              student:       studentInfo,
              checkInAt:     today_record.check_in_at,
              todayRecordId: today_record.id,
            });
          }
          return;
        }

        // No attendance today — check in
        const result = await checkInStudent(student.id, "qr");
        if (!result.success) {
          if (result.alreadyCheckedIn) {
            // Race condition: someone else just checked in between our fetch and action
            setPhase({
              name:        "duplicate_block",
              displayName,
              checkInAt:   new Date().toISOString(),
            });
          } else {
            setPhase({ name: "error", message: result.error ?? "Check-in failed." });
          }
          return;
        }

        setPhase({
          name: "result",
          outcome: {
            action:           "checkin",
            studentId:        student.id,
            firstName:        student.first_name,
            lastName:         student.last_name,
            preferredName:    student.preferred_name,
            gradeLevel:       student.grade_level,
            isLate:           today_record?.is_late ?? false,
            isEarlyPickup:    false,
            timestamp:        new Date().toISOString(),
            medicationAlerts: medication_alerts ?? [],
            allergies:        student.allergies ?? [],
          },
        });
      } catch {
        setPhase({ name: "error", message: "Network error. Check your connection." });
      }
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-redirect after successful check-in or already_out (not after checkout confirm)
  useEffect(() => {
    if (phase.name !== "result") return;
    if (phase.outcome.action === "checkout") return; // let staff linger after checkout
    const t = setTimeout(() => router.push("/dashboard/attendance"), AUTO_REDIRECT_MS);
    return () => clearTimeout(t);
  }, [phase, router]);

  // ── Checkout from confirm screen ──────────────────────────────────────

  const confirmPhase = phase.name === "checkout_confirm" ? phase : null;

  async function handleConfirmCheckout() {
    if (!confirmPhase) return;
    setPhase({ name: "checkout_loading" });

    const result = await checkOutStudent(confirmPhase.student.id, "qr");
    if (!result.success) {
      setPhase({ name: "error", message: result.error ?? "Check-out failed." });
      return;
    }

    setPhase({
      name: "result",
      outcome: {
        action:           "checkout",
        studentId:        confirmPhase.student.id,
        firstName:        confirmPhase.student.firstName,
        lastName:         confirmPhase.student.lastName,
        preferredName:    confirmPhase.student.preferredName,
        gradeLevel:       confirmPhase.student.gradeLevel,
        isLate:           false,
        isEarlyPickup:    false,
        timestamp:        new Date().toISOString(),
        medicationAlerts: confirmPhase.student.medicationAlerts,
        allergies:        confirmPhase.student.allergies,
      },
    });
  }

  // ── Undo handlers ──────────────────────────────────────────────────────

  const outcome = phase.name === "result" ? phase.outcome : null;

  async function handleUndo() {
    if (!outcome) return;
    setPhase({ name: "undo_loading" });
    const result = await undoAttendanceAction(outcome.studentId);
    if (result.success) {
      setPhase({ name: "undo_done" });
      setTimeout(() => router.push("/dashboard/attendance"), 1500);
    } else {
      setPhase({ name: "result", outcome });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-sc-cream p-4 pt-8 max-w-sm mx-auto">

      {/* SchoolCo wordmark */}
      <div className="flex items-center gap-2 mb-6 self-start">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sc-teal">
          <svg viewBox="0 0 24 24" fill="none" className="size-4 text-white" aria-hidden="true">
            <path d="M12 21C12 21 1 14.5 1 8.5C1 5.42 3.42 3 6.5 3C8.24 3 9.91 3.81 11 5.08C12.09 3.81 13.76 3 15.5 3C18.58 3 21 5.42 21 8.5C21 14.5 12 21 12 21Z"
              fill="currentColor" />
          </svg>
        </div>
        <span className="font-serif text-heading-3 text-sc-navy">SchoolCo</span>
      </div>

      {/* ── Loading ──────────────────────────────────────────────── */}
      {phase.name === "loading" && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-14 w-14 rounded-full border-4 border-sc-teal border-t-transparent animate-spin" />
          <p className="text-body-lg text-sc-gray font-medium">Processing badge…</p>
        </div>
      )}

      {/* ── Duplicate-scan block ───────────────────────────────────── */}
      {phase.name === "duplicate_block" && (
        <div className="w-full space-y-4">
          <div className="rounded-2xl border-2 border-sc-gold-300 bg-white p-6 text-center space-y-3">
            <ScanLine className="size-10 text-sc-gold-600 mx-auto" />
            <p className="font-serif text-heading-2 text-sc-navy">{phase.displayName}</p>
            <p className="text-label-md font-semibold text-sc-gold-700 uppercase tracking-wide">
              Already Checked In
            </p>
            <p className="text-body-md text-sc-gray">
              {formatAttendanceTime(phase.checkInAt)}
            </p>
            <p className="text-label-sm text-sc-gray-400 mt-1">No attendance change.</p>
          </div>
          <button
            onClick={() => router.push("/dashboard/attendance")}
            className="w-full rounded-xl bg-sc-navy py-3.5 text-white text-label-md font-semibold"
          >
            Next Student
          </button>
        </div>
      )}

      {/* ── Checkout confirmation ─────────────────────────────────── */}
      {phase.name === "checkout_confirm" && (
        <div className="w-full space-y-4">
          <div className="rounded-2xl border-2 border-sc-navy/20 bg-white p-6 text-center space-y-3">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-sc-navy/10">
              <LogOut className="size-10 text-sc-navy" />
            </div>
            <p className="font-serif text-display-1 text-sc-navy leading-tight">
              {phase.student.preferredName
                ? `${phase.student.preferredName} ${phase.student.lastName}`
                : `${phase.student.firstName} ${phase.student.lastName}`}
            </p>
            {phase.student.gradeLevel && (
              <p className="text-body-md text-sc-gray">{phase.student.gradeLevel}</p>
            )}
            <p className="text-body-md text-sc-gray">
              Currently checked in at{" "}
              <span className="font-semibold text-sc-navy">{formatAttendanceTime(phase.checkInAt)}</span>
            </p>
          </div>

          <button
            onClick={handleConfirmCheckout}
            className="w-full rounded-xl bg-sc-navy py-4 text-white text-label-md font-bold text-lg tracking-wide"
          >
            CHECK OUT
          </button>

          <button
            onClick={() => router.push("/dashboard/attendance")}
            className="w-full rounded-xl border-2 border-sc-gray-200 bg-white py-3.5 text-sc-gray text-label-md font-semibold"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Checkout loading ──────────────────────────────────────── */}
      {phase.name === "checkout_loading" && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-14 w-14 rounded-full border-4 border-sc-navy border-t-transparent animate-spin" />
          <p className="text-body-lg text-sc-gray font-medium">Checking out…</p>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────── */}
      {phase.name === "error" && (
        <div className="w-full space-y-4">
          <div className="rounded-2xl border-2 border-sc-rose-200 bg-white p-6 text-center space-y-3">
            <X className="size-10 text-sc-rose mx-auto" />
            <p className="font-serif text-heading-2 text-sc-navy">Something went wrong</p>
            <p className="text-body-md text-sc-gray">{phase.message}</p>
          </div>
          <button
            onClick={() => router.push("/dashboard/attendance")}
            className="w-full rounded-xl bg-sc-navy py-3.5 text-white text-label-md font-semibold"
          >
            Go to Attendance Page
          </button>
        </div>
      )}

      {/* ── Undo confirm ──────────────────────────────────────────── */}
      {phase.name === "undo_confirm" && outcome && (
        <div className="w-full space-y-5 text-center">
          <RotateCcw className="size-12 text-sc-navy mx-auto" />
          <div>
            <p className="font-serif text-heading-1 text-sc-navy">Undo last action?</p>
            <p className="text-body-md text-sc-gray mt-1">
              Reverse the {outcome.action === "checkout" ? "check-out" : "check-in"} for{" "}
              <strong>{outcome.preferredName ?? outcome.firstName} {outcome.lastName}</strong>.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setPhase({ name: "result", outcome })}
              className="flex-1 rounded-xl border-2 border-sc-gray-200 py-3 text-label-md font-semibold text-sc-gray"
            >
              Cancel
            </button>
            <button
              onClick={handleUndo}
              className="flex-1 rounded-xl bg-sc-rose py-3 text-label-md font-semibold text-white"
            >
              Confirm Undo
            </button>
          </div>
        </div>
      )}

      {/* ── Undo loading ──────────────────────────────────────────── */}
      {phase.name === "undo_loading" && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="h-12 w-12 rounded-full border-4 border-sc-rose border-t-transparent animate-spin" />
          <p className="text-body-md text-sc-gray">Undoing…</p>
        </div>
      )}

      {/* ── Undo done ─────────────────────────────────────────────── */}
      {phase.name === "undo_done" && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <CheckCircle className="size-12 text-sc-teal" />
          <p className="font-serif text-heading-2 text-sc-navy">Action reversed.</p>
          <p className="text-body-sm text-sc-gray">Returning to attendance…</p>
        </div>
      )}

      {/* ── Result screen ─────────────────────────────────────────── */}
      {phase.name === "result" && outcome && (
        <ResultScreen
          outcome={outcome}
          onUndo={() => setPhase({ name: "undo_confirm" })}
          onContinue={() => router.push("/dashboard/attendance")}
          onViewAttendance={() => router.push(`/dashboard/students/${outcome.studentId}?tab=attendance`)}
        />
      )}
    </div>
  );
}

// ── Result Screen ──────────────────────────────────────────────────────────

function ResultScreen({
  outcome,
  onUndo,
  onContinue,
  onViewAttendance,
}: {
  outcome: Outcome;
  onUndo: () => void;
  onContinue: () => void;
  onViewAttendance: () => void;
}) {
  const { action, firstName, lastName, preferredName, gradeLevel,
          isLate, isEarlyPickup, timestamp, medicationAlerts, allergies } = outcome;

  const displayName = preferredName ? `${preferredName} ${lastName}` : `${firstName} ${lastName}`;
  const time = formatAttendanceTime(timestamp);

  const hasEmergencyMed = medicationAlerts.some((m) => m.is_emergency);
  const hasMedical = medicationAlerts.length > 0 || allergies.length > 0;

  const config = {
    checkin:     { avatarBg: "bg-sc-teal",     cardBg: "bg-sc-teal-50  border-sc-teal/30",  badgeBg: "bg-sc-teal text-white",       label: "CHECKED IN",          Icon: CheckCircle },
    checkout:    { avatarBg: "bg-sc-navy",     cardBg: "bg-sc-navy-50  border-sc-navy/20",  badgeBg: "bg-sc-navy text-white",       label: "CHECKED OUT",         Icon: LogOut      },
    already_out: { avatarBg: "bg-sc-gray-400", cardBg: "bg-white       border-sc-gray-200", badgeBg: "bg-sc-gray-200 text-sc-gray", label: "ALREADY CHECKED OUT", Icon: X           },
  }[action];

  return (
    <div className="w-full space-y-4">

      {/* Emergency medication banner */}
      {hasEmergencyMed && (
        <div className="flex items-start gap-3 rounded-xl bg-sc-rose border-2 border-sc-rose-700 px-4 py-3">
          <ShieldAlert className="size-6 text-white shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-white text-label-md uppercase tracking-wide">
              ⚠ EMERGENCY MEDICATION
            </p>
            {medicationAlerts.filter((m) => m.is_emergency).map((m) => (
              <p key={m.id} className="text-white/90 text-label-sm mt-0.5">{m.medication_name}</p>
            ))}
          </div>
        </div>
      )}

      {/* Main card */}
      <div className={cn("rounded-2xl border-2 p-6 flex flex-col items-center gap-4 text-center", config.cardBg)}>
        <div className={cn("flex h-24 w-24 items-center justify-center rounded-full text-white text-3xl font-serif font-bold shadow-md", config.avatarBg)}>
          {firstName[0]}{lastName[0]}
        </div>
        <div>
          <p className="font-serif text-display-1 text-sc-navy leading-tight">{displayName}</p>
          {gradeLevel && <p className="text-body-md text-sc-gray mt-0.5">{gradeLevel}</p>}
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className={cn("flex items-center gap-2 rounded-full px-5 py-2.5 text-label-md font-bold tracking-widest uppercase", config.badgeBg)}>
            <config.Icon className="size-5" />
            {config.label}
          </div>
          <p className="text-body-lg font-semibold text-sc-gray">{time}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {isLate && (
            <span className="flex items-center gap-1 rounded-full bg-sc-gold-100 border border-sc-gold-300 px-3 py-1 text-label-sm text-sc-gold-700 font-medium">
              <Clock className="size-3.5" /> Late Arrival
            </span>
          )}
          {isEarlyPickup && (
            <span className="flex items-center gap-1 rounded-full bg-sc-navy-100 border border-sc-navy-200 px-3 py-1 text-label-sm text-sc-navy-600 font-medium">
              <LogOut className="size-3.5" /> Early Pickup
            </span>
          )}
        </div>
      </div>

      {/* Non-emergency medical info */}
      {hasMedical && !hasEmergencyMed && (
        <div className="rounded-xl border-2 border-sc-gold-300 bg-sc-gold-50 px-4 py-3 flex items-start gap-3">
          {allergies.length > 0
            ? <AlertTriangle className="size-5 text-sc-gold-600 shrink-0 mt-0.5" />
            : <Pill className="size-5 text-sc-gold-600 shrink-0 mt-0.5" />
          }
          <div className="text-label-sm text-sc-gold-800">
            {allergies.length > 0 && <p><span className="font-semibold">Allergies:</span> {allergies.join(", ")}</p>}
            {medicationAlerts.map((m) => <p key={m.id}>{m.medication_name}</p>)}
          </div>
        </div>
      )}

      {/* Already out: show view/fix + context */}
      {action === "already_out" && (
        <>
          <p className="text-center text-body-md text-sc-gray">
            Already checked out at {time}. No action taken.
          </p>
          <button
            onClick={onViewAttendance}
            className="w-full rounded-xl border-2 border-sc-teal bg-white py-3 text-label-md text-sc-teal font-semibold hover:bg-sc-teal-50 transition-colors"
          >
            View / Fix Attendance
          </button>
        </>
      )}

      {/* Admin override undo */}
      {action !== "already_out" && (
        <button
          onClick={onUndo}
          className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-sc-gray-200 bg-white py-3 text-label-md text-sc-gray hover:border-sc-rose hover:text-sc-rose transition-colors"
        >
          <RotateCcw className="size-4" />
          Admin Override — Undo
        </button>
      )}

      {/* Manual continue */}
      <button
        onClick={onContinue}
        className="w-full rounded-xl bg-sc-navy py-3.5 text-white text-label-md font-semibold"
      >
        Next Student
      </button>

      {action !== "checkout" && (
        <p className="text-center text-label-sm text-sc-gray-400">
          Returning automatically in a few seconds…
        </p>
      )}
    </div>
  );
}
