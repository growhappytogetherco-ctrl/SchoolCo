import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/constants";

/**
 * Safe server-side diagnostic for Anthropic configuration.
 * Staff-only. Returns only "available" or "unavailable" — never the key value.
 *
 * GET /api/diagnostic/anthropic
 */
export async function GET() {
  // Require authenticated staff
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: members } = await (supabase as any)
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .limit(1);

  const role = (members?.[0] as { role: string } | undefined)?.role ?? "";
  if (!isStaffRole(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const configured = !!process.env.ANTHROPIC_API_KEY;

  return NextResponse.json({
    anthropic: configured ? "available" : "unavailable",
  });
}
