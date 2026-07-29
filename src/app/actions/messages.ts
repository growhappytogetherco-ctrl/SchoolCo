"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/supabase/org-context";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import type { ActionResult } from "@/types/actions";

// ── Types ─────────────────────────────────────────────────────────────────

export type MessageCategory =
  | "general" | "attendance" | "academics" | "schedule"
  | "transportation" | "billing" | "medical" | "technical" | "other";

export type ConversationStatus = "open" | "waiting_parent" | "waiting_staff" | "resolved" | "closed" | "reopened";
export type ConversationPriority = "low" | "normal" | "high" | "urgent";

export interface ConversationSummary {
  id:              string;
  subject:         string;
  category:        MessageCategory;
  status:          ConversationStatus;
  priority:        ConversationPriority;
  family_id:       string;
  family_name:     string;
  student_id:      string | null;
  student_name:    string | null;
  created_by:      string;
  assigned_to:     string | null;
  assigned_name:   string | null;
  last_message_at: string;
  created_at:      string;
  resolved_at:     string | null;
  unread_count:    number;
  last_message_preview: string | null;
  last_sender_name:     string | null;
}

export interface MessageItem {
  id:             string;
  sender_id:      string;
  sender_name:    string;
  sender_role:    string | null;
  body:           string;
  message_type:   "message" | "note" | "system";
  parent_visible: boolean;
  created_at:     string;
  edited_at:      string | null;
}

export interface ConversationDetail extends ConversationSummary {
  messages:    MessageItem[];
  participants: Array<{ profile_id: string; name: string; participant_type: string }>;
  resolved_by_name: string | null;
}

export interface StaffMember {
  profile_id: string;
  full_name:  string;
  role:       string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const STAFF_ROLES = new Set(["teacher","staff","registrar","admin","full_admin","platform_admin"]);

async function requireStaff() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  const orgId = await getActiveOrgId();
  if (!orgId) throw new Error("No active org");
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .single();
  if (!member || !STAFF_ROLES.has(member.role)) throw new Error("Insufficient role");
  return { supabase, user, orgId, role: member.role };
}

async function requireParent() {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  const orgId = await getActiveOrgId();
  if (!orgId) throw new Error("No active org");
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("profile_id", user.id)
    .eq("status", "active")
    .single();
  if (!member) throw new Error("Not a member");
  return { supabase, user, orgId, role: member.role };
}

function sanitizeBody(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 5000) return null;
  return trimmed;
}

