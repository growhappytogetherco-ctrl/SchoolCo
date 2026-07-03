"use server";

import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getActiveRole } from "@/lib/supabase/org-context";

// ── Types ──────────────────────────────────────────────────────────────────────

export type NoteCategory =
  | "general" | "academic" | "behavior" | "family_communication"
  | "parent_follow_up" | "teacher_follow_up" | "leadership" | "entrepreneurship"
  | "attendance" | "medical" | "safety" | "administrative"
  // legacy values kept for backwards-compat
  | "behavioral" | "health" | "family";

export type NotePriority = "low" | "normal" | "high" | "urgent";
export type NoteStatus   = "open" | "in_progress" | "waiting" | "completed";

export interface StaffNote {
  id: string;
  student_id: string;
  organization_id: string;
  author_id: string;
  author_name: string;
  category: NoteCategory;
  priority: NotePriority;
  title: string | null;
  body: string;
  is_pinned: boolean;
  follow_up_required: boolean;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  status: NoteStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface StaffMember {
  id: string;
  full_name: string;
  role: string;
}

export interface NoteAlert {
  note_id: string;
  student_id: string;
  student_name: string;
  category: NoteCategory;
  priority: NotePriority;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  title: string | null;
  body_preview: string;
  alert_type: "urgent_open" | "high_open" | "overdue_assigned";
}

type AR = { success: true } | { success: false; error: string };

function isStaffOrAbove(role: string | null | undefined) {
  return !["parent", "student_future", "volunteer"].includes(role ?? "");
}

function fromRow(raw: Record<string, unknown>): StaffNote {
  const authorProfile   = raw.profiles as { full_name?: string } | null;
  const assignedProfile = raw.assigned_profile as { full_name?: string } | null;
  return {
    id:                 raw.id as string,
    student_id:         raw.student_id as string,
    organization_id:    raw.organization_id as string,
    author_id:          raw.author_id as string,
    author_name:        authorProfile?.full_name ?? "Staff",
    category:           (raw.category as NoteCategory) ?? "general",
    priority:           (raw.priority as NotePriority) ?? "normal",
    title:              (raw.title as string) ?? null,
    body:               raw.body as string,
    is_pinned:          Boolean(raw.is_pinned),
    follow_up_required: Boolean(raw.follow_up_required),
    assigned_to:        (raw.assigned_to as string) ?? null,
    assigned_to_name:   assignedProfile?.full_name ?? null,
    due_date:           (raw.due_date as string) ?? null,
    status:             (raw.status as NoteStatus) ?? "open",
    tags:               (raw.tags as string[]) ?? [],
    created_at:         raw.created_at as string,
    updated_at:         raw.updated_at as string,
    archived_at:        (raw.archived_at as string) ?? null,
  };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getStaffNotes(
  studentId: string,
  opts?: {
    category?: NoteCategory;
    priority?: NotePriority;
    status?: NoteStatus;
    assignedTo?: string;
    authorId?: string;
    dateFrom?: string;
    dateTo?: string;
    includeArchived?: boolean;
  }
): Promise<StaffNote[]> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId || !isStaffOrAbove(role)) return [];

  const supabase = await createClient();

  let q = supabase
    .from("staff_notes")
    .select(`
      id, student_id, organization_id, author_id,
      category, priority, title, body, is_pinned,
      follow_up_required, assigned_to, due_date, status, tags,
      created_at, updated_at, archived_at,
      profiles:author_id ( full_name ),
      assigned_profile:assigned_to ( full_name )
    `)
    .eq("organization_id", orgId)
    .eq("student_id", studentId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts?.category)    q = q.eq("category", opts.category);
  if (opts?.priority)    q = q.eq("priority", opts.priority);
  if (opts?.status)      q = q.eq("status", opts.status);
  if (opts?.assignedTo)  q = q.eq("assigned_to", opts.assignedTo);
  if (opts?.authorId)    q = q.eq("author_id", opts.authorId);
  if (opts?.dateFrom)    q = q.gte("created_at", opts.dateFrom);
  if (opts?.dateTo)      q = q.lte("created_at", opts.dateTo + "T23:59:59");
  if (!opts?.includeArchived) q = q.is("archived_at", null);

  const { data } = await q;
  return ((data ?? []) as unknown[]).map((r) => fromRow(r as Record<string, unknown>));
}

export async function getAssignedNotes(): Promise<(StaffNote & { student_name: string })[]> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId || !isStaffOrAbove(role)) return [];

  const supabase = await createClient();

  const { data } = await supabase
    .from("staff_notes")
    .select(`
      id, student_id, organization_id, author_id,
      category, priority, title, body, is_pinned,
      follow_up_required, assigned_to, due_date, status, tags,
      created_at, updated_at, archived_at,
      profiles:author_id ( full_name ),
      assigned_profile:assigned_to ( full_name ),
      students:student_id ( first_name, last_name )
    `)
    .eq("organization_id", orgId)
    .eq("assigned_to", user.id)
    .neq("status", "completed")
    .is("archived_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: false });

  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Record<string, unknown>;
    const student = row.students as { first_name: string; last_name: string } | null;
    return {
      ...fromRow(row),
      student_name: student ? `${student.first_name} ${student.last_name}` : "Student",
    };
  });
}

