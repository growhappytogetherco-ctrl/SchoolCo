"use client";

import { useEffect, useState } from "react";
import { FileText, ExternalLink, Download, FolderOpen, Lock } from "lucide-react";
import { getStudentDocumentsData } from "@/app/actions/profileData";
import { cn } from "@/lib/utils";

interface Props { studentId: string }

type DocData = Awaited<ReturnType<typeof getStudentDocumentsData>>;

const DOC_TYPE_LABELS: Record<string, string> = {
  enrollment_form: "Enrollment Form",
  transcript:      "Transcript",
  iep:             "IEP",
  medical_form:    "Medical Form",
  permission_slip: "Permission Slip",
  scholarship:     "Scholarship",
  legal:           "Legal",
  report_card:     "Report Card",
  photo_id:        "Photo ID",
  court_order:     "Court Order",
  general:         "General",
  other:           "Other",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DocumentsTab({ studentId }: Props) {
  const [data, setData] = useState<DocData>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    getStudentDocumentsData(studentId).then((d) => { setData(d); setLoading(false); });
  }, [studentId]);

  const docs = data?.documents ?? [];
  const filtered = filterType === "all" ? docs : docs.filter((d) => d.document_type === filterType);

  // Group by type
  const typeGroups = [...new Set(docs.map((d) => d.document_type))];

  if (loading) return (
    <div className="space-y-3">
      {[1,2,3].map((i) => <div key={i} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card h-20 animate-pulse" />)}
    </div>
  );

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Google Drive note */}
      <div className="rounded-xl border border-sc-teal-200 bg-sc-teal-50 px-4 py-3 flex items-start gap-3">
        <FolderOpen className="size-5 text-sc-teal shrink-0 mt-0.5" />
        <div className="text-label-sm text-sc-teal-700">
          <p className="font-semibold">Google Drive Integration</p>
          <p className="mt-0.5">Documents stored in Google Drive can be opened directly. Full Drive sync coming in Phase 5.</p>
        </div>
      </div>

      {/* Filter */}
      {docs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterType("all")}
            className={cn("rounded-full px-3 py-1 text-label-sm font-medium border transition-colors",
              filterType === "all" ? "bg-sc-teal text-white border-sc-teal" : "border-sc-gray-200 text-sc-gray hover:border-sc-teal hover:text-sc-teal"
            )}
          >
            All ({docs.length})
          </button>
          {typeGroups.map((type) => (
            <button key={type}
              onClick={() => setFilterType(type)}
              className={cn("rounded-full px-3 py-1 text-label-sm font-medium border transition-colors",
                filterType === type ? "bg-sc-teal text-white border-sc-teal" : "border-sc-gray-200 text-sc-gray hover:border-sc-teal hover:text-sc-teal"
              )}
            >
              {DOC_TYPE_LABELS[type] ?? type}
            </button>
          ))}
        </div>
      )}

      {/* Document list */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center space-y-3">
          <FileText className="size-10 text-sc-gray-300 mx-auto" />
          <p className="text-body-md text-sc-gray-400">
            {docs.length === 0 ? "No documents uploaded yet." : "No documents in this category."}
          </p>
          <p className="text-label-sm text-sc-gray">
            Use the Upload Doc button above to add documents.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
          <div className="divide-y divide-sc-gray-100">
            {filtered.map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sc-teal-50 border border-sc-teal-100">
                  <FileText className="size-5 text-sc-teal" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-label-md font-semibold text-sc-navy truncate">{doc.title}</p>
                    {doc.staff_only && (
                      <Lock className="size-3.5 text-sc-gray shrink-0" title="Staff only" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-label-sm text-sc-gray mt-0.5">
                    <span>{DOC_TYPE_LABELS[doc.document_type] ?? doc.document_type}</span>
                    <span>·</span>
                    <span>{fmtDate(doc.created_at)}</span>
                    {doc.version && doc.version > 1 && (
                      <>
                        <span>·</span>
                        <span>v{doc.version}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {doc.google_drive_url && (
                    <a href={doc.google_drive_url} target="_blank" rel="noopener noreferrer"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-teal-50 hover:text-sc-teal transition-colors"
                      title="Open in Google Drive">
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                  {doc.storage_path && (
                    <a href={`/api/documents/${doc.id}/download`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sc-gray hover:bg-sc-teal-50 hover:text-sc-teal transition-colors"
                      title="Download">
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
  );
}
