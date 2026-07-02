"use client";

import { useEffect, useState, useTransition } from "react";
import {
  BookOpen, Plus, Pencil, RefreshCw, Archive, ChevronDown, ChevronUp,
  Users, Clock, AlertCircle, CheckCircle, PauseCircle, Circle,
  ClipboardList, Loader2, CalendarDays, History, Stethoscope,
} from "lucide-react";
import {
  getCurriculumEnrollments, getCurriculumHistory,
  createCurriculumRecord, updateCurriculumRecord,
  changeCurriculum, archiveCurriculumRecord,
  getInterventionSessions, logInterventionSession, updateInterventionSession,
  type CurriculumEnrollment, type CurriculumPayload, type CurriculumStatus,
  type InterventionSession, type InterventionSessionPayload,
  type OOORequestedBy, type OOOPriority, type InterventionStatus,
} from "@/app/actions/academics";
import { SUBJECTS, SUBJECT_LABELS } from "@/lib/academics-constants";
import { cn } from "@/lib/utils";

interface Props { studentId: string; isAdmin?: boolean; }

// ── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<CurriculumStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  not_started:        { label: "Not Started",        cls: "bg-sc-gray-100 text-sc-gray-600 border-sc-gray-200",       Icon: Circle        },
  active:             { label: "Active",             cls: "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",        Icon: CheckCircle   },
  paused:             { label: "Paused",             cls: "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",        Icon: PauseCircle   },
  completed:          { label: "Completed",          cls: "bg-sc-navy/10 text-sc-navy border-sc-navy/20",             Icon: CheckCircle   },
  changed_curriculum: { label: "Changed",            cls: "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200",        Icon: RefreshCw     },
  dropped:            { label: "Dropped",            cls: "bg-sc-gray-100 text-sc-gray border-sc-gray-200",           Icon: Archive       },
};

