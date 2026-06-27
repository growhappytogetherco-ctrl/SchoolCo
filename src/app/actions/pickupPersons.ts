"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { isAdminRole } from "@/lib/constants";
import { getActiveRole } from "@/lib/supabase/org-context";

export interface PickupPerson {
  id: string;
  student_id: string;
  full_name: string;
  relationship: string;
  phone: string | null;
  email: string | null;
  is_authorized: boolean;
  is_emergency_only: boolean;
  requires_supervision: boolean;
  restriction_notes: string | null;
  admin_only_notes?: string | null; // only returned to admins
  created_at: string;
  updated_at: string;
}

export interface CreatePickupPersonPayload {
  full_name: string;
  relationship: string;
  phone?: string | null;
  email?: string | null;
  is_authorized?: boolean;
  is_emergency_only?: boolean;
  requires_supervision?: boolean;
  restriction_notes?: string | null;
  admin_only_notes?: string | null;
}

export async function getPickupPersons(studentId: string): Promise<PickupPerson[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const role = await getActiveRole();
  const supabase = await createClient();

  const { data } = await supabase
    .from("authorized_pickup_persons")
    .select("*")
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .order("is_authorized", { ascending: false })
    .order("full_name");

  return ((data ?? []) as unknown[]).map((raw) => {
    const r = raw as Record<string, unknown>;
    const p: PickupPerson = {
      id:                   r.id as string,
      student_id:           r.student_id as string,
      full_name:            r.full_name as string,
      relationship:         r.relationship as string,
      phone:                r.phone as string | null,
      email:                r.email as string | null,
      is_authorized:        r.is_authorized as boolean,
      is_emergency_only:    r.is_emergency_only as boolean,
      requires_supervision: r.requires_supervision as boolean,
      restriction_notes:    r.restriction_notes as string | null,
      created_at:           r.created_at as string,
      updated_at:           r.updated_at as string,
    };
    // Only expose admin_only_notes to admin/full_admin
    if (isAdminRole(role)) {
      p.admin_only_notes = r.admin_only_notes as string | null;
    }
    return p;
  });
}

export async function createPickupPerson(
  studentId: string,
  payload: CreatePickupPersonPayload
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const user = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!payload.full_name.trim()) return { success: false, error: "Name is required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("authorized_pickup_persons")
    .insert({
      organization_id:      orgId,
      student_id:           studentId,
      created_by:           user.id,
      updated_by:           user.id,
      full_name:            payload.full_name.trim(),
      relationship:         payload.relationship || "other",
      phone:                payload.phone ?? null,
      email:                payload.email ?? null,
      is_authorized:        payload.is_authorized ?? true,
      is_emergency_only:    payload.is_emergency_only ?? false,
      requires_supervision: payload.requires_supervision ?? false,
      restriction_notes:    payload.restriction_notes ?? null,
      admin_only_notes:     payload.admin_only_notes ?? null,
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Insert failed" };
  revalidatePath(`/dashboard/students/${studentId}`);
  return { success: true, id: (data as unknown as { id: string }).id };
}

export async function updatePickupPerson(
  id: string,
  studentId: string,
  payload: Partial<CreatePickupPersonPayload>
): Promise<{ success: true } | { success: false; error: string }> {
  const user = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("authorized_pickup_persons")
    .update({ ...payload, updated_by: user.id } as never)
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath(`/dashboard/students/${studentId}`);
  return { success: true };
}

export async function deletePickupPerson(
  id: string,
  studentId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const orgId = await getActiveOrgId();
  const role = await getActiveRole();
  if (!orgId) return { success: false, error: "Not authenticated" };
  if (!isAdminRole(role)) return { success: false, error: "Admin access required" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("authorized_pickup_persons")
    .delete()
    .eq("id", id)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };
  revalidatePath(`/dashboard/students/${studentId}`);
  return { success: true };
}
