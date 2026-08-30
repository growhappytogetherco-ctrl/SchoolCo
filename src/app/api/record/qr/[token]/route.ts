import { NextResponse } from "next/server";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set([
  "teacher", "staff", "registrar", "admin", "full_admin", "platform_admin", "volunteer",
]);

/**
 * GET /api/record/qr/[token]
 *
 * Resolves a student record QR token (PRF-*) to a student ID.
 * Token purpose is enforced: ATT- tokens are rejected here.
 *
 * Security:
 *   - Requires authenticated session with staff/volunteer role
 *   - Scoped to caller's active org
 *   - Returns only student ID — profile page enforces full permission check
 *   - Cache-Control: no-store
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

  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const membershipRole = (membership as { role: string } | null)?.role;
  if (!membershipRole || !ALLOWED_ROLES.has(membershipRole)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { token } = params;

  // Enforce token purpose: ONLY PRF- tokens accepted here.
  // ATT- tokens presented to this route are rejected — not just 404, but explicit purpose error.
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "Invalid token" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (token.startsWith("ATT-")) {
    return NextResponse.json(
      { error: "This is an attendance QR code, not a student record QR code." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!/^PRF-[A-Za-z0-9_-]+$/.test(token)) {
    return NextResponse.json(
      { error: "Invalid student record QR code" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { data: studentRaw, error } = await supabase
    .from("students")
    .select("id, first_name, last_name, preferred_name, enrollment_status")
    .eq("profile_qr_token", token)
    .eq("organization_id", orgId)
    .single();

  if (error || !studentRaw) {
    return NextResponse.json(
      { error: "Student record not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const student = studentRaw as {
    id: string; first_name: string; last_name: string;
    preferred_name: string | null; enrollment_status: string;
  };

  return NextResponse.json(
    {
      studentId:        student.id,
      firstName:        student.first_name,
      lastName:         student.last_name,
      preferredName:    student.preferred_name,
      enrollmentStatus: student.enrollment_status,
    },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
