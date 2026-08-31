"use server";

/**
 * Staff QR attendance server actions.
 *
 * Identity model: keyed on staff_roster_id (NOT profile_id / auth.uid()).
 * Staff roster members may have no Supabase auth account, so all DB writes
 * use createAdminClient() to bypass RLS — same pattern as saveManualAttendance.
 *
 * The QR token (STF-) lives on staff_roster.attendance_qr_token.
 * Attendance state lives in staff_attendance_records (one row per roster member per day).
 */

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Types ─────────────────────────────────────────────────────────────────

export interface StaffAttendanceRecord {
  id:               string;
  staff_roster_id:  string;
  date:             string;
  check_in_at:      string | null;
  check_out_at:     string | null;
  check_in_method:  string | null;
  check_out_method: string | null;
}

export interface StaffOnDutyMember {
  roster_id:     string;
  first_name:    string;
  last_name:     string;
  display_title: string | null;
  avatar_url:    string | null;
  check_in_at:   string;
}

// ── Auth helpers ──────────────────────────────────────────────────────────

const SCAN_ROLES = new Set([
  "teacher", "staff", "registrar", "admin", "full_admin", "platform_admin",
]);

async function assertScanRole() {
  const [user, orgId, role] = await Promise.all([
    getUser(), getActiveOrgId(), getActiveRole(),
  ]);
  if (!user || !orgId) return { ok: false as const, error: "Not authenticated." };
  if (!role || !SCAN_ROLES.has(role)) return { ok: false as const, error: "Staff access required." };
  return { ok: true as const, user, orgId, role };
}

async function assertFullAdmin() {
  const [user, orgId, role] = await Promise.all([
    getUser(), getActiveOrgId(), getActiveRole(),
  ]);
  if (!user || !orgId) return { ok: false as const, error: "Not authenticated." };
  if (!["full_admin", "platform_admin"].includes(role ?? "")) {
    return { ok: false as const, error: "Full Admin access required." };
  }
  return { ok: true as const, user, orgId };
}

// ── Check-in ──────────────────────────────────────────────────────────────

/**
 * Check in a staff member (QR or manual).
 * Uses admin client so stub-account staff (Mel) can trigger their own check-in.
 * Concurrent upsert with ON CONFLICT DO NOTHING prevents duplicate rows.
 */
export async function checkInStaffMember(
  staffRosterId: string,
  method: "qr" | "manual" = "qr",
): Promise<
  | { success: true; record: StaffAttendanceRecord; alreadyCheckedIn?: boolean }
  | { success: false; error: string; alreadyCheckedIn?: boolean }
> {
  const auth = await assertScanRole();
  if (!auth.ok) return { success: false, error: auth.error };

  const today = new Date().toISOString().split("T")[0];
  const admin = createAdminClient();

  // Verify staff is active and belongs to this org
  const { data: staff } = await admin
    .from("staff_roster")
    .select("id, first_name, last_name, status, organization_id")
    .eq("id", staffRosterId)
    .eq("organization_id", auth.orgId)
    .maybeSingle();

  if (!staff) return { success: false, error: "Staff member not found." };
  if ((staff.status as string) !== "active") {
    return { success: false, error: "Staff member is not currently active." };
  }

  // Check for existing record today
  const { data: existing } = await admin
    .from("staff_attendance_records")
    .select("id, check_in_at, check_out_at, check_in_method, check_out_method, date, staff_roster_id")
    .eq("staff_roster_id", staffRosterId)
    .eq("date", today)
    .maybeSingle();

  if (existing?.check_in_at) {
    return {
      success: false,
      error: "Already checked in.",
      alreadyCheckedIn: true,
    };
  }

  const now = new Date().toISOString();

  if (existing) {
    // Row exists but no check_in_at — update it
    const { data: updated, error } = await admin
      .from("staff_attendance_records")
      .update({ check_in_at: now, check_in_method: method } as never)
      .eq("id", (existing as unknown as { id: string }).id)
      .select("id, staff_roster_id, date, check_in_at, check_out_at, check_in_method, check_out_method")
      .single();
    if (error || !updated) return { success: false, error: error?.message ?? "Check-in failed." };
    return { success: true, record: updated as unknown as StaffAttendanceRecord };
  }

  // Insert new record
  const { data: inserted, error } = await admin
    .from("staff_attendance_records")
    .insert({
      organization_id: auth.orgId,
      staff_roster_id: staffRosterId,
      date:            today,
      check_in_at:     now,
      check_in_method: method,
    } as never)
    .select("id, staff_roster_id, date, check_in_at, check_out_at, check_in_method, check_out_method")
    .single();

  if (error || !inserted) return { success: false, error: error?.message ?? "Check-in failed." };
  revalidatePath("/dashboard/operations");
  return { success: true, record: inserted as unknown as StaffAttendanceRecord };
}

