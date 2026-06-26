// ─── Folder structure ─────────────────────────────────────────────────────────

export interface SubfolderDef {
  key: string;
  name: string;         // Google Drive display name (with sort prefix)
  sortOrder: number;
  isInternalOnly: boolean;     // Medical, Incidents → always internal
  parentCanView: boolean;      // Default for new uploads to this folder
  yearbookEligible: boolean;   // Whether items here can appear in portfolio
  description: string;
}

export const STUDENT_SUBFOLDERS: SubfolderDef[] = [
  { key: "enrollment",       name: "01 — Enrollment",        sortOrder:  1, isInternalOnly: true,  parentCanView: false, yearbookEligible: false, description: "Enrollment forms, applications, contracts" },
  { key: "medical",          name: "02 — Medical",           sortOrder:  2, isInternalOnly: true,  parentCanView: false, yearbookEligible: false, description: "Health records, medications, doctor notes — NEVER shared" },
  { key: "incident_reports", name: "03 — Incident Reports",  sortOrder:  3, isInternalOnly: true,  parentCanView: false, yearbookEligible: false, description: "Behavioral and safety incidents — staff only" },
  { key: "assessments",      name: "04 — Assessments",       sortOrder:  4, isInternalOnly: true,  parentCanView: false, yearbookEligible: false, description: "Test results, evaluations, benchmarks" },
  { key: "progress_reports", name: "05 — Progress Reports",  sortOrder:  5, isInternalOnly: false, parentCanView: true,  yearbookEligible: false, description: "Report cards and progress updates — parent shareable" },
  { key: "work_samples",     name: "06 — Work Samples",      sortOrder:  6, isInternalOnly: false, parentCanView: true,  yearbookEligible: true,  description: "Student work — shareable with parents and yearbook" },
  { key: "leadership",       name: "07 — Leadership",        sortOrder:  7, isInternalOnly: false, parentCanView: true,  yearbookEligible: true,  description: "Leadership evidence, badge documentation, speeches" },
  { key: "entrepreneurship", name: "08 — Entrepreneurship",  sortOrder:  8, isInternalOnly: false, parentCanView: true,  yearbookEligible: true,  description: "Business plans, pitch decks, project materials" },
  { key: "photos",           name: "09 — Photos",            sortOrder:  9, isInternalOnly: false, parentCanView: true,  yearbookEligible: true,  description: "Student photos, event photos, portraits" },
  { key: "parent_shared",    name: "10 — Parent Shared",     sortOrder: 10, isInternalOnly: false, parentCanView: true,  yearbookEligible: false, description: "Documents explicitly shared by admin with parents" },
  { key: "yearbook_archive", name: "11 — Yearbook Archive",  sortOrder: 11, isInternalOnly: false, parentCanView: false, yearbookEligible: true,  description: "End-of-year portfolio exports and memories" },
];

export function getSubfolder(key: string): SubfolderDef | undefined {
  return STUDENT_SUBFOLDERS.find((s) => s.key === key);
}

// ─── Drive operation results ──────────────────────────────────────────────────

export type DriveResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

export interface CreatedFolder {
  folderId: string;
  folderUrl: string;
}

export interface CreatedSubfolders {
  rootFolder: CreatedFolder;
  subfolders: Array<{ key: string; folderId: string; folderUrl: string }>;
}

export interface UploadedFile {
  fileId: string;
  fileUrl: string;
  thumbnailUrl?: string;
  mimeType: string;
  fileSizeBytes: number;
}

// ─── Work sample types ────────────────────────────────────────────────────────

export type FileType = "pdf" | "image" | "video" | "audio" | "document" | "spreadsheet" | "presentation" | "link" | "other";
export type Visibility = "internal" | "parent_visible" | "yearbook_eligible";

export interface WorkSample {
  id: string;
  student_id: string;
  organization_id: string;
  uploaded_by: string | null;
  title: string;
  subject: string | null;
  description: string | null;
  work_date: string | null;
  grade_level: string | null;
  file_type: FileType;
  google_drive_file_id: string | null;
  google_drive_file_url: string | null;
  google_drive_folder_key: string | null;
  storage_path: string | null;
  external_url: string | null;
  thumbnail_url: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  visibility: Visibility;
  visible_to_parent: boolean;
  include_in_yearbook: boolean;
  yearbook_caption: string | null;
  yearbook_section: string | null;
  yearbook_highlight: boolean;
  quality_rating: number | null;
  teacher_comments: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  uploader_name?: string | null;
}

export const FILE_TYPE_ICONS: Record<FileType, string> = {
  pdf:          "📄",
  image:        "🖼️",
  video:        "🎬",
  audio:        "🎵",
  document:     "📝",
  spreadsheet:  "📊",
  presentation: "📊",
  link:         "🔗",
  other:        "📎",
};

export const SUBJECT_OPTIONS = [
  "Math", "English / ELA", "Science", "Social Studies", "History",
  "Art", "Music", "Physical Education", "Leadership", "Entrepreneurship",
  "Service Learning", "STEM", "Technology", "Spanish", "Other",
];

export const YEARBOOK_SECTIONS = [
  { value: "academic",        label: "Academic Highlights" },
  { value: "leadership",      label: "Leadership & Character" },
  { value: "arts",            label: "Arts & Creativity" },
  { value: "service",         label: "Community Service" },
  { value: "entrepreneurship",label: "Entrepreneurship" },
  { value: "sports",          label: "Sports & Athletics" },
  { value: "memories",        label: "Memories & Photos" },
];