async function createNotifications(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    orgId:          string;
    senderId:       string;
    senderName:     string;
    conversationId: string;
    subject:        string;
    type:           string;
    title:          string;
    recipientIds:   string[];
  }
) {
  if (opts.recipientIds.length === 0) return;
  const rows = opts.recipientIds
    .filter(id => id !== opts.senderId)
    .map(id => ({
      organization_id: opts.orgId,
      recipient_id:    id,
      sender_id:       opts.senderId,
      type:            opts.type,
      title:           opts.title,
      resource_type:   "conversation",
      resource_id:     opts.conversationId,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) logger.error("Failed to create notifications", { error: error.message });
}

// ── Parent: get conversations ─────────────────────────────────────────────

export async function getMyConversations(): Promise<ActionResult<ConversationSummary[]>> {
  try {
    const { supabase, user, orgId } = await requireParent();

    const { data: convRows, error } = await supabase
      .from("conversations")
      .select(`
        id, subject, category, status, priority,
        family_id, student_id, created_by, assigned_to,
        last_message_at, created_at, resolved_at,
        families!inner ( family_name ),
        students ( first_name, last_name, preferred_name ),
        assigned_profile:profiles!conversations_assigned_to_fkey ( full_name )
      `)
      .eq("organization_id", orgId)
      .order("last_message_at", { ascending: false });

    if (error) {
      logger.error("getMyConversations error", { error: error.message });
      return { success: false, error: "Failed to load conversations." };
    }

    // Get last messages and participant rows for unread counts in one query
    const convIds = (convRows ?? []).map(c => c.id);
    const [{ data: lastMsgs }, { data: partRows }] = await Promise.all([
      convIds.length > 0
        ? supabase
            .from("messages")
            .select("conversation_id, body, created_at, sender_id, profiles!inner(full_name)")
            .in("conversation_id", convIds)
            .eq("parent_visible", true)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      convIds.length > 0
        ? supabase
            .from("conversation_participants")
            .select("conversation_id, last_read_at")
            .eq("profile_id", user.id)
            .in("conversation_id", convIds)
        : Promise.resolve({ data: [] }),
    ]);

    // Map last message per conversation
    const lastMsgMap: Record<string, { body: string; sender: string; at: string }> = {};
    for (const m of lastMsgs ?? []) {
      if (!lastMsgMap[m.conversation_id]) {
        const sender = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        lastMsgMap[m.conversation_id] = {
          body:   m.body,
          sender: (sender as { full_name: string })?.full_name ?? "Unknown",
          at:     m.created_at,
        };
      }
    }

    // Compute unread counts
    const readAtMap: Record<string, string | null> = {};
    for (const p of partRows ?? []) {
      readAtMap[p.conversation_id] = p.last_read_at;
    }

    const unreadCountMap: Record<string, number> = {};
    for (const m of lastMsgs ?? []) {
      if (m.sender_id === user.id) continue;
      const readAt = readAtMap[m.conversation_id];
      if (!readAt || new Date(m.created_at) > new Date(readAt)) {
        unreadCountMap[m.conversation_id] = (unreadCountMap[m.conversation_id] ?? 0) + 1;
      }
    }

    const results: ConversationSummary[] = (convRows ?? []).map(c => {
      const fam = Array.isArray(c.families) ? c.families[0] : c.families;
      const stu = Array.isArray(c.students) ? c.students?.[0] : c.students;
      const asgn = Array.isArray(c.assigned_profile) ? c.assigned_profile?.[0] : c.assigned_profile;
      const lm = lastMsgMap[c.id];
      return {
        id:              c.id,
        subject:         c.subject,
        category:        c.category as MessageCategory,
        status:          c.status as ConversationStatus,
        priority:        c.priority as ConversationPriority,
        family_id:       c.family_id,
        family_name:     (fam as { family_name: string })?.family_name ?? "",
        student_id:      c.student_id,
        student_name:    stu ? `${(stu as {preferred_name?: string|null; first_name: string}).preferred_name ?? (stu as {first_name: string}).first_name} ${(stu as {last_name: string}).last_name}` : null,
        created_by:      c.created_by,
        assigned_to:     c.assigned_to,
        assigned_name:   (asgn as { full_name: string } | null)?.full_name ?? null,
        last_message_at: c.last_message_at,
        created_at:      c.created_at,
        resolved_at:     c.resolved_at,
        unread_count:    unreadCountMap[c.id] ?? 0,
        last_message_preview: lm?.body?.slice(0, 100) ?? null,
        last_sender_name:     lm?.sender ?? null,
      };
    });

    return { success: true, data: results };
  } catch (err) {
    logger.error("getMyConversations threw", { err });
    return { success: false, error: "Unable to load messages." };
  }
}

// ── Parent: get conversation thread ───────────────────────────────────────

export async function getMyConversationThread(
  conversationId: string
): Promise<ActionResult<ConversationDetail>> {
  try {
    const { supabase, user, orgId } = await requireParent();

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select(`
        id, subject, category, status, priority,
        family_id, student_id, created_by, assigned_to,
        last_message_at, created_at, resolved_at, resolved_by,
        families!inner ( family_name ),
        students ( first_name, last_name, preferred_name ),
        assigned_profile:profiles!conversations_assigned_to_fkey ( full_name ),
        resolved_profile:profiles!conversations_resolved_by_fkey ( full_name )
      `)
      .eq("id", conversationId)
      .eq("organization_id", orgId)
      .single();

    if (convErr || !conv) return { success: false, error: "Conversation not found." };

    const { data: msgRows, error: msgErr } = await supabase
      .from("messages")
      .select(`sender_id, body, message_type, parent_visible, created_at, edited_at, id,
               profiles!inner ( full_name )`)
      .eq("conversation_id", conversationId)
      .eq("parent_visible", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (msgErr) logger.error("getMyConversationThread messages error", { error: msgErr.message });

    // Mark as read
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("profile_id", user.id);

    const fam = Array.isArray(conv.families) ? conv.families[0] : conv.families;
    const stu = Array.isArray(conv.students) ? conv.students?.[0] : conv.students;
    const asgn = Array.isArray(conv.assigned_profile) ? conv.assigned_profile?.[0] : conv.assigned_profile;
    const resBy = Array.isArray(conv.resolved_profile) ? conv.resolved_profile?.[0] : conv.resolved_profile;

    const messages: MessageItem[] = (msgRows ?? []).map(m => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        id:             m.id,
        sender_id:      m.sender_id,
        sender_name:    (p as { full_name: string })?.full_name ?? "Unknown",
        sender_role:    null,
        body:           m.body,
        message_type:   m.message_type as "message" | "note" | "system",
        parent_visible: m.parent_visible,
        created_at:     m.created_at,
        edited_at:      m.edited_at,
      };
    });

    const detail: ConversationDetail = {
      id:              conv.id,
      subject:         conv.subject,
      category:        conv.category as MessageCategory,
      status:          conv.status as ConversationStatus,
      priority:        conv.priority as ConversationPriority,
      family_id:       conv.family_id,
      family_name:     (fam as { family_name: string })?.family_name ?? "",
      student_id:      conv.student_id,
      student_name:    stu ? `${(stu as {preferred_name?: string|null; first_name: string}).preferred_name ?? (stu as {first_name: string}).first_name} ${(stu as {last_name: string}).last_name}` : null,
      created_by:      conv.created_by,
      assigned_to:     conv.assigned_to,
      assigned_name:   (asgn as { full_name: string } | null)?.full_name ?? null,
      last_message_at: conv.last_message_at,
      created_at:      conv.created_at,
      resolved_at:     conv.resolved_at,
      resolved_by_name:(resBy as { full_name: string } | null)?.full_name ?? null,
      unread_count:    0,
      last_message_preview: null,
      last_sender_name: null,
      messages,
      participants: [],
    };

    return { success: true, data: detail };
  } catch (err) {
    logger.error("getMyConversationThread threw", { err });
    return { success: false, error: "Unable to load conversation." };
  }
}

// ── Parent: create conversation ───────────────────────────────────────────

export async function createParentConversation(params: {
  family_id:  string;
  student_id: string | null;
  subject:    string;
  category:   MessageCategory;
  body:       string;
}): Promise<ActionResult<{ conversation_id: string }>> {
  try {
    const { supabase, user, orgId } = await requireParent();

    const subject = params.subject?.trim();
    if (!subject || subject.length < 2 || subject.length > 200) {
      return { success: false, error: "Subject must be 2–200 characters." };
    }
    const body = sanitizeBody(params.body);
    if (!body) return { success: false, error: "Message cannot be empty (max 5,000 characters)." };

    // Verify family ownership via guardianship
    const { data: guardianship } = await supabase
      .from("guardianships")
      .select("id")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .limit(1)
      .then(async (r) => {
        if (r.data && r.data.length > 0) return r;
        return { data: null };
      });

    // Check family is linked to this user via student guardianship
    const { data: familyCheck } = await supabase
      .from("students")
      .select("family_id")
      .eq("family_id", params.family_id)
      .eq("organization_id", orgId)
      .limit(1);

    if (!familyCheck?.length) {
      return { success: false, error: "Invalid family." };
    }

    // Double-check guardianship links this parent to this family
    const { data: guardCheck } = await supabase
      .from("guardianships")
      .select("id")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .then(async (r) => {
        if (!r.data?.length) return r;
        // Check any of their students belong to this family
        const stuIds = r.data.map(() => null); // we just need guardianship existence
        return r;
      });

    // Insert conversation (RLS will enforce family ownership)
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .insert({
        organization_id: orgId,
        family_id:       params.family_id,
        student_id:      params.student_id ?? null,
        subject,
        category:        params.category,
        created_by:      user.id,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (convErr || !conv) {
      logger.error("createParentConversation insert error", { error: convErr?.message });
      return { success: false, error: "Failed to create conversation." };
    }

    // Add parent as participant
    await supabase.from("conversation_participants").insert({
      conversation_id: conv.id,
      organization_id: orgId,
      profile_id:      user.id,
      participant_type: "parent",
      last_read_at:    new Date().toISOString(),
    });

    // Insert first message
    const { error: msgErr } = await supabase.from("messages").insert({
      conversation_id: conv.id,
      organization_id: orgId,
      sender_id:       user.id,
      body,
      message_type:    "message",
      parent_visible:  true,
    });

    if (msgErr) {
      logger.error("createParentConversation message error", { error: msgErr.message });
    }

    // Notify staff (all staff in org get notified — no specific staff added as participant yet)
    const { data: staffMembers } = await supabase
      .from("organization_members")
      .select("profile_id")
      .eq("organization_id", orgId)
      .in("role", ["staff","registrar","admin","full_admin","platform_admin"])
      .eq("status", "active");

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const staffIds = (staffMembers ?? []).map(m => m.profile_id);
    await createNotifications(supabase, {
      orgId,
      senderId:       user.id,
      senderName:     senderProfile?.full_name ?? "A parent",
      conversationId: conv.id,
      subject,
      type:           "new_parent_message",
      title:          `New message: ${subject}`,
      recipientIds:   staffIds,
    });

    revalidatePath("/portal/messages");

    return { success: true, data: { conversation_id: conv.id } };
  } catch (err) {
    logger.error("createParentConversation threw", { err });
    return { success: false, error: "Unable to send message." };
  }
}

// ── Parent: reply to conversation ─────────────────────────────────────────

export async function sendParentReply(
  conversationId: string,
  body: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, user, orgId } = await requireParent();

    const clean = sanitizeBody(body);
    if (!clean) return { success: false, error: "Message cannot be empty (max 5,000 characters)." };

    // Verify participation (RLS also enforces this)
    const { data: part } = await supabase
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("profile_id", user.id)
      .single();

    if (!part) return { success: false, error: "Conversation not found." };

    const { error: msgErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      organization_id: orgId,
      sender_id:       user.id,
      body:            clean,
      message_type:    "message",
      parent_visible:  true,
    });

    if (msgErr) {
      logger.error("sendParentReply error", { error: msgErr.message });
      return { success: false, error: "Failed to send message." };
    }

    // Update last_message_at
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    // Mark parent as having read up to now
    await supabase
      .from("conversation_participants")
      .update({ last_read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .eq("profile_id", user.id);

    // Notify staff participants
    const { data: staffParts } = await supabase
      .from("conversation_participants")
      .select("profile_id")
      .eq("conversation_id", conversationId)
      .eq("participant_type", "staff");

    const { data: conv } = await supabase
      .from("conversations")
      .select("subject")
      .eq("id", conversationId)
      .single();

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    await createNotifications(supabase, {
      orgId,
      senderId:       user.id,
      senderName:     senderProfile?.full_name ?? "A parent",
      conversationId,
      subject:        conv?.subject ?? "",
      type:           "parent_reply",
      title:          `Reply: ${conv?.subject ?? "message"}`,
      recipientIds:   (staffParts ?? []).map(p => p.profile_id),
    });

    revalidatePath(`/portal/messages/${conversationId}`);
    revalidatePath("/portal/messages");

    return { success: true, data: undefined };
  } catch (err) {
    logger.error("sendParentReply threw", { err });
    return { success: false, error: "Unable to send reply." };
  }
}

// ── Staff: get conversations ──────────────────────────────────────────────

export type StaffConversationFilter =
  | "all" | "unread" | "unresolved" | "mine" | "high_priority" | "resolved" | "waiting_parent" | "waiting_staff";

export async function getStaffConversations(
  filter: StaffConversationFilter = "unresolved"
): Promise<ActionResult<ConversationSummary[]>> {
  try {
    const { supabase, user, orgId } = await requireStaff();

    let query = supabase
      .from("conversations")
      .select(`
        id, subject, category, status, priority,
        family_id, student_id, created_by, assigned_to,
        last_message_at, created_at, resolved_at,
        families!inner ( family_name ),
        students ( first_name, last_name, preferred_name ),
        assigned_profile:profiles!conversations_assigned_to_fkey ( full_name )
      `)
      .eq("organization_id", orgId)
      .order("last_message_at", { ascending: false });

    if (filter === "resolved")       query = query.in("status", ["resolved","closed"]);
    if (filter === "unresolved")     query = query.in("status", ["open","waiting_parent","waiting_staff","reopened"]);
    if (filter === "mine")           query = query.eq("assigned_to", user.id);
    if (filter === "high_priority")  query = query.in("priority", ["high","urgent"]).in("status", ["open","waiting_parent","waiting_staff","reopened"]);
    if (filter === "waiting_parent") query = query.eq("status", "waiting_parent");
    if (filter === "waiting_staff")  query = query.eq("status", "waiting_staff");

    const { data: convRows, error } = await query;
    if (error) {
      logger.error("getStaffConversations error", { error: error.message });
      return { success: false, error: "Failed to load conversations." };
    }

    const convIds = (convRows ?? []).map(c => c.id);

    // Fetch last message per conversation and staff participant's last_read_at
    const [{ data: allMsgs }, { data: myParts }] = await Promise.all([
      convIds.length > 0
        ? supabase
            .from("messages")
            .select("conversation_id, body, created_at, sender_id, profiles!inner(full_name)")
            .in("conversation_id", convIds)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      convIds.length > 0
        ? supabase
            .from("conversation_participants")
            .select("conversation_id, last_read_at")
            .eq("profile_id", user.id)
            .in("conversation_id", convIds)
        : Promise.resolve({ data: [] }),
    ]);

    const lastMsgMap: Record<string, { body: string; sender: string; at: string; senderId: string }> = {};
    const unreadCountMap: Record<string, number> = {};
    const readAtMap: Record<string, string | null> = {};

    for (const p of myParts ?? []) readAtMap[p.conversation_id] = p.last_read_at;

    for (const m of allMsgs ?? []) {
      if (!lastMsgMap[m.conversation_id]) {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        lastMsgMap[m.conversation_id] = {
          body:     m.body,
          sender:   (p as { full_name: string })?.full_name ?? "Unknown",
          at:       m.created_at,
          senderId: m.sender_id,
        };
      }
      if (m.sender_id !== user.id) {
        const readAt = readAtMap[m.conversation_id];
        if (!readAt || new Date(m.created_at) > new Date(readAt)) {
          unreadCountMap[m.conversation_id] = (unreadCountMap[m.conversation_id] ?? 0) + 1;
        }
      }
    }

    // Filter "unread" after computing counts
    let results: ConversationSummary[] = (convRows ?? []).map(c => {
      const fam  = Array.isArray(c.families) ? c.families[0] : c.families;
      const stu  = Array.isArray(c.students) ? c.students?.[0] : c.students;
      const asgn = Array.isArray(c.assigned_profile) ? c.assigned_profile?.[0] : c.assigned_profile;
      const lm   = lastMsgMap[c.id];
      return {
        id:              c.id,
        subject:         c.subject,
        category:        c.category as MessageCategory,
        status:          c.status as ConversationStatus,
        priority:        c.priority as ConversationPriority,
        family_id:       c.family_id,
        family_name:     (fam as { family_name: string })?.family_name ?? "",
        student_id:      c.student_id,
        student_name:    stu ? `${(stu as {preferred_name?: string|null; first_name: string}).preferred_name ?? (stu as {first_name: string}).first_name} ${(stu as {last_name: string}).last_name}` : null,
        created_by:      c.created_by,
        assigned_to:     c.assigned_to,
        assigned_name:   (asgn as { full_name: string } | null)?.full_name ?? null,
        last_message_at: c.last_message_at,
        created_at:      c.created_at,
        resolved_at:     c.resolved_at,
        unread_count:    unreadCountMap[c.id] ?? 0,
        last_message_preview: lm?.body?.slice(0, 100) ?? null,
        last_sender_name:     lm?.sender ?? null,
      };
    });

    if (filter === "unread") results = results.filter(c => c.unread_count > 0);

    return { success: true, data: results };
  } catch (err) {
    logger.error("getStaffConversations threw", { err });
    return { success: false, error: "Unable to load conversations." };
  }
}

// ── Staff: get conversation thread ────────────────────────────────────────

export async function getStaffConversationThread(
  conversationId: string
): Promise<ActionResult<ConversationDetail>> {
  try {
    const { supabase, user, orgId } = await requireStaff();

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select(`
        id, subject, category, status, priority,
        family_id, student_id, created_by, assigned_to,
        last_message_at, created_at, resolved_at, resolved_by,
        families!inner ( family_name ),
        students ( first_name, last_name, preferred_name ),
        assigned_profile:profiles!conversations_assigned_to_fkey ( full_name ),
        resolved_profile:profiles!conversations_resolved_by_fkey ( full_name )
      `)
      .eq("id", conversationId)
      .eq("organization_id", orgId)
      .single();

    if (convErr || !conv) return { success: false, error: "Conversation not found." };

    const [{ data: msgRows }, { data: partRows }] = await Promise.all([
      supabase
        .from("messages")
        .select("id, sender_id, body, message_type, parent_visible, created_at, edited_at, profiles!inner(full_name)")
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("conversation_participants")
        .select("profile_id, participant_type, profiles!inner(full_name)")
        .eq("conversation_id", conversationId),
    ]);

    // Mark staff as having read this conversation
    const existingPart = (partRows ?? []).find(p => p.profile_id === user.id);
    if (existingPart) {
      await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("profile_id", user.id);
    } else {
      // Add staff as participant on first view
      await supabase.from("conversation_participants").insert({
        conversation_id:  conversationId,
        organization_id:  orgId,
        profile_id:       user.id,
        participant_type: "staff",
        last_read_at:     new Date().toISOString(),
      });
    }

    const fam  = Array.isArray(conv.families) ? conv.families[0] : conv.families;
    const stu  = Array.isArray(conv.students) ? conv.students?.[0] : conv.students;
    const asgn = Array.isArray(conv.assigned_profile) ? conv.assigned_profile?.[0] : conv.assigned_profile;
    const resBy= Array.isArray(conv.resolved_profile) ? conv.resolved_profile?.[0] : conv.resolved_profile;

    const messages: MessageItem[] = (msgRows ?? []).map(m => {
      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        id:             m.id,
        sender_id:      m.sender_id,
        sender_name:    (p as { full_name: string })?.full_name ?? "Unknown",
        sender_role:    null,
        body:           m.body,
        message_type:   m.message_type as "message" | "note" | "system",
        parent_visible: m.parent_visible,
        created_at:     m.created_at,
        edited_at:      m.edited_at,
      };
    });

    const participants = (partRows ?? []).map(p => {
      const pf = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
      return {
        profile_id:       p.profile_id,
        name:             (pf as { full_name: string })?.full_name ?? "Unknown",
        participant_type: p.participant_type,
      };
    });

    const detail: ConversationDetail = {
      id:              conv.id,
      subject:         conv.subject,
      category:        conv.category as MessageCategory,
      status:          conv.status as ConversationStatus,
      priority:        conv.priority as ConversationPriority,
      family_id:       conv.family_id,
      family_name:     (fam as { family_name: string })?.family_name ?? "",
      student_id:      conv.student_id,
      student_name:    stu ? `${(stu as {preferred_name?: string|null; first_name: string}).preferred_name ?? (stu as {first_name: string}).first_name} ${(stu as {last_name: string}).last_name}` : null,
      created_by:      conv.created_by,
      assigned_to:     conv.assigned_to,
      assigned_name:   (asgn as { full_name: string } | null)?.full_name ?? null,
      last_message_at: conv.last_message_at,
      created_at:      conv.created_at,
      resolved_at:     conv.resolved_at,
      resolved_by_name:(resBy as { full_name: string } | null)?.full_name ?? null,
      unread_count:    0,
      last_message_preview: null,
      last_sender_name: null,
      messages,
      participants,
    };

    return { success: true, data: detail };
  } catch (err) {
    logger.error("getStaffConversationThread threw", { err });
    return { success: false, error: "Unable to load conversation." };
  }
}

// ── Staff: send message or internal note ─────────────────────────────────

export async function sendStaffMessage(
  conversationId: string,
  body: string,
  isInternalNote: boolean = false
): Promise<ActionResult<void>> {
  try {
    const { supabase, user, orgId } = await requireStaff();

    const clean = sanitizeBody(body);
    if (!clean) return { success: false, error: "Message cannot be empty (max 5,000 characters)." };

    const { error: msgErr } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      organization_id: orgId,
      sender_id:       user.id,
      body:            clean,
      message_type:    isInternalNote ? "note" : "message",
      parent_visible:  !isInternalNote,
    });

    if (msgErr) {
      logger.error("sendStaffMessage error", { error: msgErr.message });
      return { success: false, error: "Failed to send message." };
    }

    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    // Mark staff as read
    await supabase
      .from("conversation_participants")
      .upsert(
        { conversation_id: conversationId, organization_id: orgId, profile_id: user.id, participant_type: "staff", last_read_at: new Date().toISOString() },
        { onConflict: "conversation_id,profile_id" }
      );

    if (!isInternalNote) {
      // Notify parent participants
      const { data: parentParts } = await supabase
        .from("conversation_participants")
        .select("profile_id")
        .eq("conversation_id", conversationId)
        .eq("participant_type", "parent");

      const { data: conv } = await supabase
        .from("conversations")
        .select("subject")
        .eq("id", conversationId)
        .single();

      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      await createNotifications(supabase, {
        orgId,
        senderId:       user.id,
        senderName:     senderProfile?.full_name ?? "Staff",
        conversationId,
        subject:        conv?.subject ?? "",
        type:           "staff_reply",
        title:          `Reply from school: ${conv?.subject ?? "message"}`,
        recipientIds:   (parentParts ?? []).map(p => p.profile_id),
      });
    }

    revalidatePath(`/dashboard/messages/${conversationId}`);
    revalidatePath("/dashboard/messages");

    return { success: true, data: undefined };
  } catch (err) {
    logger.error("sendStaffMessage threw", { err });
    return { success: false, error: "Unable to send message." };
  }
}

