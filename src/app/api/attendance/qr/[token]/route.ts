import { NextResponse } from "next/server";
import { createClient, getUser, getActiveOrgId, resolveProfileId } from "@/lib/supabase/server";

// ── In-process rate limiter (per-user, per-minute sliding window) ──────────
// Each serverless instance has its own counter. This is per-instance, not
// distributed, so it provides soft protection against brute-force on a single
// warm instance. For distributed rate limiting add an external store (Redis/KV).
const QR_LIMIT_WINDOW_MS = 60_000;
const QR_LIMIT_MAX       = 120; // 120 scans per minute per user is generous for check-in
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const state = rateLimitMap.get(userId);

  if (!state || now - state.windowStart > QR_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (state.count >= QR_LIMIT_MAX) return false;
  state.count++;
  return true;
}

// Volunteer-safe response fields — name, grade, check-in status, generic safety flag only.
// Detailed medical data is restricted to staff roles.
const STAFF_ROLES    = new Set(["teacher", "staff", "registrar", "admin", "full_admin", "platform_admin"]);
const ALLOWED_ROLES  = new Set([...STAFF_ROLES, "volunteer"]);

/**
 * GET /api/attendance/qr/[token]
 *
 * Resolves an attendance QR token (ATT-*) to a student record.
 *
 * Role-differentiated response:
 *   Staff (teacher+): full student record, medication alerts, allergy details, medical notes
 *   Volunteer:        name, grade, check-in status, hasCriticalAlert flag only
 *
 * Security:
 *   - Requires authenticated session with staff or volunteer role
 *   - Scoped to caller's active org
 *   - Rate-limited: 120 requests/minute per user (per-instance)
 *   - Cache-Control: no-store (no CDN caching of medical data)
 *   - Token values are never logged
 *   - Generic errors for invalid/not-found tokens (no enumeration signal)
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

  // Rate limit before any DB work
  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } }
    );
  }

  // Verify role — resolve canonical profile ID so stub accounts (auth.uid() ≠ profiles.id) work
  const profileId = await resolveProfileId(user.id);
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", profileId)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  if (!membership || !ALLOWED_ROLES.has(membership.role)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const isStaff = STAFF_ROLES.has(membership.role);

  const { token } = params;
  // Reject clearly malformed tokens without revealing whether well-formed ones exist
  if (!token || typeof token !== "string" || !/^ATT-[A-Za-z0-9_-]+$/.test(token)) {
    return NextResponse.json(
      { error: "Invalid attendance QR code" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const today = new Date().toISOString().split("T")[0];

  // Resolve student — only within caller's org (RLS also enforces org scope)
  const { data: student, error: studentError } = await supabase
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

  if (studentError || !student) {
    // Do not distinguish "bad token" from "wrong org" — both return 404
    return NextResponse.json(
      { error: "Student not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Today's attendance record
  const { data: record } = await supabase
    .from("attendance_records")
    .select("id, status, check_in_at, check_out_at, is_late, is_early_pickup")
    .eq("organization_id", orgId)
    .eq("student_id", student.id)
    .eq("date", today)
    .single();

  // ── Volunteer response (no medical detail) ────────────────────────────────
  if (!isStaff) {
    // Check if there are ANY critical alerts without disclosing what they are.
    // Volunteers should call for authorized staff — not attempt medical intervention.
    const { count: criticalCount } = await supabase
      .from("medication_alerts")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .eq("is_emergency", true)
      .eq("is_active", true);

    const { count: severeAllergyCount } = await supabase
      .from("student_allergies")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id)
      .eq("organization_id", orgId)
      .in("severity", ["severe", "life_threatening"])
      .eq("is_active", true)
      .is("archived_at", null);

    const hasCriticalAlert = (criticalCount ?? 0) > 0 || (severeAllergyCount ?? 0) > 0;

    return NextResponse.json(
      {
        student: {
          id:             student.id,
          first_name:     student.first_name,
          last_name:      student.last_name,
          preferred_name: student.preferred_name,
          grade_level:    student.grade_level,
        },
        today_record:      record ?? null,
        has_critical_alert: hasCriticalAlert,
        // Volunteers: if hasCriticalAlert is true, display this message and call staff
        critical_alert_message: hasCriticalAlert
          ? "⚠️ MEDICAL ALERT — Notify authorized staff immediately before check-in."
          : null,
      },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  }

  // ── Staff response (full medical detail) ──────────────────────────────────
  const { data: medAlerts } = await supabase
    .from("medication_alerts")
    .select("id, medication_name, dosage, instructions, is_emergency, storage_location")
    .eq("student_id", student.id)
    .eq("is_active", true);

  const { data: allergyDetails } = await supabase
    .from("student_allergies")
    .select("id, allergy_name, severity, emergency_medication_required, reaction")
    .eq("student_id", student.id)
    .eq("organization_id", orgId)
    .in("severity", ["severe", "life_threatening"])
    .eq("is_active", true)
    .is("archived_at", null);

  const criticalAlerts: { level: string; title: string; instruction: string }[] = [];

  for (const a of allergyDetails ?? []) {
    if (a.severity === "life_threatening") {
      criticalAlerts.push({
        level:       "critical",
        title:       "LIFE-THREATENING ALLERGY",
        instruction: `${a.allergy_name}${a.emergency_medication_required ? " — Emergency medication required" : ""}`,
      });
    } else {
      criticalAlerts.push({
        level:       "high",
        title:       "SEVERE ALLERGY",
        instruction: `${a.allergy_name} — monitor closely`,
      });
    }
  }

  for (const m of medAlerts ?? []) {
    if (m.is_emergency) {
      criticalAlerts.push({
        level:       "critical",
        title:       "EMERGENCY MEDICATION",
        instruction: `${m.medication_name}${m.storage_location ? ` — stored at ${m.storage_location}` : ""}`,
      });
    }
  }

  return NextResponse.json(
    {
      student: {
        id:                      student.id,
        first_name:              student.first_name,
        last_name:               student.last_name,
        preferred_name:          student.preferred_name,
        grade_level:             student.grade_level,
        medical_notes:           student.medical_notes,
        allergies:               student.allergies ?? [],
        authorized_pickup_notes: student.authorized_pickup_notes,
      },
      today_record:      record ?? null,
      medication_alerts: medAlerts ?? [],
      allergy_details:   allergyDetails ?? [],
      alert_summary: {
        critical: criticalAlerts.filter((a) => a.level === "critical").length,
        high:     criticalAlerts.filter((a) => a.level === "high").length,
        alerts:   criticalAlerts,
      },
    },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
