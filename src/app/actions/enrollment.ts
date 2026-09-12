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

const EnrollStudentSchema = z.object({
  // Existing family path: provide family_id; new family path: provide family_name + household fields
  existing_family_id: z.string().uuid().optional(),

  // New family fields (only used when existing_family_id is absent)
  family_name:        z.string().min(2).max(120).optional(),
  household_label:    z.string().min(2).max(120).optional(),
  household_phone:    z.string().max(30).optional().nullable(),
  household_email:    z.string().email().max(255).optional().nullable(),
  household_address:  z.object({
    street1: z.string().max(200).optional(),
    city:    z.string().max(100).optional(),
    state:   z.string().max(50).optional(),
    zip:     z.string().max(20).optional(),
    country: z.string().max(100).default("US"),
  }).optional().nullable(),
  family_notes: z.string().max(2000).optional().nullable(),

  // Student fields (always required)
  first_name:        z.string().min(1).max(100),
  last_name:         z.string().min(1).max(100),
  preferred_name:    z.string().max(100).optional().nullable(),
  grade_level:       z.string().max(20).optional().nullable(),
  track:             z.string().max(100).optional().nullable(),
  enrollment_status: z.enum(["applicant","waitlisted","enrolled","withdrawn","graduated","expelled"]).default("enrolled"),
  enrollment_date:   z.string().optional().nullable(),

  // Guardian fields (optional — wizard can skip)
  guardian_full_name:        z.string().min(2).max(120).optional().nullable(),
  guardian_email:            z.string().email().optional().nullable(),
  guardian_phone:            z.string().max(30).optional().nullable(),
  guardian_relationship_type: z.enum([
    "mother","father","stepmother","stepfather","grandmother","grandfather",
    "aunt","uncle","sibling","legal_guardian","foster_parent","other",
  ]).optional().nullable(),
  guardian_custody_type:        z.enum(["primary","joint","secondary","supervised","none"]).default("joint"),
  guardian_is_legal_guardian:   z.boolean().default(true),
  guardian_is_emergency_contact: z.boolean().default(false),
  guardian_can_pickup:          z.boolean().default(true),
});