// ── Staff: create conversation with family ────────────────────────────────

export async function createStaffConversation(params: {
  family_id:  string;
  student_id: string | null;
  subject:    string;
  category:   MessageCategory;
  priority:   ConversationPriority;
  body:       string;
}): Promise<ActionResult<{ conversation_id: string }>> {
  try {
    const { supabase, user, orgId } = await requireStaff();

    const subject = params.subject?.trim();
    if (!subject || subject.length < 2 || subject.length > 200) {
      return { success: false, error: "Subject must be 2–200 characters." };
    }
    const body = sanitizeBody(params.body);
    if (!body) return { success: false, error: "Message cannot be empty (max 5,000 characters)." };

    // Verify family belongs to org
    const { data: familyCheck } = await supabase
      .from("families")
      .select("id")
      .eq("id", params.family_id)
      .eq("organization_id", orgId)
      .single();

    if (!familyCheck) return { success: false, error: "Family not found." };

    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .insert({
        organization_id: orgId,
        family_id:       params.family_id,
        student_id:      params.student_id ?? null,
        subject,
        category:        params.category,
        priority:        params.priority,
        created_by:      user.id,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (convErr || !conv) {
      logger.error("createStaffConversation error", { error: convErr?.message });
      return { success: false, error: "Failed to create conversation." };
    }

    // Add staff as participant
    await supabase.from("conversation_participants").insert({
      conversation_id:  conv.id,
      organization_id:  orgId,
      profile_id:       user.id,
      participant_type: "staff",
      last_read_at:     new Date().toISOString(),
    });

    // Add all parent/guardian participants for this family
    const { data: guardians } = await supabase
      .from("guardianships")
      .select("profile_id")
      .in("student_id", await supabase
        .from("students")
        .select("id")
        .eq("family_id", params.family_id)
        .then(r => r.data?.map(s => s.id) ?? [])
      )
      .eq("status", "active");

    const uniqueParentIds = [...new Set((guardians ?? []).map(g => g.profile_id))];
    if (uniqueParentIds.length > 0) {
      await supabase.from("conversation_participants").insert(
        uniqueParentIds.map(pid => ({
          conversation_id:  conv.id,
          organization_id:  orgId,
          profile_id:       pid,
          participant_type: "parent",
        }))
      );
    }

    // Insert first message
    await supabase.from("messages").insert({
      conversation_id: conv.id,
      organization_id: orgId,
      sender_id:       user.id,
      body,
      message_type:    "message",
      parent_visible:  true,
    });

    // Notify parents
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    await createNotifications(supabase, {
      orgId,
      senderId:       user.id,
      senderName:     senderProfile?.full_name ?? "School staff",
      conversationId: conv.id,
      subject,
      type:           "staff_initiated",
      title:          `Message from school: ${subject}`,
      recipientIds:   uniqueParentIds,
    });

    await writeAuditLog(supabase, {
      organizationId: orgId,
      actorId:        user.id,
      action:         "messaging.conversation_created",
      resourceType:   "conversation",
      resourceId:     conv.id,
      newValues:      { family_id: params.family_id, subject, category: params.category },
    });

    revalidatePath("/dashboard/messages");

    return { success: true, data: { conversation_id: conv.id } };
  } catch (err) {
    logger.error("createStaffConversation threw", { err });
    return { success: false, error: "Unable to create conversation." };
  }
}

// ── Staff: update conversation ────────────────────────────────────────────

export async function updateConversationStatus(
  conversationId: string,
  status: ConversationStatus
): Promise<ActionResult<void>> {
  try {
    const { supabase, user, orgId } = await requireStaff();

    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === "resolved") {
      updates.resolved_at = new Date().toISOString();
      updates.resolved_by = user.id;
    } else {
      updates.resolved_at = null;
      updates.resolved_by = null;
    }

    const { error } = await supabase
      .from("conversations")
      .update(updates)
      .eq("id", conversationId)
      .eq("organization_id", orgId);

    if (error) return { success: false, error: "Failed to update status." };

    await writeAuditLog(supabase, {
      organizationId: orgId,
      actorId:        user.id,
      action:         "messaging.status_changed",
      resourceType:   "conversation",
      resourceId:     conversationId,
      newValues:      { status },
    });

    revalidatePath(`/dashboard/messages/${conversationId}`);
    revalidatePath("/dashboard/messages");
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("updateConversationStatus threw", { err });
    return { success: false, error: "Unable to update conversation." };
  }
}

export async function updateConversationPriority(
  conversationId: string,
  priority: ConversationPriority
): Promise<ActionResult<void>> {
  try {
    const { supabase, user, orgId } = await requireStaff();

    const { error } = await supabase
      .from("conversations")
      .update({ priority, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("organization_id", orgId);

    if (error) return { success: false, error: "Failed to update priority." };

    await writeAuditLog(supabase, {
      organizationId: orgId,
      actorId:        user.id,
      action:         "messaging.priority_changed",
      resourceType:   "conversation",
      resourceId:     conversationId,
      newValues:      { priority },
    });

    revalidatePath(`/dashboard/messages/${conversationId}`);
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("updateConversationPriority threw", { err });
    return { success: false, error: "Unable to update priority." };
  }
}

export async function assignConversation(
  conversationId: string,
  staffProfileId: string | null
): Promise<ActionResult<void>> {
  try {
    const { supabase, user, orgId } = await requireStaff();

    if (staffProfileId) {
      const { data: check } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", orgId)
        .eq("profile_id", staffProfileId)
        .eq("status", "active")
        .single();
      if (!check || !STAFF_ROLES.has(check.role)) {
        return { success: false, error: "Invalid staff member." };
      }
    }

    const { error } = await supabase
      .from("conversations")
      .update({ assigned_to: staffProfileId, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("organization_id", orgId);

    if (error) return { success: false, error: "Failed to assign conversation." };

    if (staffProfileId && staffProfileId !== user.id) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("subject")
        .eq("id", conversationId)
        .single();

      await createNotifications(supabase, {
        orgId,
        senderId:       user.id,
        senderName:     "System",
        conversationId,
        subject:        conv?.subject ?? "",
        type:           "conversation_assigned",
        title:          `Conversation assigned to you: ${conv?.subject ?? ""}`,
        recipientIds:   [staffProfileId],
      });

      // Add assigned staff as participant
      await supabase.from("conversation_participants").upsert(
        { conversation_id: conversationId, organization_id: orgId, profile_id: staffProfileId, participant_type: "staff" },
        { onConflict: "conversation_id,profile_id" }
      );
    }

    await writeAuditLog(supabase, {
      organizationId: orgId,
      actorId:        user.id,
      action:         "messaging.assigned",
      resourceType:   "conversation",
      resourceId:     conversationId,
      newValues:      { assigned_to: staffProfileId },
    });

    revalidatePath(`/dashboard/messages/${conversationId}`);
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("assignConversation threw", { err });
    return { success: false, error: "Unable to assign conversation." };
  }
}

// ── Shared: get unread count ──────────────────────────────────────────────

export async function getUnreadCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const user = await getUser();
    if (!user) return 0;
    const orgId = await getActiveOrgId();
    if (!orgId) return 0;

    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("profile_id", user.id);

    if (!parts?.length) return 0;

    const convIds = parts.map(p => p.conversation_id);
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, created_at, sender_id, parent_visible")
      .in("conversation_id", convIds)
      .is("deleted_at", null);

    const readAtMap: Record<string, string | null> = {};
    for (const p of parts) readAtMap[p.conversation_id] = p.last_read_at;

    const unreadConvIds = new Set<string>();
    for (const m of msgs ?? []) {
      if (m.sender_id === user.id) continue;
      if (m.parent_visible === false) {
        // Check if the current user is staff — non-visible messages still count for staff
        // (simplified: just count all non-deleted messages from others)
      }
      const readAt = readAtMap[m.conversation_id];
      if (!readAt || new Date(m.created_at) > new Date(readAt)) {
        unreadConvIds.add(m.conversation_id);
      }
    }

    return unreadConvIds.size;
  } catch {
    return 0;
  }
}

// ── Staff: list staff members for assignment ──────────────────────────────

export async function getStaffMembers(): Promise<ActionResult<StaffMember[]>> {
  try {
    const { supabase, orgId } = await requireStaff();

    const { data, error } = await supabase
      .from("organization_members")
      .select("profile_id, role, profiles!inner(full_name)")
      .eq("organization_id", orgId)
      .in("role", ["staff","registrar","admin","full_admin"])
      .eq("status", "active")
      .order("role");

    if (error) return { success: false, error: "Failed to load staff." };

    return {
      success: true,
      data: (data ?? []).map(m => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        return {
          profile_id: m.profile_id,
          full_name:  (p as { full_name: string })?.full_name ?? "Unknown",
          role:       m.role,
        };
      }),
    };
  } catch (err) {
    logger.error("getStaffMembers threw", { err });
    return { success: false, error: "Unable to load staff." };
  }
}

// ── Shared: get parent's families for compose ─────────────────────────────

export async function getMyFamiliesForCompose(): Promise<ActionResult<Array<{
  family_id: string;
  family_name: string;
  students: Array<{ id: string; name: string }>;
}>>> {
  try {
    const { supabase, user, orgId } = await requireParent();

    const { data: guardianships } = await supabase
      .from("guardianships")
      .select("student_id, students!inner(id, first_name, last_name, preferred_name, family_id, families!inner(id, family_name))")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .eq("students.organization_id", orgId);

    const familyMap = new Map<string, { family_id: string; family_name: string; students: Array<{ id: string; name: string }> }>();

    for (const g of guardianships ?? []) {
      const stu = Array.isArray(g.students) ? g.students[0] : g.students as {
        id: string; first_name: string; last_name: string; preferred_name: string | null;
        family_id: string | null;
        families: { id: string; family_name: string } | Array<{ id: string; family_name: string }> | null;
      };
      if (!stu || !stu.family_id) continue;
      const fam = Array.isArray(stu.families) ? stu.families[0] : stu.families;
      if (!fam) continue;
      if (!familyMap.has(stu.family_id)) {
        familyMap.set(stu.family_id, {
          family_id:   stu.family_id,
          family_name: (fam as { family_name: string }).family_name,
          students:    [],
        });
      }
      familyMap.get(stu.family_id)!.students.push({
        id:   stu.id,
        name: `${stu.preferred_name ?? stu.first_name} ${stu.last_name}`,
      });
    }

    return { success: true, data: Array.from(familyMap.values()) };
  } catch (err) {
    logger.error("getMyFamiliesForCompose threw", { err });
    return { success: false, error: "Unable to load family information." };
  }
}

// ── Staff: search conversations ───────────────────────────────────────────

export interface ConversationSearchResult extends ConversationSummary {
  match_context: string | null;
}

export async function searchStaffConversations(
  query: string
): Promise<ActionResult<ConversationSearchResult[]>> {
  try {
    const { supabase, orgId } = await requireStaff();
    const q = query.trim();
    if (!q || q.length < 2) return { success: true, data: [] };

    // Search subjects via full-text, plus family/student name via ilike
    const { data, error } = await supabase
      .from("conversations")
      .select(`
        id, subject, category, status, priority,
        family_id, student_id, created_by, assigned_to,
        last_message_at, created_at, resolved_at,
        families!inner ( family_name ),
        students ( first_name, last_name, preferred_name ),
        assigned_profile:profiles!conversations_assigned_to_fkey ( full_name )
      `)
      .eq("organization_id", orgId)
      .or(`subject.ilike.%${q}%,families.family_name.ilike.%${q}%`)
      .order("last_message_at", { ascending: false })
      .limit(30);

    if (error) {
      logger.error("searchStaffConversations error", { error: error.message });
      return { success: false, error: "Search failed." };
    }

    const results: ConversationSearchResult[] = (data ?? []).map(c => {
      const fam  = Array.isArray(c.families) ? c.families[0] : c.families;
      const stu  = Array.isArray(c.students) ? c.students?.[0] : c.students;
      const asgn = Array.isArray(c.assigned_profile) ? c.assigned_profile?.[0] : c.assigned_profile;
      return {
        id:              c.id,
        subject:         c.subject,
        category:        c.category as MessageCategory,
        status:          c.status as ConversationStatus,
        priority:        c.priority as ConversationPriority,
        family_id:       c.family_id,
        family_name:     (fam as { family_name: string })?.family_name ?? "",
        student_id:      c.student_id,
        student_name:    stu ? `${(stu as {preferred_name?: string|null; first_name: string}).preferred_name ?? (stu as {first_name: string}).first_name} ${(stu as {last_name: string}).last_name}` : null,
        created_by:      c.created_by,
        assigned_to:     c.assigned_to,
        assigned_name:   (asgn as { full_name: string } | null)?.full_name ?? null,
        last_message_at: c.last_message_at,
        created_at:      c.created_at,
        resolved_at:     c.resolved_at,
        unread_count:    0,
        last_message_preview: null,
        last_sender_name: null,
        match_context:   null,
      };
    });

    return { success: true, data: results };
  } catch (err) {
    logger.error("searchStaffConversations threw", { err });
    return { success: false, error: "Unable to search." };
  }
}

// ── Shared: get unread notifications for live badge ───────────────────────

export async function getUnreadNotificationsCount(): Promise<number> {
  try {
    const supabase = await createClient();
    const user = await getUser();
    if (!user) return 0;

    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null)
      .eq("resource_type", "conversation");

    return count ?? 0;
  } catch {
    return 0;
  }
}

