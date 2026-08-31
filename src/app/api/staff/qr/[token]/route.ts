import { NextResponse } from "next/server";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";

const ALLOWED_ROLES = new Set([
  "teacher", "staff", "registrar", "admin", "full_admin", "platform_admin",
]);

/**
 * GET /api/staff/qr/[token]
 *
 * Resolves a staff attendance QR token (STF-*) to the staff roster member
 * and today's attendance record.
 *
 * Security:
 *   - Requires authenticated session with staff role (no volunteers)
 *   - Scoped to caller's active org
 *   - STF- token purpose enforced: ATT-/PRF- tokens rejected here
 *   - Only ACTIVE staff members return a valid response
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

  const memberRole = (membership as { role: string } | null)?.role;
  if (!memberRole || !ALLOWED_ROLES.has(memberRole)) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { token } = params;

  // Token purpose enforcement: ONLY STF- tokens accepted here
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "Invalid token" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (token.startsWith("ATT-") || token.startsWith("PRF-")) {
    return NextResponse.json(
      { error: "This is a student QR code. Staff attendance requires a STF- badge." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!/^STF-[A-Za-z0-9_-]+$/.test(token)) {
    return NextResponse.json(
      { error: "Invalid staff QR code" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Resolve staff member — scoped to caller's org
  const { data: staffRaw } = await supabase
    .from("staff_roster")
    .select("id, first_name, last_name, display_title, avatar_url, status, organization_id")
    .eq("attendance_qr_token", token)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!staffRaw) {
    return NextResponse.json(
      { error: "Staff member not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const staff = staffRaw as {
    id: string; first_name: string; last_name: string;
    display_title: string | null; avatar_url: string | null;
    status: string; organization_id: string;
  };

  // Active check — inactive/suspended staff cannot check in
  if (staff.status !== "active") {
    return NextResponse.json(
      { error: "Staff member is not currently active.", inactive: true },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Today's attendance record
  const today = new Date().toISOString().split("T")[0];
  const { data: record } = await supabase
    .from("staff_attendance_records")
    .select("id, check_in_at, check_out_at, check_in_method, check_out_method, date")
    .eq("staff_roster_id", staff.id)
    .eq("organization_id", orgId)
    .eq("date", today)
    .maybeSingle();

  return NextResponse.json(
    {
      staff: {
        id:            staff.id,
        first_name:    staff.first_name,
        last_name:     staff.last_name,
        display_title: staff.display_title,
        avatar_url:    staff.avatar_url,
      },
      today_record: record ?? null,
    },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
