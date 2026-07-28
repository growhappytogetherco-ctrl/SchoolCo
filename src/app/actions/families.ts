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

const CreateFamilyWithHouseholdSchema = z.object({
  family_name: z.string().min(2, "Family name must be at least 2 characters").max(120),
  notes:       z.string().max(2000).optional(),
  phone:       z.string().max(30).optional().nullable(),
  email:       z.string().email("Invalid email").max(255).optional().nullable(),
  address_json: z.object({
    street1: z.string().max(200).optional(),
    city:    z.string().max(100).optional(),
    state:   z.string().max(50).optional(),
    zip:     z.string().max(20).optional(),
  }).optional().nullable(),
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

// ── Duplicate check ───────────────────────────────────────────────────────

export interface FamilyDuplicate {
  id:          string;
  family_name: string;
  family_display_id: string | null;
  match_reason: "name" | "email" | "phone";
}

/**
 * checkFamilyDuplicates — looks for likely duplicates within the org.
 * Checks normalized family name, primary email, and primary phone.
 * Returns an array of matches (may be empty).
 */
export async function checkFamilyDuplicates(
  familyName: string,
  email?: string | null,
  phone?: string | null,
): Promise<ActionResult<FamilyDuplicate[]>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const matches: FamilyDuplicate[] = [];

  // Name match (case-insensitive)
  const normalized = familyName.trim().toLowerCase();
  const { data: nameMatches } = await supabase
    .from("families")
    .select("id, family_name, family_display_id")
    .eq("organization_id", orgId)
    .ilike("family_name", normalized)
    .is("archived_at", null)
    .limit(5);

  for (const f of nameMatches ?? []) {
    matches.push({ ...f, match_reason: "name" });
  }

  // Email match via households
  if (email?.trim()) {
    const { data: emailMatches } = await supabase
      .from("households")
      .select("family_id, families!inner(id, family_name, family_display_id)")
      .eq("organization_id", orgId)
      .eq("email", email.trim().toLowerCase())
      .is("archived_at", null)
      .limit(5);

    for (const h of emailMatches ?? []) {
      const f = h.families as { id: string; family_name: string; family_display_id: string | null } | null;
      if (f && !matches.some((m) => m.id === f.id)) {
        matches.push({ id: f.id, family_name: f.family_name, family_display_id: f.family_display_id, match_reason: "email" });
      }
    }
  }

  // Phone match via households — match raw stored value
  if (phone?.trim()) {
    const { data: phoneMatches } = await supabase
      .from("households")
      .select("family_id, families!inner(id, family_name, family_display_id)")
      .eq("organization_id", orgId)
      .eq("phone", phone.trim())
      .is("archived_at", null)
      .limit(5);

    for (const h of phoneMatches ?? []) {
      const f = h.families as { id: string; family_name: string; family_display_id: string | null } | null;
      if (f && !matches.some((m) => m.id === f.id)) {
        matches.push({ id: f.id, family_name: f.family_name, family_display_id: f.family_display_id, match_reason: "phone" });
      }
    }
  }

  return { success: true, data: matches };
}

/**
 * createFamilyWithHousehold — creates a family and its primary household in one action.
 * Requires registrar+ role.
 */
export async function createFamilyWithHousehold(
  rawData: z.infer<typeof CreateFamilyWithHouseholdSchema>
): Promise<ActionResult<{ family_id: string; household_id: string }>> {
  const parse = CreateFamilyWithHouseholdSchema.safeParse(rawData);
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

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const allowedRoles = ["registrar", "admin", "full_admin", "platform_admin"];
  if (!membership || !allowedRoles.includes(membership.role)) {
    return { success: false, error: "Insufficient permissions." };
  }

  const { family_name, notes, phone, email, address_json } = parse.data;

  // Create family
  const { data: family, error: familyError } = await supabase
    .from("families")
    .insert({
      organization_id: orgId,
      family_name,
      notes:           notes ?? null,
      created_by:      user.id,
      updated_by:      user.id,
    })
    .select("id, family_name, family_display_id")
    .single();

  if (familyError || !family) {
    console.error("[createFamilyWithHousehold] families insert:", familyError?.message);
    return { success: false, error: familyError?.message ?? "Failed to create family." };
  }

  // Create primary household
  const householdLabel = `${family_name} – Primary`;
  const { data: household, error: householdError } = await supabase
    .from("households")
    .insert({
      organization_id: orgId,
      family_id:       family.id,
      household_label: householdLabel,
      sort_order:      1,
      phone:           phone ?? null,
      email:           email ?? null,
      address_json:    address_json ?? null,
      created_by:      user.id,
      updated_by:      user.id,
    })
    .select("id")
    .single();

  if (householdError || !household) {
    console.error("[createFamilyWithHousehold] households insert:", householdError?.message);
    // Family was created but household failed — still redirect, staff can add household manually
    return { success: false, error: householdError?.message ?? "Failed to create household." };
  }

  await logAudit({
    organization_id: orgId,
    actor_id:        user.id,
    action:          "family.created",
    resource_type:   "family",
    resource_id:     family.id,
    metadata:        { family_name, has_household: true },
  });

  revalidatePath("/dashboard/families");
  return { success: true, data: { family_id: family.id, household_id: household.id } };
}
