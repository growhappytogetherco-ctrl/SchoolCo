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
