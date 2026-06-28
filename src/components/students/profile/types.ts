// Shared types for the student profile system

export type TabId =
  | "overview"
  | "goals"
  | "support"
  | "academics"
  | "medical"
  | "attendance"
  | "notes"
  | "incidents"
  | "documents"
  | "leadership"
  | "entrepreneurship"
  | "family"
  | "plan";

export interface MedicationAlert {
  id: string;
  medication_name: string;
  is_emergency: boolean;
  dosage: string | null;
  storage_location: string | null;
  instructions: string | null;
}

export interface TodayAttendance {
  status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  is_late: boolean;
  is_early_pickup: boolean;
}

export interface StudentProfileData {
  id: string;
  student_display_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  grade_level: string | null;
  track: string | null;
  enrollment_status: string;
  enrollment_date: string | null;
  expected_graduation: string | null;
  date_of_birth: string | null;
  medical_notes: string | null;
  allergies: string[];
  scholarship_info: Record<string, string> | null;
  authorized_pickup_notes: string | null;
  attendance_qr_token: string | null;
  profile_qr_token: string | null;
  avatar_url: string | null;
  family: {
    id: string;
    family_name: string;
    family_display_id: string;
    is_split_household: boolean;
  } | null;
  today_attendance: TodayAttendance | null;
  medication_alerts: MedicationAlert[];
  top_badge_level: string | null;
  badge_count: number;
  active_project_count: number;
  drive_folder_status: string;
  drive_folder_url: string | null;
}
