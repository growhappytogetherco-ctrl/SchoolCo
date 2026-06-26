"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, ChevronDown, ChevronUp, Pencil, Trash2, Loader2, AlertCircle, TrendingUp, ClipboardList } from "lucide-react";
import {
  getCurriculumEnrollments, upsertCurriculum, getAcademicProgress, recordProgress,
  getAssessments, createAssessment, deleteAssessment,
  type CurriculumEnrollment, type AcademicProgressRecord, type Assessment, type Subject,
  SUBJECTS,
} from "@/app/actions/academics";
import { cn } from "@/lib/utils";

const SUBJECT_LABELS: Record<string, string> = {
  math: "Math", ela: "ELA", science: "Science", history: "History", bible: "Bible",
  spanish: "Spanish", elective: "Elective", leadership: "Leadership",
  entrepreneurship: "Entrepreneurship", art: "Art", music: "Music", pe: "PE", other: "Other",
};

const PERIOD_CFG = {
  boy:        { label: "BOY",        cls: "bg-sc-teal-50   text-sc-teal"      },
  moy:        { label: "MOY",        cls: "bg-sc-gold-100  text-sc-gold-700"  },
  eoy:        { label: "EOY",        cls: "bg-sc-green/10  text-sc-green"     },
  additional: { label: "Additional", cls: "bg-sc-gray-100  text-sc-gray"      },
};

const PERF_CFG: Record<string, { cls: string; label: string }> = {
  advanced:    { cls: "bg-sc-green/10  text-sc-green",      label: "Advanced"    },
  proficient:  { cls: "bg-sc-teal-50   text-sc-teal",       label: "Proficient"  },
  approaching: { cls: "bg-sc-gold-100  text-sc-gold-700",   label: "Approaching" },
  below:       { cls: "bg-sc-rose-50   text-sc-rose",       label: "Below"       },
  far_below:   { cls: "bg-sc-rose-100  text-sc-rose-700",   label: "Far Below"   },
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ProgressBar({ pct }: { pct: number }) {
  const color = pct >= 80 ? "bg-sc-green" : pct >= 50 ? "bg-sc-teal" : "bg-sc-gold-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-sc-gray-100">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-label-sm text-sc-gray w-8 text-right">{pct}%</span>
    </div>
  );
}

type Section = "curriculum" | "progress" | "assessments";

