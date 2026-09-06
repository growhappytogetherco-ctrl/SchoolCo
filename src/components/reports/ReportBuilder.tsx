"use client";

// Staff-facing report builder embedded in the Grades tab.
// Step 1: pick report type + period
// Step 2: add comments
// Step 3: preview/issue

import { useState, useEffect, useTransition } from "react";
import { FileText, ChevronDown, ChevronUp, Loader2, ExternalLink, CheckCircle } from "lucide-react";
import {
  previewStudentReport,
  saveReportDraft,
  updateReportComments,
  issueStudentReport,
  getStudentReportList,
  type ReportType,
  type ReportPreviewData,
  type ReportListItem,
} from "@/app/actions/reports";
import type { GradePeriodInfo } from "@/app/actions/studentGrades";

interface Props {
  studentId: string;
  periods: GradePeriodInfo[];      // quarters (is_assignment_period=true)
  allPeriods: GradePeriodInfo[];   // includes semesters
  isAdmin: boolean;
}

const REPORT_TYPE_OPTIONS: { value: ReportType; label: string; description: string }[] = [
  { value: "progress", label: "Progress Report",       description: "Mid-period snapshot of current grades" },
  { value: "quarter",  label: "Quarter Report Card",   description: "End-of-quarter academic summary" },
  { value: "semester", label: "Semester Report Card",  description: "Full semester summary with Q1 + Q2 breakdown" },
];

