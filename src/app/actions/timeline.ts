"use server";

import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";

export interface CreateTimelineEntryInput {
  organization_id:      string;
  student_id?:          string | null;
  family_id?:           string | null;
  entry_type:           string;
  title:                string;
  body?:                string | null;
  icon?:                string | null;
  color_key?:           string;
  source_event_name?:   string;
  source_resource_type?: string;
  source_resource_id?:  string;
  staff_only?:          boolean;
  requires_approval?:   boolean;
  is_celebration?:      boolean;
  occurred_at?:         string;
  metadata?:            Record<string, unknown>;
}

/**
 * createTimelineEntry — append an entry to a student or family's timeline.
 *
 * Called internally from other server actions (not directly from the UI).
 * The Timeline Engine is the only writer of timeline_entries in Sprint 2.
 *
 * Security: uses the calling server action's auth context.
 * Entries are append-only. No delete policy exists.
 */
export async function createTimelineEntry(
  input: CreateTimelineEntryInput
): Promise<ActionResult<{ id: string }>> {
  if (!input.student_id && !input.family_id) {
    return { success: false, error: "Timeline entry must have a student_id or family_id." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("timeline_entries")
    .insert({
      organization_id:      input.organization_id,
      student_id:           input.student_id ?? null,
      family_id:            input.family_id ?? null,
      entry_type:           input.entry_type,
      title:                input.title,
      body:                 input.body ?? null,
      icon:                 input.icon ?? null,
      color_key:            input.color_key ?? "teal",
      source_event_name:    input.source_event_name ?? null,
      source_resource_type: input.source_resource_type ?? null,
      source_resource_id:   input.source_resource_id ?? null,
      staff_only:           input.staff_only ?? false,
      requires_approval:    input.requires_approval ?? false,
      is_celebration:       input.is_celebration ?? false,
      occurred_at:          input.occurred_at ?? new Date().toISOString(),
      metadata:             input.metadata ?? null,
      created_by:           user?.id ?? null,
      updated_by:           user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Timeline failures are non-fatal — log but don't surface to user
    console.error("[Timeline] Failed to create entry:", error?.message);
    return { success: false, error: error?.message ?? "Failed to create timeline entry." };
  }

  return { success: true, data: { id: data.id } };
}

/**
 * approveTimelineEntry — staff approval gate for sensitive entries.
 * Required before parent-visible entries appear in family timelines.
 * Requires: admin+ role.
 */
export async function approveTimelineEntry(
  entryId: string
): Promise<ActionResult<void>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const { data: entry } = await supabase
    .from("timeline_entries")
    .select("organization_id, requires_approval, approved_at")
    .eq("id", entryId)
    .single();

  if (!entry) return { success: false, error: "Entry not found." };
  if (entry.approved_at) return { success: false, error: "Entry already approved." };

  const { error } = await supabase
    .from("timeline_entries")
    .update({
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_by:  user.id,
    })
    .eq("id", entryId);

  if (error) return { success: false, error: error.message };

  await logAudit({
    organization_id: entry.organization_id,
    actor_id:        user.id,
    action:          "timeline_entry.approved",
    resource_type:   "timeline_entry",
    resource_id:     entryId,
    metadata:        {},
  });

  return { success: true, data: undefined };
}
