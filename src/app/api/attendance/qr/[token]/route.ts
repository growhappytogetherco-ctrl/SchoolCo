import { NextResponse } from "next/server";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";

/**
 * GET /api/attendance/qr/[token]
 *
 * Resolves an attendance QR token (ATT-*) to a student record including
 * today's attendance status and any medical alerts.
 *
 * Security:
 * - Requires an authenticated staff session.
 * - Only resolves tokens belonging to students in the caller's active org.
 * - Returns 401 if unauthenticated, 403 if org mismatch, 404 if not found.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const orgId = await getActiveOrgId();
  if (!orgId) {
    return NextResponse.json({ error: "No active organization" }, { status: 403 });
  }

  const { token } = params;
  if (!token.startsWith("ATT-")) {
    return NextResponse.json({ error: "Invalid attendance QR code" }, { status: 400 });
  }

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  // Resolve student — only within caller's org
  const { data: student, error } = await supabase
    .from("students")
    .select(`
      id, first_name, last_name, preferred_name, grade_level,
      medical_notes, allergies, authorized_pickup_notes,
      enrollment_status, organization_id
    `)
    .eq("attendance_qr_token", token)
    .eq("organization_id", orgId)
    .eq("enrollment_status", "enrolled")
    .is("archived_at", null)
    .single();

  if (error || !student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  // Today's attendance record
  const { data: record } = await supabase
    .from("attendance_records")
    .select("id, status, check_in_at, check_out_at, is_late, is_early_pickup")
    .eq("organization_id", orgId)
    .eq("student_id", student.id)
    .eq("date", today)
    .single();

  // Active medication alerts
  const { data: medAlerts } = await supabase
    .from("medication_alerts")
    .select("id, medication_name, dosage, instructions, is_emergency, storage_location")
    .eq("student_id", student.id)
    .eq("is_active", true);

  // Structured severe/life-threatening allergies
  const { data: allergyDetails } = await supabase
    .from("student_allergies")
    .select("id, allergy_name, severity, emergency_medication_required, reaction")
    .eq("student_id", student.id)
    .eq("organization_id", orgId)
    .in("severity", ["severe", "life_threatening"])
    .eq("is_active", true)
    .is("archived_at", null);

  return NextResponse.json({
    student: {
      id: student.id,
      first_name: student.first_name,
      last_name: student.last_name,
      preferred_name: student.preferred_name,
      grade_level: student.grade_level,
      medical_notes: student.medical_notes,
      allergies: student.allergies ?? [],
      authorized_pickup_notes: student.authorized_pickup_notes,
    },
    today_record: record ?? null,
    medication_alerts: medAlerts ?? [],
    allergy_details: allergyDetails ?? [],
  });
}
