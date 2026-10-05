"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BookMarked, Plus, MoreHorizontal, Pencil, Trash2, CheckCircle2,
  AlertCircle, XCircle, Clock, ExternalLink, Loader2, ChevronDown, ChevronUp,
  FileText, AlertTriangle, ShieldAlert, Sparkles,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuPortal, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getCourseRecords, addCourseRecord, updateCourseRecord, updateVerifiedCourseRecord,
  deleteCourseRecord, verifyCourseRecord, markCourseRecordNeedsReview, rejectCourseRecord,
  getSourceDocumentsForStudent, getSourceDocumentUrl, checkCourseRecordDuplicates,
  type CourseRecord, type AddCourseRecordPayload, type UpdateCourseRecordPayload,
  type CourseCompletionStatus, type CourseTerm, type CourseLevel,
  type SourceCreditUnit, type InstitutionType, type SourceDocumentOption,
} from "@/app/actions/courseRecords";
import type { DuplicateMatch, ConflictMatch } from "@/lib/courseRecordMatching";
import { requestAcademicImport, checkPriorImport, getImportJobs, type ImportJob } from "@/app/actions/academicImport";
import { ImportReviewScreen } from "@/components/grades/ImportReviewScreen";

// ── Constants ─────────────────────────────────────────────────────────────────

const TERM_LABELS: Record<CourseTerm, string> = {
  full_year:  "Full Year",
  semester_1: "Semester 1",
  semester_2: "Semester 2",
  quarter_1:  "Quarter 1",
  quarter_2:  "Quarter 2",
  quarter_3:  "Quarter 3",
  quarter_4:  "Quarter 4",
  summer:     "Summer",
  other:      "Other",
};

const COMPLETION_LABELS: Record<string, string> = {
  completed:   "Completed",
  withdrawn:   "Withdrawn",
  failed:      "Failed",
  incomplete:  "Incomplete",
  unknown:     "Unknown",
  in_progress: "In Progress",
};

const LEVEL_LABELS: Record<CourseLevel, string> = {
  standard:        "Standard",
  honors:          "Honors",
  ap:              "AP",
  dual_enrollment: "Dual Enrollment",
};

const SUBJECT_AREA_OPTIONS = [
  { value: "mathematics",       label: "Mathematics" },
  { value: "english_ela",       label: "English / ELA" },
  { value: "science",           label: "Science" },
  { value: "social_studies",    label: "Social Studies" },
  { value: "world_language",    label: "World Language" },
  { value: "fine_arts",         label: "Fine Arts" },
  { value: "pe_health",         label: "PE / Health" },
  { value: "career_technical",  label: "Career & Technical" },
  { value: "leadership",        label: "Leadership" },
  { value: "entrepreneurship",  label: "Entrepreneurship" },
  { value: "elective",          label: "Elective" },
  { value: "bible",             label: "Bible" },
  { value: "other",             label: "Other" },
];

const INSTITUTION_TYPE_LABELS: Record<InstitutionType, string> = {
  public:     "Public School",
  private:    "Private School",
  homeschool: "Homeschool",
  umbrella:   "Umbrella School",
  virtual:    "Virtual School",
  college:    "College / University",
  rla:        "RLA",
  other:      "Other",
};

const SOURCE_CREDIT_UNIT_LABELS: Record<SourceCreditUnit, string> = {
  high_school_credit:     "HS Credits",
  college_semester_hours: "College Semester Hours",
  college_quarter_hours:  "College Quarter Hours",
  other:                  "Other Units",
};

// ── Status badge ─────────────────────────────────────────────────────────────

