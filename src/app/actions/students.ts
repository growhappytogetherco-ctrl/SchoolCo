"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/supabase/org-context";
import { logAudit } from "@/lib/audit";
import { createTimelineEntry } from "./timeline";
import type { ActionResult } from "@/types/actions";
import type { Student } from "@/types/database";

// ── Schemas ───────────────────────────────────────────────────────────────

export const CreateStudentSchema = z.object({
  family_id:           z.string().uuid("Select a family"),
  first_name:          z.string().min(1, "First name is required").max(100),
  last_name:           z.string().min(1, "Last name is required").max(100),
  preferred_name:      z.string().max(100).optional().nullable(),
  grade_level:         z.string().max(20).optional().nullable(),
  enrollment_status:   z.enum(["applicant","waitlisted","enrolled","withdrawn","graduated","expelled"]).default("enrolled"),
  enrollment_date:     z.string().optional().nullable(),
  expected_graduation: z.string().optional().nullable(),
  track:               z.string().max(100).optional().nullable(),
  homeroom_teacher:    z.string().max(100).optional().nullable(),
});

export const UpdateStudentSchema = z.object({
  id:                  z.string().uuid(),
  first_name:          z.string().min(1).max(100).optional(),
  last_name:           z.string().min(1).max(100).optional(),
  preferred_name:      z.string().max(100).optional().nullable(),
  grade_level:         z.string().max(20).optional().nullable(),
  enrollment_status:   z.enum(["applicant","waitlisted","enrolled","withdrawn","graduated","expelled"]).optional(),
  enrollment_date:     z.string().optional().nullable(),
  expected_graduation: z.string().optional().nullable(),
  track:               z.string().max(100).optional().nullable(),
  homeroom_teacher:    z.string().max(100).optional().nullable(),
});

// ── Actions ───────────────────────────────────────────────────────────────

/**
 * createStudent — enrolls a new student.
 * Creates the student record and a timeline 'enrollment' entry.
 * Requires: registrar+ role.
 */
export async function createStudent(
  rawData: z.infer<typeof CreateStudentSchema>
): Promise<ActionResult<Student>> {
  const parse = CreateStudentSchema.safeParse(rawData);
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

  // Verify registrar+ role
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

  // Verify family belongs to this org
  const { data: family } = await supabase
    .from("families")
    .select("id, family_name")
    .eq("id", parse.data.family_id)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .single();

  if (!family) {
    return { success: false, error: "Family not found in this organization." };
  }

  // Create student
  const { data: student, error } = await supabase
    .from("students")
    .insert({
      organization_id:    orgId,
      family_id:          parse.data.family_id,
      first_name:         parse.data.first_name,
      last_name:          parse.data.last_name,
      preferred_name:     parse.data.preferred_name ?? null,
      grade_level:        parse.data.grade_level ?? null,
      enrollment_status:  parse.data.enrollment_status,
      enrollment_date:    parse.data.enrollment_date ?? new Date().toISOString().slice(0, 10),
      expected_graduation: parse.data.expected_graduation ?? null,
      track:              parse.data.track ?? null,
      homeroom_teacher:   parse.data.homeroom_teacher ?? null,
      created_by:         user.id,
      updated_by:         user.id,
    })
    .select()
    .single();

  if (error || !student) {
    return { success: false, error: error?.message ?? "Failed to create student." };
  }

  // Audit log
  await logAudit({
    organization_id: orgId,
    actor_id:        user.id,
    action:          "student.enrolled",
    resource_type:   "student",
    resource_id:     student.id,
    metadata:        {
      family_id:    parse.data.family_id,
      first_name:   parse.data.first_name,
      last_name:    parse.data.last_name,
      grade_level:  parse.data.grade_level,
      track:        parse.data.track,
    },
  });

  // Timeline entry — 'enrollment' (first entry in student's journey)
  const displayName = parse.data.preferred_name
    ? `${parse.data.first_name} "${parse.data.preferred_name}" ${parse.data.last_name}`
    : `${parse.data.first_name} ${parse.data.last_name}`;

  await createTimelineEntry({
    organization_id:      orgId,
    student_id:           student.id,
    family_id:            parse.data.family_id,
    entry_type:           "enrollment",
    title:                `${displayName} enrolled at ${family.family_name.replace("The ", "").replace(" Family", "")}`,
    body:                  parse.data.grade_level
      ? `${displayName} joined as a ${parse.data.grade_level} grade student${parse.data.track ? ` on the ${parse.data.track} track` : ""}.`
      : `${displayName} was enrolled and their journey begins here.`,
    icon:                  "GraduationCap",
    color_key:             "teal",
    source_event_name:    "student.enrolled",
    source_resource_type: "student",
    source_resource_id:   student.id,
    occurred_at:           parse.data.enrollment_date
      ? new Date(parse.data.enrollment_date).toISOString()
      : new Date().toISOString(),
  });

  revalidatePath("/dashboard/students");
  revalidatePath(`/dashboard/families/${parse.data.family_id}`);
  return { success: true, data: student as Student };
}

/**
 * updateStudent — update student profile fields.
 * Requires: staff+ role.
 */
export async function updateStudent(
  rawData: z.infer<typeof UpdateStudentSchema>
): Promise<ActionResult<Student>> {
  const parse = UpdateStudentSchema.safeParse(rawData);
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
    .from("students")
    .update({ ...updates, updated_by: user.id })
    .eq("id", id)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .select()
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? "Failed to update student." };
  }

  // If enrollment_status changed to withdrawn, create timeline entry
  if (updates.enrollment_status === "withdrawn") {
    await createTimelineEntry({
      organization_id:      orgId,
      student_id:           id,
      family_id:            data.family_id,
      entry_type:           "enrollment",
      title:                `${data.first_name} ${data.last_name} withdrew`,
      body:                  null,
      icon:                  "LogOut",
      color_key:             "gray",
      source_event_name:    "student.withdrawn",
      source_resource_type: "student",
      source_resource_id:   id,
      staff_only:            true,
    });
  }

  await logAudit({
    organization_id: orgId,
    actor_id:        user.id,
    action:          "student.updated",
    resource_type:   "student",
    resource_id:     id,
    metadata:        updates,
  });

  revalidatePath(`/dashboard/students/${id}`);
  return { success: true, data: data as Student };
}

/**
 * archiveStudent — soft-delete a student record.
 * Requires: admin+ role.
 */
export async function archiveStudent(studentId: string): Promise<ActionResult<void>> {
  if (!z.string().uuid().safeParse(studentId).success) {
    return { success: false, error: "Invalid student ID." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const { error } = await supabase
    .from("students")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: user.id,
      updated_by:  user.id,
    })
    .eq("id", studentId)
    .eq("organization_id", orgId)
    .is("archived_at", null);

  if (error) return { success: false, error: error.message };

  await logAudit({
    organization_id: orgId,
    actor_id:        user.id,
    action:          "student.archived",
    resource_type:   "student",
    resource_id:     studentId,
    metadata:        {},
  });

  revalidatePath("/dashboard/students");
  return { success: true, data: undefined };
}
