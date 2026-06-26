/**
 * /dashboard/students/[id]/badge
 *
 * Printable student badge with attendance QR and profile QR.
 * Open in a new tab and use browser Print (Cmd+P / Ctrl+P) to print.
 */

import { redirect } from "next/navigation";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { BadgePrintClient } from "./BadgePrintClient";

export default async function BadgePage({ params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, student_display_id, first_name, last_name, preferred_name, grade_level, attendance_qr_token, profile_qr_token, avatar_url")
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .single();

  if (!student) redirect(`/dashboard/students`);

  // Org badge colours
  const { data: settings } = await supabase
    .from("org_settings")
    .select("badge_background_color, badge_text_color")
    .eq("organization_id", orgId)
    .single();

  return (
    <BadgePrintClient
      student={{
        id: student.id as string,
        student_display_id: student.student_display_id as string | null,
        first_name: student.first_name as string,
        last_name: student.last_name as string,
        preferred_name: student.preferred_name as string | null,
        grade_level: student.grade_level as string | null,
        attendance_qr_token: student.attendance_qr_token as string | null,
        profile_qr_token: student.profile_qr_token as string | null,
        avatar_url: student.avatar_url as string | null,
      }}
      orgName="Rising Leaders Academy"
      badgeBg={settings?.badge_background_color as string | null}
      badgeText={settings?.badge_text_color as string | null}
    />
  );
}