function VerificationBadge({ status }: { status: CourseRecord["verification_status"] }) {
  const configs = {
    needs_review: { icon: Clock,         color: "text-sc-gold-700 bg-sc-gold-50 border-sc-gold-300",  label: "Needs Review" },
    verified:     { icon: CheckCircle2,  color: "text-sc-teal-700 bg-sc-cream border-sc-teal-700/30", label: "Verified" },
    rejected:     { icon: XCircle,       color: "text-sc-rose-700 bg-sc-rose-50 border-sc-rose-200",  label: "Rejected" },
    proposed:     { icon: AlertCircle,   color: "text-sc-navy/60 bg-sc-gray-100 border-sc-gray-200",  label: "Proposed" },
  };
  const cfg = configs[status] ?? configs.needs_review;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-label-sm font-medium ${cfg.color}`}>
      <Icon className="size-3" />
      {cfg.label}
    </span>
  );
}

function CompletionBadge({ status }: { status: CourseCompletionStatus }) {
  const colors: Record<string, string> = {
    completed:   "text-sc-teal-700",
    failed:      "text-sc-rose",
    withdrawn:   "text-sc-gray",
    incomplete:  "text-sc-gold-700",
    unknown:     "text-sc-gray",
    in_progress: "text-sc-teal",
  };
  return (
    <span className={`text-label-sm ${colors[status] ?? "text-sc-gray"}`}>
      {COMPLETION_LABELS[status] ?? status}
    </span>
  );
}

// ── Credit summary ────────────────────────────────────────────────────────────

function CreditSummary({ records }: { records: CourseRecord[] }) {
  const verifiedCredits = records.filter(
    (r) =>
      r.verification_status === "verified" &&
      r.completion_status === "completed" &&
      r.counts_toward_high_school_credit &&
      r.credits_earned != null &&
      r.credits_earned > 0
  );

  const totalEarned = verifiedCredits.reduce((sum, r) => sum + (r.credits_earned ?? 0), 0);
  const needsReview = records.filter((r) => r.verification_status === "needs_review").length;

  return (
    <div className="rounded-2xl bg-sc-navy text-white p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1">
        <p className="text-label-sm text-white/60 uppercase tracking-wide mb-1">
          Verified HS Credits Earned
        </p>
        <p className="font-serif text-3xl font-semibold">{totalEarned.toFixed(2)}</p>
        <p className="text-label-sm text-white/60 mt-1">
          From {verifiedCredits.length} verified course{verifiedCredits.length !== 1 ? "s" : ""}
        </p>
      </div>
      {needsReview > 0 && (
        <div className="rounded-xl bg-sc-gold-600/20 border border-sc-gold-300/30 px-4 py-3">
          <p className="text-label-sm text-sc-gold-300 font-medium">
            {needsReview} record{needsReview !== 1 ? "s" : ""} need review
          </p>
        </div>
      )}
    </div>
  );
}

// ── Course record row ─────────────────────────────────────────────────────────

function CourseRow({
  record,
  studentId,
  sourceDocuments,
  onEdit,
  onRefresh,
}: {
  record: CourseRecord;
  studentId: string;
  sourceDocuments: SourceDocumentOption[];
  onEdit: (r: CourseRecord) => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function handleVerify() {
    setBusy(true);
    await verifyCourseRecord(record.id, studentId);
    onRefresh();
    setBusy(false);
  }

  async function handleNeedsReview() {
    setBusy(true);
    await markCourseRecordNeedsReview(record.id, studentId);
    onRefresh();
    setBusy(false);
  }

  async function handleReject() {
    setBusy(true);
    await rejectCourseRecord(record.id, studentId);
    onRefresh();
    setBusy(false);
  }

  async function handleDelete() {
    if (!confirm(`Delete "${record.course_name}" from the Academic Achievement Record?\n\nThis action cannot be undone.`)) return;
    setBusy(true);
    const result = await deleteCourseRecord(record.id, studentId);
    if (result.success) {
      onRefresh();
    } else {
      alert(`Delete failed: ${result.error}`);
      setBusy(false);
    }
  }

  async function handleViewOriginal() {
    if (!record.source_document_id) return;
    setBusy(true);
    const result = await getSourceDocumentUrl(record.source_document_id);
    setBusy(false);
    if (result.success && result.data) {
      window.open(result.data, "_blank", "noopener,noreferrer");
    } else {
      alert(result.success ? "No URL available for this document." : result.error);
    }
  }

  const isRejected = record.verification_status === "rejected";
  const letterGrade = record.final_grade ?? record.semester_2_grade ?? record.semester_1_grade ?? null;
  // Percentage is primary when present. Format: "91.5% (A)" or "91% (A)" or "91.5%" or "A"
  const gradeDisplay: string | null = (() => {
    const pct = record.percentage;
    if (pct !== null && pct !== undefined) {
      // Suppress meaningless trailing zeros: 91.00 → "91%", 91.50 → "91.5%"
      const pctStr = Number.isInteger(pct) ? `${pct}%` : `${parseFloat(String(pct))}%`;
      return letterGrade ? `${pctStr} (${letterGrade})` : pctStr;
    }
    return letterGrade;
  })();

  // Find linked source document label for compact display
  const linkedDoc = record.source_document_id
    ? sourceDocuments.find((d) => d.id === record.source_document_id)
    : null;

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-sc-gray-100 last:border-0 ${isRejected ? "opacity-50" : ""}`}>
      {/* Left: course info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sc-navy text-label-md">{record.course_name}</span>
          {record.course_code && (
            <span className="text-label-sm text-sc-gray font-mono">{record.course_code}</span>
          )}
          {record.course_level && record.course_level !== "standard" && (
            <span className="text-label-sm text-sc-teal-700 bg-sc-cream rounded-full px-2 py-0.5 border border-sc-teal-700/20">
              {LEVEL_LABELS[record.course_level as CourseLevel]}
            </span>
          )}
          <VerificationBadge status={record.verification_status} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
          {record.institution_name && (
            <span className="text-label-sm text-sc-gray">{record.institution_name}</span>
          )}
          {record.term && (
            <span className="text-label-sm text-sc-gray">{TERM_LABELS[record.term as CourseTerm]}</span>
          )}
          <CompletionBadge status={record.completion_status} />
        </div>
        {/* Source credits (dual enrollment) */}
        {record.source_credits_earned != null && record.source_credit_unit && (
          <p className="text-label-sm text-sc-gray mt-0.5">
            Source: {record.source_credits_earned} {SOURCE_CREDIT_UNIT_LABELS[record.source_credit_unit as SourceCreditUnit]}
          </p>
        )}
        {/* Compact source document line */}
        {linkedDoc && (
          <div className="flex items-center gap-1.5 mt-1">
            <FileText className="size-3 text-sc-gray-400 shrink-0" />
            <span className="text-label-sm text-sc-gray">
              Source: {linkedDoc.label}
            </span>
            <button
              onClick={handleViewOriginal}
              disabled={busy}
              className="text-label-sm text-sc-teal-700 hover:underline disabled:opacity-50"
            >
              · View Original
            </button>
          </div>
        )}
      </div>

      {/* Center: grade + HS credit */}
      <div className="shrink-0 text-right min-w-[80px]">
        {gradeDisplay && (
          <p className="font-semibold text-sc-navy text-label-md">{gradeDisplay}</p>
        )}
        {record.counts_toward_high_school_credit && (
          <p className="text-label-sm text-sc-teal-700">
            {record.credits_earned != null ? `${record.credits_earned} HS cr` : "HS credit"}
          </p>
        )}
      </div>

      {/* Right: menu */}
      <div className="shrink-0 flex items-center gap-1">
        {busy && <Loader2 className="size-4 animate-spin text-sc-gray" />}
        {!busy && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-gray-100 hover:text-sc-navy transition-colors"
                aria-label="Course record actions"
              >
                <MoreHorizontal className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuPortal>
              <DropdownMenuContent align="end" sideOffset={4} className="min-w-[180px] z-50">
                {/* View Original */}
                {record.source_document_id && (
                  <DropdownMenuItem
                    onClick={handleViewOriginal}
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="size-3.5" />
                    View Original
                  </DropdownMenuItem>
                )}

                {/* Edit */}
                <DropdownMenuItem
                  onClick={() => onEdit(record)}
                  className="flex items-center gap-2"
                >
                  <Pencil className="size-3.5" />
                  Edit Record
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                {/* Verification actions */}
                {record.verification_status !== "verified" && (
                  <DropdownMenuItem
                    onClick={handleVerify}
                    className="flex items-center gap-2 text-sc-teal-700"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Mark Verified
                  </DropdownMenuItem>
                )}
                {record.verification_status === "verified" && (
                  <DropdownMenuItem
                    onClick={handleNeedsReview}
                    className="flex items-center gap-2"
                  >
                    <Clock className="size-3.5" />
                    Mark Needs Review
                  </DropdownMenuItem>
                )}
                {record.verification_status !== "rejected" && (
                  <DropdownMenuItem
                    onClick={handleReject}
                    className="flex items-center gap-2 text-sc-rose"
                  >
                    <XCircle className="size-3.5" />
                    Reject Record
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                {/* Delete */}
                <DropdownMenuItem
                  onClick={handleDelete}
                  className="flex items-center gap-2 text-sc-rose focus:bg-sc-rose-50 focus:text-sc-rose-700"
                >
                  <Trash2 className="size-3.5" />
                  Delete Record
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenuPortal>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ── Course record form (shared Add/Edit) ──────────────────────────────────────

interface CourseFormValues {
  schoolYear: string;
  gradeLevel: string;
  term: string;
  institutionName: string;
  institutionType: string;
  courseName: string;
  courseCode: string;
  subjectArea: string;
  courseLevel: string;
  semester1Grade: string;
  semester2Grade: string;
  finalGrade: string;
  percentage: string;
  creditsAttempted: string;
  creditsEarned: string;
  countsTowardHighSchoolCredit: boolean;
  sourceCreditsAttempted: string;
  sourceCreditsEarned: string;
  sourceCreditUnit: string;
  completionStatus: CourseCompletionStatus;
  sourceDocumentId: string;
  sourceNotes: string;
}

const EMPTY_FORM: CourseFormValues = {
  schoolYear: "",
  gradeLevel: "",
  term: "",
  institutionName: "",
  institutionType: "",
  courseName: "",
  courseCode: "",
  subjectArea: "",
  courseLevel: "",
  semester1Grade: "",
  semester2Grade: "",
  finalGrade: "",
  percentage: "",
  creditsAttempted: "",
  creditsEarned: "",
  countsTowardHighSchoolCredit: false,
  sourceCreditsAttempted: "",
  sourceCreditsEarned: "",
  sourceCreditUnit: "",
  completionStatus: "unknown",
  sourceDocumentId: "",
  sourceNotes: "",
};

function recordToForm(r: CourseRecord): CourseFormValues {
  return {
    schoolYear:                   r.school_year,
    gradeLevel:                   r.grade_level ?? "",
    term:                         r.term ?? "",
    institutionName:              r.institution_name ?? "",
    institutionType:              r.institution_type ?? "",
    courseName:                   r.course_name,
    courseCode:                   r.course_code ?? "",
    subjectArea:                  r.subject_area ?? "",
    courseLevel:                  r.course_level ?? "",
    semester1Grade:               r.semester_1_grade ?? "",
    semester2Grade:               r.semester_2_grade ?? "",
    finalGrade:                   r.final_grade ?? "",
    percentage:                   r.percentage != null ? String(r.percentage) : "",
    creditsAttempted:             r.credits_attempted != null ? String(r.credits_attempted) : "",
    creditsEarned:                r.credits_earned != null ? String(r.credits_earned) : "",
    countsTowardHighSchoolCredit: r.counts_toward_high_school_credit,
    sourceCreditsAttempted:       r.source_credits_attempted != null ? String(r.source_credits_attempted) : "",
    sourceCreditsEarned:          r.source_credits_earned != null ? String(r.source_credits_earned) : "",
    sourceCreditUnit:             r.source_credit_unit ?? "",
    completionStatus:             r.completion_status as CourseCompletionStatus,
    sourceDocumentId:             r.source_document_id ?? "",
    sourceNotes:                  r.source_notes ?? "",
  };
}

function formToPayload(f: CourseFormValues): Omit<AddCourseRecordPayload, "studentId"> {
  return {
    schoolYear:                   f.schoolYear,
    gradeLevel:                   f.gradeLevel || undefined,
    term:                         (f.term as CourseTerm) || undefined,
    institutionName:              f.institutionName || undefined,
    institutionType:              (f.institutionType as InstitutionType) || undefined,
    courseName:                   f.courseName,
    courseCode:                   f.courseCode || undefined,
    subjectArea:                  f.subjectArea || undefined,
    courseLevel:                  (f.courseLevel as CourseLevel) || undefined,
    semester1Grade:               f.semester1Grade || undefined,
    semester2Grade:               f.semester2Grade || undefined,
    finalGrade:                   f.finalGrade || undefined,
    percentage:                   f.percentage ? parseFloat(f.percentage) : undefined,
    creditsAttempted:             f.creditsAttempted ? parseFloat(f.creditsAttempted) : undefined,
    creditsEarned:                f.creditsEarned !== "" ? parseFloat(f.creditsEarned) : undefined,
    countsTowardHighSchoolCredit: f.countsTowardHighSchoolCredit,
    sourceCreditsAttempted:       f.sourceCreditsAttempted ? parseFloat(f.sourceCreditsAttempted) : undefined,
    sourceCreditsEarned:          f.sourceCreditsEarned ? parseFloat(f.sourceCreditsEarned) : undefined,
    sourceCreditUnit:             (f.sourceCreditUnit as SourceCreditUnit) || undefined,
    completionStatus:             f.completionStatus,
    sourceDocumentId:             f.sourceDocumentId || undefined,
    sourceNotes:                  f.sourceNotes || undefined,
  };
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-label-sm font-medium text-sc-navy">
      {children}{required && <span className="text-sc-rose ml-0.5">*</span>}
    </label>
  );
}

function FormInput({
  label, value, onChange, placeholder, required, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/40 focus:border-sc-teal placeholder:text-sc-gray-400"
      />
    </div>
  );
}

function FormSelect({
  label, value, onChange, options, placeholder, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; placeholder?: string; required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel required={required}>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/40 focus:border-sc-teal bg-white"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function CourseForm({
  initial,
  onSave,
  onCancel,
  saving,
  sourceDocuments,
  isEditingVerified,
}: {
  initial: CourseFormValues;
  onSave: (f: CourseFormValues) => void;
  onCancel: () => void;
  saving: boolean;
  sourceDocuments: SourceDocumentOption[];
  isEditingVerified?: boolean;
}) {
  const [form, setForm] = useState<CourseFormValues>(initial);
  const [showSourceCredits, setShowSourceCredits] = useState(
    !!(initial.sourceCreditsAttempted || initial.sourceCreditsEarned || initial.sourceCreditUnit)
  );

  function set(field: keyof CourseFormValues, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.schoolYear.trim()) { alert("School year is required."); return; }
    if (!form.courseName.trim()) { alert("Course name is required."); return; }
    onSave(form);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Verified-record warning banner */}
      {isEditingVerified && (
        <div className="rounded-xl border border-sc-gold-300 bg-sc-gold-50 px-4 py-3 flex items-start gap-3">
          <ShieldAlert className="size-5 text-sc-gold-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-label-sm font-semibold text-sc-gold-800">
              You are editing a verified academic record.
            </p>
            <p className="text-label-sm text-sc-gold-700 mt-0.5">
              Changes will update the student's official cumulative academic history and will be logged for audit purposes. Requires Registrar role or above.
            </p>
          </div>
        </div>
      )}

      {/* Row 1: School year + grade level */}
      <div className="grid grid-cols-2 gap-4">
        <FormInput
          label="School Year" required
          value={form.schoolYear} onChange={(v) => set("schoolYear", v)}
          placeholder="2023–2024"
        />
        <FormInput
          label="Grade Level"
          value={form.gradeLevel} onChange={(v) => set("gradeLevel", v)}
          placeholder="9 (or K, 1–12, DE)"
        />
      </div>

      {/* Row 2: Institution */}
      <div className="grid grid-cols-2 gap-4">
        <FormInput
          label="Institution Name"
          value={form.institutionName} onChange={(v) => set("institutionName", v)}
          placeholder="Eastern Florida State College"
        />
        <FormSelect
          label="Institution Type"
          value={form.institutionType} onChange={(v) => set("institutionType", v)}
          options={Object.entries(INSTITUTION_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          placeholder="— Select type —"
        />
      </div>

      {/* Row 3: Course name + code */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <FormInput
            label="Course Name" required
            value={form.courseName} onChange={(v) => set("courseName", v)}
            placeholder="Algebra I"
          />
        </div>
        <FormInput
          label="Course Code"
          value={form.courseCode} onChange={(v) => set("courseCode", v)}
          placeholder="ALG1"
        />
      </div>

      {/* Row 4: Subject + level + term */}
      <div className="grid grid-cols-3 gap-4">
        <FormSelect
          label="Subject Area"
          value={form.subjectArea} onChange={(v) => set("subjectArea", v)}
          options={SUBJECT_AREA_OPTIONS}
          placeholder="— Select —"
        />
        <FormSelect
          label="Course Level"
          value={form.courseLevel} onChange={(v) => set("courseLevel", v)}
          options={Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label }))}
          placeholder="— Select —"
        />
        <FormSelect
          label="Term"
          value={form.term} onChange={(v) => set("term", v)}
          options={Object.entries(TERM_LABELS).map(([value, label]) => ({ value, label }))}
          placeholder="— Not specified —"
        />
      </div>

      {/* Row 5: Grades */}
      <div>
        <p className="text-label-sm font-medium text-sc-navy mb-2">Grades</p>
        <div className="grid grid-cols-4 gap-3">
          <FormInput label="Semester 1" value={form.semester1Grade} onChange={(v) => set("semester1Grade", v)} placeholder="A" />
          <FormInput label="Semester 2" value={form.semester2Grade} onChange={(v) => set("semester2Grade", v)} placeholder="B+" />
          <FormInput label="Final Grade" value={form.finalGrade} onChange={(v) => set("finalGrade", v)} placeholder="A" />
          <FormInput label="Percentage" value={form.percentage} onChange={(v) => set("percentage", v)} placeholder="94.5" type="number" />
        </div>
      </div>

      {/* Row 6: Completion status */}
      <FormSelect
        label="Completion Status" required
        value={form.completionStatus} onChange={(v) => set("completionStatus", v as CourseCompletionStatus)}
        options={[
          { value: "completed",  label: "Completed" },
          { value: "failed",     label: "Failed" },
          { value: "withdrawn",  label: "Withdrawn" },
          { value: "incomplete", label: "Incomplete" },
          { value: "unknown",    label: "Unknown" },
        ]}
      />

      {/* Row 7: HS credit */}
      <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50/50 p-4 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.countsTowardHighSchoolCredit}
            onChange={(e) => set("countsTowardHighSchoolCredit", e.target.checked)}
            className="rounded border-sc-gray-300 accent-sc-teal"
          />
          <span className="text-label-sm font-medium text-sc-navy">Counts toward high school credit</span>
        </label>
        {form.countsTowardHighSchoolCredit && (
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              label="HS Credits Attempted"
              value={form.creditsAttempted} onChange={(v) => set("creditsAttempted", v)}
              placeholder="1.0" type="number"
            />
            <FormInput
              label="HS Credits Earned"
              value={form.creditsEarned} onChange={(v) => set("creditsEarned", v)}
              placeholder="1.0 (0 if failed)" type="number"
            />
          </div>
        )}
      </div>

      {/* Row 8: Source / institution credits (optional) */}
      <div>
        <button
          type="button"
          onClick={() => setShowSourceCredits((v) => !v)}
          className="flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-navy transition-colors"
        >
          {showSourceCredits ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          Institution-reported credit (dual enrollment / college)
        </button>
        {showSourceCredits && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <FormInput
              label="Credits Attempted"
              value={form.sourceCreditsAttempted} onChange={(v) => set("sourceCreditsAttempted", v)}
              placeholder="3.0" type="number"
            />
            <FormInput
              label="Credits Earned"
              value={form.sourceCreditsEarned} onChange={(v) => set("sourceCreditsEarned", v)}
              placeholder="3.0" type="number"
            />
            <FormSelect
              label="Credit Unit"
              value={form.sourceCreditUnit} onChange={(v) => set("sourceCreditUnit", v)}
              options={Object.entries(SOURCE_CREDIT_UNIT_LABELS).map(([value, label]) => ({ value, label }))}
              placeholder="— Select unit —"
            />
          </div>
        )}
      </div>

      {/* Row 9: Source document picker */}
      <div className="flex flex-col gap-1">
        <FieldLabel>Source Document</FieldLabel>
        {sourceDocuments.length === 0 ? (
          <p className="text-label-sm text-sc-gray-400 italic">
            No academic records uploaded for this student. Upload a transcript or record card first to link it here.
          </p>
        ) : (
          <select
            value={form.sourceDocumentId}
            onChange={(e) => set("sourceDocumentId", e.target.value)}
            className="rounded-lg border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/40 focus:border-sc-teal bg-white"
          >
            <option value="">— No source document —</option>
            {sourceDocuments.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        )}
        <p className="text-label-sm text-sc-gray-400">
          Link the uploaded transcript or record card that supports this course entry.
        </p>
      </div>

      {/* Source notes */}
      <div className="flex flex-col gap-1">
        <FieldLabel>Provenance / Notes</FieldLabel>
        <textarea
          value={form.sourceNotes}
          onChange={(e) => set("sourceNotes", e.target.value)}
          placeholder="Source transcript, manual entry notes, corrections…"
          rows={2}
          className="rounded-lg border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/40 focus:border-sc-teal placeholder:text-sc-gray-400 resize-none"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2 border-t border-sc-gray-100">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-4 py-2 text-label-md font-medium text-sc-gray hover:bg-sc-gray-100 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg px-4 py-2 text-label-md font-medium bg-sc-navy text-white hover:bg-sc-navy/90 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          {isEditingVerified ? "Save Verified Record" : "Save Record"}
        </button>
      </div>
    </form>
  );
}

