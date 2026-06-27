"use server";

import { createClient, getActiveOrgId } from "@/lib/supabase/server";

export interface TodayAction {
  action_type: string;
  student_id:  string;
  student_name: string;
  priority:    "high" | "normal" | "low";
  detail:      string;
  due_date:    string | null;
  tab_hint:    string;
}

export async function getTodaysActions(): Promise<TodayAction[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_today_actions", { p_org_id: orgId } as never);

  if (error) {
    console.error("[getTodaysActions]", error.message);
    return [];
  }

  return ((data ?? []) as unknown[]).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      action_type:  r.action_type as string,
      student_id:   r.student_id  as string,
      student_name: r.student_name as string,
      priority:     (r.priority as "high" | "normal" | "low") ?? "normal",
      detail:       r.detail       as string,
      due_date:     r.due_date     as string | null,
      tab_hint:     r.tab_hint     as string,
    } as TodayAction;
  });
}

// School-wide alert query — attendance + safety summary for today
export interface SchoolAlert {
  category:    string;
  label:       string;
  count:       number;
  priority:    "urgent" | "today" | "week";
  admin_only:  boolean;
  student_ids: string[];
}

export async function getSchoolWideAlerts(): Promise<SchoolAlert[]> {
  const orgId = await getActiveOrgId();
  if (!orgId) return [];

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const alerts: SchoolAlert[] = [];

  // 1. Students not checked out (checked in today, no checkout)
  const { data: missingOut } = await supabase
    .from("attendance_records")
    .select("student_id")
    .eq("organization_id", orgId)
    .eq("date", today)
    .not("check_in_at", "is", null)
    .is("check_out_at", null);

  if ((missingOut?.length ?? 0) > 0) {
    alerts.push({
      category:   "missing_checkout",
      label:      "Students not checked out",
      count:      missingOut!.length,
      priority:   "urgent",
      admin_only: false,
      student_ids: (missingOut ?? []).map((r) => (r as Record<string, string>).student_id),
    });
  }

  // 2. Absences today
  const { data: absences } = await supabase
    .from("attendance_records")
    .select("student_id")
    .eq("organization_id", orgId)
    .eq("date", today)
    .eq("status", "absent");

  if ((absences?.length ?? 0) > 0) {
    alerts.push({
      category:   "absent_today",
      label:      "Absent today",
      count:      absences!.length,
      priority:   "today",
      admin_only: false,
      student_ids: (absences ?? []).map((r) => (r as Record<string, string>).student_id),
    });
  }

  // 3. Late arrivals today
  const { data: late } = await supabase
    .from("attendance_records")
    .select("student_id")
    .eq("organization_id", orgId)
    .eq("date", today)
    .eq("is_late", true);

  if ((late?.length ?? 0) > 0) {
    alerts.push({
      category:   "late_today",
      label:      "Late arrivals today",
      count:      late!.length,
      priority:   "today",
      admin_only: false,
      student_ids: (late ?? []).map((r) => (r as Record<string, string>).student_id),
    });
  }

  // 4. Early pickups today
  const { data: earlyOut } = await supabase
    .from("attendance_records")
    .select("student_id")
    .eq("organization_id", orgId)
    .eq("date", today)
    .eq("is_early_pickup", true);

  if ((earlyOut?.length ?? 0) > 0) {
    alerts.push({
      category:   "early_pickup",
      label:      "Early pickups today",
      count:      earlyOut!.length,
      priority:   "today",
      admin_only: false,
      student_ids: (earlyOut ?? []).map((r) => (r as Record<string, string>).student_id),
    });
  }

  // 5. Active medication alerts in org
  const { data: meds } = await supabase
    .from("medication_alerts")
    .select("student_id")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .eq("is_emergency", true);

  if ((meds?.length ?? 0) > 0) {
    alerts.push({
      category:   "emergency_medication",
      label:      "Emergency medication on file",
      count:      meds!.length,
      priority:   "urgent",
      admin_only: false,
      student_ids: (meds ?? []).map((r) => (r as Record<string, string>).student_id),
    });
  }

  // 6. Pickup restrictions (supervised/none custody guardians)
  const { data: custodyFlags } = await supabase
    .from("guardianships")
    .select("student_id")
    .in("custody_type", ["supervised", "none"]);

  const uniquePickupStudents = [...new Set((custodyFlags ?? []).map((r) => (r as Record<string, string>).student_id))];
  if (uniquePickupStudents.length > 0) {
    alerts.push({
      category:   "pickup_restriction",
      label:      "Students with pickup restrictions",
      count:      uniquePickupStudents.length,
      priority:   "urgent",
      admin_only: false,
      student_ids: uniquePickupStudents,
    });
  }

  // 7. Overdue goal reviews (this week)
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  const { data: overdueGoals } = await supabase
    .from("student_goals")
    .select("student_id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .lte("target_review_date", weekAhead.toISOString().split("T")[0])
    .lt("progress_pct", 100);

  const uniqueGoalStudents = [...new Set((overdueGoals ?? []).map((r) => (r as Record<string, string>).student_id))];
  if (uniqueGoalStudents.length > 0) {
    alerts.push({
      category:   "goal_review_due",
      label:      "Goal reviews due this week",
      count:      overdueGoals!.length,
      priority:   "week",
      admin_only: false,
      student_ids: uniqueGoalStudents,
    });
  }

  // 8. Support flags expiring within 7 days
  const { data: expiringFlags } = await supabase
    .from("support_flags")
    .select("student_id")
    .eq("organization_id", orgId)
    .not("expires_at", "is", null)
    .lte("expires_at", weekAhead.toISOString().split("T")[0])
    .gte("expires_at", today);

  const uniqueFlagStudents = [...new Set((expiringFlags ?? []).map((r) => (r as Record<string, string>).student_id))];
  if (uniqueFlagStudents.length > 0) {
    alerts.push({
      category:   "flag_expiring",
      label:      "Support flags expiring this week",
      count:      expiringFlags!.length,
      priority:   "week",
      admin_only: false,
      student_ids: uniqueFlagStudents,
    });
  }

  // Sort: urgent first, then today, then week
  const ORDER = { urgent: 0, today: 1, week: 2 };
  return alerts.sort((a, b) => (ORDER[a.priority] ?? 9) - (ORDER[b.priority] ?? 9));
}
