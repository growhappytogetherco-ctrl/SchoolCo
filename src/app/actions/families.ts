"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/supabase/org-context";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";
import type { Family } from "@/types/database";

// ── Validation schemas ────────────────────────────────────────────────────

const CreateFamilySchema = z.object({
  family_name:        z.string().min(2, "Family name must be at least 2 characters").max(120),
  is_split_household: z.boolean().default(false),
  notes:              z.string().max(2000).optional(),
});

const UpdateFamilySchema = z.object({
  id:                 z.string().uuid(),
  family_name:        z.string().min(2).max(120).optional(),
  is_split_household: z.boolean().optional(),
  notes:              z.string().max(2000).optional(),
});

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * createFamily — create a new family record.
 * Requires: staff, registrar, admin, or full_admin role.
 * Auto-generates family_display_id via DB trigger.
 */
export async function createFamily(
  rawData: z.infer<typeof CreateFamilySchema>
): Promise<ActionResult<Family>> {
  const parse = CreateFamilySchema.safeParse(rawData);
  if (!parse.success) {
    return {
      success: false,
      error: "Validation failed.",
      fieldErrors: parse.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  // Verify role
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const allowedRoles = ["staff", "registrar", "admin", "full_admin", "platform_admin"];
  if (!membership || !allowedRoles.includes(membership.role)) {
    return { success: false, error: "Insufficient permissions." };
  }

  const { data, error } = await supabase
    .from("families")
    .insert({
      organization_id:    orgId,
      family_name:        parse.data.family_name,
      is_split_household: parse.data.is_split_household,
      notes:              parse.data.notes ?? null,
      created_by:         user.id,
      updated_by:         user.id,
    })
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to create family." };
  }

  await logAudit({
    organization_id:   orgId,
    actor_id:          user.id,
    action:            "family.created",
    resource_type:     "family",
    resource_id:       data.id,
    metadata:          { family_name: data.family_name },
  });

  revalidatePath("/dashboard/families");
  return { success: true, data: data as Family };
}

/**
 * updateFamily — update an existing family record.
 * Requires: staff+ role.
 */
export async function updateFamily(
  rawData: z.infer<typeof UpdateFamilySchema>
): Promise<ActionResult<Family>> {
  const parse = UpdateFamilySchema.safeParse(rawData);
  if (!parse.success) {
    return { success: false, error: "Validation failed.", fieldErrors: parse.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const { id, ...updates } = parse.data;

  const { data, error } = await supabase
    .from("families")
    .update({ ...updates, updated_by: user.id })
    .eq("id", id)
    .eq("organization_id", orgId)    // RLS + extra safety
    .is("archived_at", null)
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to update family." };
  }

  await logAudit({
    organization_id: orgId,
    actor_id:        user.id,
    action:          "family.updated",
    resource_type:   "family",
    resource_id:     id,
    metadata:        updates,
  });

  revalidatePath(`/dashboard/families/${id}`);
  return { success: true, data: data as Family };
}

/**
 * archiveFamily — soft-delete a family.
 * Requires: admin+ role.
 */
export async function archiveFamily(familyId: string): Promise<ActionResult<void>> {
  if (!z.string().uuid().safeParse(familyId).success) {
    return { success: false, error: "Invalid family ID." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const { error } = await supabase
    .from("families")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: user.id,
      updated_by:  user.id,
    })
    .eq("id", familyId)
    .eq("organization_id", orgId)
    .is("archived_at", null);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    organization_id: orgId,
    actor_id:        user.id,
    action:          "family.archived",
    resource_type:   "family",
    resource_id:     familyId,
    metadata:        {},
  });

  revalidatePath("/dashboard/families");
  return { success: true, data: undefined };
}
