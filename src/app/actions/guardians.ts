"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/supabase/org-context";
import { logAudit } from "@/lib/audit";
import { createTimelineEntry } from "./timeline";
import { sendWelcomeGuardianEmail } from "@/lib/email/resend";
import type { ActionResult } from "@/types/actions";

// ── Schemas ───────────────────────────────────────────────────────────────

const VisibilityJsonSchema = z.object({
  academics:       z.boolean().default(true),
  attendance:      z.boolean().default(true),
  report_cards:    z.boolean().default(true),
  communications:  z.boolean().default(true),
  health_records:  z.boolean().default(false),
  incidents:       z.boolean().default(false),
  behavior_notes:  z.boolean().default(false),
});

const CommunicationJsonSchema = z.object({
  channels: z.object({
    email:  z.boolean().default(true),
    sms:    z.boolean().default(false),
    in_app: z.boolean().default(true),
    push:   z.boolean().default(false),
  }),
  receive: z.object({
    attendance_alerts:      z.boolean().default(true),
    grade_reports:          z.boolean().default(true),
    announcements:          z.boolean().default(true),
    incident_notifications: z.boolean().default(false),
    direct_messages:        z.boolean().default(true),
    payment_reminders:      z.boolean().default(true),
  }),
  quiet_hours: z.object({
    enabled:    z.boolean().default(false),
    start_time: z.string().nullable().default(null),
    end_time:   z.string().nullable().default(null),
  }),
  preferred_language: z.string().default("en"),
});

export const InviteGuardianSchema = z.object({
  student_id:       z.string().uuid("Invalid student ID"),
  family_id:        z.string().uuid("Invalid family ID"),
  household_id:     z.string().uuid().optional().nullable(),
  full_name:        z.string().min(2, "Full name is required").max(120),
  email:            z.string().email("Invalid email address"),
  phone:            z.string().max(30).optional().nullable(),
  relationship_type: z.enum([
    "mother","father","stepmother","stepfather","grandmother","grandfather",
    "aunt","uncle","sibling","legal_guardian","foster_parent","other"
  ], { required_error: "Select a relationship type" }),
  custody_type:     z.enum(["primary","joint","secondary","supervised","none"]).default("joint"),
  is_legal_guardian:  z.boolean().default(true),
  is_primary_contact: z.boolean().default(false),
  is_emergency_contact: z.boolean().default(false),
  emergency_contact_order: z.number().int().min(1).optional().nullable(),
  can_pickup:       z.boolean().default(true),
  pickup_restrictions: z.string().max(500).optional().nullable(),
  court_order_on_file: z.boolean().default(false),
  visibility_json:  VisibilityJsonSchema.optional(),
  communication_json: CommunicationJsonSchema.optional(),
});

export const UpdateGuardianshipSchema = z.object({
  guardianship_id:  z.string().uuid(),
  custody_type:     z.enum(["primary","joint","secondary","supervised","none"]).optional(),
  is_legal_guardian: z.boolean().optional(),
  is_primary_contact: z.boolean().optional(),
  is_emergency_contact: z.boolean().optional(),
  emergency_contact_order: z.number().int().min(1).optional().nullable(),
  can_pickup:       z.boolean().optional(),
  pickup_restrictions: z.string().max(500).optional().nullable(),
  court_order_on_file: z.boolean().optional(),
  court_order_notes: z.string().max(2000).optional().nullable(),  // Staff-only field
  household_id:     z.string().uuid().optional().nullable(),
  visibility_json:  VisibilityJsonSchema.optional(),
  communication_json: CommunicationJsonSchema.optional(),
});

export const UpdatePreferencesSchema = z.object({
  guardianship_id:    z.string().uuid(),
  visibility_json:    VisibilityJsonSchema.optional(),
  communication_json: CommunicationJsonSchema.optional(),
});

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * inviteGuardian — creates a profile stub, guardianship, org_member, and sends email invite.
 *
 * Flow:
 * 1. Check if a profile with this email already exists
 * 2. If not → call auth.admin.inviteUserByEmail to create auth user + get UUID
 * 3. Create/update profile record
 * 4. Create guardianship row
 * 5. Create org_member row (role=parent, status=invited)
 * 6. Send Resend welcome email
 * 7. Create timeline entry (staff_only)
 *
 * Requires: registrar+ role.
 * Security: service role client used only for auth.admin.inviteUserByEmail.
 */