// ── Duplicate warning modal ───────────────────────────────────────────────────

function DuplicateWarningModal({
  duplicates,
  onSaveAsSeparate,
  onGoBack,
  onCancel,
}: {
  duplicates: DuplicateMatch[];
  onSaveAsSeparate: () => void;
  onGoBack: () => void;
  onCancel: () => void;
}) {
  const strongCount = duplicates.filter((d) => d.matchLevel === "strong").length;
  const first = duplicates[0];

  function fmtGrade(r: DuplicateMatch["record"]) {
    return r.final_grade ?? r.semester_2_grade ?? r.semester_1_grade ?? "—";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sc-navy/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-sc-gray-100 w-full max-w-lg p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sc-gold-50 border border-sc-gold-200">
            <AlertTriangle className="size-5 text-sc-gold-700" />
          </div>
          <div>
            <h4 className="font-serif text-sc-navy font-semibold text-lg">Possible Duplicate Found</h4>
            <p className="text-label-sm text-sc-gray mt-0.5">
              {strongCount > 0 ? "A strongly matching record already exists." : "A possibly matching record was found."}
              {" "}Review before saving.
            </p>
          </div>
        </div>

        {/* Existing record details */}
        <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50/50 p-4 space-y-1">
          <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">Existing Record</p>
          <p className="font-medium text-sc-navy">{first.record.course_name}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-label-sm text-sc-gray">
            <span>{first.record.school_year}</span>
            {first.record.grade_level && <span>Grade {first.record.grade_level}</span>}
            {first.record.institution_name && <span>{first.record.institution_name}</span>}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-label-sm">
            <span className="text-sc-navy font-medium">Grade: {fmtGrade(first.record)}</span>
            {first.record.credits_earned != null && (
              <span className="text-sc-teal-700">HS Credit: {first.record.credits_earned}</span>
            )}
            <VerificationBadge status={first.record.verification_status as any} />
          </div>
          {duplicates.length > 1 && (
            <p className="text-label-sm text-sc-gray mt-1">
              +{duplicates.length - 1} more possible match{duplicates.length > 2 ? "es" : ""}
            </p>
          )}
        </div>

        <p className="text-label-sm text-sc-gray">
          If this is a legitimate retake, repeated course, or different term, you may save it as a separate record.
        </p>

        <div className="flex flex-col gap-2 pt-1 border-t border-sc-gray-100">
          <button
            onClick={onSaveAsSeparate}
            className="rounded-lg px-4 py-2 text-label-md font-medium bg-sc-navy text-white hover:bg-sc-navy/90 transition-colors"
          >
            Save as Separate Record
          </button>
          <button
            onClick={onGoBack}
            className="rounded-lg px-4 py-2 text-label-md font-medium border border-sc-gray-200 text-sc-navy hover:bg-sc-gray-50 transition-colors"
          >
            Go Back and Edit
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-label-md font-medium text-sc-gray hover:bg-sc-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Conflict warning modal ────────────────────────────────────────────────────

function ConflictWarningModal({
  conflicts,
  onSaveAsSeparate,
  onEditNew,
  onCancel,
}: {
  conflicts: ConflictMatch[];
  onSaveAsSeparate: () => void;
  onEditNew: () => void;
  onCancel: () => void;
}) {
  const first = conflicts[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-sc-navy/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-sc-rose-200 w-full max-w-lg p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sc-rose-50 border border-sc-rose-200">
            <ShieldAlert className="size-5 text-sc-rose" />
          </div>
          <div>
            <h4 className="font-serif text-sc-navy font-semibold text-lg">Conflict with Verified Record</h4>
            <p className="text-label-sm text-sc-gray mt-0.5">
              The new record disagrees with an existing verified record on material academic fields.
              The verified record has not been changed.
            </p>
          </div>
        </div>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-sc-teal-700/20 bg-sc-cream p-3 space-y-1.5">
            <p className="text-label-sm font-semibold text-sc-teal-700 uppercase tracking-wide">Existing Verified</p>
            <p className="font-medium text-sc-navy text-label-md">{first.record.course_name}</p>
            {first.conflictingFields.map((f) => (
              <div key={f.field}>
                <p className="text-label-sm text-sc-gray">{f.label}</p>
                <p className="text-label-sm font-medium text-sc-navy">{String(f.existing ?? "—")}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 p-3 space-y-1.5">
            <p className="text-label-sm font-semibold text-sc-rose uppercase tracking-wide">New Record</p>
            <p className="font-medium text-sc-navy text-label-md">{first.record.course_name}</p>
            {first.conflictingFields.map((f) => (
              <div key={f.field}>
                <p className="text-label-sm text-sc-gray">{f.label}</p>
                <p className="text-label-sm font-medium text-sc-navy">{String(f.proposed ?? "—")}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-label-sm text-sc-gray">
          To update the verified record, go back and edit the existing verified entry directly.
          You may also save the new record as a separate entry for review.
        </p>

        <div className="flex flex-col gap-2 pt-1 border-t border-sc-gray-100">
          <button
            onClick={onEditNew}
            className="rounded-lg px-4 py-2 text-label-md font-medium border border-sc-gray-200 text-sc-navy hover:bg-sc-gray-50 transition-colors"
          >
            Edit New Record
          </button>
          <button
            onClick={onSaveAsSeparate}
            className="rounded-lg px-4 py-2 text-label-md font-medium bg-sc-navy text-white hover:bg-sc-navy/90 transition-colors"
          >
            Save New as Separate Record
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-label-md font-medium text-sc-gray hover:bg-sc-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Year group ────────────────────────────────────────────────────────────────

function YearGroup({
  schoolYear,
  records,
  studentId,
  sourceDocuments,
  onEdit,
  onRefresh,
}: {
  schoolYear: string;
  records: CourseRecord[];
  studentId: string;
  sourceDocuments: SourceDocumentOption[];
  onEdit: (r: CourseRecord) => void;
  onRefresh: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const institutions = Array.from(new Set(records.map((r) => r.institution_name ?? "RLA")));

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-sc-gray-50/50 transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <p className="font-serif text-sc-navy font-semibold">{schoolYear}</p>
          <span className="text-label-sm text-sc-gray">{institutions.join(" · ")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-label-sm text-sc-gray">{records.length} course{records.length !== 1 ? "s" : ""}</span>
          {collapsed ? <ChevronDown className="size-4 text-sc-gray" /> : <ChevronUp className="size-4 text-sc-gray" />}
        </div>
      </button>
      {!collapsed && (
        <div className="px-5 divide-y divide-sc-gray-100">
          {records.map((r) => (
            <CourseRow
              key={r.id}
              record={r}
              studentId={studentId}
              sourceDocuments={sourceDocuments}
              onEdit={onEdit}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type FilterTab = "all" | "needs_review" | "verified" | "rejected";

interface Props {
  studentId: string;
  canManage: boolean;
}

export function AcademicAchievementRecord({ studentId, canManage }: Props) {
  const [records, setRecords]               = useState<CourseRecord[]>([]);
  const [sourceDocuments, setSourceDocs]    = useState<SourceDocumentOption[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState("");
  const [mode, setMode]                     = useState<"list" | "add" | "edit">("list");
  const [editTarget, setEditTarget]         = useState<CourseRecord | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [saveError, setSaveError]           = useState("");
  const [filterTab, setFilterTab]           = useState<FilterTab>("all");
  const [isEditingVerified, setIsEditingVerified] = useState(false);

  // Duplicate / conflict modal state
  const [pendingForm, setPendingForm]         = useState<CourseFormValues | null>(null);
  const [showDupWarning, setShowDupWarning]   = useState(false);
  const [showConflict, setShowConflict]       = useState(false);
  const [dupMatches, setDupMatches]           = useState<DuplicateMatch[]>([]);
  const [conflictMatches, setConflictMatches] = useState<ConflictMatch[]>([]);

  // AI import state
  const [importJobs, setImportJobs]             = useState<ImportJob[]>([]);
  const [analyzing, setAnalyzing]               = useState(false);
  const [analyzeError, setAnalyzeError]         = useState("");
  const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
  const [priorImportWarning, setPriorImportWarning] = useState<ImportJob | null>(null);
  const [pendingAnalyzeDocId, setPendingAnalyzeDocId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [recordsResult, docsResult, jobsResult] = await Promise.all([
      getCourseRecords(studentId),
      getSourceDocumentsForStudent(studentId),
      getImportJobs(studentId),
    ]);
    if (recordsResult.success) {
      setRecords(recordsResult.data);
    } else {
      setError(recordsResult.error ?? "Failed to load course records.");
    }
    if (docsResult.success) setSourceDocs(docsResult.data);
    if (jobsResult.success)  setImportJobs(jobsResult.data);
    setLoading(false);
  }, [studentId]);

  async function handleAnalyze(documentId: string) {
    setAnalyzeError("");
    // Idempotency check
    const priorCheck = await checkPriorImport(documentId, studentId);
    if (priorCheck.success && priorCheck.data?.status === "completed") {
      setPriorImportWarning(priorCheck.data);
      setPendingAnalyzeDocId(documentId);
      return;
    }
    await doAnalyze(documentId);
  }

  async function doAnalyze(documentId: string) {
    setAnalyzing(true);
    setAnalyzeError("");
    setPriorImportWarning(null);
    setPendingAnalyzeDocId(null);
    const result = await requestAcademicImport(studentId, documentId);
    if (result.success) {
      setReviewingImportId(result.data.importId);
      await load();
    } else {
      setAnalyzeError(result.error ?? "Analysis failed.");
    }
    setAnalyzing(false);
  }

  useEffect(() => { load(); }, [load]);

  function startAdd() {
    setEditTarget(null);
    setIsEditingVerified(false);
    setMode("add");
    setSaveError("");
  }

  function startEdit(r: CourseRecord) {
    setEditTarget(r);
    setIsEditingVerified(r.verification_status === "verified");
    setMode("edit");
    setSaveError("");
  }

  function cancelForm() {
    setMode("list");
    setEditTarget(null);
    setIsEditingVerified(false);
    setSaveError("");
  }

  async function runDuplicateCheck(
    form: CourseFormValues,
    excludeId?: string
  ): Promise<{ duplicates: DuplicateMatch[]; conflicts: ConflictMatch[] } | null> {
    const result = await checkCourseRecordDuplicates(
      studentId,
      {
        school_year:                       form.schoolYear,
        institution_name:                  form.institutionName || null,
        course_name:                       form.courseName,
        course_code:                       form.courseCode || null,
        term:                              form.term || null,
        grade_level:                       form.gradeLevel || null,
        course_level:                      form.courseLevel || null,
        final_grade:                       form.finalGrade || null,
        semester_1_grade:                  form.semester1Grade || null,
        semester_2_grade:                  form.semester2Grade || null,
        percentage:                        form.percentage ? parseFloat(form.percentage) : null,
        credits_earned:                    form.creditsEarned ? parseFloat(form.creditsEarned) : null,
        credits_attempted:                 form.creditsAttempted ? parseFloat(form.creditsAttempted) : null,
        source_credits_attempted:          form.sourceCreditsAttempted ? parseFloat(form.sourceCreditsAttempted) : null,
        source_credits_earned:             form.sourceCreditsEarned ? parseFloat(form.sourceCreditsEarned) : null,
        source_credit_unit:                form.sourceCreditUnit || null,
        completion_status:                 form.completionStatus,
        counts_toward_high_school_credit:  form.countsTowardHighSchoolCredit,
        verification_status:               "needs_review",
      },
      excludeId
    );
    if (!result.success) return null;
    return result.data;
  }

  async function doAdd(form: CourseFormValues) {
    setSaving(true);
    setSaveError("");
    const payload = { studentId, ...formToPayload(form) };
    const result = await addCourseRecord(payload);
    if (result.success) {
      setMode("list");
      setShowDupWarning(false);
      setShowConflict(false);
      await load();
    } else {
      setSaveError(result.error ?? "Save failed.");
    }
    setSaving(false);
  }

  async function doEdit(form: CourseFormValues) {
    if (!editTarget) return;
    setSaving(true);
    setSaveError("");
    const payload = formToPayload(form) as UpdateCourseRecordPayload;
    const action = isEditingVerified ? updateVerifiedCourseRecord : updateCourseRecord;
    const result = await action(editTarget.id, editTarget.student_id, payload);
    if (result.success) {
      setMode("list");
      setShowDupWarning(false);
      setShowConflict(false);
      setIsEditingVerified(false);
      await load();
    } else {
      setSaveError(result.error ?? "Save failed.");
    }
    setSaving(false);
  }

  async function handleAdd(form: CourseFormValues) {
    const checks = await runDuplicateCheck(form);
    if (checks) {
      if (checks.conflicts.length > 0) {
        setPendingForm(form);
        setConflictMatches(checks.conflicts);
        setShowConflict(true);
        return;
      }
      if (checks.duplicates.length > 0) {
        setPendingForm(form);
        setDupMatches(checks.duplicates);
        setShowDupWarning(true);
        return;
      }
    }
    await doAdd(form);
  }

  async function handleEdit(form: CourseFormValues) {
    if (!editTarget) return;
    // For verified record edits, skip duplicate check (staff is knowingly editing)
    if (isEditingVerified) {
      await doEdit(form);
      return;
    }
    const checks = await runDuplicateCheck(form, editTarget.id);
    if (checks) {
      if (checks.conflicts.length > 0) {
        setPendingForm(form);
        setConflictMatches(checks.conflicts);
        setShowConflict(true);
        return;
      }
      if (checks.duplicates.length > 0) {
        setPendingForm(form);
        setDupMatches(checks.duplicates);
        setShowDupWarning(true);
        return;
      }
    }
    await doEdit(form);
  }

  // Group and filter records
  const filteredRecords = records.filter((r) => {
    if (filterTab === "all") return true;
    return r.verification_status === filterTab;
  });

  const groups = filteredRecords.reduce<Record<string, CourseRecord[]>>((acc, r) => {
    (acc[r.school_year] = acc[r.school_year] ?? []).push(r);
    return acc;
  }, {});
  const sortedYears = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  const isForm = mode === "add" || mode === "edit";

  const needsReviewCount = records.filter((r) => r.verification_status === "needs_review").length;
  const verifiedCount    = records.filter((r) => r.verification_status === "verified").length;
  const rejectedCount    = records.filter((r) => r.verification_status === "rejected").length;

  // If reviewing an import, show that screen instead
  if (reviewingImportId) {
    return (
      <ImportReviewScreen
        importId={reviewingImportId}
        studentId={studentId}
        onClose={() => { setReviewingImportId(null); load(); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Duplicate warning modal */}
      {showDupWarning && dupMatches.length > 0 && pendingForm && (
        <DuplicateWarningModal
          duplicates={dupMatches}
          onSaveAsSeparate={async () => {
            setShowDupWarning(false);
            if (mode === "add") await doAdd(pendingForm);
            else await doEdit(pendingForm);
          }}
          onGoBack={() => { setShowDupWarning(false); setPendingForm(null); }}
          onCancel={() => { setShowDupWarning(false); setPendingForm(null); cancelForm(); }}
        />
      )}

      {/* Conflict warning modal */}
      {showConflict && conflictMatches.length > 0 && pendingForm && (
        <ConflictWarningModal
          conflicts={conflictMatches}
          onSaveAsSeparate={async () => {
            setShowConflict(false);
            if (mode === "add") await doAdd(pendingForm);
            else await doEdit(pendingForm);
          }}
          onEditNew={() => { setShowConflict(false); setPendingForm(null); }}
          onCancel={() => { setShowConflict(false); setPendingForm(null); cancelForm(); }}
        />
      )}

      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookMarked className="size-5 text-sc-navy/60" />
          <h3 className="font-serif text-heading-2 text-sc-navy">Academic Achievement Record</h3>
        </div>
        {canManage && !isForm && (
          <div className="flex items-center gap-2">
            {/* Analyze button — shown when academic docs are available */}
            {sourceDocuments.length > 0 && (
              <div className="relative">
                <select
                  disabled={analyzing}
                  onChange={async (e) => {
                    if (!e.target.value) return;
                    await handleAnalyze(e.target.value);
                    e.target.value = "";
                  }}
                  className="appearance-none rounded-lg pl-8 pr-3 py-1.5 text-label-sm font-medium border border-sc-teal-700/30 text-sc-teal-700 bg-sc-cream hover:bg-sc-teal/10 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <option value="">
                    {analyzing ? "Analyzing…" : "Analyze Academic Record"}
                  </option>
                  {sourceDocuments.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
                <Sparkles className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-sc-teal-700 pointer-events-none" />
              </div>
            )}
            <button
              onClick={startAdd}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-label-sm font-medium bg-sc-navy text-white hover:bg-sc-navy/90 transition-colors"
            >
              <Plus className="size-3.5" />
              Add Historical Course
            </button>
          </div>
        )}
      </div>

      {/* Prior import warning */}
      {priorImportWarning && pendingAnalyzeDocId && (
        <div className="rounded-xl border border-sc-gold-300 bg-sc-gold-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="size-5 text-sc-gold-700 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-label-sm font-semibold text-sc-gold-800">This academic record has already been analyzed.</p>
            <p className="text-label-sm text-sc-gold-700 mt-0.5">
              Prior import: {priorImportWarning.course_count ?? 0} courses · {new Date(priorImportWarning.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setReviewingImportId(priorImportWarning.id)}
              className="rounded-lg px-3 py-1.5 text-label-sm font-medium border border-sc-gold-300 text-sc-gold-800 hover:bg-sc-gold-100"
            >
              Open Prior Import
            </button>
            <button
              onClick={() => doAnalyze(pendingAnalyzeDocId)}
              className="rounded-lg px-3 py-1.5 text-label-sm font-medium bg-sc-navy text-white hover:bg-sc-navy/90"
            >
              Re-analyze
            </button>
            <button
              onClick={() => { setPriorImportWarning(null); setPendingAnalyzeDocId(null); }}
              className="rounded-lg px-3 py-1.5 text-label-sm font-medium text-sc-gray hover:bg-sc-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Analyze error */}
      {analyzeError && (
        <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose-700 flex items-start gap-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>{analyzeError}</span>
        </div>
      )}

      {/* Import jobs list — recent imports that staff can open for review */}
      {!isForm && importJobs.length > 0 && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 space-y-2">
          <p className="text-label-sm font-medium text-sc-navy">Import History</p>
          {importJobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-sc-gray-100 last:border-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="size-4 text-sc-gray shrink-0" />
                <span className="text-label-sm text-sc-navy truncate">{job.document_title ?? "Academic Record"}</span>
                <span className={`text-label-sm ${job.status === "failed" ? "text-sc-rose" : job.status === "reviewed" ? "text-sc-teal-700" : "text-sc-gold-700"}`}>
                  · {job.status}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-label-sm text-sc-gray-400">{new Date(job.created_at).toLocaleDateString()}</span>
                {(job.status === "completed" || job.status === "reviewed") && (
                  <button
                    onClick={() => setReviewingImportId(job.id)}
                    className="text-label-sm text-sc-teal-700 hover:underline"
                  >
                    Review →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form panel */}
      {isForm && (
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-6">
          <h4 className="font-serif text-sc-navy text-lg mb-4">
            {mode === "add" ? "Add Historical Course" : "Edit Course Record"}
          </h4>
          {saveError && (
            <div className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 mb-4 text-label-sm text-sc-rose-700">
              {saveError}
            </div>
          )}
          <CourseForm
            initial={mode === "edit" && editTarget ? recordToForm(editTarget) : EMPTY_FORM}
            onSave={mode === "add" ? handleAdd : handleEdit}
            onCancel={cancelForm}
            saving={saving}
            sourceDocuments={sourceDocuments}
            isEditingVerified={isEditingVerified}
          />
        </div>
      )}

      {/* Loading */}
      {loading && !isForm && (
        <div className="flex items-center justify-center py-10 text-sc-gray">
          <Loader2 className="size-5 animate-spin mr-2" /> Loading…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose-700">
          {error}
        </div>
      )}

      {/* Credit summary + filter tabs */}
      {!loading && !isForm && records.length > 0 && (
        <>
          <CreditSummary records={records} />

          {/* Filter tabs */}
          <div className="flex gap-1 border-b border-sc-gray-100 pb-0">
            {(
              [
                { key: "all",          label: `All (${records.length})` },
                { key: "needs_review", label: `Needs Review (${needsReviewCount})` },
                { key: "verified",     label: `Verified (${verifiedCount})` },
                { key: "rejected",     label: `Rejected (${rejectedCount})` },
              ] as { key: FilterTab; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterTab(key)}
                className={`px-3 py-2 text-label-sm font-medium rounded-t-lg transition-colors ${
                  filterTab === key
                    ? "text-sc-navy border-b-2 border-sc-navy"
                    : "text-sc-gray hover:text-sc-navy"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Empty state */}
      {!loading && !isForm && records.length === 0 && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-10 text-center">
          <BookMarked className="size-10 mx-auto mb-3 text-sc-gray-300" />
          <p className="font-serif text-heading-2 text-sc-navy">No historical course records</p>
          <p className="text-body-md text-sc-gray mt-1">
            Add historical courses from transcripts and prior schools to track the full academic record.
          </p>
          {canManage && (
            <button
              onClick={startAdd}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-label-sm font-medium bg-sc-navy text-white hover:bg-sc-navy/90 transition-colors"
            >
              <Plus className="size-3.5" />
              Add First Course
            </button>
          )}
        </div>
      )}

      {/* Filtered empty state */}
      {!loading && !isForm && records.length > 0 && filteredRecords.length === 0 && (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-8 text-center">
          <p className="text-sc-gray text-label-md">No {filterTab.replace("_", " ")} records.</p>
        </div>
      )}

      {/* Year groups */}
      {!loading && !isForm && sortedYears.length > 0 && (
        <div className="space-y-3">
          {sortedYears.map((year) => (
            <YearGroup
              key={year}
              schoolYear={year}
              records={groups[year]}
              studentId={studentId}
              sourceDocuments={sourceDocuments}
              onEdit={startEdit}
              onRefresh={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
