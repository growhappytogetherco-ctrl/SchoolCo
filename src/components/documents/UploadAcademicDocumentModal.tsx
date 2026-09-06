"use client";

import { useState, useTransition, useRef } from "react";
import { X, Upload, Link2, AlertTriangle, Loader2, CheckCircle, FileText } from "lucide-react";
import {
  uploadAcademicDocumentFile,
  uploadAcademicDocumentLink,
  checkAcademicDocumentDuplicate,
  ACADEMIC_RECORD_TYPE_LABELS,
  ACADEMIC_REPORTING_PERIOD_LABELS,
  type AcademicRecordType,
  type AcademicReportingPeriod,
  type AcademicRecordSource,
} from "@/app/actions/documents";

interface Props {
  studentId:   string;
  onClose:     () => void;
  onSuccess:   (keepOpen: boolean) => void;
}

const RECORD_TYPES: AcademicRecordType[] = [
  "progress_report", "report_card", "transcript",
  "academic_summary", "assessment_report", "other_academic",
];

const REPORTING_PERIODS: AcademicReportingPeriod[] = [
  "q1", "q2", "q3", "q4",
  "semester_1", "semester_2",
  "full_year", "mid_year", "beginning_of_year", "end_of_year",
  "other",
];

const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg", "image/png", "image/heic", "image/heif",
].join(",");

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB — matches work sample limit

const SOURCE_OPTIONS: { value: AcademicRecordSource; label: string }[] = [
  { value: "legacy_upload",      label: "Legacy Uploaded Record" },
  { value: "external_school",    label: "External School Record" },
  { value: "schoolco_generated", label: "SchoolCo Generated Report" },
];

function schoolYearOptions(): string[] {
  const now = new Date().getFullYear();
  const years: string[] = [];
  for (let y = now + 2; y >= now - 6; y--) {
    years.push(`${y - 1}–${y}`);
  }
  return years;
}

const SCHOOL_YEARS = schoolYearOptions();
// Default: one year ago (likely the most common for historical uploads)
const DEFAULT_YEAR = SCHOOL_YEARS[2] ?? "";

