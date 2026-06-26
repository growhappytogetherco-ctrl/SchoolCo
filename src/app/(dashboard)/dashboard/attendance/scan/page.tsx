"use client";

import { useState, useCallback } from "react";
import { ArrowLeft, QrCode } from "lucide-react";
import Link from "next/link";
import { QRScanner } from "@/components/attendance/QRScanner";
import { ScanResult } from "@/components/attendance/ScanResult";
import type { ScanPayload } from "@/components/attendance/ScanResult";

type ScanState =
  | { phase: "scanning" }
  | { phase: "loading" }
  | { phase: "result"; data: ScanPayload }
  | { phase: "error"; message: string };

export default function ScanPage() {
  const [state, setState] = useState<ScanState>({ phase: "scanning" });

  const handleScan = useCallback(async (token: string) => {
    // Only process ATT- tokens — ignore anything else
    if (!token.startsWith("ATT-")) return;

    setState({ phase: "loading" });

    try {
      const res = await fetch(`/api/attendance/qr/${encodeURIComponent(token)}`);
      if (res.status === 401) {
        setState({ phase: "error", message: "You must be signed in to check students in." });
        return;
      }
      if (res.status === 404) {
        setState({ phase: "error", message: "QR code not recognised. Please try again or use manual entry." });
        return;
      }
      if (!res.ok) {
        setState({ phase: "error", message: "Something went wrong. Please try again." });
        return;
      }
      const data: ScanPayload = await res.json();
      setState({ phase: "result", data });
    } catch {
      setState({ phase: "error", message: "Network error. Check your connection and try again." });
    }
  }, []);

  const reset = useCallback(() => setState({ phase: "scanning" }), []);

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col max-w-md mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 py-4">
        <Link
          href="/dashboard/attendance"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-sc-gray-200 hover:bg-sc-cream transition-colors"
        >
          <ArrowLeft className="size-4 text-sc-navy" />
        </Link>
        <div>
          <h1 className="font-serif text-heading-2 text-sc-navy">Scan QR Badge</h1>
          <p className="text-label-sm text-sc-gray">Point camera at the attendance QR code</p>
        </div>
      </div>

      {/* Scanner area */}
      <div className="flex-1 flex flex-col gap-4">

        {/* Camera — always mounted; visibility controlled by active prop */}
        <div className={state.phase === "result" ? "hidden" : ""}>
          <QRScanner
            onScan={handleScan}
            active={state.phase === "scanning"}
          />
        </div>

        {/* States */}
        {state.phase === "scanning" && (
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-sc-teal">
              <QrCode className="size-5" />
              <p className="text-label-md font-medium">Ready to scan</p>
            </div>
            <p className="text-body-sm text-sc-gray">
              Scan the <strong>Attendance QR</strong> on the student&apos;s badge.
              <br />
              Do not scan the Staff Profile QR on the back.
            </p>
          </div>
        )}

        {state.phase === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <div className="h-10 w-10 rounded-full border-4 border-sc-teal border-t-transparent animate-spin" />
            <p className="text-body-md text-sc-gray">Looking up student…</p>
          </div>
        )}

        {state.phase === "error" && (
          <div className="rounded-xl border-2 border-sc-rose-200 bg-sc-rose-50 p-5 text-center space-y-3">
            <p className="font-semibold text-sc-rose-700">{state.message}</p>
            <button
              onClick={reset}
              className="rounded-lg bg-sc-rose px-5 py-2.5 text-white text-label-md font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        {state.phase === "result" && (
          <ScanResult
            data={state.data}
            onDismiss={reset}
            onActionComplete={reset}
          />
        )}
      </div>
    </div>
  );
}
