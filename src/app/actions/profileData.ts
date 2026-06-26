"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";

// ── Tab data fetchers — each called on first tab activation ────

// ── Overview: recent timeline + recent incidents + guardian list

export async function getStudentOverviewData(studentId: string) {
  const user = await getUser();
  if (!user) return null;
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const supabase = await createClient();

  const [timeline, incidents, guardians] = await Promise.all([
    supabase
      .from("timeline_entries")
      .select("id, entry_type, title, body, icon, color_key, staff_only, occurred_at, is_celebration")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .order("occurred_at", { ascending: false })
      .limit(15),
    supabase
      .from("incidents")
      .select("id, title, incident_type, severity, status, occurred_at, parent_notified")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .order("occurred_at", { ascending: false })
      .limit(5),
    supabase
      .from("guardianships")
      .select(`
        id, relationship_type, custody_type, is_primary_contact,
        is_emergency_contact, emergency_contact_order, can_pickup,
        profiles!guardianships_profile_id_fkey ( id, full_name, email, phone )
      `)
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .order("is_primary_contact", { ascending: false }),
  ]);

  return {
    timeline: timeline.data ?? [],
    incidents: incidents.data ?? [],
    guardians: guardians.data ?? [],
  };
}

// ── Medical: student_medical record + medication_alerts

export async function getStudentMedicalData(studentId: string) {
  const user = await getUser();
  if (!user) return null;
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const supabase = await createClient();

  const [medical, meds, student] = await Promise.all([
    supabase
      .from("student_medical")
      .select("*")
      .eq("student_id", studentId)
      .single(),
    supabase
      .from("medication_alerts")
      .select("*")
      .eq("student_id", studentId)
      .eq("is_active", true)
      .order("is_emergency", { ascending: false }),
    supabase
      .from("students")
      .select("allergies, medical_notes, date_of_birth")
      .eq("id", studentId)
      .single(),
  ]);

  return {
    medical: medical.data ?? null,
    medication_alerts: meds.data ?? [],
    allergies: (student.data?.allergies as string[] | null) ?? [],
    medical_notes: student.data?.medical_notes ?? null,
    date_of_birth: student.data?.date_of_birth ?? null,
  };
}

// ── Attendance: all records for the current school year

export async function getStudentAttendanceData(studentId: string) {
  const user = await getUser();
  if (!user) return null;
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const supabase = await createClient();

  // School year: starts Aug 1
  const now = new Date();
  const yearStart = now.getMonth() >= 7
    ? `${now.getFullYear()}-08-01`
    : `${now.getFullYear() - 1}-08-01`;

  const { data: records } = await supabase
    .from("attendance_records")
    .select("id, date, status, check_in_at, check_out_at, check_in_method, check_out_method, is_late, is_early_pickup, notes")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .gte("date", yearStart)
    .order("date", { ascending: false });

  const all = records ?? [];
  const present = all.filter((r) => r.status === "present" || r.check_in_at).length;
  const absent  = all.filter((r) => r.status === "absent").length;
  const tardy   = all.filter((r) => r.status === "tardy" || r.is_late).length;
  const total   = all.length;
  const pct     = total > 0 ? Math.round((present / total) * 100) : 0;

  return {
    records: all,
    stats: { total, present, absent, tardy, percentage: pct },
  };
}

// ── Incidents

export async function getStudentIncidentsData(studentId: string) {
  const user = await getUser();
  if (!user) return null;
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("incidents")
    .select("id, title, description, incident_type, severity, status, occurred_at, location, parent_notified, resolution_notes")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .order("occurred_at", { ascending: false });

  return { incidents: data ?? [] };
}

// ── Documents

export async function getStudentDocumentsData(studentId: string) {
  const user = await getUser();
  if (!user) return null;
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("student_documents")
    .select("id, title, document_type, storage_path, google_drive_id, google_drive_url, external_url, staff_only, shared_with_family, version, expires_at, uploaded_by, created_at")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  return { documents: data ?? [] };
}

// ── Leadership: badges + service hours

export async function getStudentLeadershipData(studentId: string) {
  const user = await getUser();
  if (!user) return null;
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const supabase = await createClient();

  const [badges, hours] = await Promise.all([
    supabase
      .from("leadership_badges")
      .select("id, badge_name, badge_category, badge_level, description, icon, earned_at, awarded_by, notes, featured")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .order("earned_at", { ascending: false }),
    supabase
      .from("service_hours")
      .select("id, activity_name, organization_name, hours, service_date, description, verified, verified_at")
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .order("service_date", { ascending: false }),
  ]);

  const totalHours = (hours.data ?? []).reduce((sum, h) => sum + Number(h.hours), 0);

  return {
    badges: badges.data ?? [],
    service_hours: hours.data ?? [],
    total_service_hours: totalHours,
  };
}

// ── Entrepreneurship

export async function getStudentEntrepreneurshipData(studentId: string) {
  const user = await getUser();
  if (!user) return null;
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("entrepreneurship_projects")
    .select("id, project_name, tagline, description, business_type, status, started_at, pitch_date, completed_at, revenue_earned, pitch_score, mentor_name, mentor_notes, google_drive_folder_id, pitch_deck_url")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .order("started_at", { ascending: false });

  return { projects: data ?? [] };
}

// ── Family: full family + households + guardians

export async function getStudentFamilyData(studentId: string) {
  const user = await getUser();
  if (!user) return null;
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("family_id, authorized_pickup_notes, scholarship_info")
    .eq("id", studentId)
    .single();

  if (!student?.family_id) return { family: null, households: [], guardians: [] };

  const [family, guardians] = await Promise.all([
    supabase
      .from("families")
      .select(`
        id, family_name, family_display_id, is_split_household, notes,
        households ( id, household_label, sort_order, address_json, phone, email )
      `)
      .eq("id", student.family_id)
      .single(),
    supabase
      .from("guardianships")
      .select(`
        id, relationship_type, household_id, custody_type, is_legal_guardian,
        is_primary_contact, is_emergency_contact, emergency_contact_order,
        can_pickup, pickup_restrictions,
        profiles!guardianships_profile_id_fkey ( id, full_name, email, phone, avatar_url )
      `)
      .eq("student_id", studentId)
      .eq("organization_id", orgId)
      .order("is_primary_contact", { ascending: false }),
  ]);

  return {
    family: family.data ?? null,
    households: (family.data as { households?: unknown[] } | null)?.households ?? [],
    guardians: guardians.data ?? [],
    authorized_pickup_notes: student.authorized_pickup_notes,
    scholarship_info: student.scholarship_info,
  };
}

// ── Update student_medical ──────────────────────────────────────

export async function upsertStudentMedical(
  studentId: string,
  payload: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated." };
  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("student_medical")
    .upsert({ ...payload, student_id: studentId, organization_id: orgId, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "student_id" });

  if (error) return { success: false, error: error.message };
  return { success: true };
}
