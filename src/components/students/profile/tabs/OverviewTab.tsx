"use client";

import { useEffect, useState } from "react";
import {
  CalendarDays, Phone, ShieldAlert, AlertTriangle, Users,
  BookOpen, Trophy, Clock, CheckCircle, Target, ClipboardList, Pin, TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { getStudentOverviewData } from "@/app/actions/profileData";
import { getStudentGoals, type Goal } from "@/app/actions/studentGoals";
import { getSnapshotFlags, type SupportFlag } from "@/app/actions/supportFlags";
import { getCurriculumEnrollments, getAcademicPlanSummary, getActiveInterventionSummary, type CurriculumEnrollment, type AcademicPlanEntry } from "@/app/actions/academics";
import { getAssessmentSnapshot } from "@/app/actions/assessments";
import { getProgressSnapshot } from "@/app/actions/progressHistory";
import { SUBJECT_LABELS } from "@/lib/academics-constants";
import { getSSPSummary } from "@/app/actions/successPlanActions";
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
  const [overview, setOverview]         = useState<Awaited<ReturnType<typeof getStudentOverviewData>>>(null);
  const [goals, setGoals]               = useState<Goal[]>([]);
  const [snapshotFlags, setSnapshotFlags] = useState<SupportFlag[]>([]);
  const [curricula, setCurricula]         = useState<CurriculumEnrollment[]>([]);
  const [assessSnap, setAssessSnap]       = useState<Awaited<ReturnType<typeof getAssessmentSnapshot>> | null>(null);
  const [progressSnap, setProgressSnap]   = useState<Awaited<ReturnType<typeof getProgressSnapshot>> | null>(null);
  const [sspSummary, setSSPSummary]       = useState<Awaited<ReturnType<typeof getSSPSummary>>>(null);
  const [academicPlan, setAcademicPlan]   = useState<AcademicPlanEntry[]>([]);
  const [interventions, setInterventions] = useState<Awaited<ReturnType<typeof getActiveInterventionSummary>>>([]);
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    Promise.all([
      getStudentOverviewData(studentId),
      getStudentGoals(studentId),
      getSnapshotFlags(studentId),
      getCurriculumEnrollments(studentId),
      getAssessmentSnapshot(studentId),
      getSSPSummary(studentId),
      getAcademicPlanSummary(studentId),
      getActiveInterventionSummary(studentId),
      getProgressSnapshot(studentId),
    ]).then(([overviewData, goalsData, flagsData, currData, snapData, sspData, planData, iData, progSnap]) => {
      setOverview(overviewData);
      setGoals(goalsData.filter((g) => g.status === "active"));
      setSnapshotFlags(flagsData);
      setCurricula(currData.filter((c) => c.status === "active"));
      setAssessSnap(snapData);
      setSSPSummary(sspData);
      setAcademicPlan(planData);
      setInterventions(iData);
      setProgressSnap(progSnap);
      setLoading(false);
    });
  }, [studentId]);

  const hasEmergencyMed = data.medication_alerts.some((m) => m.is_emergency);
  const hasAllergies    = data.allergies.length > 0;
  const hasMedicalNotes = !!data.medical_notes;

  return (
    <div className="space-y-6">

      {/* ── STUDENT SNAPSHOT ROW ──────────────────────────────── */}
      {!loading && (
        <div className="rounded-2xl border border-sc-navy/10 bg-sc-navy p-5 space-y-4">
          <p className="text-label-sm font-semibold text-white/60 uppercase tracking-wider">Student Snapshot</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Grade */}
            <SnapshotCard label="Grade" value={data.grade_level ?? "—"} />
            {/* Enrollment */}
            <SnapshotCard label="Status" value={data.enrollment_status} capitalize />
            {/* Curricula count */}
            <SnapshotCard label="Curricula" value={curricula.length > 0 ? `${curricula.length} active` : "None"} />
            {/* Active goals */}
            <SnapshotCard label="Goals" value={goals.length > 0 ? `${goals.length} active` : "None"} href={`?tab=goals`} />
            {/* Scholarship */}
            <SnapshotCard label="Scholarship" value={(data.scholarship_info as { type?: string } | null)?.type ?? "—"} />
            {/* Assessments */}
            <SnapshotCard
              label="Assessments"
              value={assessSnap ? (assessSnap.totalCount > 0 ? `${assessSnap.totalCount} on file` : "None") : "—"}
              href={`?tab=assessments`}
            />
          </div>
        </div>
      )}

      {/* ── SSP Summary card ─────────────────────────────────── */}
      {sspSummary && (sspSummary.activeGoalCount > 0 || sspSummary.highPriorityStrategies.length > 0 || sspSummary.learningStyles.length > 0) && (
        <div className="rounded-2xl border border-sc-teal-200 bg-sc-teal-50 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="flex items-center gap-2 font-serif text-heading-3 text-sc-navy">
              <ClipboardList className="size-4 text-sc-teal" /> Success Plan
            </p>
            <Link href={`/dashboard/students/${studentId}?tab=plan`}
              className="text-label-sm text-sc-teal font-medium hover:text-sc-teal-700">
              View plan →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-white border border-sc-teal-100 px-3 py-2.5 text-center">
              <p className="text-display-2 font-serif font-bold text-sc-teal">{sspSummary.activeGoalCount}</p>
              <p className="text-label-sm text-sc-gray mt-0.5">Active Goals</p>
            </div>
            <div className="rounded-xl bg-white border border-sc-teal-100 px-3 py-2.5 text-center">
              <p className="text-display-2 font-serif font-bold text-sc-rose">{sspSummary.highPriorityStrategies.length}</p>
              <p className="text-label-sm text-sc-gray mt-0.5">Priority Strategies</p>
            </div>
            <div className="rounded-xl bg-white border border-sc-teal-100 px-3 py-2.5">
              <p className="text-label-sm text-sc-gray mb-1">Learning Styles</p>
              <p className="text-label-sm text-sc-navy font-medium">
                {sspSummary.learningStyles.length > 0
                  ? sspSummary.learningStyles.map((s) =>
                      ({ visual:"Visual", auditory:"Auditory", reading_writing:"Read/Write",
                         hands_on:"Hands-On", independent:"Independent", collaborative:"Collaborative" })[s] ?? s
                    ).join(", ")
                  : "Not set"}
              </p>
            </div>
          </div>
          {sspSummary.lastReviewedAt && (
            <p className="text-label-sm text-sc-gray mt-2">
              Last reviewed {new Date(sspSummary.lastReviewedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
      )}

      {/* ── Current Academic Plan Summary ─────────────────────── */}
      {academicPlan.length > 0 && (
        <div className="rounded-2xl border border-sc-navy/10 bg-white shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="flex items-center gap-2 font-serif text-heading-3 text-sc-navy">
              <BookOpen className="size-4 text-sc-teal" /> Current Academic Plan
            </p>
            <Link href={`/dashboard/students/${studentId}?tab=academics`}
              className="text-label-sm text-sc-teal hover:text-sc-teal-700 font-medium">
              View academics →
            </Link>
          </div>
          <div className="space-y-2">
            {academicPlan.map((entry) => (
              <div key={entry.subject} className="flex items-center gap-3 text-label-sm">
                <span className="w-20 shrink-0 font-semibold text-sc-navy">{entry.label}</span>
                <span className="flex-1 text-sc-gray">
                  {entry.name}
                  {entry.level  && <span> · {entry.level}</span>}
                  {entry.lesson && <span> — Lesson {entry.lesson}</span>}
                </span>
                {entry.oo1_active && entry.oo1_status && ["active","monitoring"].includes(entry.oo1_status) && (
                  <span className={cn("rounded-full px-2 py-0.5 text-label-sm font-medium border shrink-0",
                    entry.oo1_status === "active"
                      ? "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200"
                      : "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200"
                  )}>
                    {entry.oo1_status === "active" ? "Active 1:1" : "Monitoring"}
                  </span>
                )}
              </div>
            ))}
          </div>
          {interventions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-sc-gray-100">
              <p className="text-label-sm font-semibold text-sc-rose-700 mb-1">Academic Support Needed</p>
              {interventions.map((i) => (
                <p key={i.subject} className="text-label-sm text-sc-gray">
                  • {i.label} — {i.intervention_status === "active" ? "Active 1:1" : "Monitoring"}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Progress History snapshot ─────────────────────────── */}
      {progressSnap && progressSnap.totalRecords > 0 && (
        <div className="rounded-2xl border border-sc-navy/10 bg-white shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="flex items-center gap-2 font-serif text-heading-3 text-sc-navy">
              <TrendingUp className="size-4 text-sc-teal" /> Progress History
            </p>
            <Link href={`/dashboard/students/${studentId}?tab=progress`}
              className="text-label-sm text-sc-teal hover:text-sc-teal-700 font-medium">
              View history →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 px-3 py-2.5 text-center">
              <p className="text-display-2 font-serif font-bold text-sc-teal">{progressSnap.totalRecords}</p>
              <p className="text-label-sm text-sc-gray mt-0.5">Check-ins</p>
            </div>
            <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 px-3 py-2.5 text-center">
              <p className="text-display-2 font-serif font-bold text-sc-navy">{progressSnap.subjectCount}</p>
              <p className="text-label-sm text-sc-gray mt-0.5">Subjects</p>
            </div>
            <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 px-3 py-2.5 text-center">
              <p className="text-label-sm text-sc-gray mb-0.5">Latest</p>
              <p className="text-label-sm font-semibold text-sc-navy">
                {progressSnap.latestDate
                  ? new Date(progressSnap.latestDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "—"}
              </p>
            </div>
          </div>
          {progressSnap.isStale && (
            <p className="mt-3 text-label-sm text-sc-rose-700 font-medium flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" /> {progressSnap.stalenessMessage}
            </p>
          )}
        </div>
      )}

      {/* ── Pinned support flags on snapshot ─────────────────── */}
      {snapshotFlags.length > 0 && (
        <div className="rounded-2xl border-2 border-sc-rose bg-sc-rose-50 p-4 space-y-2">
          <p className="flex items-center gap-2 font-bold text-sc-rose text-label-md uppercase tracking-wide">
            <Pin className="size-4" /> Staff Reminders
          </p>
          {snapshotFlags.map((flag) => (
            <div key={flag.id} className="flex items-start gap-2 text-label-sm text-sc-rose-700">
              <span className="font-semibold">{flag.title}</span>
              {flag.description && <span>— {flag.description}</span>}
            </div>
          ))}
          <Link href={`/dashboard/students/${studentId}?tab=support`}
            className="text-label-sm text-sc-rose font-semibold hover:underline">
            View all support flags →
          </Link>
        </div>
      )}

      {/* ── Current curricula strip ───────────────────────────── */}
      {curricula.length > 0 && (
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-label-md font-semibold text-sc-navy flex items-center gap-2">
              <BookOpen className="size-4 text-sc-teal" /> Current Curriculum
            </h3>
            <Link href={`?tab=academics`} className="text-label-sm text-sc-teal hover:underline">View all →</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {curricula.map((c) => (
              <div key={c.id} className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 px-3 py-2 min-w-[120px]">
                <p className="text-label-sm font-semibold text-sc-navy capitalize">{c.subject}</p>
                <p className="text-label-sm text-sc-gray">{c.curriculum_name}</p>
                {c.current_level && <p className="text-label-sm text-sc-teal font-medium">Level {c.current_level}</p>}
                {c.current_lesson && <p className="text-label-sm text-sc-gray">{c.current_lesson}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Active goals strip ────────────────────────────────── */}
      {goals.length > 0 && (
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-label-md font-semibold text-sc-navy flex items-center gap-2">
              <Target className="size-4 text-sc-teal" /> Active Goals
            </h3>
            <Link href={`?tab=goals`} className="text-label-sm text-sc-teal hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {goals.slice(0, 3).map((g) => (
              <div key={g.id} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-label-sm text-sc-navy">{g.goal_text}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-16 h-1.5 rounded-full bg-sc-gray-100">
                    <div className="h-full rounded-full bg-sc-teal transition-all" style={{ width: `${g.progress_pct}%` }} />
                  </div>
                  <span className="text-label-sm text-sc-gray w-8 text-right">{g.progress_pct}%</span>
                </div>
              </div>
            ))}
            {goals.length > 3 && (
              <Link href={`?tab=goals`} className="text-label-sm text-sc-teal hover:underline">
                +{goals.length - 3} more goals →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Assessment summary card ───────────────────────────── */}
      {assessSnap && assessSnap.totalCount > 0 && (
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-label-md font-semibold text-sc-navy flex items-center gap-2">
              <ClipboardList className="size-4 text-sc-teal" /> Assessment Summary
            </h3>
            <Link href={`?tab=assessments`} className="text-label-sm text-sc-teal hover:underline">View all →</Link>
          </div>
          <div className="space-y-2 text-label-sm">
            <div className="flex gap-4 flex-wrap">
              <span className="text-sc-gray">
                <span className="font-semibold text-sc-navy">{assessSnap.totalCount}</span> total
              </span>
              {assessSnap.latestDate && (
                <span className="text-sc-gray">
                  Last: <span className="text-sc-navy">{new Date(assessSnap.latestDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                </span>
              )}
              {assessSnap.subjectsAssessed.length > 0 && (
                <span className="text-sc-gray">
                  Subjects: <span className="text-sc-navy">{assessSnap.subjectsAssessed.map((s) => SUBJECT_LABELS[s as keyof typeof SUBJECT_LABELS] ?? s).join(", ")}</span>
                </span>
              )}
            </div>
            {assessSnap.needsSupport.length > 0 && (
              <div className="rounded-lg bg-sc-rose-50 border border-sc-rose-100 px-3 py-2">
                <p className="font-semibold text-sc-rose-700 mb-1">Needs Support</p>
                {assessSnap.needsSupport.map((n) => (
                  <p key={n.subject} className="text-sc-rose-700">
                    {SUBJECT_LABELS[n.subject as keyof typeof SUBJECT_LABELS] ?? n.subject} — {n.level.replace(/_/g, " ")}
                  </p>
                ))}
              </div>
            )}
            {assessSnap.missingBOY.length > 0 && (
              <p className="text-sc-gold-700">
                ⚠ Missing BOY assessment: {assessSnap.missingBOY.map((s) => SUBJECT_LABELS[s as keyof typeof SUBJECT_LABELS] ?? s).join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

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
              {(overview.incidents as unknown as Array<{ id: string; title: string; severity: string; status: string; occurred_at: string }>).map((inc) => (
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
              {(overview.timeline as unknown as Array<{ id: string; entry_type: string; title: string; body: string | null; occurred_at: string }>).map((entry) => {
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
            {((overview?.guardians ?? []) as unknown as Array<{ id: string; profiles: { full_name: string; phone: string | null; email: string | null } | null; relationship_type: string | null; is_primary_contact: boolean; is_emergency_contact: boolean }>).slice(0, 4).map((g) => {
              const profile = g.profiles;
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
      </div>{/* end inner grid */}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────

function SnapshotCard({ label, value, capitalize, href, valueClass }: {
  label: string; value: string; capitalize?: boolean; href?: string; valueClass?: string;
}) {
  const inner = (
    <div className={cn("rounded-xl bg-white/10 px-3 py-3 text-center", href && "hover:bg-white/20 transition-colors")}>
      <p className="text-label-sm text-white/50">{label}</p>
      <p className={cn("text-label-md font-bold text-white mt-0.5 truncate", capitalize && "capitalize", valueClass)}>{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

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
