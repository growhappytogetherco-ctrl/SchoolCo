"use client";

// Unified Academic History view combining:
//   1. Legacy uploaded academic documents (student_documents where document_type='academic_record')
//   2. SchoolCo issued reports (student_reports, from Stage 5)
// Grouped by school year, then by period.

import { useEffect, useRef, useState } from "react";
import { FileText, ExternalLink, Loader2, History, Eye, EyeOff, GraduationCap, MoreHorizontal, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { getStudentAcademicDocuments, deleteAcademicDocument, type AcademicHistoryItem } from "@/app/actions/documents";
import { getStudentReportList, type ReportListItem } from "@/app/actions/reports";
import { UploadAcademicDocumentModal } from "@/components/documents/UploadAcademicDocumentModal";
import { EditAcademicDocumentModal } from "@/components/documents/EditAcademicDocumentModal";

interface Props {
  studentId: string;
  isAdmin:   boolean;
}

// ── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  if (source === "schoolco_generated") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sc-teal/10 border border-sc-teal/20 px-2 py-0.5 text-xs font-medium text-sc-teal-700">
        <GraduationCap className="size-3" />
        SchoolCo Report
      </span>
    );
  }
  if (source === "external_school") {
    return (
      <span className="rounded-full bg-sc-gold-50 border border-sc-gold-300 px-2 py-0.5 text-xs font-medium text-sc-gold-800">
        External School
      </span>
    );
  }
  // legacy_upload
  return (
    <span className="rounded-full bg-sc-gray-100 border border-sc-gray-200 px-2 py-0.5 text-xs font-medium text-sc-gray">
      Uploaded Historical Record
    </span>
  );
}

function SchoolCoReportBadge({ status }: { status: string }) {
  if (status === "issued") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sc-teal/10 border border-sc-teal/20 px-2 py-0.5 text-xs font-medium text-sc-teal-700">
        <GraduationCap className="size-3" />
        SchoolCo Report
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="rounded-full bg-sc-gold-50 border border-sc-gold-300 px-2 py-0.5 text-xs font-medium text-sc-gold-800">
        Draft
      </span>
    );
  }
  return (
    <span className="rounded-full bg-sc-gray-100 border border-sc-gray-200 px-2 py-0.5 text-xs font-medium text-sc-gray">
      Superseded
    </span>
  );
}

// ── Unified history item ──────────────────────────────────────────────────────

interface HistoryEntry {
  key:          string;
  schoolYear:   string;
  period:       string | null;   // for sorting within year
  periodLabel:  string | null;
  title:        string;
  type:         "document" | "report";
  sourceLabel:  string;
  // Document-specific
  docItem?:     AcademicHistoryItem;
  // Report-specific
  reportItem?:  ReportListItem;
  date:         string | null;   // ISO for sorting
}

const PERIOD_SORT_ORDER: Record<string, number> = {
  beginning_of_year: 0,
  q1: 1, q2: 2, q3: 3, q4: 4,
  mid_year: 5,
  semester_1: 6, semester_2: 7,
  end_of_year: 8,
  full_year: 9,
  other: 10,
};

const REPORT_PERIOD_SORT: Record<string, number> = {
  progress: 0, quarter: 1, semester: 2,
};

function periodSortKey(period: string | null, reportType?: string): number {
  if (period) return PERIOD_SORT_ORDER[period] ?? 99;
  if (reportType) return REPORT_PERIOD_SORT[reportType] ?? 99;
  return 99;
}

// ── Action menu per document row ─────────────────────────────────────────────

