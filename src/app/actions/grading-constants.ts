// Grading constants and types — NOT a "use server" file.
// Import from here in client components; import from grading.ts in server actions only.

export type { GradeStatus, GradingMethod, AssignmentCategory, GradeScaleLevel,
  QuarterGradeResult, WeightedGradeResult, SemesterGradeResult, YTDGradeResult,
  CategoryWeights, GradeInput } from "@/lib/grading/types";

export const ASSIGNMENT_CATEGORY_LABELS: Record<string, string> = {
  homework:      "Homework",
  classwork:     "Classwork",
  project:       "Project",
  quiz:          "Quiz",
  test:          "Test",
  participation: "Participation",
  lab:           "Lab",
  other:         "Other",
};

export const GRADE_STATUS_LABELS: Record<string, string> = {
  graded:      "Graded",
  missing:     "Missing",
  excused:     "Excused",
  absent:      "Absent",
  incomplete:  "Incomplete",
  not_graded:  "Not Graded",
};

export interface CourseSection {
  id:             string;
  organization_id: string;
  school_year_id: string;
  subject:        string;
  course_name:    string;
  teacher_id:     string | null;
  teacher_name:   string | null;
  status:         string;
  created_at:     string;
}

export interface Assignment {
  id:                string;
  organization_id:   string;
  course_section_id: string;
  grading_period_id: string;
  title:             string;
  description:       string | null;
  category:          string;
  assigned_date:     string | null;
  due_date:          string | null;
  points_possible:   number;
  is_graded:         boolean;
  status:            string;
  created_by:        string | null;
  created_at:        string;
  updated_at:        string;
}

export interface StudentGrade {
  id:             string;
  organization_id: string;
  assignment_id:  string;
  student_id:     string;
  points_earned:  number | null;
  grade_status:   string;
  teacher_note:   string | null;
  entered_by:     string | null;
  created_at:     string;
  updated_at:     string;
}

// Payload types for server actions
export interface CreateAssignmentPayload {
  orgId:           string;
  courseSectionId: string;
  title:           string;
  description?:    string;
  category:        string;
  assignedDate:    string;    // ISO date — used to auto-resolve quarter
  dueDate?:        string;
  pointsPossible:  number;
  isGraded?:       boolean;
  gradingPeriodId?: string;  // optional override; auto-resolved from assignedDate if omitted
}

export interface UpsertGradePayload {
  orgId:        string;
  assignmentId: string;
  studentId:    string;
  pointsEarned: number | null;
  gradeStatus:  string;
  teacherNote?: string;
}

// Gradebook batch response — all data needed to render one period's gradebook grid
export interface GradebookData {
  courseSectionId: string;
  periodId:        string;
  assignments:     Assignment[];
  studentRows:     GradebookStudentRow[];
}

export interface GradebookStudentRow {
  studentId:   string;
  studentName: string;
  grades:      Record<string, StudentGrade | null>;  // keyed by assignment_id
  quarterGrade: import("@/lib/grading/types").QuarterGradeResult | null;
}
