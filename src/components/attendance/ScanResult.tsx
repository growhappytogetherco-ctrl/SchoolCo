"use client";

import { useState } from "react";
import {
  UserCheck, LogOut, X, Pill, AlertTriangle,
  Clock, CheckCircle, GraduationCap, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkInStudent, checkOutStudent } from "@/app/actions/attendance";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────

interface MedicationAlert {
  id: string;
  medication_name: string;
  dosage: string | null;
  instructions: string | null;
  is_emergency: boolean;
  storage_location: string | null;
}

interface TodayRecord {
  id: string;
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  is_late: boolean;
  is_early_pickup: boolean;
}

interface ScannedStudent {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  grade_level: string | null;
  medical_notes: string | null;
  allergies: string[];
  authorized_pickup_notes: string | null;
}

export interface ScanPayload {
  student: ScannedStudent;
  today_record: TodayRecord | null;
  medication_alerts: MedicationAlert[];
}

interface ScanResultProps {
  data: ScanPayload;
  onDismiss: () => void;
  onActionComplete: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export function ScanResult({ data, onDismiss, onActionComplete }: ScanResultProps) {
  const { student, today_record, medication_alerts } = data;
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [actionTaken, setActionTaken] = useState<"in" | "out" | null>(null);

  const displayName = student.preferred_name
    ? `${student.preferred_name} ${student.last_name}`
    : `${student.first_name} ${student.last_name}`;

  const isCheckedIn  = !!today_record?.check_in_at;
  const isCheckedOut = !!today_record?.check_out_at;
  const hasEmergencyMed = medication_alerts.some((m) => m.is_emergency);
  const hasMedAlerts = medication_alerts.length > 0;
  const hasAllergies = (student.allergies ?? []).length > 0;
  const hasMedical = student.medical_notes || hasMedAlerts || hasAllergies;

  async function handleCheckIn() {
    setStatus("loading");
    const result = await checkInStudent(student.id, "qr");
    if (result.success) {
      setStatus("success");
      setActionTaken("in");
      setResultMsg(`${student.first_name} checked in successfully.`);
      setTimeout(onActionComplete, 1800);
    } else {
      setStatus("error");
      setResultMsg(result.error ?? "Check-in failed.");
    }
  }

  async function handleCheckOut() {
    setStatus("loading");
    const result = await checkOutStudent(student.id, "qr");
    if (result.success) {
      setStatus("success");
      setActionTaken("out");
      setResultMsg(`${student.first_name} checked out successfully.`);
      setTimeout(onActionComplete, 1800);
    } else {
      setStatus("error");
      setResultMsg(result.error ?? "Check-out failed.");
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────
  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
        <div className={cn(
          "flex h-20 w-20 items-center justify-center rounded-full",
          actionTaken === "in" ? "bg-sc-teal-50" : "bg-sc-navy-50"
        )}>
          <CheckCircle className={cn(
            "size-10",
            actionTaken === "in" ? "text-sc-teal" : "text-sc-navy"
          )} />
        </div>
        <p className="font-serif text-heading-2 text-sc-navy">{resultMsg}</p>
        <p className="text-body-sm text-sc-gray">Returning to scanner…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Emergency medical banner ─────────────────────────── */}
      {hasEmergencyMed && (
        <div className="flex items-start gap-3 rounded-xl bg-sc-rose border-2 border-sc-rose-700 px-4 py-3 animate-pulse">
          <ShieldAlert className="size-6 text-white shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-white text-label-md uppercase tracking-wide">
              ⚠ EMERGENCY MEDICATION ON FILE
            </p>
            {medication_alerts
              .filter((m) => m.is_emergency)
              .map((m) => (
                <p key={m.id} className="text-white/90 text-label-sm mt-0.5">
                  {m.medication_name}
                  {m.storage_location ? ` — stored at: ${m.storage_location}` : ""}
                </p>
              ))}
          </div>
        </div>
      )}

      {/* ── Student identity card ────────────────────────────── */}
      <div className="flex items-center gap-4 rounded-xl bg-white border border-sc-gray-100 p-4 shadow-card">
        {/* Avatar placeholder */}
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sc-teal text-white text-2xl font-serif font-bold">
          {student.first_name[0]}{student.last_name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-serif text-heading-2 text-sc-navy leading-tight truncate">
            {displayName}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {student.grade_level && (
              <span className="flex items-center gap-1 text-label-sm text-sc-gray">
                <GraduationCap className="size-3.5" />
                {student.grade_level}
              </span>
            )}
            {today_record?.is_late && (
              <span className="flex items-center gap-1 rounded-full bg-sc-gold-50 border border-sc-gold-200 px-2 py-0.5 text-label-sm text-sc-gold-700">
                <Clock className="size-3" /> Late Arrival
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Today's status ───────────────────────────────────── */}
      <div className="rounded-xl border border-sc-gray-100 bg-sc-cream/60 p-4">
        <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-wide mb-2">
          Today's Status
        </p>
        {!today_record ? (
          <p className="text-body-sm text-sc-gray">Not yet recorded today.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {isCheckedIn && (
              <span className="flex items-center gap-1.5 text-label-sm text-sc-teal font-medium">
                <CheckCircle className="size-4" />
                Checked in {fmt(today_record.check_in_at)}
              </span>
            )}
            {isCheckedOut && (
              <span className="flex items-center gap-1.5 text-label-sm text-sc-navy font-medium">
                <LogOut className="size-4" />
                Checked out {fmt(today_record.check_out_at)}
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Medical info ─────────────────────────────────────── */}
      {hasMedical && (
        <div className={cn(
          "rounded-xl border-2 p-4 space-y-2",
          hasEmergencyMed
            ? "border-sc-rose bg-sc-rose-50"
            : hasMedAlerts
            ? "border-sc-gold bg-sc-gold-50"
            : "border-sc-gray-200 bg-white"
        )}>
          <p className={cn(
            "flex items-center gap-2 text-label-sm font-semibold uppercase tracking-wide",
            hasEmergencyMed ? "text-sc-rose-700" : hasMedAlerts ? "text-sc-gold-700" : "text-sc-gray"
          )}>
            <Pill className="size-4" /> Medical Information
          </p>

          {hasMedAlerts && medication_alerts.map((m) => (
            <div key={m.id} className="flex items-start gap-2">
              {m.is_emergency
                ? <ShieldAlert className="size-4 text-sc-rose shrink-0 mt-0.5" />
                : <Pill className="size-4 text-sc-gold shrink-0 mt-0.5" />
              }
              <div>
                <p className="text-label-md font-semibold text-sc-navy">
                  {m.medication_name} {m.dosage ? `— ${m.dosage}` : ""}
                </p>
                {m.instructions && (
                  <p className="text-label-sm text-sc-gray">{m.instructions}</p>
                )}
              </div>
            </div>
          ))}

          {hasAllergies && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-4 text-sc-rose shrink-0 mt-0.5" />
              <p className="text-label-sm text-sc-navy">
                <span className="font-semibold">Allergies: </span>
                {student.allergies.join(", ")}
              </p>
            </div>
          )}

          {student.medical_notes && (
            <p className="text-label-sm text-sc-gray border-t border-sc-gray-200 pt-2 mt-2">
              {student.medical_notes}
            </p>
          )}
        </div>
      )}

      {/* ── Error message ────────────────────────────────────── */}
      {status === "error" && (
        <div className="rounded-lg border border-sc-rose-200 bg-sc-rose-50 px-4 py-3">
          <p className="text-label-sm text-sc-rose-700 font-medium">{resultMsg}</p>
        </div>
      )}

      {/* ── Action buttons ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        {!isCheckedOut && (
          <Button
            size="lg"
            className="h-16 flex-col gap-1 text-base bg-sc-teal hover:bg-sc-teal-600"
            onClick={handleCheckIn}
            loading={status === "loading"}
            disabled={isCheckedIn && !isCheckedOut}
          >
            <UserCheck className="size-6" />
            {isCheckedIn ? "Already In" : "Check In"}
          </Button>
        )}

        {isCheckedOut ? (
          <div className="col-span-2 rounded-xl border-2 border-sc-navy-200 bg-sc-navy-50 flex items-center justify-center gap-2 py-4">
            <CheckCircle className="size-5 text-sc-navy" />
            <span className="text-label-md font-semibold text-sc-navy">
              Checked out at {fmt(today_record?.check_out_at)}
            </span>
          </div>
        ) : (
          <Button
            size="lg"
            variant="outline"
            className="h-16 flex-col gap-1 text-base border-sc-navy text-sc-navy hover:bg-sc-navy-50"
            onClick={handleCheckOut}
            loading={status === "loading"}
            disabled={!isCheckedIn}
          >
            <LogOut className="size-6" />
            Check Out
          </Button>
        )}
      </div>

      {/* ── Cancel ──────────────────────────────────────────── */}
      <button
        onClick={onDismiss}
        disabled={status === "loading"}
        className="flex w-full items-center justify-center gap-2 py-3 text-label-md text-sc-gray hover:text-sc-navy transition-colors"
      >
        <X className="size-4" />
        Cancel — Scan Next Student
      </button>
    </div>
  );
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
