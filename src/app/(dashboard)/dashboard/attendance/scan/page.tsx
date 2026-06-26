"use client";

import { useState, useCallback, useRef } from "react";
import { ArrowLeft, QrCode } from "lucide-react";
import Link from "next/link";
import { QRScanner } from "@/components/attendance/QRScanner";
import { ScanResult } from "@/components/attendance/ScanResult";
import type { ScanResultData } from "@/components/attendance/ScanResult";
import { checkInStudent, checkOutStudent } from "@/app/actions/attendance";

// ── Types ──────────────────────────────────────────────────────────────────

type ScanState =
  | { phase: "scanning" }
  | { phase: "processing"; token: string }  // fetch + action in progress
  | { phase: "result"; data: ScanResultData }
  | { phase: "error"; message: string };

// ── Page ───────────────────────────────────────────────────────────────────

export default function ScanPage() {
  const [state, setState] = useState<ScanState>({ phase: "scanning" });
  const processingRef = useRef(false); // prevent double-fire from scanner

  const reset = useCallback(() => {
    processingRef.current = false;
    setState({ phase: "scanning" });
  }, []);

  const handleScan = useCallback(async (token: string) => {
    if (!token.startsWith("ATT-")) return;
    if (processingRef.current) return;
    processingRef.current = true;

    setState({ phase: "processing", token });

    try {
      // 1. Fetch student + today's record
      const res = await fetch(`/api/attendance/qr/${encodeURIComponent(token)}`);

      if (res.status === 401) {
        setState({ phase: "error", message: "You must be signed in to scan badges." });
        processingRef.current = false;
        return;
      }
      if (res.status === 404) {
        setState({ phase: "error", message: "Badge not recognised. Check that this is a valid student badge." });
        processingRef.current = false;
        return;
      }
      if (!res.ok) {
        setState({ phase: "error", message: "Network error. Try again." });
        processingRef.current = false;
        return;
      }

      const payload = await res.json();
      const { student, today_record, medication_alerts } = payload;

      // 2. Determine and execute the correct action automatically
      const now = new Date().toISOString();
      let action: ScanResultData["action"];
      let isLate = false;
      let isEarlyPickup = false;

      if (today_record?.check_out_at) {
        // Already fully processed today
        action = "already_out";
      } else if (today_record?.check_in_at) {
        // Checked in but not out → check out
        const result = await checkOutStudent(student.id, "qr");
        if (!result.success) {
          setState({ phase: "error", message: result.error ?? "Check-out failed." });
          processingRef.current = false;
          return;
        }
        action = "checkout";
        isEarlyPickup = false; // server sets this; we display from returned data below
      } else {
        // No record or record with no check-in → check in
        const result = await checkInStudent(student.id, "qr");
        if (!result.success) {
          setState({ phase: "error", message: result.error ?? "Check-in failed." });
          processingRef.current = false;
          return;
        }
        action = "checkin";
      }

      // For late/early flags: re-use what the server already knows from today_record if available,
      // otherwise we read the flag from the action result. Since server actions don't return
      // the final record, we derive best-effort from timing in the UI.
      if (action === "checkin" && today_record?.is_late !== undefined) {
        isLate = today_record.is_late;
      }
      if (action === "checkout" && today_record?.is_early_pickup !== undefined) {
        isEarlyPickup = today_record.is_early_pickup;
      }

      setState({
        phase: "result",
        data: {
          action,
          studentId: student.id,
          firstName: student.first_name,
          lastName: student.last_name,
          preferredName: student.preferred_name,
          gradeLevel: student.grade_level,
          isLate,
          isEarlyPickup,
          timestamp: now,
          medicationAlerts: medication_alerts ?? [],
          allergies: student.allergies ?? [],
        },
      });

    } catch {
      setState({ phase: "error", message: "Something went wrong. Try scanning again." });
      processingRef.current = false;
    }
  }, []);

  const isScanning = state.phase === "scanning";
  const isProcessing = state.phase === "processing";

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col max-w-md mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 py-4 shrink-0">
        <Link
          href="/dashboard/attendance"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-sc-gray-200 hover:bg-sc-cream transition-colors"
        >
          <ArrowLeft className="size-4 text-sc-navy" />
        </Link>
        <div>
          <h1 className="font-serif text-heading-2 text-sc-navy">Scan QR Badge</h1>
          <p className="text-label-sm text-sc-gray">
            {isScanning ? "Ready — point camera at student badge" :
             isProcessing ? "Processing…" :
             "Tap override or wait to scan next"}
          </p>
        </div>
      </div>

      {/* Camera — keep mounted the whole time; active only while scanning */}
      <div className={state.phase === "result" || state.phase === "error" ? "hidden" : ""}>
        <QRScanner onScan={handleScan} active={isScanning} />
      </div>

      {/* ── States ──────────────────────────────────────────────── */}

      {isScanning && (
        <div className="mt-4 text-center space-y-1">
          <div className="flex items-center justify-center gap-2 text-sc-teal">
            <QrCode className="size-5" />
            <span className="text-label-md font-semibold">Ready to scan</span>
          </div>
          <p className="text-label-sm text-sc-gray">
            Scan the <strong>Attendance QR</strong> on the badge front.
          </p>
        </div>
      )}

      {isProcessing && (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
          <div className="h-12 w-12 rounded-full border-4 border-sc-teal border-t-transparent animate-spin" />
          <p className="text-body-lg font-semibold text-sc-navy">Processing…</p>
        </div>
      )}

      {state.phase === "error" && (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="w-full rounded-xl border-2 border-sc-rose-200 bg-sc-rose-50 p-5 text-center">
            <p className="font-semibold text-sc-rose-700 text-body-lg">{state.message}</p>
          </div>
          <button
            onClick={reset}
            className="rounded-xl bg-sc-teal px-8 py-3 text-white text-label-md font-semibold"
          >
            Scan Next Student
          </button>
        </div>
      )}

      {state.phase === "result" && (
        <div className="flex-1 overflow-y-auto">
          <ScanResult
            data={state.data}
            onReset={reset}
            autoResetMs={2500}
          />
          {/* Manual next-student button for staff who don't want to wait */}
          <button
            onClick={reset}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-sc-gray-200 py-3 text-label-md font-medium text-sc-gray hover:bg-sc-cream transition-colors"
          >
            <QrCode className="size-4" />
            Scan Next Student
          </button>
        </div>
      )}
    </div>
  );
}