// ── Check-out ─────────────────────────────────────────────────────────────

export async function checkOutStaffMember(
  staffRosterId: string,
  method: "qr" | "manual" = "qr",
): Promise<
  | { success: true; record: StaffAttendanceRecord }
  | { success: false; error: string }
> {
  const auth = await assertScanRole();
  if (!auth.ok) return { success: false, error: auth.error };

  const today = new Date().toISOString().split("T")[0];
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("staff_attendance_records")
    .select("id, check_in_at, check_out_at")
    .eq("staff_roster_id", staffRosterId)
    .eq("organization_id", auth.orgId)
    .eq("date", today)
    .maybeSingle();

  if (!existing?.check_in_at) {
    return { success: false, error: "Staff member is not checked in today." };
  }
  if ((existing as unknown as { check_out_at: string | null }).check_out_at) {
    return { success: false, error: "Already checked out." };
  }

  const { data: updated, error } = await admin
    .from("staff_attendance_records")
    .update({ check_out_at: new Date().toISOString(), check_out_method: method } as never)
    .eq("id", (existing as unknown as { id: string }).id)
    .select("id, staff_roster_id, date, check_in_at, check_out_at, check_in_method, check_out_method")
    .single();

  if (error || !updated) return { success: false, error: error?.message ?? "Check-out failed." };
  revalidatePath("/dashboard/operations");
  return { success: true, record: updated as unknown as StaffAttendanceRecord };
}

// ── Staff on Duty ─────────────────────────────────────────────────────────

/**
 * Returns staff members currently on campus: checked in today, not yet out.
 * Called client-side from the Operations Dashboard.
 */
export async function getStaffOnDuty(date?: string): Promise<StaffOnDutyMember[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const role = await getActiveRole();
  if (!role || !SCAN_ROLES.has(role)) return [];

  const queryDate = date ?? new Date().toISOString().split("T")[0];
  const supabase = await createClient();

  const { data } = await supabase
    .from("staff_attendance_records")
    .select(`
      id,
      check_in_at,
      staff_roster:staff_roster_id (
        id, first_name, last_name, display_title, avatar_url, status
      )
    `)
    .eq("organization_id", orgId)
    .eq("date", queryDate)
    .not("check_in_at", "is", null)
    .is("check_out_at", null);

  if (!data) return [];

  return (data as unknown[])
    .map((row) => {
      const r = row as Record<string, unknown>;
      const staff = r.staff_roster as Record<string, unknown> | null;
      if (!staff || (staff.status as string) !== "active") return null;
      return {
        roster_id:     staff.id as string,
        first_name:    staff.first_name as string,
        last_name:     staff.last_name as string,
        display_title: (staff.display_title as string | null) ?? null,
        avatar_url:    (staff.avatar_url as string | null) ?? null,
        check_in_at:   r.check_in_at as string,
      };
    })
    .filter(Boolean) as StaffOnDutyMember[];
}

// ── Regenerate QR token ───────────────────────────────────────────────────

export async function regenerateStaffQrToken(
  staffRosterId: string,
): Promise<{ success: true; token: string } | { success: false; error: string }> {
  const auth = await assertFullAdmin();
  if (!auth.ok) return { success: false, error: auth.error };

  const newToken = `STF-${randomBytes(12).toString("hex")}`;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("staff_roster")
    .update({ attendance_qr_token: newToken } as never)
    .eq("id", staffRosterId)
    .eq("organization_id", auth.orgId)
    .select("attendance_qr_token")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to regenerate token." };

  revalidatePath(`/dashboard/staff/${staffRosterId}/badge`);
  revalidatePath(`/dashboard/staff/${staffRosterId}`);
  return { success: true, token: (data as unknown as { attendance_qr_token: string }).attendance_qr_token };
}
