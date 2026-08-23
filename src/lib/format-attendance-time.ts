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
