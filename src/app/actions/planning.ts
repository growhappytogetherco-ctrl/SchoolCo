"use server";

import { revalidatePath } from "next/cache";
import { createClient, getUser, getActiveOrgId } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/actions";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────

export type EventCategory =
  | "school_day" | "holiday" | "no_school" | "quarter_begins" | "quarter_ends"
  | "semester_begins" | "semester_ends" | "testing" | "leadership" | "entrepreneurship"
  | "bible" | "community_service" | "field_trip" | "parent_meeting" | "open_house"
  | "discovery_day" | "guest_speaker" | "fundraiser" | "volunteer_event"
  | "graduation" | "medical" | "sports" | "club" | "other";

export type EventVisibility =
  | "school_wide" | "parents" | "staff_only" | "specific_grade"
  | "specific_student" | "specific_family" | "leadership_students"
  | "entrepreneurship_students" | "admin_private";

export type EventStatus = "draft" | "published" | "cancelled" | "completed";
export type TaskStatus = "not_started" | "in_progress" | "waiting" | "blocked" | "completed" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type CalendarView = "agenda" | "week" | "month" | "day" | "list";
export type RsvpStatus = "pending" | "confirmed" | "declined" | "waitlisted";

export interface CalendarEvent {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  category: EventCategory;
  visibility: EventVisibility;
  status: EventStatus;
  visibility_grade: string | null;
  student_id: string | null;
  family_id: string | null;
  assigned_staff_id: string | null;
  recurrence_rule: string | null;
  capacity: number | null;
  requires_rsvp: boolean;
  requires_permission_slip: boolean;
  requires_parent_confirm: boolean;
  requires_transportation: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  // joined
  family_name?: string | null;
  student_name?: string | null;
  assigned_staff_name?: string | null;
  rsvp_count?: number;
}

export interface PlanningTask {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  priority: TaskPriority;
  due_at: string | null;
  status: TaskStatus;
  event_id: string | null;
  student_id: string | null;
  family_id: string | null;
  checklist: Array<{ id: string; label: string; done: boolean }>;
  notes: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  event_title?: string | null;
}

