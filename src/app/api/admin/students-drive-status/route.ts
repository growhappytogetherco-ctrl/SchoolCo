/**
 * Admin-only route: returns Drive provisioning status for all students in the active org.
 * Used by /dashboard/drive-bulk-provision — remove that page and this route after use.
 */

import { NextResponse } from "next/server";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();

  // Require admin role
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const adminRoles = ["admin", "full_admin", "platform_admin"];
  if (!member || !adminRoles.includes(member.role as string)) {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name, student_display_id, google_drive_folder_id, google_drive_folder_url, drive_folder_status")
    .eq("organization_id", orgId)
    .order("student_display_id");

  const mapped = (students ?? []).map((s: any) => ({
    id:         s.id,
    displayId:  s.student_display_id ?? s.id,
    name:       `${s.first_name} ${s.last_name}`,
    status:     s.drive_folder_status === "active" && s.google_drive_folder_id
                  ? "skipped"
                  : s.drive_folder_status === "error"
                  ? "error"
                  : "pending",
    folderUrl:  s.google_drive_folder_url ?? undefined,
    error:      s.drive_folder_status === "error" ? "Previous error — retry" : undefined,
  }));

  return NextResponse.json({ students: mapped });
}
