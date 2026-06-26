"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, Loader2 } from "lucide-react";

interface QRScannerProps {
  onScan: (token: string) => void;
  active?: boolean;
}

/**
 * QRScanner
 *
 * Uses html5-qrcode to open the device camera and continuously scan
 * for QR codes. Calls onScan with the raw decoded text on each detection.
 * Designed for mobile-first full-screen use.
 *
 * - Automatically starts/stops with the `active` prop.
 * - Cleans up the camera on unmount.
 */
export function QRScanner({ onScan, active = true }: QRScannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef   = useRef<Html5Qrcode | null>(null);
  const [status, setStatus]   = useState<"idle" | "starting" | "scanning" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastScan = useRef<string | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
      } catch {
        // already stopped
      }
      scannerRef.current = null;
    }
    if (cooldownRef.current) clearTimeout(cooldownRef.current);
    setStatus("idle");
  }, []);

  const startScanner = useCallback(async () => {
    if (!containerRef.current) return;
    setStatus("starting");
    setErrorMsg(null);

    const elementId = "qr-scanner-viewport";

    try {
      const html5QrCode = new Html5Qrcode(elementId, { verbose: false });
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },   // rear camera
        {
          fps: 15,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          // Debounce: ignore re-scans of the same code within 2 seconds
          if (decodedText === lastScan.current) return;
          lastScan.current = decodedText;
          onScan(decodedText);
          cooldownRef.current = setTimeout(() => {
            lastScan.current = null;
          }, 2000);
        },
        () => { /* scan miss — silent */ }
      );

      setStatus("scanning");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Camera unavailable";
      setErrorMsg(
        msg.includes("Permission") || msg.includes("NotAllowed")
          ? "Camera access denied. Please allow camera access in your browser settings."
          : msg.includes("NotFound") || msg.includes("DevicesNotFound")
          ? "No camera found on this device."
          : "Could not start camera. Try refreshing the page."
      );
      setStatus("error");
    }
  }, [onScan]);

  useEffect(() => {
    if (active) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => { stopScanner(); };
  }, [active, startScanner, stopScanner]);

  return (
    <div className="relative w-full aspect-square max-w-sm mx-auto" ref={containerRef}>
      {/* The html5-qrcode library needs this exact id to mount into */}
      <div id="qr-scanner-viewport" className="w-full h-full rounded-2xl overflow-hidden" />

      {/* Overlay states shown before/instead of camera */}
      {status === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-sc-navy/90 rounded-2xl gap-3">
          <Camera className="size-12 text-white/50" />
          <p className="text-white/70 text-body-sm">Camera paused</p>
        </div>
      )}

      {status === "starting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-sc-navy/90 rounded-2xl gap-3">
          <Loader2 className="size-10 text-sc-teal animate-spin" />
          <p className="text-white/80 text-body-sm">Starting camera…</p>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-sc-rose-50 rounded-2xl gap-3 p-6 text-center">
          <CameraOff className="size-10 text-sc-rose" />
          <p className="text-sc-rose-700 text-body-sm font-medium">{errorMsg}</p>
          <button
            onClick={startScanner}
            className="mt-2 rounded-lg bg-sc-rose px-4 py-2 text-white text-label-md"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Scan target overlay when active */}
      {status === "scanning" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-52 h-52">
            {/* Corner brackets */}
            {(["tl","tr","bl","br"] as const).map((c) => (
              <span
                key={c}
                className={[
                  "absolute w-8 h-8 border-sc-teal border-[3px]",
                  c === "tl" ? "top-0 left-0 border-r-0 border-b-0 rounded-tl-lg" : "",
                  c === "tr" ? "top-0 right-0 border-l-0 border-b-0 rounded-tr-lg" : "",
                  c === "bl" ? "bottom-0 left-0 border-r-0 border-t-0 rounded-bl-lg" : "",
                  c === "br" ? "bottom-0 right-0 border-l-0 border-t-0 rounded-br-lg" : "",
                ].join(" ")}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