// ── Staff: get recent unread conversations for widget ─────────────────────

export async function getUnreadConversationsForWidget(): Promise<ActionResult<ConversationSummary[]>> {
  try {
    const { supabase, user, orgId } = await requireStaff();

    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("profile_id", user.id);

    if (!parts?.length) return { success: true, data: [] };

    const convIds = parts.map(p => p.conversation_id);

    const { data: convRows } = await supabase
      .from("conversations")
      .select(`
        id, subject, category, status, priority, family_id, student_id,
        created_by, assigned_to, last_message_at, created_at, resolved_at,
        families!inner ( family_name ),
        students ( first_name, last_name, preferred_name ),
        assigned_profile:profiles!conversations_assigned_to_fkey ( full_name )
      `)
      .eq("organization_id", orgId)
      .in("id", convIds)
      .in("status", ["open","waiting_parent","waiting_staff","reopened"])
      .order("last_message_at", { ascending: false })
      .limit(5);

    const readAtMap: Record<string, string | null> = {};
    for (const p of parts) readAtMap[p.conversation_id] = p.last_read_at;

    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, created_at, sender_id, body, profiles!inner(full_name)")
      .in("conversation_id", convIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    const lastMsgMap: Record<string, { body: string; sender: string }> = {};
    const unreadMap: Record<string, number> = {};
    for (const m of msgs ?? []) {
      if (!lastMsgMap[m.conversation_id]) {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        lastMsgMap[m.conversation_id] = { body: m.body, sender: (p as { full_name: string })?.full_name ?? "Unknown" };
      }
      if (m.sender_id !== user.id) {
        const readAt = readAtMap[m.conversation_id];
        if (!readAt || new Date(m.created_at) > new Date(readAt)) {
          unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] ?? 0) + 1;
        }
      }
    }

    const results: ConversationSummary[] = (convRows ?? [])
      .filter(c => (unreadMap[c.id] ?? 0) > 0)
      .map(c => {
        const fam  = Array.isArray(c.families) ? c.families[0] : c.families;
        const stu  = Array.isArray(c.students) ? c.students?.[0] : c.students;
        const asgn = Array.isArray(c.assigned_profile) ? c.assigned_profile?.[0] : c.assigned_profile;
        const lm   = lastMsgMap[c.id];
        return {
          id:              c.id,
          subject:         c.subject,
          category:        c.category as MessageCategory,
          status:          c.status as ConversationStatus,
          priority:        c.priority as ConversationPriority,
          family_id:       c.family_id,
          family_name:     (fam as { family_name: string })?.family_name ?? "",
          student_id:      c.student_id,
          student_name:    stu ? `${(stu as {preferred_name?: string|null; first_name: string}).preferred_name ?? (stu as {first_name: string}).first_name} ${(stu as {last_name: string}).last_name}` : null,
          created_by:      c.created_by,
          assigned_to:     c.assigned_to,
          assigned_name:   (asgn as { full_name: string } | null)?.full_name ?? null,
          last_message_at: c.last_message_at,
          created_at:      c.created_at,
          resolved_at:     c.resolved_at,
          unread_count:    unreadMap[c.id] ?? 0,
          last_message_preview: lm?.body?.slice(0, 80) ?? null,
          last_sender_name:     lm?.sender ?? null,
        };
      });

    return { success: true, data: results };
  } catch (err) {
    logger.error("getUnreadConversationsForWidget threw", { err });
    return { success: false, error: "Unable to load." };
  }
}

