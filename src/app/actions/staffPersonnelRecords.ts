"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";
import { logAudit } from "@/lib/audit";

// ── Types ─────────────────────────────────────────────────────────────────

export type PersonnelRecordType =
  | "documented_conversation"
  | "coaching"
  | "verbal_warning"
  | "written_warning"
  | "policy_violation"
  | "performance_concern"
  | "corrective_action"
  | "commendation"
  | "other";

export type PersonnelRecordStatus = "open" | "resolved" | "no_further_action";
export type FollowUpStatus        = "pending" | "completed";

export const RECORD_TYPE_LABELS: Record<PersonnelRecordType, string> = {
  documented_conversation: "Documented Conversation",
  coaching:                "Coaching / Counseling",
  verbal_warning:          "Verbal Warning",
  written_warning:         "Written Warning",
  policy_violation:        "Policy Violation",
  performance_concern:     "Performance Concern",
  corrective_action:       "Corrective Action",
  commendation:            "Commendation / Positive Note",
  other:                   "Other",
};

export const RECORD_TYPE_COLOR: Record<PersonnelRecordType, string> = {
  documented_conversation: "bg-sc-navy-50  text-sc-navy   border-sc-navy-200",
  coaching:                "bg-sc-teal-50  text-sc-teal-700 border-sc-teal-200",
  verbal_warning:          "bg-sc-gold-50  text-sc-gold-700 border-sc-gold-200",
  written_warning:         "bg-sc-rose-50  text-sc-rose-700 border-sc-rose-200",
  policy_violation:        "bg-sc-rose-50  text-sc-rose-700 border-sc-rose-200",
  performance_concern:     "bg-sc-gold-50  text-sc-gold-700 border-sc-gold-200",
  corrective_action:       "bg-sc-rose-50  text-sc-rose-700 border-sc-rose-200",
  commendation:            "bg-sc-teal-50  text-sc-teal-700 border-sc-teal-200",
  other:                   "bg-sc-gray-100 text-sc-gray     border-sc-gray-200",
};

export interface StaffPersonnelRecord {
  id:                   string;
  organization_id:      string;
  staff_roster_id:      string;
  record_type:          PersonnelRecordType;
  title:                string;
  notes:                string;
  date:                 string;
  related_policy:       string | null;
  action_taken:         string | null;
  private_admin_notes:  string | null;
  follow_up_required:   boolean;
  follow_up_date:       string | null;
  follow_up_status:     FollowUpStatus;
  status:               PersonnelRecordStatus;
  archived_at:          string | null;
  created_by:           string;
  created_by_name:      string;
  updated_by:           string | null;
  created_at:           string;
  updated_at:           string;
}

export interface PersonnelRecordPayload {
  record_type:          PersonnelRecordType;
  title:                string;
  notes:                string;
  date:                 string;
  related_policy?:      string | null;
  action_taken?:        string | null;
  private_admin_notes?: string | null;
  follow_up_required?:  boolean;
  follow_up_date?:      string | null;
  status?:              PersonnelRecordStatus;
}

type AR = { success: true } | { success: false; error: string };

// ── Auth guard ────────────────────────────────────────────────────────────

async function assertPersonnelAccess() {
  const [user, orgId, role] = await Promise.all([
    getUser(), getActiveOrgId(), getActiveRole(),
  ]);
  if (!user || !orgId) return { ok: false as const, error: "Not authenticated." };
  if (!["full_admin", "platform_admin"].includes(role ?? "")) {
    return { ok: false as const, error: "Full Admin access required for personnel records." };
  }
  return { ok: true as const, user, orgId };
}

