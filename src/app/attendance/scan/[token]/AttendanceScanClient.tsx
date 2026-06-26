"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle, LogOut, X, ShieldAlert, AlertTriangle,
  Pill, Clock, RotateCcw,
} from "lucide-react";
import { checkInStudent, checkOutStudent, undoAttendanceAction } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────

type Phase =
  | { name: "loading" }
  | { name: "result"; outcome: Outcome }
  | { name: "error"; message: string }
  | { name: "undo_confirm" }
  | { name: "undo_loading" }
  | { name: "undo_done" };

type Action = "checkin" | "checkout" | "already_out";

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

  // Run the attendance action on mount
  useEffect(() => {
    if (!token.startsWith("ATT-")) {
      setPhase({ name: "error", message: "This QR code is not a valid attendance badge." });
      return;
    }

    async function run() {
      try {
        // Fetch student + today's record
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
        const now = new Date().toISOString();
        let action: Action;

        if (today_record?.check_out_at) {
          action = "already_out";
        } else if (today_record?.check_in_at) {
          const result = await checkOutStudent(student.id, "qr");
          if (!result.success) {
            setPhase({ name: "error", message: result.error ?? "Check-out failed." });
            return;
          }
          action = "checkout";
        } else {
          const result = await checkInStudent(student.id, "qr");
          if (!result.success) {
            setPhase({ name: "error", message: result.error ?? "Check-in failed." });
            return;
          }
          action = "checkin";
        }

        setPhase({
          name: "result",
          outcome: {
            action,
            studentId: student.id,
            firstName: student.first_name,
            lastName: student.last_name,
            preferredName: student.preferred_name,
            gradeLevel: student.grade_level,
            isLate: action === "checkin" ? (today_record?.is_late ?? false) : false,
            isEarlyPickup: action === "checkout" ? (today_record?.is_early_pickup ?? false) : false,
            timestamp: now,
            medicationAlerts: medication_alerts ?? [],
            allergies: student.allergies ?? [],
          },
        });
      } catch {
        setPhase({ name: "error", message: "Network error. Check your connection." });
      }
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-redirect after success (paused during undo flow)
  useEffect(() => {
    if (phase.name !== "result") return;
    const t = setTimeout(() => router.push("/dashboard/attendance"), AUTO_REDIRECT_MS);
    return () => clearTimeout(t);
  }, [phase, router]);

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
      // Re-show result with an error note (reuse same outcome)
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
}: {
  outcome: Outcome;
  onUndo: () => void;
  onContinue: () => void;
}) {
  const { action, firstName, lastName, preferredName, gradeLevel,
          isLate, isEarlyPickup, timestamp, medicationAlerts, allergies } = outcome;

  const displayName = preferredName ? `${preferredName} ${lastName}` : `${firstName} ${lastName}`;
  const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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

        {/* Avatar */}
        <div className={cn("flex h-24 w-24 items-center justify-center rounded-full text-white text-3xl font-serif font-bold shadow-md", config.avatarBg)}>
          {firstName[0]}{lastName[0]}
        </div>

        {/* Name */}
        <div>
          <p className="font-serif text-display-1 text-sc-navy leading-tight">{displayName}</p>
          {gradeLevel && <p className="text-body-md text-sc-gray mt-0.5">{gradeLevel}</p>}
        </div>

        {/* Action badge + time */}
        <div className="flex flex-col items-center gap-1">
          <div className={cn("flex items-center gap-2 rounded-full px-5 py-2.5 text-label-md font-bold tracking-widest uppercase", config.badgeBg)}>
            <config.Icon className="size-5" />
            {config.label}
          </div>
          <p className="text-body-lg font-semibold text-sc-gray">{time}</p>
        </div>

        {/* Flags */}
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

      {/* Already out explainer */}
      {action === "already_out" && (
        <p className="text-center text-body-md text-sc-gray">
          No action taken — this student was already checked out today.
        </p>
      )}

      {/* Admin override */}
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
        Go to Attendance Page
      </button>

      <p className="text-center text-label-sm text-sc-gray-400">
        Returning automatically in a few seconds…
      </p>
    </div>
  );
}