export async function enrollStudent(
  rawData: z.infer<typeof EnrollStudentSchema>
): Promise<ActionResult<{ student_id: string; student_display_id: string }>> {
  const parse = EnrollStudentSchema.safeParse(rawData);
  if (!parse.success) {
    return { success: false, error: "Validation failed.", fieldErrors: parse.error.flatten().fieldErrors as Record<string, string[]> };
  }
  const d = parse.data;

  if (!d.existing_family_id && !d.family_name) {
    return { success: false, error: "Either an existing family or a new family name is required." };
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
    return { success: false, error: "Insufficient permissions. Registrar role required." };
  }

  let familyId: string;
  let householdId: string | null = null;
  let familyName: string;

  if (d.existing_family_id) {
    // ── Existing family path ──────────────────────────────────────────────
    const { data: existingFamily } = await supabase
      .from("families")
      .select("id, family_name")
      .eq("id", d.existing_family_id)
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .single();

    if (!existingFamily) {
      return { success: false, error: "Family not found in this organization." };
    }
    familyId = existingFamily.id;
    familyName = (existingFamily as any).family_name as string;

  } else {
    // ── New family path ────────────────────────────────────────────────────
    const { data: newFamily, error: famErr } = await supabase
      .from("families")
      .insert({
        organization_id:    orgId,
        family_name:        d.family_name!,
        is_split_household: false,
        notes:              d.family_notes ?? null,
        created_by:         user.id,
        updated_by:         user.id,
      })
      .select("id, family_name")
      .single();

    if (famErr || !newFamily) {
      return { success: false, error: famErr?.message ?? "Failed to create family record." };
    }
    familyId = newFamily.id;
    familyName = (newFamily as any).family_name as string;

    await logAudit({
      organization_id: orgId, actor_id: user.id,
      action: "family.created", resource_type: "family", resource_id: familyId,
      metadata: { family_name: familyName },
    });

    // Create primary household
    const label = d.household_label || `${d.family_name} – Primary`;
    const { data: newHousehold, error: hhErr } = await supabase
      .from("households")
      .insert({
        organization_id: orgId,
        family_id:       familyId,
        household_label: label,
        sort_order:      1,
        phone:           d.household_phone ?? null,
        email:           d.household_email ?? null,
        address_json:    d.household_address ?? null,
        created_by:      user.id,
        updated_by:      user.id,
      })
      .select("id")
      .single();

    if (hhErr || !newHousehold) {
      return { success: false, error: hhErr?.message ?? "Failed to create household record." };
    }
    householdId = newHousehold.id;

    await logAudit({
      organization_id: orgId, actor_id: user.id,
      action: "household.created", resource_type: "household", resource_id: householdId,
      metadata: { label, family_id: familyId },
    });
  }

  // ── Create student ────────────────────────────────────────────────────────
  const enrollDate = d.enrollment_date ?? new Date().toISOString().slice(0, 10);
  const { data: student, error: stuErr } = await supabase
    .from("students")
    .insert({
      organization_id:   orgId,
      family_id:         familyId,
      first_name:        d.first_name,
      last_name:         d.last_name,
      preferred_name:    d.preferred_name ?? null,
      grade_level:       d.grade_level ?? null,
      enrollment_status: d.enrollment_status,
      enrollment_date:   enrollDate,
      track:             d.track ?? null,
      created_by:        user.id,
      updated_by:        user.id,
    })
    .select("id, student_display_id")
    .single();

  if (stuErr || !student) {
    return { success: false, error: stuErr?.message ?? "Failed to create student record." };
  }
  const studentId = (student as any).id as string;
  const studentDisplayId = (student as any).student_display_id as string;

  const displayName = d.preferred_name
    ? `${d.first_name} "${d.preferred_name}" ${d.last_name}`
    : `${d.first_name} ${d.last_name}`;

  await logAudit({
    organization_id: orgId, actor_id: user.id,
    action: "student.enrolled", resource_type: "student", resource_id: studentId,
    metadata: { family_id: familyId, first_name: d.first_name, last_name: d.last_name, grade_level: d.grade_level, track: d.track },
  });

  await createTimelineEntry({
    organization_id:      orgId,
    student_id:           studentId,
    family_id:            familyId,
    entry_type:           "enrollment",
    title:                `${displayName} enrolled at ${familyName.replace("The ", "").replace(" Family", "")}`,
    body:                  d.grade_level
      ? `${displayName} joined as a ${d.grade_level} grade student${d.track ? ` on the ${d.track} track` : ""}.`
      : `${displayName} was enrolled and their journey begins here.`,
    icon:                  "GraduationCap",
    color_key:             "teal",
    source_event_name:    "student.enrolled",
    source_resource_type: "student",
    source_resource_id:   studentId,
    occurred_at:           new Date(enrollDate).toISOString(),
  });

  // ── Invite guardian (non-fatal) ───────────────────────────────────────────
  const hasGuardian = d.guardian_email && d.guardian_full_name && d.guardian_relationship_type;
  if (hasGuardian) {
    try {
      const adminClient = createAdminClient();

      // Check for existing profile by email
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, auth_user_id")
        .eq("email", d.guardian_email!)
        .single();

      let profileId: string;
      let authUserId: string | null = null;

      if (existingProfile) {
        profileId = existingProfile.id;
        authUserId = existingProfile.auth_user_id;
      } else {
        const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
          d.guardian_email!,
          { data: { full_name: d.guardian_full_name, role: "parent" } }
        );
        if (inviteErr || !inviteData?.user) throw new Error(inviteErr?.message ?? "Invite failed");
        authUserId = inviteData.user.id;

        const { data: newProfile, error: profErr } = await supabase
          .from("profiles")
          .insert({ id: authUserId, auth_user_id: authUserId, full_name: d.guardian_full_name!, email: d.guardian_email!, phone: d.guardian_phone ?? null })
          .select("id")
          .single();
        if (profErr || !newProfile) throw new Error(profErr?.message ?? "Failed to create profile");
        profileId = (newProfile as any).id as string;
      }

      await supabase.from("guardianships").insert({
        organization_id:      orgId,
        profile_id:           profileId,
        student_id:           studentId,
        household_id:         householdId,
        relationship_type:    d.guardian_relationship_type!,
        custody_type:         d.guardian_custody_type,
        is_legal_guardian:    d.guardian_is_legal_guardian,
        is_primary_contact:   true,
        is_emergency_contact: d.guardian_is_emergency_contact,
        can_pickup:           d.guardian_can_pickup,
        status:               "active",
        created_by:           user.id,
      });

      if (!existingProfile) {
        // New account: ensure org membership
        const { data: existingMember } = await supabase
          .from("organization_members")
          .select("id")
          .eq("profile_id", profileId)
          .eq("organization_id", orgId)
          .single();

        if (!existingMember) {
          await supabase.from("organization_members").insert({
            organization_id: orgId,
            profile_id:      profileId,
            role:            "parent",
            status:          "invited",
            created_by:      user.id,
          });
        }

        try {
          await sendWelcomeGuardianEmail({
            to:           d.guardian_email!,
            guardianName: d.guardian_full_name!,
            studentName:  displayName,
            orgName:      familyName,
            loginUrl:     `${process.env.NEXT_PUBLIC_APP_URL ?? "https://schoolco.app"}/portal`,
          });
        } catch (_) { /* email send failure is non-fatal */ }
      }
    } catch (guardianErr) {
      // Guardian invite failure is non-fatal — student is created successfully
      console.warn("[enrollStudent] Guardian invite failed:", guardianErr);
    }
  }

  // ── Revalidate cache only after full success ───────────────────────────────
  revalidatePath("/dashboard/students");
  revalidatePath(`/dashboard/families/${familyId}`);
  if (d.existing_family_id) {
    revalidatePath("/dashboard/families");
  }

  return { success: true, data: { student_id: studentId, student_display_id: studentDisplayId } };
}
