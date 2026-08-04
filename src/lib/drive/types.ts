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

/**
 * Standard 13-subfolder structure for every RLA student.
 * Folder keys are stable identifiers used in DB and code.
 * Names match the spec's required folder layout exactly.
 */
export const STUDENT_SUBFOLDERS: SubfolderDef[] = [
  {
    key: "enrollment_family",
    name: "01 Enrollment & Family",
    sortOrder: 1,
    isInternalOnly: true,
    parentCanView: false,
    yearbookEligible: false,
    description: "Enrollment forms, parent agreements, handbook acknowledgments, identity and enrollment records",
  },
  {
    key: "academic_records",
    name: "02 Academic Records",
    sortOrder: 2,
    isInternalOnly: false,
    parentCanView: false,
    yearbookEligible: false,
    description: "Curriculum plans, progress reports, academic records",
  },
  {
    key: "assessments",
    name: "03 Assessments",
    sortOrder: 3,
    isInternalOnly: true,
    parentCanView: false,
    yearbookEligible: false,
    description: "BOY/MOY/EOY assessments, placement testing, benchmarks",
  },
  {
    key: "success_plan",
    name: "04 Student Success Plan",
    sortOrder: 4,
    isInternalOnly: true,
    parentCanView: false,
    yearbookEligible: false,
    description: "Goals, reviews, support plans, individualized plans",
  },
  {
    key: "work_samples",
    name: "05 Work Samples",
    sortOrder: 5,
    isInternalOnly: false,
    parentCanView: true,
    yearbookEligible: true,
    description: "Student assignments, photos of projects, writing samples, academic work",
  },
  {
    key: "portfolio_yearbook",
    name: "06 Portfolio & Yearbook",
    sortOrder: 6,
    isInternalOnly: false,
    parentCanView: false,
    yearbookEligible: true,
    description: "Selected portfolio artifacts, yearbook-approved content, end-of-year summary assets",
  },
  {
    key: "leadership",
    name: "07 Leadership",
    sortOrder: 7,
    isInternalOnly: false,
    parentCanView: true,
    yearbookEligible: true,
    description: "Badges, reflections, leadership projects",
  },
  {
    key: "entrepreneurship",
    name: "08 Entrepreneurship",
    sortOrder: 8,
    isInternalOnly: false,
    parentCanView: true,
    yearbookEligible: true,
    description: "Business plans, project records, Market Day materials",
  },
  {
    key: "attendance",
    name: "09 Attendance",
    sortOrder: 9,
    isInternalOnly: true,
    parentCanView: false,
    yearbookEligible: false,
    description: "Attendance exports or supporting documentation",
  },
  {
    key: "medical_emergency",
    name: "10 Medical & Emergency",
    sortOrder: 10,
    isInternalOnly: true,
    parentCanView: false,
    yearbookEligible: false,
    description: "Medication authorization, allergy plans, emergency action plans, private medical documents — NEVER shared",
  },
  {
    key: "incidents_safety",
    name: "11 Incidents & Safety",
    sortOrder: 11,
    isInternalOnly: true,
    parentCanView: false,
    yearbookEligible: false,
    description: "Incident attachments, safety documentation — restricted staff access only",
  },
  {
    key: "parent_visible",
    name: "12 Parent-Visible Documents",
    sortOrder: 12,
    isInternalOnly: false,
    parentCanView: true,
    yearbookEligible: false,
    description: "Documents explicitly approved for parent access, shared work samples, progress reports intended for families",
  },
  {
    key: "archived",
    name: "99 Archived",
    sortOrder: 99,
    isInternalOnly: true,
    parentCanView: false,
    yearbookEligible: false,
    description: "Superseded or inactive records",
  },
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
  /** Whether this was an existing folder (reused) or newly created */
  wasExisting?: boolean;
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