export async function getNoteAlerts(): Promise<NoteAlert[]> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) return [];

  const supabase = await createClient();
  const today    = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("staff_notes")
    .select(`
      id, student_id, category, priority, title, body,
      assigned_to, due_date, status,
      students:student_id ( first_name, last_name ),
      assigned_profile:assigned_to ( full_name )
    `)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .neq("status", "completed")
    .in("priority", ["high", "urgent"])
    .order("priority", { ascending: false })
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(50);

  const alerts: NoteAlert[] = [];
  for (const r of ((data ?? []) as unknown[])) {
    const row     = r as Record<string, unknown>;
    const student = row.students as { first_name: string; last_name: string } | null;
    const assigned = row.assigned_profile as { full_name?: string } | null;
    const dueDate  = row.due_date as string | null;

    let alertType: NoteAlert["alert_type"] =
      row.priority === "urgent" ? "urgent_open" : "high_open";

    if (dueDate && dueDate < today && row.assigned_to) {
      alertType = "overdue_assigned";
    }

    alerts.push({
      note_id:          row.id as string,
      student_id:       row.student_id as string,
      student_name:     student ? `${student.first_name} ${student.last_name}` : "Student",
      category:         row.category as NoteCategory,
      priority:         row.priority as NotePriority,
      assigned_to:      (row.assigned_to as string) ?? null,
      assigned_to_name: assigned?.full_name ?? null,
      due_date:         dueDate,
      title:            (row.title as string) ?? null,
      body_preview:     ((row.body as string) ?? "").slice(0, 120),
      alert_type:       alertType,
    });
  }

  // Overdue assigned first, then urgent, then high
  const ORDER = { overdue_assigned: 0, urgent_open: 1, high_open: 2 };
  return alerts.sort((a, b) => ORDER[a.alert_type] - ORDER[b.alert_type]);
}

export async function getStudentNoteIndicator(studentId: string): Promise<boolean> {
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!orgId || !isStaffOrAbove(role)) return false;

  const supabase = await createClient();
  const { count } = await supabase
    .from("staff_notes")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .neq("status", "completed")
    .in("priority", ["high", "urgent"]);

  return (count ?? 0) > 0;
}

export async function getOrgStaffMembers(): Promise<StaffMember[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("organization_members")
    .select("profile_id, role, profiles:profile_id ( full_name )")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .not("role", "in", '("parent","student_future","volunteer")')
    .order("role");

  return ((data ?? []) as unknown[]).map((r) => {
    const row     = r as Record<string, unknown>;
    const profile = row.profiles as { full_name?: string } | null;
    return {
      id:        row.profile_id as string,
      full_name: profile?.full_name ?? "Staff",
      role:      row.role as string,
    };
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createStaffNote(
  studentId: string,
  payload: {
    category: NoteCategory;
    priority: NotePriority;
    title?: string;
    body: string;
    is_pinned?: boolean;
    follow_up_required?: boolean;
    assigned_to?: string | null;
    due_date?: string | null;
    status?: NoteStatus;
    tags?: string[];
  }
): Promise<AR> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  const role  = await getActiveRole();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };
  if (!isStaffOrAbove(role)) return { success: false, error: "Access denied." };
  if (!payload.body.trim()) return { success: false, error: "Note body is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("staff_notes").insert({
    organization_id:    orgId,
    student_id:         studentId,
    author_id:          user.id,
    category:           payload.category,
    priority:           payload.priority,
    title:              payload.title?.trim() || null,
    body:               payload.body.trim(),
    is_pinned:          payload.is_pinned ?? false,
    follow_up_required: payload.follow_up_required ?? false,
    assigned_to:        payload.assigned_to || null,
    due_date:           payload.due_date || null,
    status:             payload.status ?? "open",
    tags:               payload.tags ?? [],
  } as never);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateStaffNote(
  noteId: string,
  studentId: string,
  payload: {
    category?: NoteCategory;
    priority?: NotePriority;
    title?: string | null;
    body?: string;
    is_pinned?: boolean;
    follow_up_required?: boolean;
    assigned_to?: string | null;
    due_date?: string | null;
    status?: NoteStatus;
    tags?: string[];
  }
): Promise<AR> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };

  const supabase = await createClient();
  const update: Record<string, unknown> = {
    ...payload,
    updated_at: new Date().toISOString(),
  };
  if (payload.body !== undefined) update.body = payload.body.trim();
  if (payload.title !== undefined) update.title = payload.title?.trim() || null;
  if (payload.assigned_to !== undefined) update.assigned_to = payload.assigned_to || null;
  if (payload.due_date !== undefined) update.due_date = payload.due_date || null;

  const { error } = await supabase
    .from("staff_notes")
    .update(update as never)
    .eq("id", noteId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function archiveStaffNote(noteId: string, studentId: string): Promise<AR> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_notes")
    .update({ archived_at: new Date().toISOString() } as never)
    .eq("id", noteId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function restoreStaffNote(noteId: string, studentId: string): Promise<AR> {
  const user  = await getUser();
  const orgId = await getActiveOrgId();
  if (!user || !orgId) return { success: false, error: "Not authenticated." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_notes")
    .update({ archived_at: null } as never)
    .eq("id", noteId)
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function toggleNotePin(noteId: string, studentId: string, pinned: boolean): Promise<AR> {
  return updateStaffNote(noteId, studentId, { is_pinned: pinned });
}
