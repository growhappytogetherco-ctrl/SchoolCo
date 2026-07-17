import { notFound, redirect } from "next/navigation";
import { createClient, getUser, getActiveOrgId, getActiveRole } from "@/lib/supabase/server";
import { StudentProfile } from "@/components/students/profile/StudentProfile";
import { getStudentSafetyAlerts } from "@/app/actions/studentAlerts";

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const role = (await getActiveRole()) ?? "volunteer";
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const tab = searchParams.tab ?? "overview";

  // Core student — always needed for header
  const { data: student } = await supabase
    .from("students")
    .select(`
      id, student_display_id, first_name, last_name, preferred_name,
      grade_level, track, enrollment_status, enrollment_date, expected_graduation,
      date_of_birth, medical_notes, allergies, scholarship_info,
      authorized_pickup_notes, attendance_qr_token, profile_qr_token, avatar_url,
      family_id, google_drive_folder_id, google_drive_folder_url, drive_folder_status,
      families ( id, family_name, family_display_id, is_split_household )
    `)
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .single();

  if (!student) notFound();

  // Today's attendance (header status + quick actions)
  const { data: todayAttendance } = await supabase
    .from("attendance_records")
    .select("status, check_in_at, check_out_at, is_late, is_early_pickup")
    .eq("student_id", params.id)
    .eq("organization_id", orgId)
    .eq("date", today)
    .single();

  // Active medication alerts — shown in emergency banner throughout
  const { data: medAlerts } = await supabase
    .from("medication_alerts")
    .select("id, medication_name, is_emergency, dosage, storage_location, instructions")
    .eq("student_id", params.id)
    .eq("is_active", true)
    .order("is_emergency", { ascending: false });

  // Badge summary for leadership level chip
  const { data: badges } = await supabase
    .from("leadership_badges")
    .select("badge_level")
    .eq("student_id", params.id)
    .eq("organization_id", orgId);

  // Active project count for entrepreneurship chip
  const { count: activeProjectCount } = await supabase
    .from("entrepreneurship_projects")
    .select("id", { count: "exact", head: true })
    .eq("student_id", params.id)
    .eq("organization_id", orgId)
    .in("status", ["active", "pitching"]);

  // Consolidated student alerts (replaces scattered queries for allergies, flags, SSP, notes)
  const studentAlerts = await getStudentSafetyAlerts(params.id, role);

  // Derive top leadership level from badge set
  const BADGE_RANK = ["platinum", "gold", "silver", "bronze"];
  const earnedLevels = new Set((badges ?? []).map((b) => b.badge_level as string));
  const topBadgeLevel = BADGE_RANK.find((l) => earnedLevels.has(l)) ?? null;

  const profileData = {
    id: student.id as string,
    student_display_id: student.student_display_id as string | null,
    first_name: student.first_name as string,
    last_name: student.last_name as string,
    preferred_name: student.preferred_name as string | null,
    grade_level: student.grade_level as string | null,
    track: student.track as string | null,
    enrollment_status: student.enrollment_status as string,
    enrollment_date: student.enrollment_date as string | null,
    expected_graduation: student.expected_graduation as string | null,
    date_of_birth: student.date_of_birth as string | null,
    medical_notes: student.medical_notes as string | null,
    allergies: (student.allergies as string[] | null) ?? [],
    scholarship_info: student.scholarship_info as Record<string, string> | null,
    authorized_pickup_notes: student.authorized_pickup_notes as string | null,
    attendance_qr_token: student.attendance_qr_token as string | null,
    profile_qr_token: student.profile_qr_token as string | null,
    avatar_url: student.avatar_url as string | null,
    family: student.families as {
      id: string; family_name: string; family_display_id: string; is_split_household: boolean;
    } | null,
    today_attendance: todayAttendance ? {
      status: todayAttendance.status as string,
      check_in_at: todayAttendance.check_in_at as string | null,
      check_out_at: todayAttendance.check_out_at as string | null,
      is_late: todayAttendance.is_late as boolean,
      is_early_pickup: todayAttendance.is_early_pickup as boolean,
    } : null,
    medication_alerts: (medAlerts ?? []).map((m) => ({
      id: m.id as string,
      medication_name: m.medication_name as string,
      is_emergency: m.is_emergency as boolean,
      dosage: m.dosage as string | null,
      storage_location: m.storage_location as string | null,
      instructions: m.instructions as string | null,
    })),
    top_badge_level: topBadgeLevel,
    badge_count: badges?.length ?? 0,
    active_project_count: activeProjectCount ?? 0,
    drive_folder_status: (student.drive_folder_status as string | null) ?? "none",
    drive_folder_url: student.google_drive_folder_url as string | null,
  };

  // Build alertBannerFlags for backward compat with StudentProfileHeader
  const alertBannerFlags = studentAlerts
    .filter((a) => a.level !== "informational")
    .map((a) => ({
      id: a.id,
      title: `${a.title}: ${a.instruction}`,
      priority: (a.level === "critical" ? "critical" : "high") as "high" | "critical",
      category: a.category as string,
      color: a.level === "critical" ? "rose" : "gold",
    }));

  // Build pickupAlerts for backward compat with StudentProfile pickup banner
  const pickupAlerts = studentAlerts
    .filter((a) => a.category === "pickup")
    .map((a) => ({
      guardian_name: "",
      custody_type: a.level === "critical" ? "none" : "supervised",
      can_pickup: a.level !== "critical",
      pickup_restrictions: a.instruction,
    }));

  // hasOpenNotes from consolidated alerts
  const hasOpenNotes = studentAlerts.some((a) => a.category === "notes");

  return (
    <StudentProfile
      data={profileData}
      initialTab={tab}
      orgId={orgId}
      currentUserId={user.id}
      role={role}
      alertBannerFlags={alertBannerFlags}
      pickupAlerts={pickupAlerts}
      hasOpenNotes={hasOpenNotes}
      studentAlerts={studentAlerts}
    />
  );
}
