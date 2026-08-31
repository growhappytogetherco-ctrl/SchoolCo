/**
 * /dashboard/staff/[id]/badge
 *
 * Staff attendance QR badge page.
 * Shows the STF- QR code, Download PNG, and Regenerate (full_admin only).
 */

import { redirect } from "next/navigation";
import { createClient, getUser, getActiveOrgId, getActiveRole } from "@/lib/supabase/server";
import { StaffBadgePrintClient } from "./StaffBadgePrintClient";

export default async function StaffBadgePage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const role = (await getActiveRole()) ?? "staff";

  // Only staff and above may view badges
  const allowed = new Set(["teacher", "staff", "registrar", "admin", "full_admin", "platform_admin"]);
  if (!allowed.has(role)) redirect("/dashboard/home");

  const isFullAdmin = ["full_admin", "platform_admin"].includes(role);

  const supabase = await createClient();
  const { data: member } = await supabase
    .from("staff_roster")
    .select("id, first_name, last_name, display_title, avatar_url, status, attendance_qr_token")
    .eq("id", params.id)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .maybeSingle();

  if (!member) redirect("/dashboard/staff");

  return (
    <StaffBadgePrintClient
      member={{
        id:                  member.id as string,
        first_name:          member.first_name as string,
        last_name:           member.last_name as string,
        display_title:       (member.display_title as string | null) ?? null,
        avatar_url:          (member.avatar_url as string | null) ?? null,
        status:              member.status as string,
        attendance_qr_token: (member.attendance_qr_token as string | null) ?? null,
      }}
      isFullAdmin={isFullAdmin}
    />
  );
}