function fromRow(r: Record<string, unknown>): StaffPersonnelRecord {
  const creator = r.creator as { full_name?: string } | null;
  return {
    id:                  r.id                  as string,
    organization_id:     r.organization_id     as string,
    staff_roster_id:     r.staff_roster_id     as string,
    record_type:         r.record_type         as PersonnelRecordType,
    title:               r.title               as string,
    notes:               r.notes               as string,
    date:                r.date                as string,
    related_policy:      (r.related_policy      as string | null) ?? null,
    action_taken:        (r.action_taken        as string | null) ?? null,
    private_admin_notes: (r.private_admin_notes as string | null) ?? null,
    follow_up_required:  Boolean(r.follow_up_required),
    follow_up_date:      (r.follow_up_date      as string | null) ?? null,
    follow_up_status:    (r.follow_up_status    as FollowUpStatus) ?? "pending",
    status:              (r.status              as PersonnelRecordStatus) ?? "open",
    archived_at:         (r.archived_at         as string | null) ?? null,
    created_by:          r.created_by           as string,
    created_by_name:     creator?.full_name     ?? "Admin",
    updated_by:          (r.updated_by          as string | null) ?? null,
    created_at:          r.created_at           as string,
    updated_at:          r.updated_at           as string,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────

export async function getStaffPersonnelRecords(
  staffRosterId: string,
  includeArchived = false,
): Promise<StaffPersonnelRecord[]> {
  const auth = await assertPersonnelAccess();
  if (!auth.ok) return [];

  const supabase = await createClient();
  let q = supabase
    .from("staff_personnel_records")
    .select(`
      id, organization_id, staff_roster_id, record_type, title, notes, date,
      related_policy, action_taken, private_admin_notes,
      follow_up_required, follow_up_date, follow_up_status, status, archived_at,
      created_by, updated_by, created_at, updated_at,
      creator:created_by ( full_name )
    `)
    .eq("organization_id", auth.orgId)
    .eq("staff_roster_id", staffRosterId)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (!includeArchived) q = q.is("archived_at", null);

  const { data } = await q;
  return ((data ?? []) as unknown[]).map((r) => fromRow(r as Record<string, unknown>));
}

/** Upcoming/overdue follow-ups for the org — used by operations dashboard alerts. */
export async function getStaffFollowUpAlerts(): Promise<
  Array<{ id: string; staff_name: string; title: string; follow_up_date: string; days_overdue: number }>
> {
  const auth = await assertPersonnelAccess();
  if (!auth.ok) return [];

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  // Overdue or due in next 7 days
  const upcoming = new Date();
  upcoming.setDate(upcoming.getDate() + 7);
  const upcomingStr = upcoming.toISOString().split("T")[0];

  const { data } = await supabase
    .from("staff_personnel_records")
    .select(`
      id, title, follow_up_date, staff_roster_id,
      staff_roster:staff_roster_id ( first_name, last_name )
    `)
    .eq("organization_id", auth.orgId)
    .eq("follow_up_required", true)
    .eq("follow_up_status", "pending")
    .is("archived_at", null)
    .lte("follow_up_date", upcomingStr)
    .order("follow_up_date", { ascending: true });

  return ((data ?? []) as unknown[]).map((r) => {
    const row    = r as Record<string, unknown>;
    const staff  = row.staff_roster as { first_name: string; last_name: string } | null;
    const due    = row.follow_up_date as string;
    const daysOverdue = Math.floor(
      (new Date(today).getTime() - new Date(due).getTime()) / 86_400_000
    );
    return {
      id:           row.id   as string,
      staff_name:   staff ? `${staff.first_name} ${staff.last_name}` : "Staff",
      title:        row.title as string,
      follow_up_date: due,
      days_overdue: daysOverdue,
    };
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────

export async function createStaffPersonnelRecord(
  staffRosterId: string,
  payload: PersonnelRecordPayload,
): Promise<AR> {
  const auth = await assertPersonnelAccess();
  if (!auth.ok) return { success: false, error: auth.error };
  if (!payload.title.trim())  return { success: false, error: "Title is required." };
  if (!payload.notes.trim())  return { success: false, error: "Notes are required." };
  if (!payload.date)          return { success: false, error: "Date is required." };

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("staff_personnel_records")
    .insert({
      organization_id:     auth.orgId,
      staff_roster_id:     staffRosterId,
      record_type:         payload.record_type,
      title:               payload.title.trim(),
      notes:               payload.notes.trim(),
      date:                payload.date,
      related_policy:      payload.related_policy?.trim()      || null,
      action_taken:        payload.action_taken?.trim()        || null,
      private_admin_notes: payload.private_admin_notes?.trim() || null,
      follow_up_required:  payload.follow_up_required ?? false,
      follow_up_date:      payload.follow_up_required ? (payload.follow_up_date || null) : null,
      status:              payload.status ?? "open",
      created_by:          auth.user.id,
    } as never)
    .select("id")
    .single();

  if (error || !inserted) return { success: false, error: error?.message ?? "Failed to create record." };

  await logAudit({
    organization_id: auth.orgId,
    actor_id:        auth.user.id,
    action:          "record.created",
    resource_type:   "staff_personnel_record",
    resource_id:     (inserted as unknown as { id: string }).id,
    new_values:      { record_type: payload.record_type, staff_roster_id: staffRosterId },
  });

  revalidatePath(`/dashboard/staff/${staffRosterId}`);
  return { success: true };
}

export async function updateStaffPersonnelRecord(
  recordId:       string,
  staffRosterId:  string,
  payload: Partial<PersonnelRecordPayload> & {
    follow_up_status?: FollowUpStatus;
  },
): Promise<AR> {
  const auth = await assertPersonnelAccess();
  if (!auth.ok) return { success: false, error: auth.error };

  const update: Record<string, unknown> = {
    updated_by: auth.user.id,
    updated_at: new Date().toISOString(),
  };
  if (payload.record_type         !== undefined) update.record_type         = payload.record_type;
  if (payload.title               !== undefined) update.title               = payload.title.trim();
  if (payload.notes               !== undefined) update.notes               = payload.notes.trim();
  if (payload.date                !== undefined) update.date                = payload.date;
  if (payload.related_policy      !== undefined) update.related_policy      = payload.related_policy?.trim() || null;
  if (payload.action_taken        !== undefined) update.action_taken        = payload.action_taken?.trim()   || null;
  if (payload.private_admin_notes !== undefined) update.private_admin_notes = payload.private_admin_notes?.trim() || null;
  if (payload.follow_up_required  !== undefined) update.follow_up_required  = payload.follow_up_required;
  if (payload.follow_up_date      !== undefined) update.follow_up_date      = payload.follow_up_date || null;
  if (payload.follow_up_status    !== undefined) update.follow_up_status    = payload.follow_up_status;
  if (payload.status              !== undefined) update.status              = payload.status;

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_personnel_records")
    .update(update as never)
    .eq("id", recordId)
    .eq("organization_id", auth.orgId);

  if (error) return { success: false, error: error.message };

  await logAudit({
    organization_id: auth.orgId,
    actor_id:        auth.user.id,
    action:          "record.updated",
    resource_type:   "staff_personnel_record",
    resource_id:     recordId,
    new_values:      update,
  });

  revalidatePath(`/dashboard/staff/${staffRosterId}`);
  return { success: true };
}

export async function archiveStaffPersonnelRecord(
  recordId:      string,
  staffRosterId: string,
): Promise<AR> {
  const auth = await assertPersonnelAccess();
  if (!auth.ok) return { success: false, error: auth.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_personnel_records")
    .update({ archived_at: new Date().toISOString(), updated_by: auth.user.id } as never)
    .eq("id", recordId)
    .eq("organization_id", auth.orgId);

  if (error) return { success: false, error: error.message };

  await logAudit({
    organization_id: auth.orgId,
    actor_id:        auth.user.id,
    action:          "record.archived",
    resource_type:   "staff_personnel_record",
    resource_id:     recordId,
  });

  revalidatePath(`/dashboard/staff/${staffRosterId}`);
  return { success: true };
}