function statusBadge(status: string) {
  if (status === "issued")     return <span className="rounded-full bg-sc-teal/10 border border-sc-teal/20 px-2 py-0.5 text-label-sm text-sc-teal-700 font-medium">Issued</span>;
  if (status === "draft")      return <span className="rounded-full bg-sc-gold-50 border border-sc-gold-300 px-2 py-0.5 text-label-sm text-sc-gold-800 font-medium">Draft</span>;
  if (status === "superseded") return <span className="rounded-full bg-sc-gray-100 border border-sc-gray-200 px-2 py-0.5 text-label-sm text-sc-gray font-medium">Superseded</span>;
  return null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ReportBuilder({ studentId, periods, allPeriods, isAdmin }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("progress");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [generalComment, setGeneralComment] = useState("");
  const [courseComments, setCourseComments] = useState<Record<string, string>>({});
  const [previewData, setPreviewData] = useState<ReportPreviewData | null>(null);
  const [reportList, setReportList] = useState<ReportListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [step, setStep] = useState<"setup" | "comments" | "issued">("setup");
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Available periods depend on report type
  const availablePeriods = (() => {
    if (reportType === "semester") {
      // Semester periods: those with is_assignment_period = false that have children
      return allPeriods.filter((p) => p.period_type === "semester" || !periods.find((q) => q.id === p.id));
    }
    return periods; // quarters for progress + quarter reports
  })();

  useEffect(() => {
    // Default to first available period
    if (availablePeriods.length > 0 && !availablePeriods.find((p) => p.id === selectedPeriodId)) {
      setSelectedPeriodId(availablePeriods[0]?.id ?? "");
    }
  }, [reportType, availablePeriods]);

  useEffect(() => {
    if (!expanded) return;
    setLoadingList(true);
    getStudentReportList(studentId)
      .then((r) => { if (r.success) setReportList(r.data); })
      .finally(() => setLoadingList(false));
  }, [studentId, expanded]);

  function handlePreview() {
    if (!selectedPeriodId) { setError("Select a period."); return; }
    setError("");
    startTransition(async () => {
      const result = await previewStudentReport(studentId, selectedPeriodId, reportType);
      if (!result.success) { setError(result.error ?? "Preview failed."); return; }
      setPreviewData(result.data);
      // Pre-fill comment fields from preview
      const newComments: Record<string, string> = {};
      for (const c of result.data.courses) newComments[c.courseSectionId] = "";
      setCourseComments(newComments);
      setStep("comments");
    });
  }

  function handleSaveDraft() {
    setError("");
    startTransition(async () => {
      const result = await saveReportDraft(studentId, selectedPeriodId, reportType, generalComment || null, courseComments);
      if (!result.success) { setError(result.error ?? "Failed to save draft."); return; }
      setCurrentReportId(result.data.reportId);
      setSuccessMsg("Draft saved.");
      // Refresh list
      const listResult = await getStudentReportList(studentId);
      if (listResult.success) setReportList(listResult.data);
    });
  }

  function handleIssue() {
    setError("");
    startTransition(async () => {
      // Save/update draft first, then issue
      const draftResult = await saveReportDraft(studentId, selectedPeriodId, reportType, generalComment || null, courseComments);
      if (!draftResult.success) { setError(draftResult.error ?? "Failed to save report."); return; }
      const rid = draftResult.data.reportId;
      // Update comments on the saved draft
      await updateReportComments(rid, generalComment || null, courseComments);
      const issueResult = await issueStudentReport(rid);
      if (!issueResult.success) { setError(issueResult.error ?? "Failed to issue report."); return; }
      setCurrentReportId(rid);
      setStep("issued");
      setSuccessMsg("Report issued successfully.");
      const listResult = await getStudentReportList(studentId);
      if (listResult.success) setReportList(listResult.data);
    });
  }

  function handleReset() {
    setStep("setup");
    setPreviewData(null);
    setCurrentReportId(null);
    setGeneralComment("");
    setCourseComments({});
    setError("");
    setSuccessMsg("");
  }

  return (
    <div className="space-y-4">
      {/* ── Section header ─────────────────────────────────────── */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between rounded-xl border border-sc-gray-100 bg-white px-4 py-3 text-left shadow-sm hover:bg-sc-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-sc-teal" />
          <span className="font-medium text-sc-navy">Reports</span>
          {reportList.length > 0 && (
            <span className="rounded-full bg-sc-navy/10 px-2 py-0.5 text-label-sm text-sc-navy font-medium">{reportList.filter((r) => r.status !== "superseded").length}</span>
          )}
        </div>
        {expanded ? <ChevronUp className="size-4 text-sc-gray" /> : <ChevronDown className="size-4 text-sc-gray" />}
      </button>

      {expanded && (
        <div className="space-y-5">

          {/* ── Report history ─────────────────────────────────── */}
          {loadingList && (
            <div className="flex items-center gap-2 text-label-sm text-sc-gray py-2 px-1">
              <Loader2 className="size-3.5 animate-spin" /> Loading reports…
            </div>
          )}
          {!loadingList && reportList.length > 0 && (
            <div className="rounded-xl border border-sc-gray-100 bg-white divide-y divide-sc-gray-100 overflow-hidden">
              {reportList.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-label-sm font-medium text-sc-navy">{r.reportTypeLabel}</p>
                    <p className="text-label-sm text-sc-gray mt-0.5">
                      {r.schoolYearLabel}
                      {r.issuedAt ? ` · Issued ${fmtDate(r.issuedAt)}` : ` · Created ${fmtDate(r.createdAt)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(r.status)}
                    <a
                      href={`/print/report/${r.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-label-sm text-sc-teal hover:underline"
                    >
                      View <ExternalLink className="size-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Generator ──────────────────────────────────────── */}
          <div className="rounded-xl border border-sc-teal/20 bg-sc-teal/5 p-4 space-y-4">
            <p className="text-label-sm font-semibold text-sc-navy">Generate New Report</p>

            {step === "setup" && (
              <div className="space-y-4">
                {/* Report type */}
                <div className="space-y-2">
                  <label className="text-label-sm font-medium text-sc-navy">Report Type</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {REPORT_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setReportType(opt.value)}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          reportType === opt.value
                            ? "border-sc-teal bg-white text-sc-navy"
                            : "border-sc-gray-200 bg-white text-sc-gray hover:border-sc-gray-300"
                        }`}
                      >
                        <p className="text-label-sm font-medium">{opt.label}</p>
                        <p className="text-xs text-sc-gray mt-0.5">{opt.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Period selector */}
                <div className="space-y-1.5">
                  <label className="text-label-sm font-medium text-sc-navy">Period</label>
                  {availablePeriods.length === 0 ? (
                    <p className="text-label-sm text-sc-gray italic">No periods available for this report type.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availablePeriods.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedPeriodId(p.id)}
                          className={`rounded-lg px-3 py-1.5 text-label-sm font-medium transition-colors ${
                            selectedPeriodId === p.id
                              ? "bg-sc-navy text-white"
                              : "bg-white border border-sc-gray-200 text-sc-gray hover:bg-sc-gray-50"
                          }`}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {error && <p className="text-label-sm text-sc-rose">{error}</p>}

                <button
                  onClick={handlePreview}
                  disabled={isPending || !selectedPeriodId}
                  className="inline-flex items-center gap-2 rounded-lg bg-sc-teal px-4 py-2 text-label-sm text-white hover:bg-sc-teal-700 disabled:opacity-50 transition-colors"
                >
                  {isPending ? <><Loader2 className="size-3.5 animate-spin" /> Loading…</> : "Next: Add Comments"}
                </button>
              </div>
            )}

            {step === "comments" && previewData && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-label-sm font-medium text-sc-navy">{previewData.reportTypeLabel}</p>
                  <button onClick={handleReset} className="text-label-sm text-sc-gray hover:underline">← Back</button>
                </div>

                {/* Course comments */}
                <div className="space-y-3">
                  <p className="text-label-sm font-medium text-sc-navy">Course Comments (optional)</p>
                  {previewData.courses.map((c) => (
                    <div key={c.courseSectionId} className="space-y-1">
                      <label className="text-label-sm text-sc-gray">
                        {c.courseName}
                        {c.displayPercentage && <span className="ml-1.5 text-sc-teal-700 font-medium">{c.displayPercentage} {c.letterGrade && `— ${c.letterGrade}`}</span>}
                      </label>
                      <textarea
                        rows={2}
                        value={courseComments[c.courseSectionId] ?? ""}
                        onChange={(e) => setCourseComments((prev) => ({ ...prev, [c.courseSectionId]: e.target.value }))}
                        placeholder="Optional teacher comment…"
                        className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm focus:outline-none focus:ring-2 focus:ring-sc-teal/30 resize-none bg-white"
                      />
                    </div>
                  ))}
                </div>

                {/* General comment */}
                <div className="space-y-1">
                  <label className="text-label-sm font-medium text-sc-navy">General Academic Comment (optional)</label>
                  <textarea
                    rows={3}
                    value={generalComment}
                    onChange={(e) => setGeneralComment(e.target.value)}
                    placeholder="Overall academic progress note…"
                    className="w-full rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm focus:outline-none focus:ring-2 focus:ring-sc-teal/30 resize-none bg-white"
                  />
                </div>

                {error && <p className="text-label-sm text-sc-rose">{error}</p>}
                {successMsg && <p className="text-label-sm text-sc-teal-700">{successMsg}</p>}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleSaveDraft}
                    disabled={isPending}
                    className="rounded-lg border border-sc-gray-200 bg-white px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {isPending ? "Saving…" : "Save Draft"}
                  </button>
                  {currentReportId && (
                    <a
                      href={`/print/report/${currentReportId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sc-teal/30 bg-white px-4 py-2 text-label-sm text-sc-teal hover:bg-sc-teal/5 transition-colors"
                    >
                      Preview <ExternalLink className="size-3" />
                    </a>
                  )}
                  {isAdmin && (
                    <button
                      onClick={handleIssue}
                      disabled={isPending}
                      className="rounded-lg bg-sc-navy px-4 py-2 text-label-sm text-white hover:bg-sc-navy/90 disabled:opacity-50 transition-colors"
                    >
                      {isPending ? "Issuing…" : "Issue Report"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === "issued" && currentReportId && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sc-teal-700">
                  <CheckCircle className="size-5" />
                  <p className="font-medium text-label-md">Report Issued</p>
                </div>
                <p className="text-label-sm text-sc-gray">The report has been saved and is now visible to authorized parents.</p>
                <div className="flex gap-2">
                  <a
                    href={`/print/report/${currentReportId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sc-teal px-4 py-2 text-label-sm text-white hover:bg-sc-teal-700 transition-colors"
                  >
                    View / Print <ExternalLink className="size-3" />
                  </a>
                  <button onClick={handleReset} className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50 transition-colors">
                    Generate Another
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
