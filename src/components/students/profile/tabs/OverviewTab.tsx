"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays, Phone, ShieldAlert, AlertTriangle, Users,
  BookOpen, Trophy, Loader2, Clock, CheckCircle,
} from "lucide-react";
import Link from "next/link";
import { getStudentOverviewData } from "@/app/actions/profileData";
import type { StudentProfileData } from "../types";
import { cn } from "@/lib/utils";

// ── Helpers ─────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function fmtAge(dob: string | null): string {
  if (!dob) return "";
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return `${age} years old`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const INCIDENT_SEVERITY: Record<string, string> = {
  low:      "bg-sc-gold-50  text-sc-gold-700  border-sc-gold-200",
  medium:   "bg-sc-rose-50  text-sc-rose-700  border-sc-rose-200",
  high:     "bg-sc-rose     text-white         border-sc-rose-700",
  critical: "bg-sc-navy     text-white         border-sc-navy",
};

const TIMELINE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  enrollment:            { icon: BookOpen,    color: "text-sc-teal"  },
  badge_earned:          { icon: Trophy,      color: "text-sc-gold"  },
  attendance_milestone:  { icon: CheckCircle, color: "text-sc-teal"  },
  staff_note_shared:     { icon: Clock,       color: "text-sc-gray"  },
  incident_resolved:     { icon: CheckCircle, color: "text-sc-green" },
};

// ── Component ────────────────────────────────────────────────────

interface Props {
  studentId: string;
  data: StudentProfileData;
}

