"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/supabase/org-context";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "@/types/actions";
import type { Household } from "@/types/database";

// ── Schemas ───────────────────────────────────────────────────────────────

const AddressSchema = z.object({
  street1: z.string().max(200).optional(),
  street2: z.string().max(200).optional(),
  city:    z.string().max(100).optional(),
  state:   z.string().max(50).optional(),
  zip:     z.string().max(20).optional(),
  country: z.string().max(100).default("US"),
}).optional();

const CreateHouseholdSchema = z.object({
  family_id:       z.string().uuid("Invalid family ID"),
  household_label: z.string().min(2, "Household label is required").max(120),
  sort_order:      z.number().int().min(1).default(1),
  address_json:    AddressSchema,
  phone:           z.string().max(30).optional().nullable(),
  email:           z.string().email().max(255).optional().nullable(),
});

const UpdateHouseholdSchema = z.object({
  id:              z.string().uuid(),
  household_label: z.string().min(2).max(120).optional(),
  sort_order:      z.number().int().min(1).optional(),
  address_json:    AddressSchema,
  phone:           z.string().max(30).optional().nullable(),
  email:           z.string().email().max(255).optional().nullable(),
});

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * createHousehold — add a household to an existing family.
 * When a family has 2+ households, family.is_split_household is set to true.
 */
export async function createHousehold(
  rawData: z.infer<typeof CreateHouseholdSchema>
): Promise<ActionResult<Household>> {
  const parse = CreateHouseholdSchema.safeParse(rawData);
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

  const { data, error } = await supabase
    .from("households")
    .insert({
      organization_id: orgId,
      family_id:       parse.data.family_id,
      household_label: parse.data.household_label,
      sort_order:      parse.data.sort_order,
      address_json:    parse.data.address_json ?? null,
      phone:           parse.data.phone ?? null,
      email:           parse.data.email ?? null,
      created_by:      user.id,
      updated_by:      user.id,
    })
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to create household." };
  }

  // Count households for this family; if 2+, mark family as split
  const { count } = await supabase
    .from("households")
    .select("id", { count: "exact", head: true })
    .eq("family_id", parse.data.family_id)
    .eq("organization_id", orgId)
    .is("archived_at", null);

  if ((count ?? 0) >= 2) {
    await supabase
      .from("families")
      .update({ is_split_household: true, updated_by: user.id })
      .eq("id", parse.data.family_id)
      .eq("organization_id", orgId);
  }

  await logAudit({
    organization_id: orgId,
    actor_id:        user.id,
    action:          "household.created",
    resource_type:   "household",
    resource_id:     data.id,
    metadata:        { family_id: parse.data.family_id, label: parse.data.household_label },
  });

  revalidatePath(`/dashboard/families/${parse.data.family_id}`);
  return { success: true, data: data as Household };
}

/**
 * updateHousehold — update address, phone, email, or label.
 */
export async function updateHousehold(
  rawData: z.infer<typeof UpdateHouseholdSchema>
): Promise<ActionResult<Household>> {
  const parse = UpdateHouseholdSchema.safeParse(rawData);
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
    .from("households")
    .update({ ...updates, updated_by: user.id })
    .eq("id", id)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to update household." };
  }

  await logAudit({
    organization_id: orgId,
    actor_id:        user.id,
    action:          "household.updated",
    resource_type:   "household",
    resource_id:     id,
    metadata:        updates,
  });

  // Get family_id for path revalidation
  revalidatePath(`/dashboard/families/${data.family_id}`);
  return { success: true, data: data as Household };
}
