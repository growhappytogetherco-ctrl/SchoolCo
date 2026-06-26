"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";

export type FlagCategory = "learning" | "behavioral" | "medical" | "environmental" | "safety" | "social" | "family" | "communication" | "other";
export type FlagPriority = "low" | "normal" | "high" | "critical";
export type FlagColor    = "gray" | "red" | "yellow" | "blue" | "green" | "purple" | "orange";

export interface SupportFlag {
  id: string;
  student_id: string;
  title: string;
  description: string | null;
  category: FlagCategory;
  priority: FlagPriority;
  color: FlagColor;
  is_pinned: boolean;
  show_on_snapshot: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  creator_name?: string | null;
}

export interface CreateFlagPayload {
  title: string;
  description?: string | null;
  category: FlagCategory;
  priority: FlagPriority;
  color: FlagColor;
  is_pinned?: boolean;
  show_on_snapshot?: boolean;
  expires_at?: string | null;
}

export async function getSupportFlags(studentId: string): Promise<SupportFlag[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_flags")
    .select("*, profiles:created_by(full_name)")
    .eq("student_id", studentId)
    .order("is_pinned", { ascending: false })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    const prof = row.profiles as Record<string, string> | null;
    return { ...row, creator_name: prof?.full_name ?? null } as SupportFlag;
  });
}

// Used by the student profile header — only returns flags marked show_on_snapshot
export async function getSnapshotFlags(studentId: string): Promise<SupportFlag[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("support_flags")
    .select("*")
    .eq("student_id", studentId)
    .eq("show_on_snapshot", true)
    .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString().split("T")[0]}`)
    .order("priority", { ascending: false });
  return (data ?? []) as unknown as SupportFlag[];
}

export async function createFlag(studentId: string, payload: CreateFlagPayload): Promise<
  { success: true; id: string } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  if (!payload.title.trim()) return { success: false, error: "Title is required" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("support_flags")
    .insert({
      organization_id: orgId,
      student_id:      studentId,
      created_by:      user.id,
      updated_by:      user.id,
      title:           payload.title.trim(),
      description:     payload.description   ?? null,
      category:        payload.category,
      priority:        payload.priority,
      color:           payload.color,
      is_pinned:       payload.is_pinned       ?? false,
      show_on_snapshot:payload.show_on_snapshot ?? false,
      expires_at:      payload.expires_at     ?? null,
    } as never)
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Insert failed" };
  return { success: true, id: (data as unknown as { id: string }).id };
}

export async function updateFlag(flagId: string, studentId: string, payload: Partial<CreateFlagPayload>): Promise<
  { success: true } | { success: false; error: string }
> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("support_flags")
    .update({ ...payload, updated_by: user.id } as never)
    .eq("id", flagId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function deleteFlag(flagId: string, studentId: string): Promise<
  { success: true } | { success: false; error: string }
> {
  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "Not authenticated" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("support_flags")
    .delete()
    .eq("id", flagId)
    .eq("student_id", studentId)
    .eq("organization_id", orgId);
  return error ? { success: false, error: error.message } : { success: true };
}

export async function togglePin(flagId: string, studentId: string, isPinned: boolean): Promise<
  { success: true } | { success: false; error: string }
> {
  return updateFlag(flagId, studentId, { is_pinned: isPinned });
}
