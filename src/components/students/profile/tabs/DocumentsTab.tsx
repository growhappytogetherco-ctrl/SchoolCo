"use client";

import { useEffect, useState } from "react";
import {
  FileText, ExternalLink, Download, Lock, Plus,
  Star, Eye, EyeOff, BookOpen, Image, Video, Music, Trash2, Loader2,
} from "lucide-react";
import { getStudentDocumentsData } from "@/app/actions/profileData";
import { getWorkSamples, deleteWorkSample, getDriveStatus } from "@/app/actions/drive";
import { DriveFolderCard } from "@/components/students/profile/drive/DriveFolderCard";
import { UploadWorkSampleModal } from "@/components/students/profile/drive/UploadWorkSampleModal";
import type { WorkSample } from "@/lib/drive/types";
import { FILE_TYPE_ICONS } from "@/lib/drive/types";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  driveFolderStatus?: string | null;
  driveFolderUrl?: string | null;
}

type DocData = Awaited<ReturnType<typeof getStudentDocumentsData>>;

const DOC_TYPE_LABELS: Record<string, string> = {
  enrollment_form: "Enrollment", transcript: "Transcript", iep: "IEP",
  medical_form: "Medical Form", permission_slip: "Permission Slip", scholarship: "Scholarship",
  legal: "Legal", report_card: "Report Card", photo_id: "Photo ID", court_order: "Court Order",
  general: "General", other: "Other",
};

const VISIBILITY_CFG = {
  internal:         { icon: EyeOff,    cls: "text-sc-gray",      label: "Staff Only"     },
  parent_visible:   { icon: Eye,       cls: "text-sc-teal",      label: "Parent Visible" },
  yearbook_eligible:{ icon: BookOpen,  cls: "text-sc-gold-600",  label: "Yearbook"       },
};

const FILE_TYPE_CLR: Record<string, string> = {
  pdf:          "bg-sc-rose-50  text-sc-rose  border-sc-rose-200",
  image:        "bg-sc-teal-50  text-sc-teal  border-sc-teal-200",
  video:        "bg-sc-navy-50  text-sc-navy  border-sc-navy-200",
  audio:        "bg-sc-gold-50  text-sc-gold-700 border-sc-gold-200",
  document:     "bg-sc-gray-50  text-sc-gray  border-sc-gray-200",
  presentation: "bg-sc-gold-50  text-sc-gold-700 border-sc-gold-200",
  spreadsheet:  "bg-sc-green/10 text-sc-green border-sc-green/20",
  link:         "bg-sc-teal-50  text-sc-teal  border-sc-teal-200",
  other:        "bg-sc-gray-50  text-sc-gray  border-sc-gray-200",
};

function fmtDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DocumentsTab({ studentId, driveFolderStatus, driveFolderUrl }: Props) {
  const [docs, setDocs]         = useState<DocData>(null);
  const [samples, setSamples]   = useState<WorkSample[]>([]);
  const [loading, setLoading]   = useState(true);
  const [activeSection, setActiveSection] = useState<"samples" | "docs">("samples");
  const [showUpload, setShowUpload] = useState(false);
  const [driveReady, setDriveReady] = useState(false);
  const [folderStatus, setFolderStatus] = useState(driveFolderStatus ?? "none");
  const [folderUrl, setFolderUrl]   = useState(driveFolderUrl ?? "");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [visFilter, setVisFilter]   = useState<"all" | "parent" | "yearbook">("all");

  useEffect(() => {
    Promise.all([
      getStudentDocumentsData(studentId),
      getWorkSamples(studentId),
      getDriveStatus(),
    ]).then(([docData, sampleData, driveStatus]) => {
      setDocs(docData);
      setSamples(sampleData);
      setDriveReady(driveStatus.configured);
      setLoading(false);
    });
  }, [studentId]);

  async function handleDelete(sampleId: string) {
    setDeletingId(sampleId);
    const res = await deleteWorkSample(sampleId, studentId);
    if (res.success) setSamples((prev) => prev.filter((s) => s.id !== sampleId));
    setDeletingId(null);
  }

  function handleUploadSuccess() {
    setShowUpload(false);
    // Reload work samples
    getWorkSamples(studentId).then(setSamples);
  }

  const docList = docs?.documents ?? [];
  const filteredSamples = samples.filter((s) => {
    if (visFilter === "parent")   return s.visible_to_parent;
    if (visFilter === "yearbook") return s.include_in_yearbook;
    return true;
  });

  if (loading) return (
    <div className="space-y-3">
      {[1,2,3].map((i) => <div key={i} className="h-20 rounded-2xl border border-sc-gray-100 bg-white animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Drive folder setup */}
      <DriveFolderCard
        studentId={studentId}
        driveFolderStatus={folderStatus}
        driveFolderUrl={folderUrl}
        driveConfigured={driveReady}
      />

      {/* Section tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl border border-sc-gray-200 p-1 bg-white">
          {([
            { id: "samples", label: `Work Samples (${samples.length})` },
            { id: "docs",    label: `Documents (${docList.length})`    },
          ] as const).map((tab) => (
            <button key={tab.id} onClick={() => setActiveSection(tab.id)}
              className={cn("rounded-lg px-4 py-1.5 text-label-sm font-medium transition-colors",
                activeSection === tab.id ? "bg-sc-navy text-white" : "text-sc-gray hover:text-sc-navy"
              )}>
              {tab.label}
            </button>
          ))}
        </div>
        {activeSection === "samples" && (
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white font-medium hover:bg-sc-teal-700 transition-colors">
            <Plus className="size-4" /> Add Work Sample
          </button>
        )}
      </div>

      {/* Work Samples section */}
      {activeSection === "samples" && (
        <div className="space-y-4">
          {/* Visibility filters */}
          {samples.length > 0 && (
            <div className="flex gap-2">
              {([
                { id: "all",      label: "All"           },
                { id: "parent",   label: "Parent Visible" },
                { id: "yearbook", label: "Yearbook"       },
              ] as const).map((f) => (
                <button key={f.id} onClick={() => setVisFilter(f.id)}
                  className={cn("rounded-full border px-3 py-1 text-label-sm font-medium transition-colors",
                    visFilter === f.id ? "bg-sc-navy text-white border-sc-navy" : "border-sc-gray-200 text-sc-gray hover:border-sc-navy hover:text-sc-navy"
                  )}>
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {filteredSamples.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center space-y-3">
              <FileText className="size-10 text-sc-gray-300 mx-auto" />
              <p className="text-body-md text-sc-gray-400">
                {samples.length === 0 ? "No work samples yet." : "No samples match this filter."}
              </p>
              <button onClick={() => setShowUpload(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white font-medium">
                <Plus className="size-4" /> Add First Work Sample
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSamples.map((sample) => {
                const visCfg = VISIBILITY_CFG[sample.visibility] ?? VISIBILITY_CFG.internal;
                const VisCon = visCfg.icon;
                const ftClr  = FILE_TYPE_CLR[sample.file_type] ?? FILE_TYPE_CLR.other;
                const emoji  = FILE_TYPE_ICONS[sample.file_type] ?? "📎";

                return (
                  <div key={sample.id} className={cn(
                    "rounded-2xl border bg-white shadow-card p-4 flex items-start gap-4",
                    sample.yearbook_highlight ? "border-sc-gold-300 ring-1 ring-sc-gold-200" : "border-sc-gray-100"
                  )}>
                    {/* Thumbnail or type icon */}
                    {sample.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sample.thumbnail_url} alt={sample.title}
                        className="h-14 w-14 rounded-xl object-cover shrink-0 border border-sc-gray-100" />
                    ) : (
                      <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border text-2xl", ftClr)}>
                        {emoji}
                      </div>
                    )}

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-start gap-2">
                        <p className="text-label-md font-semibold text-sc-navy flex-1">{sample.title}</p>
                        {sample.yearbook_highlight && (
                          <Star className="size-4 text-sc-gold-500 shrink-0" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-label-sm text-sc-gray">
                        {sample.subject && <span className="font-medium text-sc-navy">{sample.subject}</span>}
                        {sample.subject && <span>·</span>}
                        {sample.work_date && <span>{fmtDate(sample.work_date)}</span>}
                        {sample.quality_rating && (
                          <>
                            <span>·</span>
                            <span className="text-sc-gold-600 font-medium">★ {sample.quality_rating}/5</span>
                          </>
                        )}
                        {sample.uploader_name && (
                          <>
                            <span>·</span>
                            <span>by {sample.uploader_name}</span>
                          </>
                        )}
                      </div>
                      {sample.description && (
                        <p className="text-label-sm text-sc-gray line-clamp-1">{sample.description}</p>
                      )}
                      {/* Visibility badges */}
                      <div className="flex items-center gap-2">
                        <span className={cn("flex items-center gap-1 text-label-sm", visCfg.cls)}>
                          <VisCon className="size-3" /> {visCfg.label}
                        </span>
                        {sample.yearbook_section && (
                          <span className="text-label-sm text-sc-gold-700 capitalize">{sample.yearbook_section}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {(sample.google_drive_file_url ?? sample.external_url) && (
                        <a href={sample.google_drive_file_url ?? sample.external_url ?? "#"}
                          target="_blank" rel="noopener noreferrer"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-teal-50 hover:text-sc-teal transition-colors">
                          <ExternalLink className="size-4" />
                        </a>
                      )}
                      <button onClick={() => handleDelete(sample.id)} disabled={deletingId === sample.id}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-rose-50 hover:text-sc-rose transition-colors">
                        {deletingId === sample.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Documents section */}
      {activeSection === "docs" && (
        <div className="space-y-3">
          {docList.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center">
              <FileText className="size-10 text-sc-gray-300 mx-auto mb-2" />
              <p className="text-body-md text-sc-gray-400">No documents uploaded yet.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
              <div className="divide-y divide-sc-gray-100">
                {docList.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-4 px-5 py-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sc-teal-50 border border-sc-teal-100">
                      <FileText className="size-5 text-sc-teal" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-label-md font-semibold text-sc-navy truncate">{doc.title}</p>
                        {doc.staff_only && <Lock className="size-3.5 text-sc-gray shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 text-label-sm text-sc-gray mt-0.5">
                        <span>{DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}</span>
                        <span>·</span>
                        <span>{fmtDate(doc.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {doc.google_drive_url && (
                        <a href={doc.google_drive_url} target="_blank" rel="noopener noreferrer"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-teal-50 hover:text-sc-teal transition-colors">
                          <ExternalLink className="size-4" />
                        </a>
                      )}
                      {doc.storage_path && (
                        <a href={`/api/documents/${doc.id}/download`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-teal-50 hover:text-sc-teal transition-colors">
                          <Download className="size-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadWorkSampleModal
          studentId={studentId}
          driveReady={driveReady && (folderStatus === "active")}
          onClose={() => setShowUpload(false)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}