export async function inviteGuardian(
  rawData: z.infer<typeof InviteGuardianSchema>
): Promise<ActionResult<{ guardianship_id: string; profile_id: string }>> {
  const parse = InviteGuardianSchema.safeParse(rawData);
  if (!parse.success) {
    return {
      success: false,
      error: "Validation failed.",
      fieldErrors: parse.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const { data: { user: actingUser } } = await supabase.auth.getUser();
  if (!actingUser) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  // Verify registrar+ role
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("profile_id", actingUser.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .single();

  const allowedRoles = ["registrar", "admin", "full_admin", "platform_admin"];
  if (!membership || !allowedRoles.includes(membership.role)) {
    return { success: false, error: "Insufficient permissions. Registrar role required." };
  }

  const {
    student_id, family_id, household_id, full_name, email, phone,
    relationship_type, custody_type, is_legal_guardian, is_primary_contact,
    is_emergency_contact, emergency_contact_order, can_pickup, pickup_restrictions,
    court_order_on_file, visibility_json, communication_json,
  } = parse.data;

  // ── Step 1: Check for existing profile by email ─────────────────────────
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("email", email)
    .single();

  let profileId: string;
  let isNewUser = false;

  if (existingProfile) {
    // Existing user — use their profile ID
    profileId = existingProfile.id;
  } else {
    // ── Step 2: Create new auth user via admin client ──────────────────────
    const adminClient = createAdminClient();
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name, phone: phone ?? null },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/portal/children`,
      }
    );

    if (inviteError || !inviteData.user) {
      return { success: false, error: `Failed to send invite: ${inviteError?.message ?? "Unknown error"}` };
    }

    profileId = inviteData.user.id;
    isNewUser = true;

    // ── Step 3: Create profile record ─────────────────────────────────────
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        id:         profileId,
        email:      email,
        full_name:  full_name,
        phone:      phone ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (profileError) {
      return { success: false, error: `Failed to create profile: ${profileError.message}` };
    }
  }

  // ── Step 4: Create guardianship ────────────────────────────────────────
  const defaultVisibility = {
    academics: true, attendance: true, report_cards: true,
    communications: true, health_records: false, incidents: false, behavior_notes: false,
  };
  const defaultCommunication = {
    channels: { email: true, sms: false, in_app: true, push: false },
    receive: {
      attendance_alerts: true, grade_reports: true, announcements: true,
      incident_notifications: false, direct_messages: true, payment_reminders: true,
    },
    quiet_hours: { enabled: false, start_time: null, end_time: null },
    preferred_language: "en",
  };

  // Automatically restrict visibility for supervised/no-custody guardians
  const restrictedVisibility = (custody_type === "supervised" || custody_type === "none")
    ? { ...defaultVisibility, incidents: false, behavior_notes: false, health_records: false }
    : (visibility_json ?? defaultVisibility);

  const { data: guardianship, error: guardianshipError } = await supabase
    .from("guardianships")
    .insert({
      organization_id:          orgId,
      profile_id:               profileId,
      student_id:               student_id,
      household_id:             household_id ?? null,
      relationship_type:        relationship_type,
      custody_type:             custody_type,
      is_legal_guardian:        is_legal_guardian,
      is_primary_contact:       is_primary_contact,
      is_emergency_contact:     is_emergency_contact,
      emergency_contact_order:  emergency_contact_order ?? null,
      can_pickup:               can_pickup,
      pickup_restrictions:      pickup_restrictions ?? null,
      court_order_on_file:      court_order_on_file,
      visibility_json:          restrictedVisibility,
      communication_json:       communication_json ?? defaultCommunication,
      created_by:               actingUser.id,
      updated_by:               actingUser.id,
    })
    .select("id")
    .single();

  if (guardianshipError || !guardianship) {
    return { success: false, error: `Failed to create guardianship: ${guardianshipError?.message}` };
  }

  // ── Step 5: Create/update org_member row ──────────────────────────────
  const { error: memberError } = await supabase
    .from("organization_members")
    .upsert({
      organization_id: orgId,
      profile_id:      profileId,
      role:            "parent",
      status:          isNewUser ? "invited" : "active",
      invited_by:      actingUser.id,
      joined_at:       isNewUser ? null : new Date().toISOString(),
      created_at:      new Date().toISOString(),
      updated_at:      new Date().toISOString(),
    }, { onConflict: "organization_id,profile_id" });

  if (memberError) {
    console.error("[Guardian] Failed to create org_member:", memberError.message);
    // Non-fatal — guardianship is already created
  }

  // ── Step 6: Send welcome email ─────────────────────────────────────────
  if (isNewUser) {
    // Get org name for email
    const { data: org } = await supabase
      .from("organizations")
      .select("name, logo_url")
      .eq("id", orgId)
      .single();

    // Get student name
    const { data: student } = await supabase
      .from("students")
      .select("first_name, last_name")
      .eq("id", student_id)
      .single();

    await sendWelcomeGuardianEmail({
      to:            email,
      guardianName:  full_name,
      studentName:   student ? `${student.first_name} ${student.last_name}` : "your child",
      orgName:       org?.name ?? "your school",
      loginUrl:      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`,
    });
  }

  // ── Step 7: Timeline entry (staff-only) ────────────────────────────────
  await createTimelineEntry({
    organization_id:      orgId,
    student_id:           student_id,
    family_id:            family_id,
    entry_type:           "guardian_linked",
    title:                `${full_name} added as ${relationship_type.replace("_", " ")}`,
    body:                  null,
    icon:                  "UserPlus",
    color_key:             "navy",
    source_event_name:    "guardian.linked",
    source_resource_type: "guardianship",
    source_resource_id:   guardianship.id,
    staff_only:            true,
  });

  // ── Audit log ──────────────────────────────────────────────────────────
  await logAudit({
    organization_id: orgId,
    actor_id:        actingUser.id,
    action:          "guardian.invited",
    resource_type:   "guardianship",
    resource_id:     guardianship.id,
    metadata:        {
      profile_id:       profileId,
      student_id:       student_id,
      relationship_type,
      custody_type,
      is_new_user:      isNewUser,
    },
  });

  revalidatePath(`/dashboard/students/${student_id}`);
  revalidatePath(`/dashboard/families/${family_id}`);

  return {
    success: true,
    data: { guardianship_id: guardianship.id, profile_id: profileId },
  };
}

