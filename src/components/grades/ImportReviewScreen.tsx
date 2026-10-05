"use client";

import { useState, useCallback, useEffect } from "react";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, ShieldAlert,
  ChevronDown, ChevronUp, Loader2, ExternalLink, FileText,
  RotateCcw, Check, X, Pencil, Info,
} from "lucide-react";
import {
  getImportJob, updateProposedCourse, approveProposedCourse,
  rejectProposedCourse, markImportReviewed, retryImport,
  type ImportJobWithCourses, type ProposedCourse,
} from "@/app/actions/academicImport";
import { getSourceDocumentUrl as getDocUrl } from "@/app/actions/courseRecords";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TERM_LABELS: Record<string, string> = {
  full_year: "Full Year", semester_1: "Semester 1", semester_2: "Semester 2",
  quarter_1: "Q1", quarter_2: "Q2", quarter_3: "Q3", quarter_4: "Q4",
  summer: "Summer", other: "Other",
};

const COMPLETION_LABELS: Record<string, string> = {
  completed: "Completed", failed: "Failed", withdrawn: "Withdrawn",
  incomplete: "Incomplete", unknown: "Unknown", in_progress: "In Progress",
};

const LEVEL_LABELS: Record<string, string> = {
  standard: "Standard", honors: "Honors", ap: "AP", dual_enrollment: "Dual Enrollment",
};

const CREDIT_UNIT_LABELS: Record<string, string> = {
  high_school_credit: "HS Credits",
  college_semester_hours: "College Semester Hours",
  college_quarter_hours: "College Quarter Hours",
  other: "Other Units",
};