export function UploadAcademicDocumentModal({ studentId, onClose, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition();
  const [mode, setMode]             = useState<"file" | "link">("file");
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState<string | null>(null);
  const [dupWarning, setDupWarning] = useState<string | null>(null);
  const [dupChecked, setDupChecked] = useState(false);
  const fileRef                     = useRef<HTMLInputElement>(null);

  // Form state
  const [recordType, setRecordType] = useState<AcademicRecordType>("progress_report");
  const [schoolYear, setSchoolYear] = useState(DEFAULT_YEAR);
  const [period, setPeriod]         = useState<AcademicReportingPeriod | "">("");
  const [title, setTitle]           = useState("");
  const [recordDate, setRecordDate] = useState("");
  const [source, setSource]         = useState<AcademicRecordSource>("legacy_upload");
  const [parentVisible, setParentVisible] = useState(false);
  const [selectedFile, setSelectedFile]   = useState<File | null>(null);
  const [driveUrl, setDriveUrl]     = useState("");
  const [externalUrl, setExtUrl]    = useState("");

  const reportingPeriod = period === "" ? null : (period as AcademicReportingPeriod);

  function autoFillTitle() {
    if (title) return;
    const parts = [
      ACADEMIC_RECORD_TYPE_LABELS[recordType],
      period ? ACADEMIC_REPORTING_PERIOD_LABELS[period as AcademicReportingPeriod] : "",
      schoolYear,
    ].filter(Boolean);
    setTitle(parts.join(" — "));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setSelectedFile(f);
    setDupWarning(null);
    setDupChecked(false);
    if (f && !title) {
      // Don't auto-fill from filename — use metadata instead
      autoFillTitle();
    }
  }

  async function runDupCheck() {
    if (dupChecked || !reportingPeriod || !schoolYear) return;
    setDupChecked(true);
    const result = await checkAcademicDocumentDuplicate(studentId, recordType, schoolYear, reportingPeriod);
    if (result.success && result.data.hasDuplicate) {
      setDupWarning(`A similar ${ACADEMIC_RECORD_TYPE_LABELS[recordType]} already exists for this student: "${result.data.existingTitle}". You can still upload — both records will be kept.`);
    }
  }

  function resetForNextUpload() {
    setSelectedFile(null);
    setDupWarning(null);
    setDupChecked(false);
    setError(null);
    setSuccess(null);
    setTitle("");
    setRecordDate("");
    setDriveUrl("");
    setExtUrl("");
    setPeriod("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSubmit(uploadAnother: boolean) {
    setError(null);
    setSuccess(null);

    if (!title.trim())      { setError("Title is required."); return; }
    if (!schoolYear.trim()) { setError("School year is required."); return; }

    if (mode === "file") {
      if (!selectedFile) { setError("Please choose a file to upload."); return; }
      if (selectedFile.size > MAX_FILE_BYTES) {
        setError(`File is too large (${(selectedFile.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 10 MB.`);
        return;
      }
    } else {
      if (!driveUrl.trim() && !externalUrl.trim()) {
        setError("Paste a Google Drive link or external URL.");
        return;
      }
    }

    startTransition(async () => {
      try {
        if (mode === "file" && selectedFile) {
          const arrayBuf = await selectedFile.arrayBuffer();
          const base64   = Buffer.from(arrayBuf).toString("base64");

          const result = await uploadAcademicDocumentFile({
            studentId,
            title:           title.trim(),
            recordType,
            schoolYear:      schoolYear.trim(),
            reportingPeriod,
            recordDate:      recordDate || null,
            recordSource:    source,
            parentVisible,
            fileBase64:      base64,
            fileName:        selectedFile.name,
            mimeType:        selectedFile.type || "application/octet-stream",
          });

          if (!result.success) { setError(result.error ?? "Upload failed."); return; }
          setSuccess("Academic record uploaded successfully.");
        } else {
          const result = await uploadAcademicDocumentLink({
            studentId,
            title:           title.trim(),
            recordType,
            schoolYear:      schoolYear.trim(),
            reportingPeriod,
            recordDate:      recordDate || null,
            recordSource:    source,
            parentVisible,
            googleDriveUrl:  driveUrl.trim() || undefined,
            externalUrl:     externalUrl.trim() || undefined,
          });

          if (!result.success) { setError(result.error ?? "Save failed."); return; }
          setSuccess("Academic record saved successfully.");
        }

        onSuccess(uploadAnother);
        if (uploadAnother) {
          resetForNextUpload();
        }
      } catch (e) {
        setError(String(e));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[92vh] overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sc-gray-100 flex-shrink-0">
          <div>
            <p className="font-serif text-heading-2 text-sc-navy">Upload Academic Record</p>
            <p className="text-xs text-sc-gray mt-0.5">File saves to the student&apos;s existing Drive folder — no duplicate created.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-sc-gray hover:text-sc-navy hover:bg-sc-gray-50 transition-colors">
            <X className="size-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

          {/* ── Record Type ─────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-label-sm font-medium text-sc-navy">Record Type *</label>
            <select
              value={recordType}
              onChange={(e) => { setRecordType(e.target.value as AcademicRecordType); setTitle(""); setDupChecked(false); }}
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            >
              {RECORD_TYPES.map((t) => (
                <option key={t} value={t}>{ACADEMIC_RECORD_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* ── School Year + Reporting Period (side by side) ───────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-label-sm font-medium text-sc-navy">School Year *</label>
              <select
                value={schoolYear}
                onChange={(e) => { setSchoolYear(e.target.value); setDupChecked(false); }}
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
              >
                {SCHOOL_YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-label-sm font-medium text-sc-navy">
                Period
                <span className="ml-1 font-normal text-sc-gray text-xs">(opt.)</span>
              </label>
              <select
                value={period}
                onChange={(e) => { setPeriod(e.target.value as AcademicReportingPeriod | ""); setDupChecked(false); }}
                onBlur={runDupCheck}
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
              >
                <option value="">— None —</option>
                {REPORTING_PERIODS.map((p) => (
                  <option key={p} value={p}>{ACADEMIC_REPORTING_PERIOD_LABELS[p]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Title ───────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-label-sm font-medium text-sc-navy">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onFocus={autoFillTitle}
              placeholder="e.g. Progress Report — Q2 2025–2026"
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            />
          </div>

          {/* ── Record Date ─────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-label-sm font-medium text-sc-navy">
              Record Date
              <span className="ml-1 font-normal text-sc-gray text-xs">(optional)</span>
            </label>
            <input
              type="date"
              value={recordDate}
              onChange={(e) => setRecordDate(e.target.value)}
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            />
          </div>

          {/* ── Mode toggle ─────────────────────────────────────────── */}
          <div className="flex rounded-xl border border-sc-gray-200 p-1 bg-sc-gray-50 gap-1">
            <button
              onClick={() => setMode("file")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-label-sm font-medium transition-colors ${
                mode === "file" ? "bg-white shadow-sm text-sc-navy" : "text-sc-gray hover:text-sc-navy"
              }`}
            >
              <Upload className="size-3.5" /> Upload File
            </button>
            <button
              onClick={() => setMode("link")}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-label-sm font-medium transition-colors ${
                mode === "link" ? "bg-white shadow-sm text-sc-navy" : "text-sc-gray hover:text-sc-navy"
              }`}
            >
              <Link2 className="size-3.5" /> Add Existing Link
            </button>
          </div>

          {/* ── File upload area ─────────────────────────────────────── */}
          {mode === "file" && (
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_MIME_TYPES}
                onChange={handleFileChange}
                className="hidden"
              />
              {!selectedFile ? (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-sc-gray-200 p-6 text-center hover:border-sc-teal/50 hover:bg-sc-teal/5 transition-colors"
                >
                  <Upload className="size-7 text-sc-gray-300 mx-auto mb-2" />
                  <p className="text-label-sm font-medium text-sc-navy">Choose file</p>
                  <p className="text-xs text-sc-gray mt-1">PDF, Word, or image · max 10 MB</p>
                </button>
              ) : (
                <div className="rounded-xl border border-sc-teal/20 bg-sc-teal/5 px-4 py-3 flex items-center gap-3">
                  <FileText className="size-5 text-sc-teal flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-label-sm font-medium text-sc-navy truncate">{selectedFile.name}</p>
                    <p className="text-xs text-sc-gray">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button
                    onClick={() => { setSelectedFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="text-xs text-sc-gray hover:text-sc-rose transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}
              <p className="text-xs text-sc-gray">
                File will be saved to the student&apos;s <span className="font-medium">02 Academic Records</span> Drive folder automatically.
              </p>
            </div>
          )}

          {/* ── Link mode ────────────────────────────────────────────── */}
          {mode === "link" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-label-sm font-medium text-sc-navy">Google Drive Link</label>
                <input
                  type="url"
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/…"
                  className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-label-sm font-medium text-sc-navy">
                  Or External URL
                  <span className="ml-1 font-normal text-sc-gray text-xs">(if not in Drive)</span>
                </label>
                <input
                  type="url"
                  value={externalUrl}
                  onChange={(e) => setExtUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
                />
              </div>
            </div>
          )}

          {/* ── Source ───────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-label-sm font-medium text-sc-navy">Record Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as AcademicRecordSource)}
              className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal/30"
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* ── Parent Visibility ─────────────────────────────────────── */}
          <label className="flex items-start gap-3 rounded-xl border border-sc-gray-100 p-3 cursor-pointer hover:bg-sc-gray-50 transition-colors">
            <input
              type="checkbox"
              checked={parentVisible}
              onChange={(e) => setParentVisible(e.target.checked)}
              className="mt-0.5 accent-sc-teal"
            />
            <div>
              <p className="text-label-sm font-medium text-sc-navy">Visible to Parent</p>
              <p className="text-xs text-sc-gray mt-0.5">Parent can view this from the portal. Default: staff only.</p>
            </div>
          </label>

          {/* ── Duplicate warning ─────────────────────────────────────── */}
          {dupWarning && (
            <div className="rounded-xl border border-sc-gold-300 bg-sc-gold-50 p-3 flex items-start gap-2">
              <AlertTriangle className="size-4 text-sc-gold-700 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-sc-gold-800">{dupWarning}</p>
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────────── */}
          {error && (
            <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 p-3 flex items-start gap-2">
              <AlertTriangle className="size-4 text-sc-rose mt-0.5 flex-shrink-0" />
              <p className="text-xs text-sc-rose">{error}</p>
            </div>
          )}

          {/* ── Success ──────────────────────────────────────────────── */}
          {success && !error && (
            <div className="rounded-xl border border-sc-teal/20 bg-sc-teal/5 p-3 flex items-center gap-2">
              <CheckCircle className="size-4 text-sc-teal flex-shrink-0" />
              <p className="text-xs text-sc-teal-700 font-medium">{success}</p>
            </div>
          )}

          {/* ── Uploading indicator ───────────────────────────────────── */}
          {isPending && (
            <div className="flex items-center gap-2 text-label-sm text-sc-gray">
              <Loader2 className="size-4 animate-spin" />
              Uploading to Google Drive…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-sc-gray-100 flex flex-wrap gap-2 justify-between flex-shrink-0">
          <button
            onClick={() => handleSubmit(true)}
            disabled={isPending}
            className="rounded-lg border border-sc-gray-200 bg-white px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 className="size-4 animate-spin inline" /> : "Upload + Add Another"}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isPending}
              className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50 disabled:opacity-40 transition-colors"
            >
              {success ? "Done" : "Cancel"}
            </button>
            <button
              onClick={() => handleSubmit(false)}
              disabled={isPending}
              className="rounded-lg bg-sc-teal px-4 py-2 text-label-sm text-white hover:bg-sc-teal-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {isPending
                ? <><Loader2 className="size-3.5 animate-spin" /> Uploading…</>
                : mode === "file" ? "Upload Record" : "Save Record"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