function DocActionMenu({
  doc,
  onEdit,
  onDelete,
}: {
  doc:      AcademicHistoryItem;
  onEdit:   (doc: AcademicHistoryItem) => void;
  onDelete: (doc: AcademicHistoryItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-gray-100 hover:text-sc-navy transition-colors"
        aria-label="More actions"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 w-40 rounded-xl border border-sc-gray-100 bg-white shadow-lg overflow-hidden">
          {(doc.googleDriveUrl || doc.externalUrl) && (
            <a
              href={(doc.googleDriveUrl ?? doc.externalUrl)!}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50 hover:text-sc-navy transition-colors"
            >
              <ExternalLink className="size-3.5" /> View Document
            </a>
          )}
          <button
            onClick={() => { setOpen(false); onEdit(doc); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50 hover:text-sc-navy transition-colors"
          >
            <Pencil className="size-3.5" /> Edit Record Details
          </button>
          <button
            onClick={() => { setOpen(false); onDelete(doc); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-label-sm text-sc-rose hover:bg-sc-rose-50 transition-colors"
          >
            <Trash2 className="size-3.5" /> Delete from SchoolCo
          </button>
        </div>
      )}
    </div>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────

function DeleteConfirmModal({
  doc,
  onCancel,
  onConfirm,
  isPending,
  error,
}: {
  doc:       AcademicHistoryItem;
  onCancel:  () => void;
  onConfirm: () => void;
  isPending: boolean;
  error:     string | null;
}) {
  const hasDriveFile = !!doc.googleDriveId;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sc-rose-50 border border-sc-rose-200">
            <Trash2 className="size-5 text-sc-rose" />
          </div>
          <div>
            <p className="font-serif text-heading-2 text-sc-navy">Delete Academic Record from SchoolCo?</p>
            <p className="text-label-sm text-sc-gray mt-1">
              &ldquo;{doc.title}&rdquo;
            </p>
          </div>
        </div>

        <p className="text-label-sm text-sc-gray">
          This will remove this academic record from SchoolCo. The original file in Google Drive will remain.
        </p>

        {error && (
          <div className="rounded-xl border border-sc-rose-200 bg-sc-rose-50 p-3 flex items-start gap-2">
            <AlertTriangle className="size-4 text-sc-rose mt-0.5 flex-shrink-0" />
            <p className="text-xs text-sc-rose">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:bg-sc-gray-50 disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="rounded-lg bg-sc-rose px-4 py-2 text-label-sm text-white hover:bg-sc-rose-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            {isPending ? <><Loader2 className="size-3.5 animate-spin" /> Deleting…</> : "Delete from SchoolCo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AcademicHistory({ studentId, isAdmin }: Props) {
  const [docs, setDocs]         = useState<AcademicHistoryItem[]>([]);
  const [reports, setReports]   = useState<ReportListItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);  // triggers re-fetch

  // Edit/delete state
  const [editingDoc, setEditingDoc]     = useState<AcademicHistoryItem | null>(null);
  const [deletingDoc, setDeletingDoc]   = useState<AcademicHistoryItem | null>(null);
  const [deleteError, setDeleteError]   = useState<string | null>(null);
  const [deleteIsPending, setDeleteIsPending] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getStudentAcademicDocuments(studentId),
      getStudentReportList(studentId),
    ]).then(([docResult, reportResult]) => {
      if (docResult.success) setDocs(docResult.data);
      if (reportResult.success) setReports(reportResult.data);
      setLoading(false);
    });
  }, [studentId, uploadCount]);

  function handleUploadSuccess(keepOpen: boolean) {
    setUploadCount((c) => c + 1);
    if (!keepOpen) setShowUpload(false);
  }

  function handleEditSuccess(updated: AcademicHistoryItem) {
    setDocs((prev) => prev.map((d) => d.id === updated.id ? updated : d));
    setEditingDoc(null);
  }

  async function handleDeleteConfirm() {
    if (!deletingDoc) return;
    setDeleteError(null);
    setDeleteIsPending(true);
    const result = await deleteAcademicDocument(deletingDoc.id);
    setDeleteIsPending(false);
    if (!result.success) {
      setDeleteError(result.error ?? "Delete failed.");
      return;
    }
    setDocs((prev) => prev.filter((d) => d.id !== deletingDoc.id));
    setDeletingDoc(null);
  }

  // ── Build unified entries ──────────────────────────────────────────────────

  const entries: HistoryEntry[] = [];

  for (const doc of docs) {
    entries.push({
      key:         `doc-${doc.id}`,
      schoolYear:  doc.schoolYear || "Unknown Year",
      period:      doc.reportingPeriod,
      periodLabel: doc.periodLabel,
      title:       doc.title,
      type:        "document",
      sourceLabel: doc.sourceLabel,
      docItem:     doc,
      date:        doc.recordDate ?? doc.createdAt,
    });
  }

  for (const report of reports) {
    entries.push({
      key:         `report-${report.id}`,
      schoolYear:  report.schoolYearLabel || "Unknown Year",
      period:      null,
      periodLabel: report.periodName,
      title:       report.reportTypeLabel,
      type:        "report",
      sourceLabel: "SchoolCo Report",
      reportItem:  report,
      date:        report.issuedAt ?? report.createdAt,
    });
  }

  // Group by school year, descending
  const byYear = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    if (!byYear.has(e.schoolYear)) byYear.set(e.schoolYear, []);
    byYear.get(e.schoolYear)!.push(e);
  }

  // Sort years descending
  const sortedYears = Array.from(byYear.keys()).sort((a, b) => b.localeCompare(a));

  // Sort entries within each year by period, then date
  for (const year of sortedYears) {
    byYear.get(year)!.sort((a, b) => {
      const pa = periodSortKey(a.period, a.reportItem?.reportType);
      const pb = periodSortKey(b.period, b.reportItem?.reportType);
      if (pa !== pb) return pa - pb;
      return (a.date ?? "").localeCompare(b.date ?? "");
    });
  }

  const isEmpty = entries.length === 0;

  return (
    <div className="space-y-4">
      {/* ── Section header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="size-4 text-sc-teal" />
          <p className="font-medium text-sc-navy">Academic History</p>
          {entries.length > 0 && (
            <span className="rounded-full bg-sc-navy/10 px-2 py-0.5 text-xs font-medium text-sc-navy">
              {entries.length}
            </span>
          )}
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sc-gray-200 bg-white px-3 py-1.5 text-label-sm text-sc-gray hover:bg-sc-gray-50 transition-colors"
          >
            <FileText className="size-3.5" />
            Upload Historical Record
          </button>
        )}
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      {loading && (
        <div className="flex items-center gap-2 text-label-sm text-sc-gray py-4">
          <Loader2 className="size-3.5 animate-spin" /> Loading academic history…
        </div>
      )}

      {!loading && isEmpty && (
        <div className="rounded-xl border border-sc-gray-100 bg-white p-6 text-center">
          <History className="size-8 text-sc-gray-300 mx-auto mb-2" />
          <p className="text-label-sm font-medium text-sc-navy">No academic history yet</p>
          <p className="text-xs text-sc-gray mt-1">
            {isAdmin
              ? "Upload prior progress reports, report cards, or transcripts using the button above."
              : "Issued report cards and progress reports will appear here."}
          </p>
        </div>
      )}

      {!loading && !isEmpty && (
        <div className="space-y-6">
          {sortedYears.map((year) => (
            <div key={year} className="space-y-2">
              {/* Year header */}
              <p className="text-label-sm font-semibold text-sc-navy border-b border-sc-gray-100 pb-1.5">
                {year}
              </p>

              {/* Records for this year */}
              <div className="rounded-xl border border-sc-gray-100 bg-white divide-y divide-sc-gray-100 overflow-hidden">
                {byYear.get(year)!.map((entry) => (
                  <div key={entry.key} className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {entry.periodLabel && (
                          <span className="text-label-sm font-medium text-sc-teal-700">
                            {entry.periodLabel}
                          </span>
                        )}
                        <p className="text-label-sm font-medium text-sc-navy truncate">
                          {entry.title}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {entry.type === "document" && entry.docItem && (
                          <>
                            <SourceBadge source={entry.docItem.recordSource} />
                            {entry.docItem.parentVisible ? (
                              <span className="flex items-center gap-0.5 text-xs text-sc-teal-700">
                                <Eye className="size-3" /> Parent Visible
                              </span>
                            ) : (
                              <span className="flex items-center gap-0.5 text-xs text-sc-gray">
                                <EyeOff className="size-3" /> Staff Only
                              </span>
                            )}
                            {entry.docItem.recordDate && (
                              <span className="text-xs text-sc-gray">
                                {new Date(entry.docItem.recordDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                              </span>
                            )}
                          </>
                        )}
                        {entry.type === "report" && entry.reportItem && (
                          <>
                            <SchoolCoReportBadge status={entry.reportItem.status} />
                            {entry.reportItem.issuedAt && (
                              <span className="text-xs text-sc-gray">
                                Issued {new Date(entry.reportItem.issuedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Document actions */}
                    {entry.type === "document" && entry.docItem && (
                      isAdmin ? (
                        <DocActionMenu
                          doc={entry.docItem}
                          onEdit={setEditingDoc}
                          onDelete={(d) => { setDeleteError(null); setDeletingDoc(d); }}
                        />
                      ) : (entry.docItem.googleDriveUrl || entry.docItem.externalUrl) ? (
                        <a
                          href={(entry.docItem.googleDriveUrl ?? entry.docItem.externalUrl)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 flex items-center gap-1 text-label-sm text-sc-teal hover:underline"
                        >
                          View <ExternalLink className="size-3" />
                        </a>
                      ) : null
                    )}

                    {entry.type === "report" && entry.reportItem && (
                      <a
                        href={`/print/report/${entry.reportItem.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 flex items-center gap-1 text-label-sm text-sc-teal hover:underline"
                      >
                        View <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadAcademicDocumentModal
          studentId={studentId}
          onClose={() => setShowUpload(false)}
          onSuccess={handleUploadSuccess}
        />
      )}

      {/* Edit modal */}
      {editingDoc && (
        <EditAcademicDocumentModal
          doc={editingDoc}
          onClose={() => setEditingDoc(null)}
          onSuccess={handleEditSuccess}
        />
      )}

      {/* Delete confirm */}
      {deletingDoc && (
        <DeleteConfirmModal
          doc={deletingDoc}
          onCancel={() => { setDeletingDoc(null); setDeleteError(null); }}
          onConfirm={handleDeleteConfirm}
          isPending={deleteIsPending}
          error={deleteError}
        />
      )}
    </div>
  );
}