function DupBadge({ level }: { level: ProposedCourse["duplicate_level"] }) {
  if (!level || level === "none") return null;
  const cfg = {
    possible: { cls: "text-sc-gold-700 bg-sc-gold-50 border-sc-gold-300", icon: AlertTriangle, label: "Possible Duplicate" },
    strong:   { cls: "text-sc-gold-800 bg-sc-gold-50 border-sc-gold-600", icon: AlertTriangle, label: "Strong Duplicate" },
    conflict: { cls: "text-sc-rose-700 bg-sc-rose-50 border-sc-rose-200", icon: ShieldAlert,   label: "Conflict w/ Verified" },
  }[level];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-label-sm border rounded-full px-2 py-0.5 ${cfg.cls}`}>
      <Icon className="size-3" />{cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; label: string }> = {
    needs_review: { cls: "text-sc-gold-700 bg-sc-gold-50 border-sc-gold-300", label: "Needs Review" },
    verified:     { cls: "text-sc-teal-700 bg-sc-cream border-sc-teal-700/30", label: "Verified" },
    rejected:     { cls: "text-sc-rose-700 bg-sc-rose-50 border-sc-rose-200", label: "Rejected" },
  };
  const c = cfg[status] ?? cfg.needs_review;
  return (
    <span className={`text-label-sm border rounded-full px-2 py-0.5 ${c.cls}`}>{c.label}</span>
  );
}

// ── Inline edit form for one proposed course ──────────────────────────────────

function CourseEditForm({
  course,
  studentId,
  onSave,
  onCancel,
}: {
  course: ProposedCourse;
  studentId: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [fields, setFields] = useState({
    school_year:          course.school_year,
    grade_level:          course.grade_level ?? "",
    institution_name:     course.institution_name ?? "",
    course_name:          course.course_name,
    course_code:          course.course_code ?? "",
    term:                 course.term ?? "",
    course_level:         course.course_level ?? "",
    semester_1_grade:     course.semester_1_grade ?? "",
    semester_2_grade:     course.semester_2_grade ?? "",
    final_grade:          course.final_grade ?? "",
    percentage:           course.percentage != null ? String(course.percentage) : "",
    credits_attempted:    course.credits_attempted != null ? String(course.credits_attempted) : "",
    credits_earned:       course.credits_earned != null ? String(course.credits_earned) : "",
    source_credits_attempted: course.source_credits_attempted != null ? String(course.source_credits_attempted) : "",
    source_credits_earned:    course.source_credits_earned != null ? String(course.source_credits_earned) : "",
    source_credit_unit:       course.source_credit_unit ?? "",
    counts_toward_high_school_credit: course.counts_toward_high_school_credit,
    completion_status:    course.completion_status,
    source_notes:         course.source_notes ?? "",
  });

  function set(k: string, v: string | boolean) {
    setFields((p) => ({ ...p, [k]: v }));
  }

  async function handleSave() {
    setBusy(true);
    setErr("");
    const result = await updateProposedCourse(course.id, studentId, {
      school_year:          fields.school_year || undefined,
      grade_level:          fields.grade_level || null,
      institution_name:     fields.institution_name || null,
      course_name:          fields.course_name || undefined,
      course_code:          fields.course_code || null,
      term:                 fields.term || null,
      course_level:         fields.course_level || null,
      semester_1_grade:     fields.semester_1_grade || null,
      semester_2_grade:     fields.semester_2_grade || null,
      final_grade:          fields.final_grade || null,
      percentage:           fields.percentage ? parseFloat(fields.percentage) : null,
      credits_attempted:    fields.credits_attempted ? parseFloat(fields.credits_attempted) : null,
      credits_earned:       fields.credits_earned !== "" ? parseFloat(fields.credits_earned) : null,
      source_credits_attempted: fields.source_credits_attempted ? parseFloat(fields.source_credits_attempted) : null,
      source_credits_earned:    fields.source_credits_earned ? parseFloat(fields.source_credits_earned) : null,
      source_credit_unit:       fields.source_credit_unit || null,
      counts_toward_high_school_credit: fields.counts_toward_high_school_credit,
      completion_status:    fields.completion_status || undefined,
      source_notes:         fields.source_notes || null,
    });
    if (result.success) {
      onSave();
    } else {
      setErr(result.error ?? "Save failed.");
      setBusy(false);
    }
  }

  const inp = "rounded-lg border border-sc-gray-200 px-2 py-1.5 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/40 w-full";
  const sel = `${inp} bg-white`;

  return (
    <div className="mt-3 space-y-3 bg-sc-gray-50/50 rounded-xl border border-sc-gray-100 p-4">
      {err && <p className="text-label-sm text-sc-rose-700">{err}</p>}

      <div className="grid grid-cols-3 gap-2">
        <div><label className="text-label-sm font-medium text-sc-navy">School Year</label>
          <input className={inp} value={fields.school_year} onChange={e => set("school_year", e.target.value)} /></div>
        <div><label className="text-label-sm font-medium text-sc-navy">Grade Level</label>
          <input className={inp} value={fields.grade_level} onChange={e => set("grade_level", e.target.value)} placeholder="10" /></div>
        <div><label className="text-label-sm font-medium text-sc-navy">Term</label>
          <select className={sel} value={fields.term} onChange={e => set("term", e.target.value)}>
            <option value="">— Not set —</option>
            {Object.entries(TERM_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div><label className="text-label-sm font-medium text-sc-navy">Course Name</label>
          <input className={inp} value={fields.course_name} onChange={e => set("course_name", e.target.value)} /></div>
        <div><label className="text-label-sm font-medium text-sc-navy">Course Code</label>
          <input className={inp} value={fields.course_code} onChange={e => set("course_code", e.target.value)} /></div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div><label className="text-label-sm font-medium text-sc-navy">Institution</label>
          <input className={inp} value={fields.institution_name} onChange={e => set("institution_name", e.target.value)} /></div>
        <div><label className="text-label-sm font-medium text-sc-navy">Level</label>
          <select className={sel} value={fields.course_level} onChange={e => set("course_level", e.target.value)}>
            <option value="">— Not set —</option>
            {Object.entries(LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div><label className="text-label-sm font-medium text-sc-navy">Status</label>
          <select className={sel} value={fields.completion_status} onChange={e => set("completion_status", e.target.value)}>
            {Object.entries(COMPLETION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <div><label className="text-label-sm font-medium text-sc-navy">S1</label>
          <input className={inp} value={fields.semester_1_grade} onChange={e => set("semester_1_grade", e.target.value)} placeholder="—" /></div>
        <div><label className="text-label-sm font-medium text-sc-navy">S2</label>
          <input className={inp} value={fields.semester_2_grade} onChange={e => set("semester_2_grade", e.target.value)} placeholder="—" /></div>
        <div><label className="text-label-sm font-medium text-sc-navy">Final</label>
          <input className={inp} value={fields.final_grade} onChange={e => set("final_grade", e.target.value)} placeholder="—" /></div>
        <div><label className="text-label-sm font-medium text-sc-navy">%</label>
          <input className={inp} type="number" value={fields.percentage} onChange={e => set("percentage", e.target.value)} /></div>
      </div>

      {/* HS credit section */}
      <div className="rounded-lg border border-sc-gray-100 p-3 space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={fields.counts_toward_high_school_credit}
            onChange={e => set("counts_toward_high_school_credit", e.target.checked)}
            className="rounded border-sc-gray-300 accent-sc-teal" />
          <span className="text-label-sm font-medium text-sc-navy">Counts toward HS credit</span>
        </label>
        {fields.counts_toward_high_school_credit && (
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-label-sm text-sc-gray">HS Credits Attempted</label>
              <input className={inp} type="number" value={fields.credits_attempted} onChange={e => set("credits_attempted", e.target.value)} placeholder="1.0" /></div>
            <div><label className="text-label-sm text-sc-gray">HS Credits Earned</label>
              <input className={inp} type="number" value={fields.credits_earned} onChange={e => set("credits_earned", e.target.value)} placeholder="0 if failed" /></div>
          </div>
        )}
      </div>

      {/* Source / institution credits */}
      <div className="grid grid-cols-3 gap-2">
        <div><label className="text-label-sm text-sc-gray">Source Credits Attempted</label>
          <input className={inp} type="number" value={fields.source_credits_attempted} onChange={e => set("source_credits_attempted", e.target.value)} /></div>
        <div><label className="text-label-sm text-sc-gray">Source Credits Earned</label>
          <input className={inp} type="number" value={fields.source_credits_earned} onChange={e => set("source_credits_earned", e.target.value)} /></div>
        <div><label className="text-label-sm text-sc-gray">Credit Unit</label>
          <select className={sel} value={fields.source_credit_unit} onChange={e => set("source_credit_unit", e.target.value)}>
            <option value="">— None —</option>
            {Object.entries(CREDIT_UNIT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
      </div>

      <div><label className="text-label-sm text-sc-gray">Notes / Provenance</label>
        <input className={inp} value={fields.source_notes} onChange={e => set("source_notes", e.target.value)} /></div>

      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={busy}
          className="rounded-lg px-3 py-1.5 text-label-sm font-medium bg-sc-navy text-white hover:bg-sc-navy/90 disabled:opacity-50 flex items-center gap-1.5">
          {busy && <Loader2 className="size-3.5 animate-spin" />}Save Changes
        </button>
        <button onClick={onCancel} disabled={busy}
          className="rounded-lg px-3 py-1.5 text-label-sm font-medium text-sc-gray hover:bg-sc-gray-100 border border-sc-gray-200">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Single proposed course row ────────────────────────────────────────────────

function ProposedCourseRow({
  course,
  studentId,
  onRefresh,
}: {
  course: ProposedCourse;
  studentId: string;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const isRejected  = course.verification_status === "rejected";
  const isVerified  = course.verification_status === "verified";
  const needsReview = course.verification_status === "needs_review";

  async function handleApprove() {
    setBusy(true);
    await approveProposedCourse(course.id, studentId);
    onRefresh();
    setBusy(false);
  }

  async function handleReject() {
    setBusy(true);
    await rejectProposedCourse(course.id, studentId);
    onRefresh();
    setBusy(false);
  }

  async function handleViewOriginal() {
    if (!course.source_document_id) return;
    setBusy(true);
    const r = await getDocUrl(course.source_document_id);
    setBusy(false);
    if (r.success && r.data) window.open(r.data, "_blank", "noopener,noreferrer");
  }

  const grade = course.final_grade ?? course.semester_2_grade ?? course.semester_1_grade ?? null;

  return (
    <div className={`border-b border-sc-gray-100 last:border-0 py-3 ${isRejected ? "opacity-40" : ""}`}>
      <div className="flex items-start gap-3">
        {/* Left: course info */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sc-navy text-label-md">{course.course_name}</span>
            {course.course_code && <span className="text-label-sm text-sc-gray font-mono">{course.course_code}</span>}
            {course.course_level && course.course_level !== "standard" && (
              <span className="text-label-sm text-sc-teal-700 bg-sc-cream rounded-full px-2 py-0.5 border border-sc-teal-700/20">
                {LEVEL_LABELS[course.course_level]}
              </span>
            )}
            <StatusBadge status={course.verification_status} />
            <DupBadge level={course.duplicate_level} />
          </div>
          <div className="flex flex-wrap gap-x-3 text-label-sm text-sc-gray">
            {course.institution_name && <span>{course.institution_name}</span>}
            {course.term && <span>{TERM_LABELS[course.term]}</span>}
            {course.completion_status && <span className={course.completion_status === "failed" ? "text-sc-rose" : ""}>{COMPLETION_LABELS[course.completion_status]}</span>}
          </div>

          {/* Grades inline */}
          <div className="flex flex-wrap gap-x-4 text-label-sm mt-1">
            {course.semester_1_grade && <span>S1: <strong className="text-sc-navy">{course.semester_1_grade}</strong></span>}
            {course.semester_2_grade && <span>S2: <strong className="text-sc-navy">{course.semester_2_grade}</strong></span>}
            {course.final_grade && <span>Final: <strong className="text-sc-navy">{course.final_grade}</strong></span>}
            {course.percentage != null && <span>%: <strong className="text-sc-navy">{course.percentage}</strong></span>}
          </div>

          {/* Credit info */}
          <div className="flex flex-wrap gap-x-4 text-label-sm">
            {course.counts_toward_high_school_credit && (
              <span className="text-sc-teal-700">
                HS Credit: {course.credits_earned != null ? `${course.credits_earned}` : "—"} / {course.credits_attempted != null ? `${course.credits_attempted}` : "—"}
              </span>
            )}
            {course.source_credits_earned != null && course.source_credit_unit && (
              <span className="text-sc-gray">
                {course.source_credits_earned} {CREDIT_UNIT_LABELS[course.source_credit_unit] ?? course.source_credit_unit}
              </span>
            )}
          </div>

          {/* Source notes — official provenance from the source document */}
          {course.source_notes && (
            <div className="flex items-start gap-1 text-label-sm text-sc-gold-700">
              <Info className="size-3.5 mt-0.5 shrink-0" />
              <span>{course.source_notes}</span>
            </div>
          )}
          {/* Import notes — AI interpretation/normalization notes (staff review only) */}
          {course.import_notes && (
            <div className="flex items-start gap-1 text-label-sm text-sc-gray">
              <Info className="size-3.5 mt-0.5 shrink-0 opacity-60" />
              <span className="opacity-75"><span className="font-medium">AI note:</span> {course.import_notes}</span>
            </div>
          )}

          {/* Inline edit form */}
          {editing && (
            <CourseEditForm
              course={course}
              studentId={studentId}
              onSave={() => { setEditing(false); onRefresh(); }}
              onCancel={() => setEditing(false)}
            />
          )}
        </div>

        {/* Right: action buttons */}
        <div className="shrink-0 flex items-center gap-1">
          {busy && <Loader2 className="size-4 animate-spin text-sc-gray" />}
          {!busy && (
            <>
              {!editing && !isRejected && (
                <button onClick={() => setEditing(true)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-gray-100 hover:text-sc-navy"
                  title="Edit">
                  <Pencil className="size-3.5" />
                </button>
              )}
              {course.source_document_id && !editing && (
                <button onClick={handleViewOriginal}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-gray-100 hover:text-sc-navy"
                  title="View Original">
                  <ExternalLink className="size-3.5" />
                </button>
              )}
              {needsReview && !editing && (
                <>
                  <button onClick={handleApprove}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-sc-teal-700 hover:bg-sc-cream"
                    title="Approve">
                    <Check className="size-3.5" />
                  </button>
                  <button onClick={handleReject}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-sc-rose hover:bg-sc-rose-50"
                    title="Reject">
                    <X className="size-3.5" />
                  </button>
                </>
              )}
              {isVerified && !editing && (
                <CheckCircle2 className="size-4 text-sc-teal-700" />
              )}
              {isRejected && !editing && (
                <XCircle className="size-4 text-sc-rose" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Year+Institution group ────────────────────────────────────────────────────

function CourseGroup({
  label,
  courses,
  studentId,
  onRefresh,
}: {
  label: string;
  courses: ProposedCourse[];
  studentId: string;
  onRefresh: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-sc-gray-50/50"
        onClick={() => setCollapsed(v => !v)}>
        <p className="font-serif text-sc-navy font-semibold">{label}</p>
        <div className="flex items-center gap-2 text-label-sm text-sc-gray">
          <span>{courses.length} course{courses.length !== 1 ? "s" : ""}</span>
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </div>
      </button>
      {!collapsed && (
        <div className="px-5 divide-y divide-sc-gray-100">
          {courses.map(c => (
            <ProposedCourseRow key={c.id} course={c} studentId={studentId} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main review screen ────────────────────────────────────────────────────────

interface Props {
  importId: string;
  studentId: string;
  onClose?: () => void;
}

export function ImportReviewScreen({ importId, studentId, onClose }: Props) {
  const [data, setData] = useState<ImportJobWithCourses | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getImportJob(importId, studentId);
    if (result.success) {
      setData(result.data);
    } else {
      setError(result.error ?? "Failed to load import.");
    }
    setLoading(false);
  }, [importId, studentId]);

  useEffect(() => { load(); }, [load]);

  async function handleMarkReviewed() {
    setMarkingReviewed(true);
    await markImportReviewed(importId, studentId);
    await load();
    setMarkingReviewed(false);
  }

  async function handleRetry() {
    setRetrying(true);
    const result = await retryImport(importId, studentId);
    if (result.success) {
      await load();
    } else {
      setError(result.error ?? "Retry failed.");
    }
    setRetrying(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-sc-gray mr-2" />
        <span className="text-sc-gray">Loading import…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose-700">
        {error || "Import not found."}
      </div>
    );
  }

  const { job, courses } = data;

  // Group courses by school year + institution
  const groups: Record<string, ProposedCourse[]> = {};
  for (const c of courses) {
    const key = [c.school_year, c.institution_name].filter(Boolean).join(" · ") || c.school_year;
    (groups[key] = groups[key] ?? []).push(c);
  }
  const sortedGroups = Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));

  const verifiedCount    = courses.filter(c => c.verification_status === "verified").length;
  const rejectedCount    = courses.filter(c => c.verification_status === "rejected").length;
  const needsReviewCount = courses.filter(c => c.verification_status === "needs_review").length;
  const conflictCount    = courses.filter(c => c.duplicate_level === "conflict").length;
  const dupCount         = courses.filter(c => c.duplicate_level === "strong" || c.duplicate_level === "possible").length;

  const canMarkReviewed = needsReviewCount === 0 && job.status !== "reviewed";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-serif text-heading-2 text-sc-navy">Review Imported Academic Record</h3>
            <p className="text-label-sm text-sc-gray mt-0.5">
              Review each extracted course before adding to the official Academic Achievement Record.
            </p>
          </div>
          {onClose && (
            <button onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-label-sm font-medium text-sc-gray hover:bg-sc-gray-100 border border-sc-gray-200 shrink-0">
              ← Back
            </button>
          )}
        </div>

        {/* Import metadata */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50/50 p-3">
            <p className="text-label-sm text-sc-gray">Status</p>
            <div className="flex items-center gap-1 mt-1">
              {job.status === "completed" && <CheckCircle2 className="size-4 text-sc-teal-700" />}
              {job.status === "reviewed"  && <CheckCircle2 className="size-4 text-sc-navy" />}
              {job.status === "failed"    && <XCircle      className="size-4 text-sc-rose" />}
              {job.status === "processing"&& <Loader2      className="size-4 text-sc-gold-700 animate-spin" />}
              <span className="text-label-md font-medium text-sc-navy capitalize">{job.status}</span>
            </div>
          </div>
          <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50/50 p-3">
            <p className="text-label-sm text-sc-gray">Courses Found</p>
            <p className="text-label-md font-semibold text-sc-navy mt-1">{job.course_count ?? 0}</p>
          </div>
          <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50/50 p-3">
            <p className="text-label-sm text-sc-gray">Verified</p>
            <p className="text-label-md font-semibold text-sc-teal-700 mt-1">{verifiedCount}</p>
          </div>
          <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50/50 p-3">
            <p className="text-label-sm text-sc-gray">Needs Review</p>
            <p className={`text-label-md font-semibold mt-1 ${needsReviewCount > 0 ? "text-sc-gold-700" : "text-sc-gray"}`}>
              {needsReviewCount}
            </p>
          </div>
        </div>

        {/* Warning summary */}
        {(conflictCount > 0 || dupCount > 0) && (
          <div className="rounded-xl border border-sc-gold-300 bg-sc-gold-50 px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="size-5 text-sc-gold-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              {conflictCount > 0 && (
                <p className="text-label-sm font-semibold text-sc-gold-800">
                  {conflictCount} course{conflictCount !== 1 ? "s" : ""} conflict with verified records — review carefully before approving.
                </p>
              )}
              {dupCount > 0 && (
                <p className="text-label-sm text-sc-gold-700">
                  {dupCount} possible duplicate{dupCount !== 1 ? "s" : ""} detected.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Failed state */}
        {job.status === "failed" && job.error_message && (
          <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 px-4 py-3">
            <p className="text-label-sm font-semibold text-sc-rose-700">Extraction Failed</p>
            <p className="text-label-sm text-sc-rose-700 mt-0.5">{job.error_message}</p>
            <button onClick={handleRetry} disabled={retrying}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-label-sm font-medium bg-sc-navy text-white hover:bg-sc-navy/90 disabled:opacity-50">
              {retrying ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
              Retry Analysis
            </button>
          </div>
        )}

        {/* Model info */}
        {job.model && (
          <p className="text-label-sm text-sc-gray-400">
            Analyzed by {job.provider}/{job.model}
            {job.completed_at && ` · ${new Date(job.completed_at).toLocaleDateString()}`}
          </p>
        )}
      </div>

      {/* Course groups */}
      {sortedGroups.length > 0 && (
        <div className="space-y-3">
          {sortedGroups.map(([label, groupCourses]) => (
            <CourseGroup
              key={label}
              label={label}
              courses={groupCourses}
              studentId={studentId}
              onRefresh={load}
            />
          ))}
        </div>
      )}

      {/* No courses */}
      {courses.length === 0 && job.status === "completed" && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-8 text-center">
          <FileText className="size-8 mx-auto mb-2 text-sc-gray-300" />
          <p className="font-serif text-sc-navy">No courses extracted</p>
          <p className="text-label-sm text-sc-gray mt-1">
            The AI did not find any course records in this document. Check that it is an academic transcript, report card, or similar record.
          </p>
        </div>
      )}

      {/* Mark reviewed */}
      {canMarkReviewed && courses.length > 0 && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sc-navy text-label-md">
              {verifiedCount} of {courses.length} course{courses.length !== 1 ? "s" : ""} verified, {rejectedCount} rejected.
            </p>
            <p className="text-label-sm text-sc-gray">
              Mark this import as reviewed to close it out.
            </p>
          </div>
          <button
            onClick={handleMarkReviewed}
            disabled={markingReviewed}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-label-md font-medium bg-sc-navy text-white hover:bg-sc-navy/90 disabled:opacity-50">
            {markingReviewed ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Mark Reviewed
          </button>
        </div>
      )}

      {job.status === "reviewed" && (
        <div className="rounded-xl border border-sc-teal-700/20 bg-sc-cream px-4 py-3 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-sc-teal-700 shrink-0" />
          <p className="text-label-sm text-sc-teal-700">
            Import reviewed{job.reviewed_at ? ` on ${new Date(job.reviewed_at).toLocaleDateString()}` : ""}.
            Verified courses are part of the Academic Achievement Record.
          </p>
        </div>
      )}
    </div>
  );
}