export function OverviewTab({ studentId, data }: Props) {
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getStudentOverviewData>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStudentOverviewData(studentId).then((d) => {
      setOverview(d);
      setLoading(false);
    });
  }, [studentId]);

  const hasEmergencyMed = data.medication_alerts.some((m) => m.is_emergency);
  const hasAllergies    = data.allergies.length > 0;
  const hasMedicalNotes = !!data.medical_notes;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ── Left column (2/3 on desktop) ─────────────────────── */}
      <div className="lg:col-span-2 space-y-5">

        {/* Emergency medical alert */}
        {hasEmergencyMed && (
          <div className="rounded-2xl border-2 border-sc-rose bg-sc-rose-50 p-4 space-y-2">
            <p className="flex items-center gap-2 font-bold text-sc-rose text-label-md uppercase tracking-wide">
              <ShieldAlert className="size-5" /> Emergency Medication On File
            </p>
            {data.medication_alerts.filter((m) => m.is_emergency).map((m) => (
              <div key={m.id} className="text-label-sm text-sc-rose-700">
                <p className="font-semibold">{m.medication_name} {m.dosage ? `— ${m.dosage}` : ""}</p>
                {m.instructions && <p className="mt-0.5 text-sc-rose-600">{m.instructions}</p>}
                {m.storage_location && <p className="text-sc-rose-500">Stored: {m.storage_location}</p>}
              </div>
            ))}
            <Link href={`/dashboard/students/${studentId}?tab=medical`}
              className="text-label-sm text-sc-rose font-semibold hover:underline">
              View full medical record →
            </Link>
          </div>
        )}

        {/* Basic info card */}
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-4">
          <h2 className="font-serif text-heading-3 text-sc-navy">Student Information</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <InfoRow label="Date of Birth" value={fmtDate(data.date_of_birth)} />
            <InfoRow label="Age" value={fmtAge(data.date_of_birth) || "—"} />
            <InfoRow label="Grade" value={data.grade_level ?? "—"} />
            <InfoRow label="Track" value={data.track ?? "—"} />
            <InfoRow label="Enrollment" value={fmtDate(data.enrollment_date)} />
            <InfoRow label="Status"
              value={data.enrollment_status.charAt(0).toUpperCase() + data.enrollment_status.slice(1)}
              valueClass={data.enrollment_status === "enrolled" ? "text-sc-teal font-semibold" : ""}
            />
            {data.expected_graduation && (
              <InfoRow label="Expected Graduation" value={fmtDate(data.expected_graduation)} />
            )}
            {data.scholarship_info?.type && (
              <InfoRow label="Scholarship" value={data.scholarship_info.type} />
            )}
          </div>
        </div>

        {/* Current attendance */}
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
          <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
            <CalendarDays className="size-4 text-sc-teal" /> Today&apos;s Attendance
          </h2>
          {!data.today_attendance ? (
            <p className="text-body-md text-sc-gray">No attendance record yet today.</p>
          ) : (
            <div className="flex flex-wrap gap-4 text-label-sm">
              <div>
                <p className="text-sc-gray">Check In</p>
                <p className="font-semibold text-sc-navy">{fmtTime(data.today_attendance.check_in_at)}</p>
              </div>
              <div>
                <p className="text-sc-gray">Check Out</p>
                <p className="font-semibold text-sc-navy">{fmtTime(data.today_attendance.check_out_at)}</p>
              </div>
              {data.today_attendance.is_late && (
                <span className="self-center rounded-full bg-sc-gold-50 border border-sc-gold-200 px-2.5 py-0.5 text-sc-gold-700 font-medium">
                  Late Arrival
                </span>
              )}
              {data.today_attendance.is_early_pickup && (
                <span className="self-center rounded-full bg-sc-navy-50 border border-sc-navy-200 px-2.5 py-0.5 text-sc-navy font-medium">
                  Early Pickup
                </span>
              )}
            </div>
          )}
        </div>

        {/* Recent incidents */}
        {loading ? (
          <Skeleton />
        ) : overview?.incidents && overview.incidents.length > 0 ? (
          <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
            <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
              <AlertTriangle className="size-4 text-sc-rose" /> Recent Incidents
            </h2>
            <div className="divide-y divide-sc-gray-100">
              {overview.incidents.map((inc) => (
                <div key={inc.id} className="py-2.5 flex items-center gap-3">
                  <span className={cn("rounded-full border px-2 py-0.5 text-label-sm shrink-0",
                    INCIDENT_SEVERITY[inc.severity] ?? "bg-sc-gray-50 text-sc-gray border-sc-gray-200"
                  )}>
                    {inc.severity}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-label-md text-sc-navy font-medium truncate">{inc.title}</p>
                    <p className="text-label-sm text-sc-gray">{fmtDate(inc.occurred_at)}</p>
                  </div>
                  <span className={cn("text-label-sm font-medium",
                    inc.status === "resolved" || inc.status === "closed"
                      ? "text-sc-teal" : "text-sc-rose"
                  )}>
                    {inc.status}
                  </span>
                </div>
              ))}
            </div>
            <Link href={`/dashboard/students/${studentId}?tab=incidents`}
              className="text-label-sm text-sc-teal hover:underline font-medium">
              View all incidents →
            </Link>
          </div>
        ) : null}

        {/* Timeline */}
        {loading ? (
          <Skeleton />
        ) : overview?.timeline && overview.timeline.length > 0 ? (
          <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-4">
            <h2 className="font-serif text-heading-3 text-sc-navy">Recent Activity</h2>
            <div className="relative pl-5 space-y-4">
              <div className="absolute left-2 top-2 bottom-2 w-px bg-sc-gray-100" />
              {overview.timeline.map((entry) => {
                const cfg = TIMELINE_ICONS[entry.entry_type] ?? { icon: Clock, color: "text-sc-gray" };
                const TIcon = cfg.icon;
                return (
                  <div key={entry.id} className="relative flex gap-3">
                    <div className="absolute -left-3 flex h-4 w-4 items-center justify-center rounded-full bg-white ring-2 ring-sc-gray-100">
                      <TIcon className={cn("size-2.5", cfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-label-md text-sc-navy font-medium">{entry.title}</p>
                      {entry.body && (
                        <p className="text-label-sm text-sc-gray mt-0.5 line-clamp-2">{entry.body}</p>
                      )}
                      <p className="text-label-sm text-sc-gray-400 mt-0.5">{fmtDate(entry.occurred_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Right column (1/3 on desktop) ─────────────────────── */}
      <div className="space-y-5">

        {/* Guardians / contacts */}
        {loading ? (
          <Skeleton />
        ) : (
          <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
            <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
              <Users className="size-4 text-sc-teal" /> Family Contacts
            </h2>
            {(overview?.guardians ?? []).slice(0, 4).map((g) => {
              const profile = g.profiles as { full_name: string; phone: string | null; email: string | null } | null;
              return (
                <div key={g.id} className="border-t border-sc-gray-100 pt-2.5 first:border-t-0 first:pt-0">
                  <p className="text-label-md font-semibold text-sc-navy">{profile?.full_name ?? "—"}</p>
                  <p className="text-label-sm text-sc-gray capitalize">
                    {g.relationship_type?.replace("_", " ")}
                    {g.is_primary_contact && " · Primary"}
                    {g.is_emergency_contact && " · Emergency"}
                  </p>
                  {profile?.phone && (
                    <a href={`tel:${profile.phone}`} className="flex items-center gap-1 text-label-sm text-sc-teal mt-0.5">
                      <Phone className="size-3" /> {profile.phone}
                    </a>
                  )}
                </div>
              );
            })}
            <Link href={`/dashboard/students/${studentId}?tab=family`}
              className="text-label-sm text-sc-teal hover:underline font-medium">
              View full family →
            </Link>
          </div>
        )}

        {/* Medical summary */}
        {(hasAllergies || hasMedicalNotes || data.medication_alerts.length > 0) && (
          <div className={cn(
            "rounded-2xl border-2 p-5 space-y-3",
            hasEmergencyMed ? "border-sc-rose bg-sc-rose-50" : "border-sc-gold-200 bg-sc-gold-50"
          )}>
            <h2 className={cn("font-serif text-heading-3 flex items-center gap-2",
              hasEmergencyMed ? "text-sc-rose" : "text-sc-gold-700"
            )}>
              <AlertTriangle className="size-4" /> Medical Alerts
            </h2>
            {hasAllergies && (
              <div>
                <p className="text-label-sm font-semibold text-sc-navy">Allergies</p>
                <p className="text-label-sm text-sc-gray mt-0.5">{data.allergies.join(", ")}</p>
              </div>
            )}
            {data.medication_alerts.map((m) => (
              <div key={m.id}>
                <p className="text-label-sm font-semibold text-sc-navy">{m.medication_name}</p>
                {m.dosage && <p className="text-label-sm text-sc-gray">{m.dosage}</p>}
              </div>
            ))}
            <Link href={`/dashboard/students/${studentId}?tab=medical`}
              className="text-label-sm font-semibold text-sc-teal hover:underline">
              Full medical record →
            </Link>
          </div>
        )}

        {/* Authorized pickup notes */}
        {data.authorized_pickup_notes && (
          <div className="rounded-2xl border border-sc-gray-200 bg-white shadow-card p-5">
            <h2 className="font-serif text-heading-3 text-sc-navy mb-2">Authorized Pickup</h2>
            <p className="text-body-sm text-sc-gray">{data.authorized_pickup_notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────

function InfoRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-label-sm text-sc-gray">{label}</p>
      <p className={cn("text-label-md text-sc-navy font-medium mt-0.5", valueClass)}>{value}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-5 space-y-3">
      <div className="h-5 w-32 rounded-lg bg-sc-gray-100 animate-pulse" />
      <div className="h-4 w-full rounded-lg bg-sc-gray-100 animate-pulse" />
      <div className="h-4 w-3/4 rounded-lg bg-sc-gray-100 animate-pulse" />
    </div>
  );
}
