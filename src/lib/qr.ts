/**
 * QR code generation utilities.
 *
 * Student badges encode a full HTTPS URL, not a raw token, so that
 * a regular phone camera (iOS/Android) can scan the badge and open
 * the SchoolCo attendance flow directly — no app required on the phone.
 *
 * URL format:  https://schoolco.vercel.app/attendance/scan/{ATT-token}
 * Token only:  ATT-{24 hex chars}  (no PII in the URL)
 */

import QRCode from "qrcode";

const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
  "https://schoolco.vercel.app";

/** Build the URL that goes inside the attendance QR code. */
export function attendanceQrUrl(token: string): string {
  return `${APP_ORIGIN}/attendance/scan/${token}`;
}

export type QrFormat = "dataUrl" | "svg" | "buffer";

interface QrOptions {
  size?: number;       // pixel width/height for dataUrl/buffer (default 300)
  margin?: number;     // quiet-zone modules (default 2)
  darkColor?: string;  // hex e.g. "#0B1E38" (default near-black)
  lightColor?: string; // hex (default white)
}

/** Generate a Data URL (PNG) for embedding in <img src={...} /> */
export async function generateQrDataUrl(
  token: string,
  opts: QrOptions = {}
): Promise<string> {
  const url = attendanceQrUrl(token);
  return QRCode.toDataURL(url, {
    width: opts.size ?? 300,
    margin: opts.margin ?? 2,
    color: {
      dark: opts.darkColor ?? "#0B1E38",   // sc-navy
      light: opts.lightColor ?? "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });
}

/** Generate an SVG string for high-quality print output. */
export async function generateQrSvg(
  token: string,
  opts: QrOptions = {}
): Promise<string> {
  const url = attendanceQrUrl(token);
  return QRCode.toString(url, {
    type: "svg",
    margin: opts.margin ?? 2,
    color: {
      dark: opts.darkColor ?? "#0B1E38",
      light: opts.lightColor ?? "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });
}

/** Build the URL that goes inside the student record (back) QR code. */
export function profileQrUrl(token: string): string {
  return `${APP_ORIGIN}/record/scan/${token}`;
}

/** Generate a Data URL (PNG) for the student record QR (PRF- token). */
export async function generateProfileQrDataUrl(
  token: string,
  opts: QrOptions = {}
): Promise<string> {
  const url = profileQrUrl(token);
  return QRCode.toDataURL(url, {
    width: opts.size ?? 300,
    margin: opts.margin ?? 2,
    color: {
      dark: opts.darkColor ?? "#0B1E38",
      light: opts.lightColor ?? "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });
}

/** Build the URL that goes inside a staff attendance QR code (STF- token). */
export function staffAttendanceQrUrl(token: string): string {
  return `${APP_ORIGIN}/staff/scan/${token}`;
}

/** Generate a Data URL (PNG) for the staff attendance QR (STF- token). */
export async function generateStaffQrDataUrl(
  token: string,
  opts: QrOptions = {}
): Promise<string> {
  const url = staffAttendanceQrUrl(token);
  return QRCode.toDataURL(url, {
    width: opts.size ?? 300,
    margin: opts.margin ?? 2,
    color: {
      dark: opts.darkColor ?? "#0B1E38",
      light: opts.lightColor ?? "#FFFFFF",
    },
    errorCorrectionLevel: "M",
  });
}

/**
 * Generate a high-resolution print-quality PNG for any URL.
 * Used for the Canva-ready QR download — 800px, H error correction, max contrast.
 */
export async function generatePrintQrDataUrl(
  url: string,
  opts: QrOptions = {}
): Promise<string> {
  return QRCode.toDataURL(url, {
    width: opts.size ?? 800,
    margin: opts.margin ?? 4,
    color: {
      dark: opts.darkColor ?? "#000000",
      light: opts.lightColor ?? "#FFFFFF",
    },
    errorCorrectionLevel: "H",
  });
}
