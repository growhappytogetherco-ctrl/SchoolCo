"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";

type AR<T = undefined> = { success: true; data?: T } | { success: false; error: string };

async function assertFullAdmin() {
  const [user, orgId, role] = await Promise.all([getUser(), getActiveOrgId(), getActiveRole()]);
  if (!user || !orgId) return { ok: false as const, error: "Not authenticated." };
  if (!["full_admin", "platform_admin"].includes(role ?? "")) {
    return { ok: false as const, error: "Full Admin access required." };
  }
  return { ok: true as const, user, orgId };
}

export async function regenerateAttendanceQrToken(studentId: string): Promise<AR<string>> {
  const auth = await assertFullAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const newToken = `ATT-${randomBytes(12).toString("hex")}`;

  const { data, error } = await admin
    .from("students")
    .update({ attendance_qr_token: newToken } as never)
    .eq("id", studentId)
    .eq("organization_id", auth.orgId)
    .select("attendance_qr_token")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to regenerate token." };

  revalidatePath(`/dashboard/students/${studentId}/badge`);
  revalidatePath(`/dashboard/students/${studentId}`);
  return { success: true, data: (data as { attendance_qr_token: string }).attendance_qr_token };
}

export async function regenerateProfileQrToken(studentId: string): Promise<AR<string>> {
  const auth = await assertFullAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const admin = createAdminClient();
  const newToken = `PRF-${randomBytes(12).toString("hex")}`;

  const { data, error } = await admin
    .from("students")
    .update({ profile_qr_token: newToken } as never)
    .eq("id", studentId)
    .eq("organization_id", auth.orgId)
    .select("profile_qr_token")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to regenerate token." };

  revalidatePath(`/dashboard/students/${studentId}/badge`);
  revalidatePath(`/dashboard/students/${studentId}`);
  return { success: true, data: (data as { profile_qr_token: string }).profile_qr_token };
}