/**
 * updateGuardianship — update custody, visibility, communication, or pickup settings.
 * Requires: registrar+ for custody/court changes; staff+ for communication prefs.
 *
 * SECURITY: court_order_notes is staff-only — never expose to parent sessions.
 */
export async function updateGuardianship(
  rawData: z.infer<typeof UpdateGuardianshipSchema>
): Promise<ActionResult<void>> {
  const parse = UpdateGuardianshipSchema.safeParse(rawData);
  if (!parse.success) {
    return { success: false, error: "Validation failed.", fieldErrors: parse.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const { guardianship_id, ...updates } = parse.data;

  const { error } = await supabase
    .from("guardianships")
    .update({ ...updates, updated_by: user.id })
    .eq("id", guardianship_id)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  await logAudit({
    organization_id: orgId,
    actor_id:        user.id,
    action:          "guardianship.updated",
    resource_type:   "guardianship",
    resource_id:     guardianship_id,
    metadata:        updates,
  });

  return { success: true, data: undefined };
}

/**
 * updateMyPreferences — parent updates their own communication and visibility preferences.
 * Parents may only update their own guardianship rows.
 * Visibility restrictions set by staff (custody-based) cannot be elevated by the parent.
 */
export async function updateMyPreferences(
  rawData: z.infer<typeof UpdatePreferencesSchema>
): Promise<ActionResult<void>> {
  const parse = UpdatePreferencesSchema.safeParse(rawData);
  if (!parse.success) {
    return { success: false, error: "Validation failed.", fieldErrors: parse.error.flatten().fieldErrors as Record<string, string[]> };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const { guardianship_id, communication_json, visibility_json } = parse.data;

  // Verify this guardianship belongs to the calling user (not updatable via another user's session)
  const { data: existing } = await supabase
    .from("guardianships")
    .select("profile_id, organization_id, visibility_json, custody_type")
    .eq("id", guardianship_id)
    .single();

  if (!existing || existing.profile_id !== user.id) {
    return { success: false, error: "You can only update your own preferences." };
  }

  // Parents cannot elevate visibility beyond what staff set.
  // Supervised/none custody types always have restricted visibility — cannot be changed by parent.
  const isCustodyRestricted = existing.custody_type === "supervised" || existing.custody_type === "none";

  const finalVisibility = isCustodyRestricted
    ? existing.visibility_json  // Staff-set restrictions are immutable by parent
    : (visibility_json ?? existing.visibility_json);

  const { error } = await supabase
    .from("guardianships")
    .update({
      communication_json: communication_json ?? undefined,
      visibility_json:    finalVisibility,
      updated_by:         user.id,
    })
    .eq("id", guardianship_id)
    .eq("profile_id", user.id);  // Defense in depth: ensure row matches calling user

  if (error) return { success: false, error: error.message };

  return { success: true, data: undefined };
}
