/**
 * Canonical attendance time formatter for Rising Leaders Academy.
 *
 * All staff-facing attendance time displays MUST use this function.
 * RLA operates in America/New_York (EDT in summer, EST in winter).
 * Timestamps are stored as UTC (timestamptz) in Postgres.
 * This function converts back to Eastern for display.
 *
 * Usage:
 *   import { formatAttendanceTime } from "@/lib/format-attendance-time";
 *   formatAttendanceTime(record.check_in_at)  // "8:02 AM"
 *   formatAttendanceTime(null)                // "—"
 */
export function formatAttendanceTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  });
}

/**
 * Convert a date string (YYYY-MM-DD) and time string (HH:MM) entered as
 * America/New_York wall-clock time to a UTC ISO string for timestamptz storage.
 * Uses an iterative Intl approach that is browser-timezone-independent and DST-aware.
 */
export function toEasternISO(dateStr: string, hhmm: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  let utcMs = Date.UTC(y, mo - 1, d, h, m, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  for (let i = 0; i < 2; i++) {
    const parts = fmt.formatToParts(new Date(utcMs));
    const eH = parseInt(parts.find((p) => p.type === "hour")!.value) % 24;
    const eM = parseInt(parts.find((p) => p.type === "minute")!.value);
    utcMs -= (eH * 60 + eM - h * 60 - m) * 60_000;
  }
  return new Date(utcMs).toISOString();
}
