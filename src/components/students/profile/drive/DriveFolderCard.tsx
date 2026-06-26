"use client";

import { useState, useTransition } from "react";
import { FolderOpen, Plus, Link2, ExternalLink, Loader2, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Lock } from "lucide-react";
import { createStudentDriveFolders, linkStudentDriveFolder, getStudentDriveFolders } from "@/app/actions/drive";
import { STUDENT_SUBFOLDERS } from "@/lib/drive/types";
import { cn } from "@/lib/utils";

interface Props {
  studentId: string;
  driveFolderStatus: string | null;
  driveFolderUrl: string | null;
  driveConfigured: boolean;
}

export function DriveFolderCard({ studentId, driveFolderStatus, driveFolderUrl, driveConfigured }: Props) {
  const [status, setStatus]         = useState(driveFolderStatus ?? "none");
  const [folderUrl, setFolderUrl]   = useState(driveFolderUrl ?? "");
  const [isPending, startTransition] = useTransition();
  const [showLink, setShowLink]     = useState(false);
  const [linkInput, setLinkInput]   = useState("");
  const [expanded, setExpanded]     = useState(false);
  const [subfolders, setSubfolders] = useState<Array<{ key: string; folder_name: string; google_drive_folder_url: string | null; is_internal_only: boolean; parent_can_view: boolean }>>([]);
  const [error, setError]           = useState<string | null>(null);

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createStudentDriveFolders(studentId);
      if (res.success) {
        setStatus("active");
        setFolderUrl(res.folderUrl);
      } else {
        setError(res.error);
        setStatus("error");
      }
    });
  }

  function handleLink() {
    const raw = linkInput.trim();
    if (!raw) return;
    // Accept either a full URL or just the folder ID
    const id = raw.includes("folders/") ? raw.split("folders/")[1].split("?")[0] : raw;
    startTransition(async () => {
      const res = await linkStudentDriveFolder(studentId, id);
      if (res.success) {
        setStatus("manually_linked");
        setFolderUrl(`https://drive.google.com/drive/folders/${id}`);
        setShowLink(false);
      } else {
        setError(res.error);
      }
    });
  }

  async function handleExpand() {
    if (!expanded && subfolders.length === 0) {
      const data = await getStudentDriveFolders(studentId);
      setSubfolders(data as unknown as typeof subfolders);
    }
    setExpanded((v) => !v);
  }

  const isActive = status === "active" || status === "manually_linked";

  return (
    <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          isActive ? "bg-sc-green/10 border border-sc-green/20" : "bg-sc-gray-50 border border-sc-gray-200"
        )}>
          <FolderOpen className={cn("size-5", isActive ? "text-sc-green" : "text-sc-gray")} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-label-md font-semibold text-sc-navy">Student Drive Folder</p>
          <p className="text-label-sm text-sc-gray">
            {status === "none"     && "Not created yet"}
            {status === "creating" && "Creating…"}
            {status === "active"   && "Active — 11 subfolders"}
            {status === "manually_linked" && "Manually linked"}
            {status === "error"    && "Setup failed"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isActive && folderUrl && (
            <a href={folderUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-label-sm text-sc-teal font-medium hover:underline">
              <ExternalLink className="size-3.5" /> Open
            </a>
          )}
          {isActive && (
            <button onClick={handleExpand}
              className="flex items-center gap-1 text-label-sm text-sc-gray hover:text-sc-navy">
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!driveConfigured && status === "none" && (
        <div className="mx-4 mb-3 rounded-lg bg-sc-gold-50 border border-sc-gold-200 px-3 py-2 text-label-sm text-sc-gold-800">
          Google Drive API not configured. Set <code className="bg-sc-gold-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_JSON</code> and <code className="bg-sc-gold-100 px-1 rounded">GOOGLE_DRIVE_ROOT_FOLDER_ID</code> to enable auto-creation.
        </div>
      )}

      {status === "none" && (
        <div className="flex items-center gap-2 px-5 pb-4">
          <button onClick={handleCreate} disabled={isPending || !driveConfigured}
            className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm text-white font-medium disabled:opacity-50 hover:bg-sc-teal-700 transition-colors">
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Create Folders
          </button>
          <button onClick={() => setShowLink((v) => !v)}
            className="flex items-center gap-2 rounded-xl border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:border-sc-navy hover:text-sc-navy transition-colors">
            <Link2 className="size-3.5" /> Link Existing
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-2 px-5 pb-4">
          <button onClick={() => setShowLink(true)}
            className="flex items-center gap-2 rounded-xl border border-sc-gray-200 px-4 py-2 text-label-sm text-sc-gray hover:border-sc-navy hover:text-sc-navy transition-colors">
            <Link2 className="size-3.5" /> Link Existing Folder
          </button>
        </div>
      )}

      {showLink && (
        <div className="flex items-center gap-2 px-5 pb-4">
          <input
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="Paste Drive folder URL or folder ID…"
            className="flex-1 rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy placeholder:text-sc-gray-300 focus:border-sc-teal focus:outline-none"
          />
          <button onClick={handleLink} disabled={!linkInput.trim() || isPending}
            className="rounded-xl bg-sc-navy px-4 py-2 text-label-sm text-white font-medium disabled:opacity-50">
            Link
          </button>
          <button onClick={() => setShowLink(false)} className="text-label-sm text-sc-gray hover:text-sc-navy">Cancel</button>
        </div>
      )}

      {/* Subfolder list */}
      {expanded && (
        <div className="border-t border-sc-gray-100 divide-y divide-sc-gray-50">
          {subfolders.length > 0 ? subfolders.map((sf) => (
            <div key={sf.key} className="flex items-center gap-3 px-5 py-2.5">
              {sf.is_internal_only && <Lock className="size-3.5 text-sc-rose shrink-0" />}
              {!sf.is_internal_only && sf.parent_can_view && <CheckCircle className="size-3.5 text-sc-teal shrink-0" />}
              {!sf.is_internal_only && !sf.parent_can_view && <div className="size-3.5 shrink-0" />}
              <span className="text-label-sm text-sc-gray flex-1">{sf.folder_name}</span>
              {sf.google_drive_folder_url && (
                <a href={sf.google_drive_folder_url} target="_blank" rel="noopener noreferrer"
                  className="text-label-sm text-sc-teal hover:underline">
                  Open
                </a>
              )}
            </div>
          )) : STUDENT_SUBFOLDERS.map((sf) => (
            <div key={sf.key} className="flex items-center gap-3 px-5 py-2">
              {sf.isInternalOnly && <Lock className="size-3.5 text-sc-rose shrink-0" />}
              {!sf.isInternalOnly && <CheckCircle className="size-3.5 text-sc-gray-300 shrink-0" />}
              <span className="text-label-sm text-sc-gray-400">{sf.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