const OO1_INTERVENTION_CFG: Record<InterventionStatus, { label: string; dot: string }> = {
  monitoring:    { label: "Monitoring",    dot: "bg-sc-gold" },
  active:        { label: "Active 1:1",   dot: "bg-sc-rose" },
  completed:     { label: "Completed",    dot: "bg-sc-teal" },
  discontinued:  { label: "Discontinued", dot: "bg-sc-gray" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const BLANK_PAYLOAD: CurriculumPayload = {
  subject:                   "math",
  curriculum_name:           "",
  publisher:                 null,
  current_level:             null,
  current_unit:              null,
  current_lesson:            null,
  teacher_id:                null,
  teacher_name:              null,
  start_date:                null,
  expected_completion:       null,
  completion_pct:            0,
  status:                    "active",
  visibility:                "parent_visible",
  notes:                     null,
  linked_goal_id:            null,
  one_on_one_needed:         false,
  one_on_one_requested_by:   null,
  one_on_one_reason:         null,
  one_on_one_priority:       "medium",
  one_on_one_date_identified:null,
  intervention_status:       null,
};

const BLANK_SESSION: InterventionSessionPayload = {
  curriculum_enrollment_id: "",
  session_date:             new Date().toISOString().split("T")[0],
  subject:                  "",
  staff_id:                 null,
  duration_minutes:         null,
  focus_skill:              null,
  lesson_unit_covered:      null,
  teaching_strategy:        null,
  student_response:         null,
  progress_observed:        null,
  next_steps:               null,
  parent_followup_needed:   false,
};

// ── Curriculum Form ───────────────────────────────────────────────────────────

function CurriculumForm({
  payload, onChange, onSave, onCancel, saving, label,
}: {
  payload: CurriculumPayload;
  onChange: (p: Partial<CurriculumPayload>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Subject */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Subject *</label>
          <select value={payload.subject}
            onChange={(e) => onChange({ subject: e.target.value as typeof SUBJECTS[number] })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
            {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABELS[s]}</option>)}
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Status</label>
          <select value={payload.status}
            onChange={(e) => onChange({ status: e.target.value as CurriculumStatus })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="not_started">Not Started</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Curriculum name */}
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Curriculum Name *</label>
          <input value={payload.curriculum_name}
            onChange={(e) => onChange({ curriculum_name: e.target.value })}
            placeholder="e.g. Saxon Math, Lexia Core5, Mystery of History"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Publisher */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Publisher</label>
          <input value={payload.publisher ?? ""}
            onChange={(e) => onChange({ publisher: e.target.value || null })}
            placeholder="e.g. Saxon Publishers"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Level/Book */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Level / Book</label>
          <input value={payload.current_level ?? ""}
            onChange={(e) => onChange({ current_level: e.target.value || null })}
            placeholder="e.g. Level 5/4, Book 3, Grade 2"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Unit */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Unit</label>
          <input value={payload.current_unit ?? ""}
            onChange={(e) => onChange({ current_unit: e.target.value || null })}
            placeholder="e.g. Unit 3, Chapter 4"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Lesson */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Lesson</label>
          <input value={payload.current_lesson ?? ""}
            onChange={(e) => onChange({ current_lesson: e.target.value || null })}
            placeholder="e.g. Lesson 38, Section 2.4"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Start date */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Start Date</label>
          <input type="date" value={payload.start_date ?? ""}
            onChange={(e) => onChange({ start_date: e.target.value || null })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Expected completion */}
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Expected Completion</label>
          <input type="date" value={payload.expected_completion ?? ""}
            onChange={(e) => onChange({ expected_completion: e.target.value || null })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Completion % */}
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">
            Completion ({payload.completion_pct}%)
          </label>
          <input type="range" min={0} max={100} step={5}
            value={payload.completion_pct}
            onChange={(e) => onChange({ completion_pct: Number(e.target.value) })}
            className="w-full accent-sc-teal" />
        </div>

        {/* Assigned staff */}
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Assigned Teacher / Staff</label>
          <input value={payload.teacher_name ?? ""}
            onChange={(e) => onChange({ teacher_name: e.target.value || null })}
            placeholder="Staff name"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Notes</label>
          <textarea value={payload.notes ?? ""}
            onChange={(e) => onChange({ notes: e.target.value || null })}
            placeholder="Additional notes or context"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>
      </div>

      {/* ── 1:1 Support Section ── */}
      <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="size-4 text-sc-rose" />
          <p className="font-semibold text-label-md text-sc-navy">1:1 Academic Support</p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={payload.one_on_one_needed}
            onChange={(e) => onChange({ one_on_one_needed: e.target.checked })}
            className="rounded accent-sc-rose" />
          <span className="text-label-sm text-sc-navy font-semibold">1:1 Support Needed</span>
        </label>

        {payload.one_on_one_needed && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-label-sm font-semibold text-sc-navy block mb-1">Requested By</label>
              <select value={payload.one_on_one_requested_by ?? ""}
                onChange={(e) => onChange({ one_on_one_requested_by: (e.target.value || null) as OOORequestedBy | null })}
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-rose">
                <option value="">— Select —</option>
                <option value="parent">Parent</option>
                <option value="teacher">Teacher</option>
                <option value="assessment">Assessment</option>
                <option value="student_success_plan">Student Success Plan</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-label-sm font-semibold text-sc-navy block mb-1">Priority</label>
              <select value={payload.one_on_one_priority}
                onChange={(e) => onChange({ one_on_one_priority: e.target.value as OOOPriority })}
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-rose">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="text-label-sm font-semibold text-sc-navy block mb-1">Intervention Status</label>
              <select value={payload.intervention_status ?? ""}
                onChange={(e) => onChange({ intervention_status: (e.target.value || null) as InterventionStatus | null })}
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-rose">
                <option value="">— Select —</option>
                <option value="monitoring">Monitoring</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="discontinued">Discontinued</option>
              </select>
            </div>
            <div>
              <label className="text-label-sm font-semibold text-sc-navy block mb-1">Date Identified</label>
              <input type="date" value={payload.one_on_one_date_identified ?? ""}
                onChange={(e) => onChange({ one_on_one_date_identified: e.target.value || null })}
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-rose" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-label-sm font-semibold text-sc-navy block mb-1">Reason for 1:1 Support</label>
              <textarea value={payload.one_on_one_reason ?? ""}
                onChange={(e) => onChange({ one_on_one_reason: e.target.value || null })}
                placeholder="Describe why 1:1 support is needed"
                rows={2}
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-rose resize-none" />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel}
          className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50">
          Cancel
        </button>
        <button onClick={onSave} disabled={saving || !payload.curriculum_name.trim()}
          className="rounded-lg bg-sc-teal px-4 py-2 text-label-sm text-white hover:bg-sc-teal-700 disabled:opacity-60">
          {saving ? "Saving…" : label}
        </button>
      </div>
    </div>
  );
}

// ── Session Form ──────────────────────────────────────────────────────────────

function SessionForm({
  payload, onChange, onSave, onCancel, saving, label,
}: {
  payload: InterventionSessionPayload;
  onChange: (p: Partial<InterventionSessionPayload>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  label: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Session Date *</label>
          <input type="date" value={payload.session_date}
            onChange={(e) => onChange({ session_date: e.target.value })}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Duration (minutes)</label>
          <input type="number" min={5} max={240} value={payload.duration_minutes ?? ""}
            onChange={(e) => onChange({ duration_minutes: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 30"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Focus Skill</label>
          <input value={payload.focus_skill ?? ""}
            onChange={(e) => onChange({ focus_skill: e.target.value || null })}
            placeholder="e.g. Regrouping subtraction"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Lesson / Unit Covered</label>
          <input value={payload.lesson_unit_covered ?? ""}
            onChange={(e) => onChange({ lesson_unit_covered: e.target.value || null })}
            placeholder="e.g. Lesson 38, Chapter 3"
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Teaching Strategy Used</label>
          <textarea value={payload.teaching_strategy ?? ""}
            onChange={(e) => onChange({ teaching_strategy: e.target.value || null })}
            placeholder="e.g. Multisensory approach, direct instruction, manipulatives"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Student Response</label>
          <textarea value={payload.student_response ?? ""}
            onChange={(e) => onChange({ student_response: e.target.value || null })}
            placeholder="How did the student respond to the instruction?"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Progress Observed</label>
          <textarea value={payload.progress_observed ?? ""}
            onChange={(e) => onChange({ progress_observed: e.target.value || null })}
            placeholder="What progress or growth was observed?"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-label-sm font-semibold text-sc-navy block mb-1">Next Steps</label>
          <textarea value={payload.next_steps ?? ""}
            onChange={(e) => onChange({ next_steps: e.target.value || null })}
            placeholder="What should the next session focus on?"
            rows={2}
            className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal resize-none" />
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={payload.parent_followup_needed}
              onChange={(e) => onChange({ parent_followup_needed: e.target.checked })}
              className="rounded accent-sc-teal" />
            <span className="text-label-sm text-sc-navy font-semibold">Parent follow-up needed</span>
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel}
          className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50">
          Cancel
        </button>
        <button onClick={onSave} disabled={saving || !payload.session_date}
          className="rounded-lg bg-sc-rose px-4 py-2 text-label-sm text-white hover:bg-sc-rose-700 disabled:opacity-60">
          {saving ? "Saving…" : label}
        </button>
      </div>
    </div>
  );
}

// ── Intervention History Panel ─────────────────────────────────────────────────

function InterventionPanel({ enrollment, studentId, isAdmin }: {
  enrollment: CurriculumEnrollment; studentId: string; isAdmin: boolean;
}) {
  const [sessions, setSessions]     = useState<InterventionSession[] | null>(null);
  const [addingSession, setAdding]  = useState(false);
  const [sessionDraft, setDraft]    = useState<InterventionSessionPayload>({
    ...BLANK_SESSION,
    curriculum_enrollment_id: enrollment.id,
    subject: enrollment.subject,
  });
  const [error, setError]           = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getInterventionSessions(enrollment.id).then(setSessions);
  }, [enrollment.id]);

  function handleAdd() {
    startTransition(async () => {
      const r = await logInterventionSession(studentId, sessionDraft);
      if (!r.success) { setError(r.error); return; }
      const fresh = await getInterventionSessions(enrollment.id);
      setSessions(fresh);
      setDraft({ ...BLANK_SESSION, curriculum_enrollment_id: enrollment.id, subject: enrollment.subject });
      setAdding(false);
      setError(null);
    });
  }

  if (sessions === null) {
    return <p className="text-label-sm text-sc-gray animate-pulse">Loading sessions…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-label-md text-sc-navy">
          Intervention Sessions ({sessions.length})
        </p>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1 rounded-lg bg-sc-rose px-3 py-1.5 text-label-sm text-white hover:bg-sc-rose-700 transition-colors">
          <Plus className="size-3.5" /> Log Session
        </button>
      </div>

      {error && (
        <p className="text-label-sm text-sc-rose-700 bg-sc-rose-50 border border-sc-rose-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {addingSession && (
        <div className="rounded-xl border border-sc-rose-200 bg-white p-4">
          <SessionForm
            payload={sessionDraft}
            onChange={(p) => setDraft((d) => ({ ...d, ...p }))}
            onSave={handleAdd}
            onCancel={() => setAdding(false)}
            saving={isPending}
            label="Log Session"
          />
        </div>
      )}

      {sessions.length === 0 && !addingSession && (
        <p className="text-label-sm text-sc-gray italic">No sessions logged yet.</p>
      )}

      <div className="space-y-3">
        {sessions.map((s) => (
          <div key={s.id} className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-label-sm text-sc-navy">{fmtDate(s.session_date)}</p>
              <div className="flex gap-2 text-label-sm text-sc-gray">
                {s.duration_minutes && <span className="flex items-center gap-1"><Clock className="size-3" />{s.duration_minutes} min</span>}
                {s.parent_followup_needed && <span className="text-sc-gold-700 font-medium">Parent follow-up</span>}
              </div>
            </div>
            {s.focus_skill && <p className="text-label-sm text-sc-navy"><span className="font-medium">Focus:</span> {s.focus_skill}</p>}
            {s.lesson_unit_covered && <p className="text-label-sm text-sc-gray">Covered: {s.lesson_unit_covered}</p>}
            {s.teaching_strategy && <p className="text-label-sm text-sc-gray"><span className="font-medium">Strategy:</span> {s.teaching_strategy}</p>}
            {s.student_response && <p className="text-body-md text-sc-navy">{s.student_response}</p>}
            {s.progress_observed && (
              <p className="text-label-sm text-sc-teal-700 bg-sc-teal-50 rounded-lg px-2 py-1">
                <span className="font-medium">Progress:</span> {s.progress_observed}
              </p>
            )}
            {s.next_steps && <p className="text-label-sm text-sc-gray italic">Next: {s.next_steps}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Curriculum Card ───────────────────────────────────────────────────────────

function CurriculumCard({
  enrollment, studentId, isAdmin, onUpdated, onChanged, onArchived,
}: {
  enrollment:  CurriculumEnrollment;
  studentId:   string;
  isAdmin:     boolean;
  onUpdated:   (e: CurriculumEnrollment) => void;
  onChanged:   (oldId: string, newEnrollment: CurriculumEnrollment) => void;
  onArchived:  (id: string) => void;
}) {
  const [expanded, setExpanded]      = useState(false);
  const [mode, setMode]              = useState<"view" | "edit" | "change" | "intervention">("view");
  const [editDraft, setEditDraft]    = useState<CurriculumPayload>(BLANK_PAYLOAD);
  const [changeDraft, setChangeDraft]= useState<CurriculumPayload>(BLANK_PAYLOAD);
  const [error, setError]            = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { cls: statusCls, label: statusLabel, Icon: StatusIcon } = STATUS_CFG[enrollment.status];
  const subjectLabel = SUBJECT_LABELS[enrollment.subject] ?? enrollment.subject;

  function startEdit() {
    setEditDraft({
      subject:                    enrollment.subject,
      curriculum_name:            enrollment.curriculum_name,
      publisher:                  enrollment.publisher,
      current_level:              enrollment.current_level,
      current_unit:               enrollment.current_unit,
      current_lesson:             enrollment.current_lesson,
      teacher_id:                 enrollment.teacher_id,
      teacher_name:               enrollment.teacher_name,
      start_date:                 enrollment.start_date,
      expected_completion:        enrollment.expected_completion,
      completion_pct:             enrollment.completion_pct,
      status:                     enrollment.status,
      visibility:                 enrollment.visibility,
      notes:                      enrollment.notes,
      linked_goal_id:             enrollment.linked_goal_id,
      one_on_one_needed:          enrollment.one_on_one_needed,
      one_on_one_requested_by:    enrollment.one_on_one_requested_by,
      one_on_one_reason:          enrollment.one_on_one_reason,
      one_on_one_priority:        enrollment.one_on_one_priority,
      one_on_one_date_identified: enrollment.one_on_one_date_identified,
      intervention_status:        enrollment.intervention_status,
    });
    setMode("edit");
    setExpanded(true);
    setError(null);
  }

  function startChange() {
    setChangeDraft({
      ...BLANK_PAYLOAD,
      subject: enrollment.subject,
    });
    setMode("change");
    setExpanded(true);
    setError(null);
  }

  function saveEdit() {
    startTransition(async () => {
      const r = await updateCurriculumRecord(enrollment.id, studentId, editDraft);
      if (!r.success) { setError(r.error); return; }
      onUpdated({ ...enrollment, ...editDraft, updated_at: new Date().toISOString() });
      setMode("view");
    });
  }

  function saveChange() {
    startTransition(async () => {
      const r = await changeCurriculum(enrollment.id, studentId, changeDraft);
      if (!r.success) { setError(r.error); return; }
      const now = new Date().toISOString();
      onChanged(enrollment.id, {
        ...changeDraft,
        id: r.newId,
        student_id:   studentId,
        archived_at:  null,
        created_at:   now,
        updated_at:   now,
      });
      setMode("view");
    });
  }

  function doArchive() {
    if (!confirm(`Archive this ${subjectLabel} record? It will be moved to history.`)) return;
    startTransition(async () => {
      await archiveCurriculumRecord(enrollment.id, studentId);
      onArchived(enrollment.id);
    });
  }

  const hasOo1 = enrollment.one_on_one_needed && enrollment.intervention_status;
  const oo1cfg = hasOo1 ? OO1_INTERVENTION_CFG[enrollment.intervention_status!] : null;

  return (
    <div className={cn("rounded-2xl border bg-white overflow-hidden shadow-card",
      enrollment.one_on_one_needed && enrollment.intervention_status === "active"
        ? "border-sc-rose-300" : "border-sc-gray-100"
    )}>
      {/* Card header */}
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif text-heading-3 text-sc-navy">{subjectLabel}</span>
            <span className={cn("rounded-full border px-2.5 py-0.5 text-label-sm font-medium flex items-center gap-1", statusCls)}>
              <StatusIcon className="size-3" />
              {statusLabel}
            </span>
            {hasOo1 && oo1cfg && (
              <span className="flex items-center gap-1.5 rounded-full bg-sc-rose-50 border border-sc-rose-200 px-2.5 py-0.5 text-label-sm text-sc-rose-700 font-medium">
                <span className={cn("size-1.5 rounded-full", oo1cfg.dot)} />
                {oo1cfg.label}
              </span>
            )}
          </div>
          <p className="text-body-md text-sc-navy mt-0.5">
            <span className="font-medium">{enrollment.curriculum_name}</span>
            {enrollment.current_level && <span className="text-sc-gray"> · {enrollment.current_level}</span>}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-label-sm text-sc-gray">
            {enrollment.current_unit  && <span>Unit: {enrollment.current_unit}</span>}
            {enrollment.current_lesson && <span>Lesson: {enrollment.current_lesson}</span>}
            {enrollment.teacher_name   && <span className="flex items-center gap-1"><Users className="size-3" />{enrollment.teacher_name}</span>}
          </div>

          {/* Completion bar */}
          {enrollment.completion_pct > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-sc-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-sc-teal transition-all"
                  style={{ width: `${enrollment.completion_pct}%` }} />
              </div>
              <span className="text-label-sm text-sc-gray shrink-0">{enrollment.completion_pct}%</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 shrink-0">
          <button onClick={startEdit}
            className="rounded-lg border border-sc-gray-200 p-1.5 text-sc-gray hover:bg-sc-teal-50 hover:text-sc-teal transition-colors"
            title="Edit">
            <Pencil className="size-3.5" />
          </button>
          <button onClick={startChange}
            className="rounded-lg border border-sc-gray-200 p-1.5 text-sc-gray hover:bg-sc-gold-50 hover:text-sc-gold-700 transition-colors"
            title="Change curriculum">
            <RefreshCw className="size-3.5" />
          </button>
          {isAdmin && (
            <button onClick={doArchive} disabled={isPending}
              className="rounded-lg border border-sc-gray-200 p-1.5 text-sc-gray hover:bg-sc-rose-50 hover:text-sc-rose transition-colors"
              title="Archive">
              <Archive className="size-3.5" />
            </button>
          )}
          {enrollment.one_on_one_needed && (
            <button onClick={() => { setMode(mode === "intervention" ? "view" : "intervention"); setExpanded(true); }}
              className={cn("rounded-lg border p-1.5 transition-colors",
                mode === "intervention"
                  ? "border-sc-rose bg-sc-rose-50 text-sc-rose"
                  : "border-sc-gray-200 text-sc-gray hover:bg-sc-rose-50 hover:text-sc-rose"
              )}
              title="Intervention sessions">
              <Stethoscope className="size-3.5" />
            </button>
          )}
          <button onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-sc-gray-200 p-1.5 text-sc-gray hover:bg-sc-gray-50">
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-sc-gray-100 px-5 py-4 bg-sc-gray-50/50 space-y-4">
          {error && (
            <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{error}</p>
          )}

          {/* Edit mode */}
          {mode === "edit" && (
            <>
              <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">Edit Curriculum</p>
              <CurriculumForm
                payload={editDraft}
                onChange={(p) => setEditDraft((d) => ({ ...d, ...p }))}
                onSave={saveEdit}
                onCancel={() => setMode("view")}
                saving={isPending}
                label="Save Changes"
              />
            </>
          )}

          {/* Change mode */}
          {mode === "change" && (
            <>
              <div className="rounded-lg bg-sc-gold-50 border border-sc-gold-200 px-3 py-2 text-label-sm text-sc-gold-700">
                <span className="font-semibold">Changing Curriculum:</span> The current record will be archived as "Changed Curriculum" and a new record will be created. History is preserved.
              </div>
              <CurriculumForm
                payload={changeDraft}
                onChange={(p) => setChangeDraft((d) => ({ ...d, ...p }))}
                onSave={saveChange}
                onCancel={() => setMode("view")}
                saving={isPending}
                label="Switch Curriculum"
              />
            </>
          )}

          {/* View mode details */}
          {mode === "view" && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-label-sm">
              {enrollment.publisher && (
                <div>
                  <p className="text-sc-gray">Publisher</p>
                  <p className="text-sc-navy font-medium">{enrollment.publisher}</p>
                </div>
              )}
              {enrollment.start_date && (
                <div>
                  <p className="text-sc-gray">Started</p>
                  <p className="text-sc-navy font-medium">{fmtDate(enrollment.start_date)}</p>
                </div>
              )}
              {enrollment.expected_completion && (
                <div>
                  <p className="text-sc-gray">Expected Completion</p>
                  <p className="text-sc-navy font-medium">{fmtDate(enrollment.expected_completion)}</p>
                </div>
              )}
              {enrollment.notes && (
                <div className="col-span-full">
                  <p className="text-sc-gray">Notes</p>
                  <p className="text-sc-navy">{enrollment.notes}</p>
                </div>
              )}
              {enrollment.one_on_one_needed && (
                <div className="col-span-full rounded-lg bg-sc-rose-50 border border-sc-rose-200 p-3 space-y-1">
                  <p className="font-semibold text-sc-rose-700 flex items-center gap-1.5">
                    <Stethoscope className="size-3.5" /> 1:1 Support
                  </p>
                  {enrollment.one_on_one_requested_by && (
                    <p className="text-sc-rose-700">Requested by: {enrollment.one_on_one_requested_by.replace("_", " ")}</p>
                  )}
                  {enrollment.one_on_one_reason && <p className="text-sc-rose-700">{enrollment.one_on_one_reason}</p>}
                  {enrollment.one_on_one_date_identified && (
                    <p className="text-sc-gray">Identified: {fmtDate(enrollment.one_on_one_date_identified)}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Intervention sessions panel */}
          {mode === "intervention" && (
            <InterventionPanel enrollment={enrollment} studentId={studentId} isAdmin={isAdmin} />
          )}
        </div>
      )}
    </div>
  );
}

// ── History Section ───────────────────────────────────────────────────────────

function HistorySection({ studentId }: { studentId: string }) {
  const [records, setRecords]     = useState<CurriculumEnrollment[] | null>(null);
  const [open, setOpen]           = useState(false);

  function load() {
    setOpen(true);
    if (!records) getCurriculumHistory(studentId).then(setRecords).catch(() => setRecords([]));
  }

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <button onClick={open ? () => setOpen(false) : load}
        className="w-full flex items-center gap-2 px-5 py-4 text-left hover:bg-sc-gray-50 transition-colors">
        <History className="size-4 text-sc-gray" />
        <span className="font-serif text-heading-3 text-sc-navy">Curriculum History</span>
        <span className="text-label-sm text-sc-gray">(archived / changed)</span>
        {open ? <ChevronUp className="size-4 text-sc-gray ml-auto" /> : <ChevronDown className="size-4 text-sc-gray ml-auto" />}
      </button>
      {open && (
        <div className="border-t border-sc-gray-100 p-5 space-y-3">
          {records === null && <p className="text-label-sm text-sc-gray animate-pulse">Loading…</p>}
          {records?.length === 0 && <p className="text-label-sm text-sc-gray italic">No archived records yet.</p>}
          {records?.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-xl border border-sc-gray-100 bg-sc-gray-50 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-label-sm font-medium text-sc-navy">
                  {SUBJECT_LABELS[r.subject]} — {r.curriculum_name}
                </p>
                {r.current_level && <p className="text-label-sm text-sc-gray">{r.current_level}</p>}
              </div>
              <div className="text-right text-label-sm text-sc-gray shrink-0">
                <p>{STATUS_CFG[r.status]?.label ?? r.status}</p>
                {r.archived_at && <p>Archived {fmtDate(r.archived_at)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

type StatusFilter = "all" | CurriculumStatus;
type InterventionFilter = "all" | "needed" | "active" | "monitoring";

export function AcademicsTab({ studentId, isAdmin = false }: Props) {
  const [enrollments, setEnrollments]     = useState<CurriculumEnrollment[] | null>(null);
  const [addingNew, setAddingNew]         = useState(false);
  const [newDraft, setNewDraft]           = useState<CurriculumPayload>(BLANK_PAYLOAD);
  const [error, setError]                 = useState<string | null>(null);
  const [fetchFailed, setFetchFailed]     = useState(false);
  const [isPending, startTransition]      = useTransition();
  const [search, setSearch]               = useState("");
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>("all");
  const [interventionFilter, setInterventionFilter] = useState<InterventionFilter>("all");

  useEffect(() => {
    setFetchFailed(false);
    getCurriculumEnrollments(studentId)
      .then(setEnrollments)
      .catch(() => { setEnrollments([]); setFetchFailed(true); });
  }, [studentId]);

  function handleAdd() {
    startTransition(async () => {
      const r = await createCurriculumRecord(studentId, newDraft);
      if (!r.success) { setError(r.error); return; }
      const fresh = await getCurriculumEnrollments(studentId);
      setEnrollments(fresh);
      setNewDraft(BLANK_PAYLOAD);
      setAddingNew(false);
      setError(null);
    });
  }

  function handleUpdated(updated: CurriculumEnrollment) {
    setEnrollments((arr) => arr?.map((e) => e.id === updated.id ? updated : e) ?? null);
  }

  function handleChanged(oldId: string, newEnrollment: CurriculumEnrollment) {
    setEnrollments((arr) => arr
      ? [newEnrollment, ...arr.filter((e) => e.id !== oldId)]
      : [newEnrollment]
    );
  }

  function handleArchived(id: string) {
    setEnrollments((arr) => arr?.filter((e) => e.id !== id) ?? null);
  }

  if (enrollments === null) {
    return (
      <div className="flex items-center justify-center py-16 text-sc-gray">
        <Loader2 className="size-5 animate-spin mr-2" /> Loading academics…
      </div>
    );
  }

  // ── Filter logic ─────────────────────────────────────────────────────────────
  const q = search.toLowerCase().trim();
  const filtered = enrollments
    .filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (interventionFilter === "needed" && !e.one_on_one_needed) return false;
      if (interventionFilter === "active" && e.intervention_status !== "active") return false;
      if (interventionFilter === "monitoring" && e.intervention_status !== "monitoring") return false;
      if (q) {
        const haystack = [
          e.curriculum_name, e.publisher, e.subject,
          SUBJECT_LABELS[e.subject], e.teacher_name, e.status,
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject));

  const activeSubjects = enrollments.filter((e) => e.status === "active");
  const interventionSubjects = enrollments.filter((e) => e.one_on_one_needed && ["active", "monitoring"].includes(e.intervention_status ?? ""));

  return (
    <div className="space-y-5 max-w-4xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-heading-2 text-sc-navy">Academic Plan</h2>
          <p className="text-body-md text-sc-gray mt-0.5">
            {enrollments.length} subject{enrollments.length !== 1 ? "s" : ""} tracked
          </p>
        </div>
        <button onClick={() => setAddingNew(true)}
          className="flex items-center gap-1.5 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white font-medium hover:bg-sc-teal-700 transition-colors">
          <Plus className="size-4" /> Add Curriculum
        </button>
      </div>

      {fetchFailed && (
        <p className="rounded-xl bg-sc-gold-50 border border-sc-gold-200 px-4 py-3 text-label-sm text-sc-gold-700">
          Could not load curriculum data. Please refresh to try again.
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose-700">{error}</p>
      )}

      {/* ── Current Academic Plan Summary ───────────────────────────────────── */}
      {activeSubjects.length > 0 && (
        <div className="rounded-2xl border border-sc-navy/10 bg-sc-navy/[0.03] p-4">
          <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <ClipboardList className="size-3.5" /> Current Academic Plan
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {activeSubjects
              .sort((a, b) => SUBJECTS.indexOf(a.subject) - SUBJECTS.indexOf(b.subject))
              .map((e) => (
                <div key={e.id} className="rounded-xl bg-white border border-sc-gray-100 px-3 py-2">
                  <p className="text-label-sm font-semibold text-sc-navy">{SUBJECT_LABELS[e.subject]}</p>
                  <p className="text-label-sm text-sc-gray truncate">{e.curriculum_name}</p>
                  {e.current_lesson && (
                    <p className="text-label-sm text-sc-teal-700">Lesson {e.current_lesson}</p>
                  )}
                </div>
              ))}
          </div>
          {interventionSubjects.length > 0 && (
            <div className="mt-3 pt-3 border-t border-sc-navy/10">
              <p className="text-label-sm font-semibold text-sc-navy mb-1.5">Academic Supports</p>
              <div className="flex flex-wrap gap-2">
                {interventionSubjects.map((e) => {
                  const cfg = OO1_INTERVENTION_CFG[e.intervention_status!];
                  return (
                    <span key={e.id} className="inline-flex items-center gap-1.5 rounded-full bg-white border border-sc-gray-200 px-2.5 py-1 text-label-sm">
                      <span className={cn("size-2 rounded-full", cfg.dot)} />
                      {SUBJECT_LABELS[e.subject]} — {cfg.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Search & Filter ─────────────────────────────────────────────────── */}
      {enrollments.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search curriculum, publisher, teacher…"
            className="flex-1 rounded-xl border border-sc-gray-200 px-3 py-2 text-body-md focus:outline-none focus:ring-2 focus:ring-sc-teal"
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-xl border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="not_started">Not Started</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
          <select value={interventionFilter} onChange={(e) => setInterventionFilter(e.target.value as InterventionFilter)}
            className="rounded-xl border border-sc-gray-200 px-3 py-2 text-body-md bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="all">All</option>
            <option value="needed">Intervention Needed</option>
            <option value="active">Active 1:1</option>
            <option value="monitoring">Monitoring</option>
          </select>
        </div>
      )}

      {/* ── Add new form ────────────────────────────────────────────────────── */}
      {addingNew && (
        <div className="rounded-2xl border border-sc-teal-200 bg-white shadow-card p-5">
          <p className="font-serif text-heading-3 text-sc-navy mb-4 flex items-center gap-2">
            <BookOpen className="size-4 text-sc-teal" /> New Curriculum Record
          </p>
          <CurriculumForm
            payload={newDraft}
            onChange={(p) => setNewDraft((d) => ({ ...d, ...p }))}
            onSave={handleAdd}
            onCancel={() => { setAddingNew(false); setError(null); }}
            saving={isPending}
            label="Add Curriculum"
          />
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {enrollments.length === 0 && !addingNew && (
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-10 text-center">
          <BookOpen className="size-10 mx-auto mb-3 text-sc-gray-300" />
          <p className="font-serif text-heading-2 text-sc-navy">No curriculum on file</p>
          <p className="text-body-md text-sc-gray mt-1 mb-4">
            Add the curriculum this student is using for each subject.
          </p>
          <button onClick={() => setAddingNew(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white hover:bg-sc-teal-700 transition-colors">
            <Plus className="size-4" /> Add First Curriculum
          </button>
        </div>
      )}

      {/* ── Filtered empty state ─────────────────────────────────────────────── */}
      {enrollments.length > 0 && filtered.length === 0 && (
        <p className="text-label-sm text-sc-gray italic py-4 text-center">
          No curriculum matches your search or filters.
        </p>
      )}

      {/* ── Curriculum cards ─────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {filtered.map((enrollment) => (
          <CurriculumCard
            key={enrollment.id}
            enrollment={enrollment}
            studentId={studentId}
            isAdmin={isAdmin}
            onUpdated={handleUpdated}
            onChanged={handleChanged}
            onArchived={handleArchived}
          />
        ))}
      </div>

      {/* ── History section ──────────────────────────────────────────────────── */}
      {enrollments.length > 0 && (
        <HistorySection studentId={studentId} />
      )}
    </div>
  );
}