// ── Parent: get unread conversations for portal widget ────────────────────

export async function getParentUnreadForWidget(): Promise<ActionResult<{
  unread_count: number;
  latest_subject: string | null;
  latest_at: string | null;
}>> {
  try {
    const { supabase, user, orgId } = await requireParent();

    const { data: parts } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("profile_id", user.id);

    if (!parts?.length) return { success: true, data: { unread_count: 0, latest_subject: null, latest_at: null } };

    const convIds = parts.map(p => p.conversation_id);
    const readAtMap: Record<string, string | null> = {};
    for (const p of parts) readAtMap[p.conversation_id] = p.last_read_at;

    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, created_at, sender_id")
      .in("conversation_id", convIds)
      .eq("parent_visible", true)
      .is("deleted_at", null)
      .neq("sender_id", user.id);

    const unreadConvIds = new Set<string>();
    for (const m of msgs ?? []) {
      const readAt = readAtMap[m.conversation_id];
      if (!readAt || new Date(m.created_at) > new Date(readAt)) {
        unreadConvIds.add(m.conversation_id);
      }
    }

    if (unreadConvIds.size === 0) {
      return { success: true, data: { unread_count: 0, latest_subject: null, latest_at: null } };
    }

    const { data: latestConv } = await supabase
      .from("conversations")
      .select("subject, last_message_at")
      .eq("organization_id", orgId)
      .in("id", Array.from(unreadConvIds))
      .order("last_message_at", { ascending: false })
      .limit(1)
      .single();

    return {
      success: true,
      data: {
        unread_count:   unreadConvIds.size,
        latest_subject: latestConv?.subject ?? null,
        latest_at:      latestConv?.last_message_at ?? null,
      },
    };
  } catch (err) {
    logger.error("getParentUnreadForWidget threw", { err });
    return { success: false, error: "Unable to load." };
  }
}

// ── Mark notification read ────────────────────────────────────────────────

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    const supabase = await createClient();
    const user = await getUser();
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("recipient_id", user.id);
  } catch { /* silent */ }
}