export function AcademicsTab({ studentId }: { studentId: string }) {
  const [section, setSection] = useState<Section>("curriculum");
  const [curricula, setCurricula]     = useState<CurriculumEnrollment[]>([]);
  const [progress, setProgress]       = useState<AcademicProgressRecord[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loaded, setLoaded]           = useState<Set<Section>>(new Set());

  // Curriculum form
  const [showCurrForm, setShowCurrForm] = useState(false);
  const [editingCurr, setEditingCurr]   = useState<CurriculumEnrollment | null>(null);
  const [currForm, setCurrForm] = useState<{
    subject: Subject; curriculum_name: string; publisher: string;
    current_level: string; current_unit: string; current_lesson: string;
    teacher_name: string; start_date: string; expected_completion: string;
    completion_pct: number; status: "active" | "completed" | "paused" | "dropped";
  }>({
    subject: "math", curriculum_name: "", publisher: "",
    current_level: "", current_unit: "", current_lesson: "",
    teacher_name: "", start_date: "", expected_completion: "",
    completion_pct: 0, status: "active",
  });

  // Progress form
  const [showProgForm, setShowProgForm] = useState(false);
  const [progForm, setProgForm] = useState({
    subject: "math", curriculum_name: "", level: "", lesson: "",
    mastery_pct: "", notes: "", recorded_date: new Date().toISOString().split("T")[0],
    curriculum_enrollment_id: "",
  });

  // Assessment form
  const [showAssessForm, setShowAssessForm] = useState(false);
  const [assessForm, setAssessForm] = useState<{
    subject: string; assessment_name: string;
    assessment_period: "boy" | "moy" | "eoy" | "additional";
    assessment_date: string; score_raw: string; score_max: string;
    grade_equivalent: string; performance_level: string;
    teacher_comments: string; visibility: string;
  }>({
    subject: "", assessment_name: "", assessment_period: "boy",
    assessment_date: new Date().toISOString().split("T")[0],
    score_raw: "", score_max: "", grade_equivalent: "",
    performance_level: "", teacher_comments: "", visibility: "internal",
  });

  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [expandedProg, setExpandedProg] = useState<string | null>(null);

  useEffect(() => {
    async function loadSection() {
      if (loaded.has(section)) return;
      setLoading(true);
      if (section === "curriculum") {
        const data = await getCurriculumEnrollments(studentId);
        setCurricula(data);
      } else if (section === "progress") {
        const data = await getAcademicProgress(studentId);
        setProgress(data);
      } else {
        const data = await getAssessments(studentId);
        setAssessments(data);
      }
      setLoaded((prev) => new Set(prev).add(section));
      setLoading(false);
    }
    loadSection();
  }, [section, studentId, loaded]);

  // ── Curriculum CRUD ───────────────────────────────────────────

  function openNewCurr() {
    setEditingCurr(null);
    setCurrForm({
      subject: "math", curriculum_name: "", publisher: "",
      current_level: "", current_unit: "", current_lesson: "",
      teacher_name: "", start_date: "", expected_completion: "", completion_pct: 0, status: "active",
    });
    setShowCurrForm(true);
    setError(null);
  }

  function openEditCurr(c: CurriculumEnrollment) {
    setEditingCurr(c);
    setCurrForm({
      subject:            c.subject,
      curriculum_name:    c.curriculum_name,
      publisher:          c.publisher ?? "",
      current_level:      c.current_level ?? "",
      current_unit:       c.current_unit ?? "",
      current_lesson:     c.current_lesson ?? "",
      teacher_name:       c.teacher_name ?? "",
      start_date:         c.start_date ?? "",
      expected_completion:c.expected_completion ?? "",
      completion_pct:     c.completion_pct,
      status:             c.status,
    });
    setShowCurrForm(true);
    setError(null);
  }

  async function saveCurr() {
    if (!currForm.curriculum_name.trim()) { setError("Curriculum name required"); return; }
    setSaving(true);
    setError(null);
    const res = await upsertCurriculum(studentId, {
      id: editingCurr?.id,
      ...currForm,
      publisher:          currForm.publisher || null,
      current_level:      currForm.current_level || null,
      current_unit:       currForm.current_unit || null,
      current_lesson:     currForm.current_lesson || null,
      teacher_name:       currForm.teacher_name || null,
      start_date:         currForm.start_date || null,
      expected_completion:currForm.expected_completion || null,
    });
    if (!res.success) { setError(res.error); setSaving(false); return; }
    const updated = await getCurriculumEnrollments(studentId);
    setCurricula(updated);
    setShowCurrForm(false);
    setSaving(false);
  }

  // ── Progress CRUD ─────────────────────────────────────────────

  async function saveProgress() {
    setSaving(true);
    setError(null);
    const res = await recordProgress(studentId, {
      subject:                  progForm.subject,
      curriculum_enrollment_id: progForm.curriculum_enrollment_id || null,
      curriculum_name:          progForm.curriculum_name || null,
      level:                    progForm.level || null,
      lesson:                   progForm.lesson || null,
      mastery_pct:              progForm.mastery_pct ? parseInt(progForm.mastery_pct) : null,
      notes:                    progForm.notes || null,
      recorded_date:            progForm.recorded_date,
    });
    if (!res.success) { setError(res.error); setSaving(false); return; }
    const updated = await getAcademicProgress(studentId);
    setProgress(updated);
    setShowProgForm(false);
    setSaving(false);
  }

  // ── Assessment CRUD ───────────────────────────────────────────

  async function saveAssessment() {
    if (!assessForm.subject || !assessForm.assessment_name) { setError("Subject and name required"); return; }
    setSaving(true);
    setError(null);
    const res = await createAssessment(studentId, {
      ...assessForm,
      score_raw:       assessForm.score_raw       ? parseFloat(assessForm.score_raw) : null,
      score_max:       assessForm.score_max       ? parseFloat(assessForm.score_max) : null,
      grade_equivalent:assessForm.grade_equivalent || null,
      performance_level:assessForm.performance_level || null,
      teacher_comments: assessForm.teacher_comments || null,
    });
    if (!res.success) { setError(res.error); setSaving(false); return; }
    const updated = await getAssessments(studentId);
    setAssessments(updated);
    setShowAssessForm(false);
    setSaving(false);
  }

  async function handleDeleteAssessment(id: string) {
    const res = await deleteAssessment(id, studentId);
    if (res.success) setAssessments((prev) => prev.filter((a) => a.id !== id));
  }

  // Group progress by subject
  const progressBySubject: Record<string, AcademicProgressRecord[]> = {};
  progress.forEach((p) => {
    if (!progressBySubject[p.subject]) progressBySubject[p.subject] = [];
    progressBySubject[p.subject].push(p);
  });

  const activeCurricula  = curricula.filter((c) => c.status === "active");
  const inactiveCurricula = curricula.filter((c) => c.status !== "active");

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Section tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl border border-sc-gray-200 p-1 bg-white">
          {([
            { id: "curriculum",  label: "Curriculum",       Icon: BookOpen       },
            { id: "progress",    label: "Progress History",  Icon: TrendingUp     },
            { id: "assessments", label: "Assessments",       Icon: ClipboardList  },
          ] as const).map((tab) => (
            <button key={tab.id} onClick={() => setSection(tab.id)}
              className={cn("flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-label-sm font-medium transition-colors",
                section === tab.id ? "bg-sc-navy text-white" : "text-sc-gray hover:text-sc-navy"
              )}>
              <tab.Icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => <div key={i} className="h-24 rounded-2xl border border-sc-gray-100 bg-white animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* ── CURRICULUM ── */}
          {section === "curriculum" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-heading-sm text-sc-navy font-semibold">Curriculum Enrollments</h3>
                <button onClick={openNewCurr}
                  className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white font-medium hover:bg-sc-teal-700 transition-colors">
                  <Plus className="size-4" /> Add Curriculum
                </button>
              </div>

              {showCurrForm && (
                <div className="rounded-2xl border border-sc-teal-200 bg-sc-teal-50 p-5 space-y-4">
                  <h4 className="text-label-md font-semibold text-sc-navy">{editingCurr ? "Edit Curriculum" : "New Curriculum"}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Subject</label>
                      <select value={currForm.subject} onChange={(e) => setCurrForm((f) => ({ ...f, subject: e.target.value as Subject }))}
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none">
                        {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABELS[s] ?? s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Curriculum Name *</label>
                      <input value={currForm.curriculum_name} onChange={(e) => setCurrForm((f) => ({ ...f, curriculum_name: e.target.value }))}
                        placeholder="e.g. Saxon Math"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Publisher</label>
                      <input value={currForm.publisher} onChange={(e) => setCurrForm((f) => ({ ...f, publisher: e.target.value }))}
                        placeholder="e.g. Saxon Publishers"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Level</label>
                      <input value={currForm.current_level} onChange={(e) => setCurrForm((f) => ({ ...f, current_level: e.target.value }))}
                        placeholder="e.g. 5/4"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Current Lesson</label>
                      <input value={currForm.current_lesson} onChange={(e) => setCurrForm((f) => ({ ...f, current_lesson: e.target.value }))}
                        placeholder="e.g. Lesson 38"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Teacher</label>
                      <input value={currForm.teacher_name} onChange={(e) => setCurrForm((f) => ({ ...f, teacher_name: e.target.value }))}
                        placeholder="Teacher name"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Start Date</label>
                      <input type="date" value={currForm.start_date} onChange={(e) => setCurrForm((f) => ({ ...f, start_date: e.target.value }))}
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Expected Completion</label>
                      <input type="date" value={currForm.expected_completion} onChange={(e) => setCurrForm((f) => ({ ...f, expected_completion: e.target.value }))}
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-label-sm font-medium text-sc-gray mb-1 block">Completion: {currForm.completion_pct}%</label>
                    <input type="range" min={0} max={100} step={5} value={currForm.completion_pct}
                      onChange={(e) => setCurrForm((f) => ({ ...f, completion_pct: parseInt(e.target.value) }))}
                      className="w-full accent-sc-teal" />
                  </div>
                  <div>
                    <label className="text-label-sm font-medium text-sc-gray mb-1 block">Status</label>
                    <select value={currForm.status} onChange={(e) => setCurrForm((f) => ({ ...f, status: e.target.value as "active" | "completed" | "paused" | "dropped" }))}
                      className="rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none">
                      <option value="active">Active</option>
                      <option value="completed">Completed</option>
                      <option value="paused">Paused</option>
                      <option value="dropped">Dropped</option>
                    </select>
                  </div>
                  {error && <p className="flex items-center gap-1.5 text-label-sm text-sc-rose"><AlertCircle className="size-4" />{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={saveCurr} disabled={saving}
                      className="flex items-center gap-2 rounded-xl bg-sc-navy px-5 py-2 text-label-sm text-white font-medium disabled:opacity-50">
                      {saving && <Loader2 className="size-4 animate-spin" />}{editingCurr ? "Save" : "Add"}
                    </button>
                    <button onClick={() => setShowCurrForm(false)} className="text-label-sm text-sc-gray px-3 py-2">Cancel</button>
                  </div>
                </div>
              )}

              {curricula.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center space-y-3">
                  <BookOpen className="size-10 text-sc-gray-300 mx-auto" />
                  <p className="text-body-md text-sc-gray-400">No curriculum added yet.</p>
                  <button onClick={openNewCurr}
                    className="inline-flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white font-medium">
                    <Plus className="size-4" /> Add First Curriculum
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeCurricula.map((c) => (
                    <div key={c.id} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sc-teal-50 border border-sc-teal-100">
                          <BookOpen className="size-5 text-sc-teal" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-label-md font-semibold text-sc-navy">{c.curriculum_name}</p>
                            <span className="rounded-full bg-sc-teal-50 px-2 py-0.5 text-label-sm text-sc-teal font-medium capitalize">
                              {SUBJECT_LABELS[c.subject] ?? c.subject}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-label-sm text-sc-gray">
                            {c.current_level  && <span>Level: <strong className="text-sc-navy">{c.current_level}</strong></span>}
                            {c.current_lesson && <span>Lesson: <strong className="text-sc-navy">{c.current_lesson}</strong></span>}
                            {c.teacher_name   && <span>Teacher: {c.teacher_name}</span>}
                          </div>
                        </div>
                        <button onClick={() => openEditCurr(c)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-teal-50 hover:text-sc-teal transition-colors">
                          <Pencil className="size-3.5" />
                        </button>
                      </div>
                      {c.completion_pct > 0 && <ProgressBar pct={c.completion_pct} />}
                      {(c.start_date || c.expected_completion) && (
                        <div className="flex gap-4 text-label-sm text-sc-gray">
                          {c.start_date          && <span>Started: {fmtDate(c.start_date)}</span>}
                          {c.expected_completion && <span>Expected: {fmtDate(c.expected_completion)}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                  {inactiveCurricula.length > 0 && (
                    <details className="rounded-2xl border border-sc-gray-100 bg-white">
                      <summary className="px-4 py-3 text-label-sm font-medium text-sc-gray cursor-pointer hover:text-sc-navy">
                        {inactiveCurricula.length} inactive curriculum(s)
                      </summary>
                      <div className="border-t border-sc-gray-100 divide-y divide-sc-gray-50">
                        {inactiveCurricula.map((c) => (
                          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                            <p className="text-label-sm text-sc-gray flex-1">{c.curriculum_name} — {SUBJECT_LABELS[c.subject] ?? c.subject}</p>
                            <span className="text-label-sm text-sc-gray capitalize">{c.status}</span>
                            <button onClick={() => openEditCurr(c)} className="flex h-7 w-7 items-center justify-center rounded-lg text-sc-gray hover:text-sc-teal">
                              <Pencil className="size-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── PROGRESS HISTORY ── */}
          {section === "progress" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-heading-sm text-sc-navy font-semibold">Progress History</h3>
                <button onClick={() => { setShowProgForm(true); setError(null); }}
                  className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white font-medium hover:bg-sc-teal-700 transition-colors">
                  <Plus className="size-4" /> Record Progress
                </button>
              </div>

              {showProgForm && (
                <div className="rounded-2xl border border-sc-teal-200 bg-sc-teal-50 p-5 space-y-3">
                  <h4 className="text-label-md font-semibold text-sc-navy">Record Progress Check-In</h4>
                  <p className="text-label-sm text-sc-gray">Each check-in creates an immutable history entry — the full timeline is preserved.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Subject</label>
                      <select value={progForm.subject} onChange={(e) => {
                        const sub = e.target.value;
                        const match = activeCurricula.find((c) => c.subject === sub);
                        setProgForm((f) => ({
                          ...f, subject: sub,
                          curriculum_enrollment_id: match?.id ?? "",
                          curriculum_name: match?.curriculum_name ?? f.curriculum_name,
                          level: match?.current_level ?? f.level,
                          lesson: match?.current_lesson ?? f.lesson,
                        }));
                      }}
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none">
                        {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABELS[s] ?? s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Date</label>
                      <input type="date" value={progForm.recorded_date} onChange={(e) => setProgForm((f) => ({ ...f, recorded_date: e.target.value }))}
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Curriculum</label>
                      <input value={progForm.curriculum_name} onChange={(e) => setProgForm((f) => ({ ...f, curriculum_name: e.target.value }))}
                        placeholder="e.g. Saxon Math"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Level</label>
                      <input value={progForm.level} onChange={(e) => setProgForm((f) => ({ ...f, level: e.target.value }))}
                        placeholder="e.g. 5/4"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Lesson</label>
                      <input value={progForm.lesson} onChange={(e) => setProgForm((f) => ({ ...f, lesson: e.target.value }))}
                        placeholder="e.g. Lesson 38"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Mastery %</label>
                      <input type="number" min={0} max={100} value={progForm.mastery_pct} onChange={(e) => setProgForm((f) => ({ ...f, mastery_pct: e.target.value }))}
                        placeholder="e.g. 72"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-label-sm font-medium text-sc-gray mb-1 block">Notes</label>
                    <textarea value={progForm.notes} onChange={(e) => setProgForm((f) => ({ ...f, notes: e.target.value }))}
                      rows={2} placeholder="Optional observations…"
                      className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none resize-none" />
                  </div>
                  {error && <p className="flex items-center gap-1.5 text-label-sm text-sc-rose"><AlertCircle className="size-4" />{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={saveProgress} disabled={saving}
                      className="flex items-center gap-2 rounded-xl bg-sc-navy px-5 py-2 text-label-sm text-white font-medium disabled:opacity-50">
                      {saving && <Loader2 className="size-4 animate-spin" />} Record
                    </button>
                    <button onClick={() => setShowProgForm(false)} className="text-label-sm text-sc-gray px-3 py-2">Cancel</button>
                  </div>
                </div>
              )}

              {Object.keys(progressBySubject).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center space-y-3">
                  <TrendingUp className="size-10 text-sc-gray-300 mx-auto" />
                  <p className="text-body-md text-sc-gray-400">No progress check-ins recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(progressBySubject).map(([sub, records]) => {
                    const isExp = expandedProg === sub;
                    const latest = records[0];
                    return (
                      <div key={sub} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
                        <div className="flex items-center gap-3 p-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-label-md font-semibold text-sc-navy">{SUBJECT_LABELS[sub] ?? sub}</p>
                              <span className="text-label-sm text-sc-gray">{records.length} check-in{records.length > 1 ? "s" : ""}</span>
                            </div>
                            {latest && (
                              <p className="text-label-sm text-sc-gray mt-0.5">
                                Latest: {latest.curriculum_name && `${latest.curriculum_name} · `}{latest.level && `${latest.level} · `}{latest.lesson && `${latest.lesson} · `}
                                {fmtDate(latest.recorded_date)}
                                {latest.mastery_pct != null && ` · ${latest.mastery_pct}% mastery`}
                              </p>
                            )}
                          </div>
                          <button onClick={() => setExpandedProg(isExp ? null : sub)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:text-sc-navy">
                            {isExp ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                          </button>
                        </div>
                        {isExp && (
                          <div className="border-t border-sc-gray-100 divide-y divide-sc-gray-50">
                            {records.map((r, i) => (
                              <div key={r.id} className={cn("px-4 py-2.5 flex items-center gap-3", i === 0 && "bg-sc-teal-50")}>
                                <div className="w-2 h-2 rounded-full bg-sc-teal shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-label-sm">
                                    {r.level  && <span className="font-medium text-sc-navy">Level {r.level}</span>}
                                    {r.lesson && <span className="text-sc-gray">· {r.lesson}</span>}
                                    {r.mastery_pct != null && <span className="text-sc-teal font-medium">· {r.mastery_pct}%</span>}
                                  </div>
                                  {r.notes && <p className="text-label-sm text-sc-gray">{r.notes}</p>}
                                </div>
                                <span className="text-label-sm text-sc-gray shrink-0">{fmtDate(r.recorded_date)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── ASSESSMENTS ── */}
          {section === "assessments" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-heading-sm text-sc-navy font-semibold">Assessment Center</h3>
                <button onClick={() => { setShowAssessForm(true); setError(null); }}
                  className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white font-medium hover:bg-sc-teal-700 transition-colors">
                  <Plus className="size-4" /> Add Assessment
                </button>
              </div>

              {showAssessForm && (
                <div className="rounded-2xl border border-sc-teal-200 bg-sc-teal-50 p-5 space-y-3">
                  <h4 className="text-label-md font-semibold text-sc-navy">New Assessment</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Subject *</label>
                      <select value={assessForm.subject} onChange={(e) => setAssessForm((f) => ({ ...f, subject: e.target.value }))}
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none">
                        <option value="">Select subject…</option>
                        {SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_LABELS[s] ?? s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Assessment Period</label>
                      <select value={assessForm.assessment_period} onChange={(e) => setAssessForm((f) => ({ ...f, assessment_period: e.target.value as "boy" | "moy" | "eoy" | "additional" }))}
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none">
                        <option value="boy">BOY — Beginning of Year</option>
                        <option value="moy">MOY — Middle of Year</option>
                        <option value="eoy">EOY — End of Year</option>
                        <option value="additional">Additional</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Assessment Name *</label>
                      <input value={assessForm.assessment_name} onChange={(e) => setAssessForm((f) => ({ ...f, assessment_name: e.target.value }))}
                        placeholder="e.g. Saxon Math Test 10, DIBELS, MAP Reading"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Date</label>
                      <input type="date" value={assessForm.assessment_date} onChange={(e) => setAssessForm((f) => ({ ...f, assessment_date: e.target.value }))}
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Performance Level</label>
                      <select value={assessForm.performance_level} onChange={(e) => setAssessForm((f) => ({ ...f, performance_level: e.target.value }))}
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none">
                        <option value="">Select…</option>
                        <option value="advanced">Advanced</option>
                        <option value="proficient">Proficient</option>
                        <option value="approaching">Approaching</option>
                        <option value="below">Below</option>
                        <option value="far_below">Far Below</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Score (raw)</label>
                      <input type="number" value={assessForm.score_raw} onChange={(e) => setAssessForm((f) => ({ ...f, score_raw: e.target.value }))}
                        placeholder="e.g. 85"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Total Points</label>
                      <input type="number" value={assessForm.score_max} onChange={(e) => setAssessForm((f) => ({ ...f, score_max: e.target.value }))}
                        placeholder="e.g. 100"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Grade Equivalent</label>
                      <input value={assessForm.grade_equivalent} onChange={(e) => setAssessForm((f) => ({ ...f, grade_equivalent: e.target.value }))}
                        placeholder="e.g. 3.2"
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-label-sm font-medium text-sc-gray mb-1 block">Visibility</label>
                      <select value={assessForm.visibility} onChange={(e) => setAssessForm((f) => ({ ...f, visibility: e.target.value }))}
                        className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none">
                        <option value="internal">Staff Only</option>
                        <option value="parent_visible">Parent Visible</option>
                        <option value="admin_only">Admin Only</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-label-sm font-medium text-sc-gray mb-1 block">Teacher Comments</label>
                    <textarea value={assessForm.teacher_comments} onChange={(e) => setAssessForm((f) => ({ ...f, teacher_comments: e.target.value }))}
                      rows={2}
                      className="w-full rounded-xl border border-sc-gray-200 bg-white px-3 py-2 text-label-sm focus:border-sc-teal focus:outline-none resize-none" />
                  </div>
                  {error && <p className="flex items-center gap-1.5 text-label-sm text-sc-rose"><AlertCircle className="size-4" />{error}</p>}
                  <div className="flex gap-2">
                    <button onClick={saveAssessment} disabled={saving}
                      className="flex items-center gap-2 rounded-xl bg-sc-navy px-5 py-2 text-label-sm text-white font-medium disabled:opacity-50">
                      {saving && <Loader2 className="size-4 animate-spin" />} Save Assessment
                    </button>
                    <button onClick={() => setShowAssessForm(false)} className="text-label-sm text-sc-gray px-3 py-2">Cancel</button>
                  </div>
                </div>
              )}

              {assessments.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center space-y-3">
                  <ClipboardList className="size-10 text-sc-gray-300 mx-auto" />
                  <p className="text-body-md text-sc-gray-400">No assessments recorded yet. Add BOY, MOY, EOY, or additional assessments.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(["boy","moy","eoy","additional"] as const).map((period) => {
                    const periodAssessments = assessments.filter((a) => a.assessment_period === period);
                    if (periodAssessments.length === 0) return null;
                    const cfg = PERIOD_CFG[period];
                    return (
                      <div key={period} className="space-y-2">
                        <p className="text-label-sm font-semibold text-sc-gray uppercase tracking-wider">{cfg.label}</p>
                        {periodAssessments.map((a) => {
                          const perfCfg = a.performance_level ? PERF_CFG[a.performance_level] : null;
                          return (
                            <div key={a.id} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-4">
                              <div className="flex items-start gap-3">
                                <div className={cn("rounded-lg px-2.5 py-1 text-label-sm font-semibold shrink-0", cfg.cls)}>
                                  {cfg.label}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-label-md font-semibold text-sc-navy">{a.assessment_name}</p>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-label-sm text-sc-gray">
                                    <span className="font-medium capitalize">{SUBJECT_LABELS[a.subject] ?? a.subject}</span>
                                    <span>·</span>
                                    <span>{fmtDate(a.assessment_date)}</span>
                                    {a.score_pct != null && <><span>·</span><span className="font-medium text-sc-navy">{Math.round(a.score_pct)}%</span></>}
                                    {a.score_raw != null && a.score_max != null && <span>({a.score_raw}/{a.score_max})</span>}
                                    {a.grade_equivalent && <><span>·</span><span>GE {a.grade_equivalent}</span></>}
                                    {perfCfg && (
                                      <span className={cn("rounded-full px-2 py-0.5 font-medium", perfCfg.cls)}>{perfCfg.label}</span>
                                    )}
                                  </div>
                                  {a.teacher_comments && <p className="text-label-sm text-sc-gray mt-1">{a.teacher_comments}</p>}
                                </div>
                                <button onClick={() => handleDeleteAssessment(a.id)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-rose-50 hover:text-sc-rose transition-colors shrink-0">
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