export interface SmartSuggestion {
  label: string;
  type: "task" | "reminder";
  data: Partial<PlanningTask> | { offset_seconds: number; target_audience: string };
  selected?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function requireStaffAuth() {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  const orgId = await getActiveOrgId();
  if (!orgId) throw new Error("No active org");
  return { user, orgId };
}

async function requireParentAuth() {
  const user = await getUser();
  if (!user) throw new Error("Unauthenticated");
  const orgId = await getActiveOrgId();
  if (!orgId) throw new Error("No active org");
  return { user, orgId };
}

// ── Smart Suggestions ─────────────────────────────────────────────────────

export async function getSmartSuggestions(
  category: EventCategory,
  _eventTitle: string
): Promise<SmartSuggestion[]> {
  const DAY = 86400;

  const suggestions: Record<string, SmartSuggestion[]> = {
    field_trip: [
      { label: "Print permission slips", type: "task", data: { title: "Print permission slips", priority: "high" as TaskPriority } },
      { label: "Notify parents 14 days before", type: "reminder", data: { offset_seconds: -14 * DAY, target_audience: "parents" } },
      { label: "Notify parents 7 days before", type: "reminder", data: { offset_seconds: -7 * DAY, target_audience: "parents" } },
      { label: "Notify parents 1 day before", type: "reminder", data: { offset_seconds: -1 * DAY, target_audience: "parents" } },
      { label: "Create attendance roster", type: "task", data: { title: "Create attendance roster", priority: "normal" as TaskPriority } },
      { label: "Assign chaperone", type: "task", data: { title: "Assign chaperone", priority: "high" as TaskPriority } },
      { label: "Reserve transportation", type: "task", data: { title: "Reserve transportation", priority: "urgent" as TaskPriority } },
      { label: "Parent confirmation required", type: "task", data: { title: "Collect parent confirmations", priority: "high" as TaskPriority } },
      { label: "Volunteer request", type: "task", data: { title: "Send volunteer request to families", priority: "normal" as TaskPriority } },
    ],
    discovery_day: [
      { label: "Create booking slots task", type: "task", data: { title: "Set up discovery day booking slots", priority: "high" as TaskPriority } },
      { label: "Notify interested families", type: "reminder", data: { offset_seconds: -14 * DAY, target_audience: "parents" } },
      { label: "Campus tour checklist", type: "task", data: { title: "Prepare campus tour checklist", priority: "normal" as TaskPriority } },
      { label: "Sign-in sheet", type: "task", data: { title: "Prepare sign-in sheet", priority: "normal" as TaskPriority } },
      { label: "Enrollment follow-up task", type: "task", data: { title: "Follow up with prospective families after event", priority: "high" as TaskPriority } },
      { label: "Send reminder 7 days before", type: "reminder", data: { offset_seconds: -7 * DAY, target_audience: "parents" } },
    ],
    parent_meeting: [
      { label: "Create reminder 7 days before", type: "reminder", data: { offset_seconds: -7 * DAY, target_audience: "parents" } },
      { label: "Create reminder 1 day before", type: "reminder", data: { offset_seconds: -1 * DAY, target_audience: "parents" } },
      { label: "Attendance list task", type: "task", data: { title: "Prepare parent meeting attendance list", priority: "normal" as TaskPriority } },
      { label: "Send parent notification", type: "task", data: { title: "Send parent meeting notification", priority: "high" as TaskPriority } },
      { label: "Follow-up message task", type: "task", data: { title: "Send follow-up message after meeting", priority: "normal" as TaskPriority } },
    ],
    testing: [
      { label: "Notify parents", type: "reminder", data: { offset_seconds: -7 * DAY, target_audience: "parents" } },
      { label: "Prepare student roster", type: "task", data: { title: "Prepare testing student roster", priority: "high" as TaskPriority } },
      { label: "Verify accommodations", type: "task", data: { title: "Verify student accommodations for testing", priority: "urgent" as TaskPriority } },
      { label: "Teacher setup task", type: "task", data: { title: "Classroom setup for testing day", priority: "normal" as TaskPriority } },
    ],
    community_service: [
      { label: "Create service hours opportunity", type: "task", data: { title: "Post community service hours opportunity", priority: "normal" as TaskPriority } },
      { label: "Notify parents", type: "reminder", data: { offset_seconds: -7 * DAY, target_audience: "parents" } },
      { label: "Parent volunteer request", type: "task", data: { title: "Send parent volunteer request", priority: "normal" as TaskPriority } },
      { label: "Attendance roster", type: "task", data: { title: "Create community service attendance roster", priority: "normal" as TaskPriority } },
    ],
    medical: [
      { label: "Notify medical staff", type: "task", data: { title: "Notify school medical staff", priority: "urgent" as TaskPriority } },
      { label: "Prepare medication list task", type: "task", data: { title: "Prepare student medication list", priority: "urgent" as TaskPriority } },
      { label: "Emergency contacts task", type: "task", data: { title: "Verify emergency contacts", priority: "high" as TaskPriority } },
      { label: "Flag Daily Operations", type: "task", data: { title: "Flag in daily operations board", priority: "high" as TaskPriority } },
    ],
    graduation: [
      { label: "Parent notification", type: "reminder", data: { offset_seconds: -30 * DAY, target_audience: "parents" } },
      { label: "Reminder 7 days", type: "reminder", data: { offset_seconds: -7 * DAY, target_audience: "parents" } },
      { label: "Reminder 1 day", type: "reminder", data: { offset_seconds: -1 * DAY, target_audience: "parents" } },
      { label: "Print programs task", type: "task", data: { title: "Print graduation programs", priority: "high" as TaskPriority } },
      { label: "Venue setup checklist", type: "task", data: { title: "Graduation venue setup checklist", priority: "high" as TaskPriority } },
      { label: "Photo checklist", type: "task", data: { title: "Graduation photo checklist", priority: "normal" as TaskPriority } },
    ],
  };

  const defaults: SmartSuggestion[] = [
    { label: "Notify parents", type: "reminder", data: { offset_seconds: -7 * DAY, target_audience: "parents" } },
    { label: "Create reminder 7 days before", type: "reminder", data: { offset_seconds: -7 * DAY, target_audience: "staff" } },
  ];

  return (suggestions[category] ?? defaults).map((s) => ({ ...s, selected: true }));
}

// ── Staff Actions ─────────────────────────────────────────────────────────

export async function getCalendarEvents(params: {
  startDate?: string;
  endDate?: string;
  category?: EventCategory;
  status?: EventStatus;
} = {}): Promise<ActionResult<CalendarEvent[]>> {
  try {
    const { orgId } = await requireStaffAuth();
    const supabase = await createClient();

    let q = supabase
      .from("calendar_events")
      .select("*")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("start_at", { ascending: true });

    if (params.startDate) q = q.gte("start_at", params.startDate);
    if (params.endDate) q = q.lte("start_at", params.endDate);
    if (params.category) q = q.eq("category", params.category);
    if (params.status) q = q.eq("status", params.status);

    const { data, error } = await q;
    if (error) throw error;
    return { success: true, data: (data ?? []) as CalendarEvent[] };
  } catch (err) {
    logger.error("getCalendarEvents error", { err });
    return { success: false, error: String(err) };
  }
}

export async function getEventById(id: string): Promise<ActionResult<CalendarEvent & { reminders: any[]; rsvps: any[]; tasks: PlanningTask[] }>> {
  try {
    const { orgId } = await requireStaffAuth();
    const supabase = await createClient();

    const { data: event, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("id", id)
      .eq("organization_id", orgId)
      .single();
    if (error) throw error;

    const [remindersRes, rsvpsRes, tasksRes] = await Promise.all([
      supabase.from("event_reminders").select("*").eq("event_id", id).eq("organization_id", orgId),
      supabase.from("event_rsvps").select("*").eq("event_id", id).eq("organization_id", orgId),
      supabase.from("planning_tasks").select("*").eq("event_id", id).eq("organization_id", orgId).is("archived_at", null),
    ]);

    return {
      success: true,
      data: {
        ...(event as CalendarEvent),
        reminders: remindersRes.data ?? [],
        rsvps: rsvpsRes.data ?? [],
        tasks: (tasksRes.data ?? []) as PlanningTask[],
      },
    };
  } catch (err) {
    logger.error("getEventById error", { err });
    return { success: false, error: String(err) };
  }
}

export async function createEvent(
  data: Partial<CalendarEvent> & { title: string; start_at: string; end_at: string; category: EventCategory }
): Promise<ActionResult<CalendarEvent>> {
  try {
    const { user, orgId } = await requireStaffAuth();
    const supabase = await createClient();

    const { data: event, error } = await supabase
      .from("calendar_events")
      .insert({
        ...data,
        organization_id: orgId,
        created_by: user.id,
        updated_by: user.id,
        status: data.status ?? "draft",
        visibility: data.visibility ?? "school_wide",
      })
      .select()
      .single();

    if (error) throw error;
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/events");
    return { success: true, data: event as CalendarEvent };
  } catch (err) {
    logger.error("createEvent error", { err });
    return { success: false, error: String(err) };
  }
}

export async function updateEvent(id: string, data: Partial<CalendarEvent>): Promise<ActionResult<CalendarEvent>> {
  try {
    const { user, orgId } = await requireStaffAuth();
    const supabase = await createClient();

    const { data: event, error } = await supabase
      .from("calendar_events")
      .update({ ...data, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) throw error;
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/events");
    revalidatePath(`/dashboard/events/${id}`);
    return { success: true, data: event as CalendarEvent };
  } catch (err) {
    logger.error("updateEvent error", { err });
    return { success: false, error: String(err) };
  }
}

export async function archiveEvent(id: string): Promise<ActionResult<void>> {
  try {
    const { orgId } = await requireStaffAuth();
    const supabase = await createClient();

    const { error } = await supabase
      .from("calendar_events")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", orgId);

    if (error) throw error;
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/events");
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("archiveEvent error", { err });
    return { success: false, error: String(err) };
  }
}

export async function createTask(
  data: Partial<PlanningTask> & { title: string }
): Promise<ActionResult<PlanningTask>> {
  try {
    const { user, orgId } = await requireStaffAuth();
    const supabase = await createClient();

    const { data: task, error } = await supabase
      .from("planning_tasks")
      .insert({
        ...data,
        organization_id: orgId,
        created_by: user.id,
        status: data.status ?? "not_started",
        priority: data.priority ?? "normal",
        checklist: data.checklist ?? [],
      })
      .select()
      .single();

    if (error) throw error;
    revalidatePath("/dashboard/tasks");
    return { success: true, data: task as PlanningTask };
  } catch (err) {
    logger.error("createTask error", { err });
    return { success: false, error: String(err) };
  }
}

export async function updateTask(id: string, data: Partial<PlanningTask>): Promise<ActionResult<PlanningTask>> {
  try {
    const { user, orgId } = await requireStaffAuth();
    const supabase = await createClient();

    const updateData: Record<string, unknown> = { ...data, updated_at: new Date().toISOString() };
    if (data.status === "completed" && !data.completed_at) {
      updateData.completed_at = new Date().toISOString();
      updateData.completed_by = user.id;
    }

    const { data: task, error } = await supabase
      .from("planning_tasks")
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) throw error;
    revalidatePath("/dashboard/tasks");
    return { success: true, data: task as PlanningTask };
  } catch (err) {
    logger.error("updateTask error", { err });
    return { success: false, error: String(err) };
  }
}

export async function getTasks(params: { status?: TaskStatus; assigned_to?: string } = {}): Promise<ActionResult<PlanningTask[]>> {
  try {
    const { orgId } = await requireStaffAuth();
    const supabase = await createClient();

    let q = supabase
      .from("planning_tasks")
      .select("*, calendar_events(title)")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("due_at", { ascending: true });

    if (params.status) q = q.eq("status", params.status);
    if (params.assigned_to) q = q.eq("assigned_to", params.assigned_to);

    const { data, error } = await q;
    if (error) throw error;

    const tasks = (data ?? []).map((t: any) => ({
      ...t,
      event_title: t.calendar_events?.title ?? null,
      calendar_events: undefined,
    }));

    return { success: true, data: tasks as PlanningTask[] };
  } catch (err) {
    logger.error("getTasks error", { err });
    return { success: false, error: String(err) };
  }
}

export async function createFromSmartSuggestions(
  eventId: string,
  suggestions: SmartSuggestion[]
): Promise<ActionResult<void>> {
  try {
    const { user, orgId } = await requireStaffAuth();
    const supabase = await createClient();

    const selected = suggestions.filter((s) => s.selected);

    // Get event for context
    const { data: event } = await supabase
      .from("calendar_events")
      .select("start_at")
      .eq("id", eventId)
      .eq("organization_id", orgId)
      .single();

    const tasks = selected
      .filter((s) => s.type === "task")
      .map((s) => ({
        ...(s.data as Partial<PlanningTask>),
        organization_id: orgId,
        created_by: user.id,
        event_id: eventId,
        status: "not_started" as TaskStatus,
        priority: (s.data as Partial<PlanningTask>).priority ?? "normal" as TaskPriority,
        checklist: [],
      }));

    const reminders = selected
      .filter((s) => s.type === "reminder")
      .map((s) => {
        const d = s.data as { offset_seconds: number; target_audience: string };
        const eventStart = event?.start_at ? new Date(event.start_at) : new Date();
        const sendAt = new Date(eventStart.getTime() + d.offset_seconds * 1000);
        return {
          event_id: eventId,
          organization_id: orgId,
          offset_seconds: d.offset_seconds,
          target_audience: d.target_audience,
        };
      });

    if (tasks.length > 0) {
      const { error } = await supabase.from("planning_tasks").insert(tasks);
      if (error) throw error;
    }
    if (reminders.length > 0) {
      const { error } = await supabase.from("event_reminders").insert(reminders);
      if (error) throw error;
    }

    revalidatePath("/dashboard/tasks");
    revalidatePath(`/dashboard/events/${eventId}`);
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("createFromSmartSuggestions error", { err });
    return { success: false, error: String(err) };
  }
}

export async function getTemplates(): Promise<ActionResult<any[]>> {
  try {
    const { orgId } = await requireStaffAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("planning_templates")
      .select("*")
      .or(`organization_id.eq.${orgId},is_system.eq.true`)
      .order("name");

    if (error) throw error;
    return { success: true, data: data ?? [] };
  } catch (err) {
    logger.error("getTemplates error", { err });
    return { success: false, error: String(err) };
  }
}

export async function createFromTemplate(
  templateId: string,
  anchorDate: string,
  overrides: Partial<CalendarEvent>
): Promise<ActionResult<CalendarEvent>> {
  try {
    const { user, orgId } = await requireStaffAuth();
    const supabase = await createClient();

    const { data: template, error: tErr } = await supabase
      .from("planning_templates")
      .select("*")
      .eq("id", templateId)
      .single();
    if (tErr) throw tErr;

    const anchor = new Date(anchorDate);
    const eventsTemplate = template.events_template ?? {};

    const { data: event, error } = await supabase
      .from("calendar_events")
      .insert({
        title: eventsTemplate.title ?? template.name,
        description: eventsTemplate.description ?? null,
        start_at: anchor.toISOString(),
        end_at: anchor.toISOString(),
        category: eventsTemplate.category ?? "other",
        visibility: eventsTemplate.visibility ?? "school_wide",
        status: "draft",
        organization_id: orgId,
        created_by: user.id,
        updated_by: user.id,
        ...overrides,
      })
      .select()
      .single();

    if (error) throw error;
    revalidatePath("/dashboard/calendar");
    revalidatePath("/dashboard/events");
    return { success: true, data: event as CalendarEvent };
  } catch (err) {
    logger.error("createFromTemplate error", { err });
    return { success: false, error: String(err) };
  }
}

export async function getOrCreatePreferences(): Promise<{ default_view: CalendarView; hidden_categories: string[] }> {
  try {
    const { user, orgId } = await requireStaffAuth();
    const supabase = await createClient();

    const { data } = await supabase
      .from("calendar_preferences")
      .select("default_view, hidden_categories")
      .eq("profile_id", user.id)
      .eq("organization_id", orgId)
      .single();

    if (data) {
      return {
        default_view: (data.default_view as CalendarView) ?? "month",
        hidden_categories: (data.hidden_categories as string[]) ?? [],
      };
    }

    // Create defaults
    await supabase.from("calendar_preferences").insert({
      profile_id: user.id,
      organization_id: orgId,
      default_view: "month",
      hidden_categories: [],
    });

    return { default_view: "month", hidden_categories: [] };
  } catch {
    return { default_view: "month", hidden_categories: [] };
  }
}

export async function updatePreferences(prefs: { default_view?: CalendarView; hidden_categories?: string[] }): Promise<void> {
  try {
    const { user, orgId } = await requireStaffAuth();
    const supabase = await createClient();

    await supabase
      .from("calendar_preferences")
      .upsert({
        profile_id: user.id,
        organization_id: orgId,
        ...prefs,
        updated_at: new Date().toISOString(),
      }, { onConflict: "profile_id,organization_id" });
  } catch (err) {
    logger.error("updatePreferences error", { err });
  }
}

export async function searchEvents(query: string): Promise<ActionResult<CalendarEvent[]>> {
  try {
    const { orgId } = await requireStaffAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .ilike("title", `%${query}%`)
      .order("start_at", { ascending: true })
      .limit(20);

    if (error) throw error;
    return { success: true, data: (data ?? []) as CalendarEvent[] };
  } catch (err) {
    logger.error("searchEvents error", { err });
    return { success: false, error: String(err) };
  }
}

// ── Parent Actions ────────────────────────────────────────────────────────

export async function getMyCalendarEvents(params: {
  startDate?: string;
  endDate?: string;
} = {}): Promise<ActionResult<CalendarEvent[]>> {
  try {
    const { orgId } = await requireParentAuth();
    const supabase = await createClient();

    // RLS handles visibility filtering for parents
    let q = supabase
      .from("calendar_events")
      .select("*")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .eq("status", "published")
      .order("start_at", { ascending: true });

    if (params.startDate) q = q.gte("start_at", params.startDate);
    if (params.endDate) q = q.lte("start_at", params.endDate);

    const { data, error } = await q;
    if (error) throw error;
    return { success: true, data: (data ?? []) as CalendarEvent[] };
  } catch (err) {
    logger.error("getMyCalendarEvents error", { err });
    return { success: false, error: String(err) };
  }
}

export async function rsvpEvent(eventId: string, status: string, notes?: string): Promise<ActionResult<void>> {
  try {
    const { user, orgId } = await requireParentAuth();
    const supabase = await createClient();

    const { error } = await supabase
      .from("event_rsvps")
      .upsert({
        event_id: eventId,
        organization_id: orgId,
        profile_id: user.id,
        status,
        notes: notes ?? null,
        responded_at: new Date().toISOString(),
      }, { onConflict: "event_id,profile_id" });

    if (error) throw error;
    return { success: true, data: undefined };
  } catch (err) {
    logger.error("rsvpEvent error", { err });
    return { success: false, error: String(err) };
  }
}

export async function getMyUpcomingEvents(limit = 10): Promise<ActionResult<CalendarEvent[]>> {
  try {
    const { orgId } = await requireParentAuth();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .eq("status", "published")
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(limit);

    if (error) throw error;
    return { success: true, data: (data ?? []) as CalendarEvent[] };
  } catch (err) {
    logger.error("getMyUpcomingEvents error", { err });
    return { success: false, error: String(err) };
  }
}
