"use client";

import { useState, useTransition, useRef } from "react";
import { X, Upload, Link2, Star, Eye, EyeOff, Loader2, BookOpen, AlertTriangle } from "lucide-react";
import { createWorkSample, uploadWorkSampleFile } from "@/app/actions/drive";
import { SUBJECT_OPTIONS, YEARBOOK_SECTIONS, STUDENT_SUBFOLDERS } from "@/lib/drive/types";
import type { Visibility } from "@/lib/drive/types";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  driveReady: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type UploadMethod = "link" | "file";

export function UploadWorkSampleModal({ studentId, driveReady, onClose, onSuccess }: Props) {
  const [method, setMethod]         = useState<UploadMethod>("link");
  const [isPending, startTransition] = useTransition();
  const [error, setError]           = useState<string | null>(null);
  const fileRef                     = useRef<HTMLInputElement>(null);

  // Form fields
  const [title, setTitle]           = useState("");
  const [subject, setSubject]       = useState("");
  const [description, setDesc]      = useState("");
  const [workDate, setWorkDate]     = useState("");
  const [fileType, setFileType]     = useState("document");
  const [driveUrl, setDriveUrl]     = useState("");
  const [externalUrl, setExtUrl]    = useState("");
  const [folderKey, setFolderKey]   = useState("work_samples");
  const [visibility, setVisibility] = useState<Visibility>("internal");
  const [visibleParent, setVisParent] = useState(false);
  const [inYearbook, setInYearbook] = useState(false);
  const [ybCaption, setYbCaption]   = useState("");
  const [ybSection, setYbSection]   = useState("");
  const [ybHighlight, setYbHigh]    = useState(false);
  const [rating, setRating]         = useState<number | null>(null);
  const [comments, setComments]     = useState("");
  const [selectedFile, setSelFile]  = useState<File | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setSelFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
    const mt = f.type;
    if (mt.startsWith("image/"))       setFileType("image");
    else if (mt.startsWith("video/"))  setFileType("video");
    else if (mt.startsWith("audio/"))  setFileType("audio");
    else if (mt === "application/pdf") setFileType("pdf");
    else if (mt.includes("word"))      setFileType("document");
    else if (mt.includes("sheet") || mt.includes("excel")) setFileType("spreadsheet");
    else if (mt.includes("presentation") || mt.includes("powerpoint")) setFileType("presentation");
  }

  function extractDriveFileId(url: string): string | null {
    // Handle various Drive URL formats
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /id=([a-zA-Z0-9_-]+)/,
      /^([a-zA-Z0-9_-]{20,})$/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  function handleSubmit() {
    if (!title.trim()) { setError("Title is required"); return; }
    if (method === "file" && !selectedFile && !driveUrl && !externalUrl) {
      setError("Please select a file, paste a Drive URL, or enter an external link"); return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const base: Parameters<typeof createWorkSample>[1] = {
          title: title.trim(),
          subject:             subject     || null,
          description:         description || null,
          work_date:           workDate    || null,
          file_type:           fileType,
          external_url:        externalUrl || null,
          google_drive_folder_key: folderKey,
          visibility,
          visible_to_parent:   visibleParent,
          include_in_yearbook: inYearbook,
          yearbook_caption:    ybCaption   || null,
          yearbook_section:    ybSection   || null,
          yearbook_highlight:  ybHighlight,
          quality_rating:      rating,
          teacher_comments:    comments    || null,
        };

        if (method === "file" && selectedFile && driveReady) {
          // Server-side file upload
          const arrayBuf = await selectedFile.arrayBuffer();
          const base64   = Buffer.from(arrayBuf).toString("base64");
          const res = await uploadWorkSampleFile(
            studentId, base64, selectedFile.name, selectedFile.type, folderKey, base
          );
          if (!res.success) { setError(res.error); return; }
        } else if (driveUrl) {
          const fileId  = extractDriveFileId(driveUrl);
          const fileUrl = fileId ? `https://drive.google.com/file/d/${fileId}/view` : driveUrl;
          const res = await createWorkSample(studentId, { ...base, google_drive_file_id: fileId, google_drive_file_url: fileUrl });
          if (!res.success) { setError(res.error); return; }
        } else {
          const res = await createWorkSample(studentId, base);
          if (!res.success) { setError(res.error); return; }
        }

        onSuccess();
      } catch (e) {
        setError(String(e));
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg max-h-[90vh] bg-white rounded-2xl shadow-modal flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-sc-gray-100">
          <h2 className="font-serif text-heading-3 text-sc-navy">Add Work Sample</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-sc-gray-50 text-sc-gray">
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-label-sm font-semibold text-sc-navy">Title <span className="text-sc-rose">*</span></label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="What is this work sample?"
              className="w-full rounded-xl border border-sc-gray-200 px-4 py-2.5 text-label-md text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-teal focus:outline-none" />
          </div>

          {/* Subject + Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-label-sm font-semibold text-sc-navy">Subject</label>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-xl border border-sc-gray-200 px-4 py-2.5 text-label-md text-sc-navy focus:border-sc-teal focus:outline-none bg-white">
                <option value="">Select…</option>
                {SUBJECT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-label-sm font-semibold text-sc-navy">Date of Work</label>
              <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)}
                className="w-full rounded-xl border border-sc-gray-200 px-4 py-2.5 text-label-md text-sc-navy focus:border-sc-teal focus:outline-none" />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-label-sm font-semibold text-sc-navy">Description</label>
            <textarea value={description} onChange={(e) => setDesc(e.target.value)} rows={2}
              placeholder="What did the student accomplish or demonstrate?"
              className="w-full rounded-xl border border-sc-gray-200 px-4 py-2.5 text-label-md text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-teal focus:outline-none resize-none" />
          </div>

          {/* Upload method tabs */}
          <div className="space-y-3">
            <div className="flex rounded-xl border border-sc-gray-200 overflow-hidden">
              <button onClick={() => setMethod("link")}
                className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 text-label-sm font-medium transition-colors",
                  method === "link" ? "bg-sc-navy text-white" : "text-sc-gray hover:bg-sc-gray-50")}>
                <Link2 className="size-4" /> Drive / External Link
              </button>
              <button onClick={() => setMethod("file")} disabled={!driveReady}
                className={cn("flex-1 flex items-center justify-center gap-2 py-2.5 text-label-sm font-medium transition-colors disabled:opacity-40",
                  method === "file" ? "bg-sc-navy text-white" : "text-sc-gray hover:bg-sc-gray-50")}>
                <Upload className="size-4" /> Upload File
                {!driveReady && <span className="text-xs opacity-60">(Drive needed)</span>}
              </button>
            </div>

            {method === "link" && (
              <div className="space-y-3">
                <input value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)}
                  placeholder="Paste Google Drive file URL or file ID…"
                  className="w-full rounded-xl border border-sc-gray-200 px-4 py-2.5 text-label-md text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-teal focus:outline-none" />
                <div className="flex items-center gap-2 text-label-sm text-sc-gray">
                  <span>or</span>
                  <input value={externalUrl} onChange={(e) => setExtUrl(e.target.value)}
                    placeholder="External URL (YouTube, website, etc.)"
                    className="flex-1 rounded-xl border border-sc-gray-200 px-4 py-2.5 text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-teal focus:outline-none" />
                </div>
              </div>
            )}

            {method === "file" && (
              <div>
                <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
                <button onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-sc-gray-200 p-5 text-center hover:border-sc-teal transition-colors">
                  {selectedFile
                    ? <p className="text-label-md text-sc-teal font-medium">{selectedFile.name}</p>
                    : <p className="text-label-md text-sc-gray">Click to browse files</p>}
                </button>
              </div>
            )}
          </div>

          {/* Folder + File type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-label-sm font-semibold text-sc-navy">Drive Folder</label>
              <select value={folderKey} onChange={(e) => setFolderKey(e.target.value)}
                className="w-full rounded-xl border border-sc-gray-200 px-4 py-2.5 text-label-md text-sc-navy focus:border-sc-teal focus:outline-none bg-white">
                {STUDENT_SUBFOLDERS.filter((f) => !f.isInternalOnly).map((f) => (
                  <option key={f.key} value={f.key}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-label-sm font-semibold text-sc-navy">File Type</label>
              <select value={fileType} onChange={(e) => setFileType(e.target.value)}
                className="w-full rounded-xl border border-sc-gray-200 px-4 py-2.5 text-label-md text-sc-navy focus:border-sc-teal focus:outline-none bg-white">
                {["pdf","image","video","audio","document","spreadsheet","presentation","link","other"].map((t) => (
                  <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Visibility */}
          <div className="space-y-2">
            <label className="text-label-sm font-semibold text-sc-navy">Visibility</label>
            <div className="flex gap-2 flex-wrap">
              {([
                { value: "internal",          label: "Staff Only",      icon: EyeOff, cls: "border-sc-gray-200 text-sc-gray" },
                { value: "parent_visible",     label: "Parent Visible",  icon: Eye,    cls: "border-sc-teal-200 text-sc-teal" },
                { value: "yearbook_eligible",  label: "Yearbook Ready",  icon: BookOpen, cls: "border-sc-gold-200 text-sc-gold-700" },
              ] as const).map(({ value, label, icon: Icon, cls }) => (
                <button key={value} onClick={() => {
                  setVisibility(value);
                  setVisParent(value === "parent_visible" || value === "yearbook_eligible");
                  setInYearbook(value === "yearbook_eligible");
                }}
                  className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-label-sm font-medium transition-colors",
                    visibility === value ? `${cls} bg-white ring-1 ring-current` : "border-sc-gray-200 text-sc-gray-400 hover:border-sc-gray-300"
                  )}>
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Individual visibility toggles */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={visibleParent} onChange={(e) => setVisParent(e.target.checked)} className="rounded" />
              <span className="text-label-sm text-sc-navy">Visible to parents</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={inYearbook} onChange={(e) => setInYearbook(e.target.checked)} className="rounded" />
              <span className="text-label-sm text-sc-navy">Include in yearbook</span>
            </label>
          </div>

          {/* Yearbook extras */}
          {inYearbook && (
            <div className="space-y-3 rounded-xl border border-sc-gold-200 bg-sc-gold-50 p-4">
              <div className="flex items-center gap-2 text-label-sm font-semibold text-sc-gold-800">
                <BookOpen className="size-4" /> Yearbook Settings
              </div>
              <div className="space-y-1.5">
                <label className="text-label-sm text-sc-gold-800">Section</label>
                <select value={ybSection} onChange={(e) => setYbSection(e.target.value)}
                  className="w-full rounded-xl border border-sc-gold-200 px-4 py-2.5 text-label-md text-sc-navy focus:border-sc-gold-400 focus:outline-none bg-white">
                  <option value="">Select section…</option>
                  {YEARBOOK_SECTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-label-sm text-sc-gold-800">Caption</label>
                <input value={ybCaption} onChange={(e) => setYbCaption(e.target.value)}
                  placeholder="Caption for the yearbook page…"
                  className="w-full rounded-xl border border-sc-gold-200 px-4 py-2.5 text-label-md text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-gold-400 focus:outline-none" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={ybHighlight} onChange={(e) => setYbHigh(e.target.checked)} className="rounded" />
                <Star className="size-4 text-sc-gold-600" />
                <span className="text-label-sm text-sc-gold-800 font-medium">Feature as highlight</span>
              </label>
            </div>
          )}

          {/* Quality + teacher comments */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-label-sm font-semibold text-sc-navy">Quality Rating</label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map((n) => (
                  <button key={n} onClick={() => setRating(n === rating ? null : n)}
                    className={cn("flex h-9 w-9 items-center justify-center rounded-xl border text-label-md font-bold transition-colors",
                      rating === n ? "bg-sc-gold-500 border-sc-gold-500 text-white" : "border-sc-gray-200 text-sc-gray hover:border-sc-gold-300"
                    )}>
                    {n}
                  </button>
                ))}
                {rating && <span className="text-label-sm text-sc-gray self-center ml-1">/ 5</span>}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-label-sm font-semibold text-sc-navy">Teacher Comments</label>
              <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2}
                placeholder="Optional observation or feedback…"
                className="w-full rounded-xl border border-sc-gray-200 px-4 py-2.5 text-label-md text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-teal focus:outline-none resize-none" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-sc-gray-100">
          <button onClick={onClose} className="rounded-xl border border-sc-gray-200 px-5 py-2.5 text-label-md text-sc-gray hover:border-sc-navy hover:text-sc-navy">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={isPending || !title.trim()}
            className="flex items-center gap-2 rounded-xl bg-sc-teal px-5 py-2.5 text-label-md text-white font-semibold disabled:opacity-50 hover:bg-sc-teal-700 transition-colors">
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Save Work Sample
          </button>
        </div>
      </div>
    </div>
  );
}
