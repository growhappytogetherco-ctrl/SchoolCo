"use client";

import { useEffect, useState, useRef } from "react";
import {
  CheckCircle, LogOut, Clock, AlertTriangle,
  Pill, ShieldAlert, RotateCcw, X,
} from "lucide-react";
import { undoAttendanceAction } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";

// ── Types (shared with scan page) ─────────────────────────────────────────

export type ScanAction = "checkin" | "checkout" | "already_out";

export interface ScanResultData {
  action: ScanAction;
  studentId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  gradeLevel: string | null;
  isLate: boolean;
  isEarlyPickup: boolean;
  timestamp: string; // ISO
  medicationAlerts: {
    id: string;
    medication_name: string;
    is_emergency: boolean;
  }[];
  allergies: string[];
  allergyDetails?: {
    id: string;
    allergy_name: string;
    severity: "mild" | "moderate" | "severe" | "life_threatening";
    emergency_medication_required: boolean;
    reaction: string | null;
  }[];
}

interface ScanResultProps {
  data: ScanResultData;
  onReset: () => void;
  autoResetMs?: number;
}

// ── Component ─────────────────────────────────────────────────────────────

export function ScanResult({ data, onReset, autoResetMs = 2500 }: ScanResultProps) {
  const {
    action, studentId, firstName, lastName, preferredName,
    gradeLevel, isLate, isEarlyPickup, timestamp,
    medicationAlerts, allergies, allergyDetails = [],
  } = data;

  const [undoState, setUndoState] = useState<"idle" | "confirm" | "loading" | "done" | "error">("idle");
  const [undoError, setUndoError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayName = preferredName
    ? `${preferredName} ${lastName}`
    : `${firstName} ${lastName}`;

  const time = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit",
  });

  const hasEmergencyMed = medicationAlerts.some((m) => m.is_emergency);
  const hasLifeThreateningAllergy = allergyDetails.some((a) => a.severity === "life_threatening");
  const hasMedical = medicationAlerts.length > 0 || allergies.length > 0 || allergyDetails.length > 0;

  // Auto-reset after delay; pauses while admin override is open
  useEffect(() => {
    if (undoState !== "idle") return; // pause timer during override flow

    timerRef.current = setTimeout(onReset, autoResetMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onReset, autoResetMs, undoState]);

  async function handleUndo() {
    setUndoState("loading");
    const result = await undoAttendanceAction(studentId);
    if (result.success) {
      setUndoState("done");
      setTimeout(onReset, 1500);
    } else {
      setUndoError(result.error ?? "Could not undo. Try again.");
      setUndoState("error");
    }
  }

  // ── Color scheme per action ─────────────────────────────────────────────
  const scheme = {
    checkin:     { bg: "bg-sc-teal",    text: "text-sc-teal",    label: "CHECKED IN",  Icon: CheckCircle },
    checkout:    { bg: "bg-sc-navy",    text: "text-sc-navy",    label: "CHECKED OUT", Icon: LogOut      },
    already_out: { bg: "bg-sc-gray-400", text: "text-sc-gray-600", label: "ALREADY CHECKED OUT", Icon: X },
  }[action];

  // ── Undo confirmation screen ────────────────────────────────────────────
  if (undoState === "confirm") {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-10 text-center px-4">
        <RotateCcw className="size-12 text-sc-navy" />
        <div>
          <p className="font-serif text-heading-1 text-sc-navy">Undo last action?</p>
          <p className="text-body-md text-sc-gray mt-1">
            This will reverse the {action === "checkout" ? "check-out" : "check-in"} for{" "}
            <strong>{displayName}</strong>.
          </p>
        </div>
        <div className="flex gap-3 w-full max-w-xs">
          <button
            onClick={() => setUndoState("idle")}
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
    );
  }

  if (undoState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <div className="h-10 w-10 rounded-full border-4 border-sc-teal border-t-transparent animate-spin" />
        <p className="text-body-md text-sc-gray">Undoing…</p>
      </div>
    );
  }

  if (undoState === "done") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
        <CheckCircle className="size-12 text-sc-teal" />
        <p className="font-serif text-heading-2 text-sc-navy">Action reversed.</p>
      </div>
    );
  }

  // ── Main result screen ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* ── Emergency medication banner — shown first, always ─────── */}
      {hasEmergencyMed && (
        <div className="flex items-start gap-3 rounded-xl bg-sc-rose border-2 border-sc-rose-700 px-4 py-3">
          <ShieldAlert className="size-6 text-white shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-white text-label-md uppercase tracking-wide">
              ⚠ EMERGENCY MEDICATION
            </p>
            {medicationAlerts
              .filter((m) => m.is_emergency)
              .map((m) => (
                <p key={m.id} className="text-white/90 text-label-sm mt-0.5">
                  {m.medication_name}
                </p>
              ))}
          </div>
        </div>
      )}

      {/* ── Main action card ──────────────────────────────────────── */}
      <div className={cn(
        "rounded-2xl p-6 flex flex-col items-center gap-4 text-center shadow-card",
        action === "checkin"     ? "bg-sc-teal-50 border-2 border-sc-teal/30" :
        action === "checkout"    ? "bg-sc-navy-50 border-2 border-sc-navy/20" :
                                   "bg-sc-gray-100 border-2 border-sc-gray-200"
      )}>

        {/* Avatar circle */}
        <div className={cn(
          "flex h-24 w-24 items-center justify-center rounded-full text-white text-3xl font-serif font-bold shadow-md",
          action === "checkin"  ? "bg-sc-teal" :
          action === "checkout" ? "bg-sc-navy" : "bg-sc-gray-400"
        )}>
          {firstName[0]}{lastName[0]}
        </div>

        {/* Name */}
        <div>
          <p className="font-serif text-display-1 text-sc-navy leading-tight">{displayName}</p>
          {gradeLevel && (
            <p className="text-body-md text-sc-gray mt-0.5">{gradeLevel}</p>
          )}
        </div>

        {/* Action label + time */}
        <div className="flex flex-col items-center gap-1">
          <div className={cn(
            "flex items-center gap-2 rounded-full px-4 py-2 text-label-md font-bold tracking-widest uppercase",
            action === "checkin"     ? "bg-sc-teal text-white" :
            action === "checkout"    ? "bg-sc-navy text-white" :
                                       "bg-sc-gray-300 text-sc-gray-700"
          )}>
            <scheme.Icon className="size-5" />
            {scheme.label}
          </div>
          <p className="text-body-lg font-semibold text-sc-gray">{time}</p>
        </div>

        {/* Late / early pickup badges */}
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

      {/* ── Life-threatening allergy banner ──────────────────────────── */}
      {hasLifeThreateningAllergy && (
        <div className="rounded-xl border-2 border-sc-rose bg-sc-rose-50 px-4 py-3 flex items-start gap-3">
          <ShieldAlert className="size-5 text-sc-rose shrink-0 mt-0.5" />
          <div className="text-label-sm text-sc-rose-800">
            <p className="font-bold uppercase tracking-wide mb-1">Life-Threatening Allergy</p>
            {allergyDetails.filter((a) => a.severity === "life_threatening").map((a) => (
              <p key={a.id}>
                {a.allergy_name}
                {a.emergency_medication_required && " — Emergency medication required"}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* ── Non-emergency medical info ─────────────────────────────── */}
      {hasMedical && !hasEmergencyMed && (
        <div className="rounded-xl border-2 border-sc-gold-300 bg-sc-gold-50 px-4 py-3 flex items-start gap-3">
          {allergies.length > 0
            ? <AlertTriangle className="size-5 text-sc-gold-600 shrink-0 mt-0.5" />
            : <Pill className="size-5 text-sc-gold-600 shrink-0 mt-0.5" />
          }
          <div className="text-label-sm text-sc-gold-800">
            {allergyDetails.filter((a) => a.severity === "severe").map((a) => (
              <p key={a.id}><span className="font-semibold">Severe allergy:</span> {a.allergy_name}</p>
            ))}
            {allergies.length > 0 && allergyDetails.length === 0 && (
              <p><span className="font-semibold">Allergies:</span> {allergies.join(", ")}</p>
            )}
            {medicationAlerts.map((m) => (
              <p key={m.id}>{m.medication_name}</p>
            ))}
          </div>
        </div>
      )}

      {/* ── "Already checked out" explanation ─────────────────────── */}
      {action === "already_out" && (
        <p className="text-center text-body-md text-sc-gray-600">
          This student was already checked out today. No action taken.
        </p>
      )}

      {/* ── Undo error ─────────────────────────────────────────────── */}
      {undoState === "error" && (
        <div className="rounded-lg border border-sc-rose-200 bg-sc-rose-50 px-4 py-2 text-center">
          <p className="text-label-sm text-sc-rose-700">{undoError}</p>
        </div>
      )}

      {/* ── Admin override (only for completed actions, not already_out) ── */}
      {action !== "already_out" && (undoState as string) !== "done" && (
        <button
          onClick={() => setUndoState("confirm")}
          className="flex items-center justify-center gap-2 w-full rounded-xl border-2 border-sc-gray-200 py-3 text-label-md text-sc-gray hover:border-sc-rose hover:text-sc-rose transition-colors"
        >
          <RotateCcw className="size-4" />
          Admin Override — Undo Last Action
        </button>
      )}
    </div>
  );
}
