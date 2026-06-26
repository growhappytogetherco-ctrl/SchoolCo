"use client";

import { GraduationCap, QrCode, Clock, Award, Briefcase, BadgeCheck } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { StudentProfileData } from "./types";

// ── Helpers ────────────────────────────────────────────────────

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function AttendanceChip({ attendance }: { attendance: StudentProfileData["today_attendance"] }) {
  if (!attendance) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sc-gray-100 px-2.5 py-1 text-label-sm text-sc-gray-500">
        Not yet recorded
      </span>
    );
  }
  if (attendance.check_out_at) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sc-navy-50 border border-sc-navy-200 px-2.5 py-1 text-label-sm text-sc-navy font-medium">
        <Clock className="size-3" /> Checked out {fmtTime(attendance.check_out_at)}
      </span>
    );
  }
  if (attendance.check_in_at) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sc-teal-50 border border-sc-teal-200 px-2.5 py-1 text-label-sm text-sc-teal-700 font-medium">
        <BadgeCheck className="size-3" />
        On campus {fmtTime(attendance.check_in_at)}
        {attendance.is_late && (
          <span className="ml-1 text-sc-gold-600 font-semibold">· Late</span>
        )}
      </span>
    );
  }
  if (attendance.status === "absent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sc-rose-50 border border-sc-rose-200 px-2.5 py-1 text-label-sm text-sc-rose-700 font-medium">
        Absent today
      </span>
    );
  }
  return null;
}

const BADGE_LEVEL_COLORS: Record<string, string> = {
  platinum: "bg-sc-gray-100 text-sc-gray-700 border-sc-gray-300",
  gold:     "bg-sc-gold-50  text-sc-gold-700  border-sc-gold-200",
  silver:   "bg-sc-gray-50  text-sc-gray-600  border-sc-gray-200",
  bronze:   "bg-amber-50    text-amber-700    border-amber-200",
};

// ── Component ─────────────────────────────────────────────────

export function StudentProfileHeader({ data }: { data: StudentProfileData }) {
  const displayName = data.preferred_name
    ? `${data.preferred_name} ${data.last_name}`
    : `${data.first_name} ${data.last_name}`;

  const legalName =
    data.preferred_name
      ? `${data.first_name} ${data.last_name}`
      : null;

  const age = calcAge(data.date_of_birth);
  const scholarship = data.scholarship_info?.type ?? data.scholarship_info?.name ?? null;
  const hasAllergies = data.allergies.length > 0;
  const hasMedicalNotes = !!data.medical_notes;

  return (
    <div className="bg-sc-navy text-white">
      <div className="px-4 sm:px-6 pt-6 pb-5">
        <div className="flex gap-4 items-start">

          {/* ── Avatar ──────────────────────────────────────── */}
          <div className="shrink-0">
            {data.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.avatar_url}
                alt={displayName}
                className="h-20 w-20 rounded-2xl object-cover ring-2 ring-white/20"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-sc-teal text-white text-2xl font-serif font-bold ring-2 ring-white/20">
                {data.first_name[0]}{data.last_name[0]}
              </div>
            )}
          </div>

          {/* ── Name block ──────────────────────────────────── */}
          <div className="flex-1 min-w-0 pt-0.5">
            <h1 className="font-serif text-display-2 text-white leading-tight">{displayName}</h1>
            {legalName && (
              <p className="text-white/60 text-label-sm mt-0.5">Legal name: {legalName}</p>
            )}

            {/* Grade + age + track */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {data.grade_level && (
                <span className="flex items-center gap-1 text-white/80 text-label-sm">
                  <GraduationCap className="size-3.5" />
                  {data.grade_level}
                  {age !== null && <span className="text-white/50 ml-1">· {age} yrs</span>}
                </span>
              )}
              {data.track && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-label-sm text-white/80">
                  {data.track}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Chip row ────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mt-4">
          {/* Student ID */}
          {data.student_display_id && (
            <span className="rounded-full bg-white/10 border border-white/20 px-3 py-1 text-label-sm text-white/90 font-mono">
              {data.student_display_id}
            </span>
          )}

          {/* QR Badge ID */}
          {data.attendance_qr_token && (
            <Link
              href={`/dashboard/attendance/scan`}
              className="flex items-center gap-1 rounded-full bg-white/10 border border-white/20 px-3 py-1 text-label-sm text-white/80 hover:bg-white/20 transition-colors"
              title="View attendance scanner"
            >
              <QrCode className="size-3" />
              QR Badge
            </Link>
          )}

          {/* Attendance today */}
          <AttendanceChip attendance={data.today_attendance} />

          {/* Leadership level */}
          {data.top_badge_level && (
            <span className={cn(
              "flex items-center gap-1 rounded-full border px-3 py-1 text-label-sm font-medium",
              BADGE_LEVEL_COLORS[data.top_badge_level] ?? "bg-white/10 text-white border-white/20"
            )}>
              <Award className="size-3" />
              {data.top_badge_level.charAt(0).toUpperCase() + data.top_badge_level.slice(1)} Leader
            </span>
          )}

          {/* Entrepreneurship */}
          {data.active_project_count > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-sc-gold-50 border border-sc-gold-200 px-3 py-1 text-label-sm text-sc-gold-700 font-medium">
              <Briefcase className="size-3" />
              {data.active_project_count} Active {data.active_project_count === 1 ? "Project" : "Projects"}
            </span>
          )}

          {/* Scholarship */}
          {scholarship && (
            <span className="flex items-center gap-1 rounded-full bg-sc-teal-50 border border-sc-teal-200 px-3 py-1 text-label-sm text-sc-teal-700 font-medium">
              <BadgeCheck className="size-3" />
              {scholarship}
            </span>
          )}

          {/* Medical flag */}
          {(hasAllergies || hasMedicalNotes) && (
            <span className="rounded-full bg-sc-gold-100 border border-sc-gold-300 px-3 py-1 text-label-sm text-sc-gold-700 font-medium">
              Medical Notes
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
