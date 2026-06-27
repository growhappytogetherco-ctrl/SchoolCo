"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";

export type NoteCategory = "academic" | "behavioral" | "health" | "safety" | "family" | "attendance" | "general";
export type NotePriority = "low" | "normal" | "high" | "urgent";

export interface StaffNote {
  id: string;
  student_id: string;
  author_id: string;
  author_name: string;
  category: NoteCategory;
  priority: NotePriority;
  title: string | null;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

type AR = { success: true } | { success: false; error: string };

// ── Fetch ──────────────────────────────────────────────────────

export async function getStaffNotes(studentId: string): Promise<StaffNote[]> {
  const user = await getUser();
  if (!user) return [];

  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_notes")
    .select(`
      id, student_id, author_id, category, priority, title, body, is_pinned,
      created_at, updated_at,
      profiles!staff_notes_author_id_fkey ( full_name )
    `)
    .eq("organization_id", orgId)
    .eq("student_id", studentId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  return ((data ?? []) as unknown[]).map((raw) => {
    const n = raw as Record<string, unknown>;
    const profiles = n.profiles as { full_name: string } | null;
    return { ...n, author_name: profiles?.full_name ?? "Staff" } as StaffNote;
  });
}

// ── Create ─────────────────────────────────────────────────────

export async function createStaffNote(
  studentId: string,
  payload: {
    category: NoteCategory;
    priority: NotePriority;
    title?: string;
    body: string;
    is_pinned?: boolean;
  }
): Promise<AR> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  if (!payload.body.trim()) return { success: false, error: "Note body is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("staff_notes").insert({
    organization_id: orgId,
    student_id: studentId,
    author_id: user.id,
    category: payload.category,
    priority: payload.priority,
    title: payload.title?.trim() || null,
    body: payload.body.trim(),
    is_pinned: payload.is_pinned ?? false,
  } as never);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/students/${studentId}`);
  return { success: true };
}

// ── Update ─────────────────────────────────────────────────────

export async function updateStaffNote(
  noteId: string,
  studentId: string,
  payload: {
    category?: NoteCategory;
    priority?: NotePriority;
    title?: string | null;
    body?: string;
    is_pinned?: boolean;
  }
): Promise<AR> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_notes")
    .update({ ...payload, updated_at: new Date().toISOString() } as never)
    .eq("id", noteId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/students/${studentId}`);
  return { success: true };
}

// ── Delete ─────────────────────────────────────────────────────

export async function deleteStaffNote(noteId: string, studentId: string): Promise<AR> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated." };

  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active organization." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_notes")
    .delete()
    .eq("id", noteId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/dashboard/students/${studentId}`);
  return { success: true };
}

// ── Toggle pin ─────────────────────────────────────────────────

export async function toggleNotePin(noteId: string, studentId: string, pinned: boolean): Promise<AR> {
  return updateStaffNote(noteId, studentId, { is_pinned: pinned });
}
