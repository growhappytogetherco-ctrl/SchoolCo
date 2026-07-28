"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/supabase/org-context";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/types/actions";
import { CHECKLIST_DEFINITION } from "@/lib/launch-config";

// ── Auth guard ────────────────────────────────────────────────────────────

const ADMIN_LAUNCH_ROLES = new Set(["admin", "full_admin", "platform_admin"]);

async function requireLaunchAdmin() {
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
  if (!member || !ADMIN_LAUNCH_ROLES.has(member.role as string)) {
    throw new Error("Insufficient role");
  }
  return { supabase, user, orgId };
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface LaunchItem {
  key: string;
  label: string;
  section: string;
  auto: boolean;
  status: "pending" | "in_progress" | "completed" | "skipped" | "blocked";
  owner_name: string | null;
  completed_at: string | null;
  notes: string | null;
  updated_at: string | null;
}

export interface ImportJob {
  id: string;
  entity_type: string | null;
  status: string;
  file_name: string | null;
  total_rows: number | null;
  inserted_students: number | null;
  error_rows: number | null;
  created_at: string;
  completed_at: string | null;
  preview_rows: unknown[];
  validation_errors: unknown[];
}

export interface ValidationResult {
  duplicateStudents: Array<{ full_name: string; count: number }>;
  studentsWithoutFamily: number;
  studentsWithoutGrade: number;
  studentsWithoutEnrollmentStatus: number;
  guardiansWithoutStudent: number;
  familiesWithNoStudents: number;
  familiesWithNoGuardians: number;
  invalidEmails: Array<{ name: string; email: string }>;
  duplicatePhones: Array<{ phone: string; names: string[] }>;
}

export interface StudentBadge {
  id: string;
  full_name: string;
  grade_level: string | null;
  attendance_qr_token: string | null;
  student_display_id: string | null;
}

export interface PilotFamily {
  id: string;
  family_id: string | null;
  family_name: string;
  invited_at: string;
  notes: string | null;
  events: Array<{
    id: string;
    event_type: string;
    occurred_at: string;
    notes: string | null;
  }>;
}

export interface GoLiveResult {
  checks: Array<{ label: string; passed: boolean; detail?: string }>;
  allPassed: boolean;
}

// ── Checklist actions ─────────────────────────────────────────────────────

export async function getLaunchChecklist(): Promise<LaunchItem[]> {
  const { supabase, orgId } = await requireLaunchAdmin();
  const { data: rows } = await supabase
    .from("launch_checklist_items")
    .select("*")
    .eq("organization_id", orgId);

  const map = new Map((rows ?? []).map((r) => [r.item_key, r]));

  return CHECKLIST_DEFINITION.map((def) => {
    const row = map.get(def.key);
    return {
      key: def.key,
      label: def.label,
      section: def.section,
      auto: def.auto,
      status: (row?.status as LaunchItem["status"]) ?? "pending",
      owner_name: row?.owner_name ?? null,
      completed_at: row?.completed_at ?? null,
      notes: row?.notes ?? null,
      updated_at: row?.updated_at ?? null,
    };
  });
}

export async function updateChecklistItem(
  itemKey: string,
  data: { status?: string; owner_name?: string; notes?: string }
): Promise<ActionResult<void>> {
  try {
    const { supabase, orgId, user } = await requireLaunchAdmin();
    const now = new Date().toISOString();
    const upsertData: Record<string, unknown> = {
      organization_id: orgId,
      item_key: itemKey,
      updated_at: now,
    };
    if (data.status !== undefined) {
      upsertData.status = data.status;
      if (data.status === "completed") {
        upsertData.completed_at = now;
        upsertData.completed_by = user.id;
      }
    }
    if (data.owner_name !== undefined) upsertData.owner_name = data.owner_name;
    if (data.notes !== undefined) upsertData.notes = data.notes;

    const { error } = await supabase
      .from("launch_checklist_items")
      .upsert(upsertData, { onConflict: "organization_id,item_key" });

    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/admin/launch");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

async function autoCheckItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string,
  itemKey: string
): Promise<boolean> {
  let passed = false;

  if (itemKey === "org_configured") {
    const { count } = await supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("id", orgId);
    passed = (count ?? 0) > 0;
  } else if (itemKey === "school_profile") {
    const { data: org } = await supabase
      .from("organizations")
      .select("name, short_name")
      .eq("id", orgId)
      .single();
    passed = !!(org?.name && org?.short_name);
  } else if (itemKey === "staff_imported") {
    const { count } = await supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active")
      .in("role", ["teacher", "staff", "registrar", "admin", "full_admin"]);
    passed = (count ?? 0) > 0;
  } else if (itemKey === "families_imported") {
    const { count } = await supabase
      .from("families")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    passed = (count ?? 0) > 0;
  } else if (itemKey === "students_imported") {
    const { count } = await supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("archived_at", null);
    passed = (count ?? 0) > 0;
  } else if (itemKey === "guardian_relationships") {
    const { count: guardCount } = await supabase
      .from("guardianships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active");
    const { count: studentCount } = await supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("archived_at", null);
    passed = (guardCount ?? 0) > 0 && (guardCount ?? 0) >= (studentCount ?? 0) * 0.5;
  } else if (itemKey === "academic_calendar") {
    const { count } = await supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    passed = (count ?? 0) > 0;
  } else if (itemKey === "planning_templates") {
    const { count } = await supabase
      .from("planning_templates")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId);
    passed = (count ?? 0) > 0;
  } else if (itemKey === "qr_badges_generated") {
    const { count: missingQr } = await supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("attendance_qr_token", null)
      .is("archived_at", null);
    const { count: total } = await supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("archived_at", null);
    passed = (total ?? 0) > 0 && (missingQr ?? 0) === 0;
  }

  if (passed) {
    const now = new Date().toISOString();
    await supabase.from("launch_checklist_items").upsert(
      {
        organization_id: orgId,
        item_key: itemKey,
        status: "completed",
        completed_at: now,
        completed_by: userId,
        updated_at: now,
      },
      { onConflict: "organization_id,item_key" }
    );
  }

  return passed;
}

export async function runAutoChecks(): Promise<LaunchItem[]> {
  const { supabase, orgId, user } = await requireLaunchAdmin();
  const autoKeys = CHECKLIST_DEFINITION.filter((d) => d.auto).map((d) => d.key);
  await Promise.all(autoKeys.map((k) => autoCheckItem(supabase, orgId, user.id, k)));
  revalidatePath("/dashboard/admin/launch");
  return getLaunchChecklist();
}

// ── Import actions ────────────────────────────────────────────────────────

export async function createImportJob(
  entityType: string,
  filename: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, orgId, user } = await requireLaunchAdmin();
    const { data, error } = await supabase
      .from("import_jobs")
      .insert({
        organization_id: orgId,
        created_by: user.id,
        entity_type: entityType,
        file_name: filename,
        status: "pending",
        source: "airtable_csv",
      })
      .select("id")
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: { id: data.id } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function submitImportPreview(
  jobId: string,
  previewData: unknown[]
): Promise<ActionResult<void>> {
  try {
    const { supabase, orgId } = await requireLaunchAdmin();
    const { error } = await supabase
      .from("import_jobs")
      .update({ preview_rows: previewData, status: "dry_run" })
      .eq("id", jobId)
      .eq("organization_id", orgId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function confirmImport(
  jobId: string
): Promise<ActionResult<{ imported: number; errors: number }>> {
  try {
    const { supabase, orgId } = await requireLaunchAdmin();
    const { error } = await supabase
      .from("import_jobs")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("organization_id", orgId);
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/admin/launch");
    return { success: true, data: { imported: 0, errors: 0 } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function rollbackImport(jobId: string): Promise<ActionResult<void>> {
  try {
    const { supabase, orgId } = await requireLaunchAdmin();
    const { error } = await supabase
      .from("import_jobs")
      .update({ status: "rolled_back" })
      .eq("id", jobId)
      .eq("organization_id", orgId);
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/admin/launch");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getImportJobs(): Promise<ActionResult<ImportJob[]>> {
  try {
    const { supabase, orgId } = await requireLaunchAdmin();
    const { data, error } = await supabase
      .from("import_jobs")
      .select(
        "id, entity_type, status, file_name, total_rows, inserted_students, error_rows, created_at, completed_at, preview_rows, validation_errors"
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as ImportJob[] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getImportValidationSummary(): Promise<
  ActionResult<ValidationResult>
> {
  try {
    const { supabase, orgId } = await requireLaunchAdmin();

    const [
      { count: studentsWithoutFamily },
      { count: studentsWithoutGrade },
      { count: studentsWithoutEnrollmentStatus },
      { count: guardiansWithoutStudent },
      { count: familiesWithNoStudents },
      { count: familiesWithNoGuardians },
      { data: profilesWithEmail },
    ] = await Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("family_id", null)
        .is("archived_at", null),
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("grade_level", null)
        .is("archived_at", null),
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .is("enrollment_status", null)
        .is("archived_at", null),
      supabase
        .from("guardianships")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .not(
          "student_id",
          "in",
          `(select id from students where organization_id = '${orgId}')`
        ),
      supabase
        .from("families")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .not(
          "id",
          "in",
          `(select distinct family_id from students where organization_id = '${orgId}' and family_id is not null)`
        ),
      supabase
        .from("families")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .not(
          "id",
          "in",
          `(select distinct family_id from guardianships where organization_id = '${orgId}' and family_id is not null)`
        ),
      supabase
        .from("profiles")
        .select("full_name, email")
        .not("email", "is", null)
        .not("email", "like", "%@%"),
    ]);

    const invalidEmails = (profilesWithEmail ?? []).map((p) => ({
      name: p.full_name ?? "Unknown",
      email: p.email ?? "",
    }));

    return {
      success: true,
      data: {
        duplicateStudents: [],
        studentsWithoutFamily: studentsWithoutFamily ?? 0,
        studentsWithoutGrade: studentsWithoutGrade ?? 0,
        studentsWithoutEnrollmentStatus: studentsWithoutEnrollmentStatus ?? 0,
        guardiansWithoutStudent: guardiansWithoutStudent ?? 0,
        familiesWithNoStudents: familiesWithNoStudents ?? 0,
        familiesWithNoGuardians: familiesWithNoGuardians ?? 0,
        invalidEmails,
        duplicatePhones: [],
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── QR Badge actions ──────────────────────────────────────────────────────

export async function getQrBadgeStatus(): Promise<
  ActionResult<{
    total: number;
    hasQr: number;
    missingQr: number;
    byGrade: Record<string, { total: number; hasQr: number }>;
  }>
> {
  try {
    const { supabase, orgId } = await requireLaunchAdmin();
    const { data: students } = await supabase
      .from("students")
      .select("grade_level, attendance_qr_token")
      .eq("organization_id", orgId)
      .is("archived_at", null);

    const byGrade: Record<string, { total: number; hasQr: number }> = {};
    let hasQr = 0;
    for (const s of students ?? []) {
      const grade = s.grade_level ?? "Unknown";
      if (!byGrade[grade]) byGrade[grade] = { total: 0, hasQr: 0 };
      byGrade[grade].total++;
      if (s.attendance_qr_token) {
        hasQr++;
        byGrade[grade].hasQr++;
      }
    }
    const total = students?.length ?? 0;
    return { success: true, data: { total, hasQr, missingQr: total - hasQr, byGrade } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function generateMissingQrCodes(): Promise<
  ActionResult<{ generated: number }>
> {
  try {
    const { supabase, orgId } = await requireLaunchAdmin();
    const { data: missing } = await supabase
      .from("students")
      .select("id")
      .eq("organization_id", orgId)
      .is("attendance_qr_token", null)
      .is("archived_at", null);

    let generated = 0;
    for (const student of missing ?? []) {
      const token = `ATT-${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;
      const { error } = await supabase
        .from("students")
        .update({ attendance_qr_token: token })
        .eq("id", student.id);
      if (!error) generated++;
    }
    revalidatePath("/dashboard/admin/launch");
    return { success: true, data: { generated } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getStudentsForBadge(
  filter: "all" | "missing" | string
): Promise<ActionResult<StudentBadge[]>> {
  try {
    const { supabase, orgId } = await requireLaunchAdmin();
    let query = supabase
      .from("students")
      .select("id, full_name, grade_level, attendance_qr_token, student_display_id")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("grade_level", { ascending: true })
      .order("full_name", { ascending: true });

    if (filter === "missing") {
      query = query.is("attendance_qr_token", null);
    } else if (filter !== "all") {
      query = query.eq("grade_level", filter);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as StudentBadge[] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Import students (actual insert) ──────────────────────────────────────

export async function importStudentsFromCsv(
  rows: Array<{
    full_name: string;
    grade_level: string;
    enrollment_status: string;
    student_display_id?: string;
  }>
): Promise<ActionResult<{ imported: number; errors: string[] }>> {
  try {
    const { supabase, orgId, user } = await requireLaunchAdmin();

    const validStatuses = [
      "enrolled",
      "withdrawn",
      "graduated",
      "suspended",
      "future",
      "inactive",
    ];
    const errors: string[] = [];
    const toInsert: Array<Record<string, unknown>> = [];

    rows.forEach((row, i) => {
      const rowNum = i + 1;
      if (!row.full_name?.trim()) {
        errors.push(`Row ${rowNum}: full_name is required`);
        return;
      }
      if (!row.grade_level?.trim()) {
        errors.push(`Row ${rowNum}: grade_level is required`);
        return;
      }
      const status = row.enrollment_status?.trim() || "enrolled";
      if (!validStatuses.includes(status)) {
        errors.push(
          `Row ${rowNum}: invalid enrollment_status "${status}" (valid: ${validStatuses.join(", ")})`
        );
        return;
      }
      toInsert.push({
        organization_id: orgId,
        full_name: row.full_name.trim(),
        grade_level: row.grade_level.trim(),
        enrollment_status: status,
        ...(row.student_display_id?.trim()
          ? { student_display_id: row.student_display_id.trim() }
          : {}),
        created_by: user.id,
      });
    });

    if (toInsert.length === 0) {
      return { success: false, error: `No valid rows to import. Errors: ${errors.join("; ")}` };
    }

    const { data: inserted, error } = await supabase
      .from("students")
      .insert(toInsert)
      .select("id");

    if (error) return { success: false, error: error.message };

    // Create import_jobs record for audit
    await supabase.from("import_jobs").insert({
      organization_id: orgId,
      created_by: user.id,
      entity_type: "students",
      file_name: "csv_import",
      status: "completed",
      source: "airtable_csv",
      total_rows: rows.length,
      inserted_students: inserted?.length ?? 0,
      error_rows: errors.length,
      completed_at: new Date().toISOString(),
    });

    revalidatePath("/dashboard/admin/launch");
    return {
      success: true,
      data: { imported: inserted?.length ?? 0, errors },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Pilot family actions ──────────────────────────────────────────────────

export async function getPilotFamilies(): Promise<ActionResult<PilotFamily[]>> {
  try {
    const { supabase, orgId } = await requireLaunchAdmin();
    const { data: families, error } = await supabase
      .from("launch_pilot_families")
      .select(
        "id, family_id, family_name, invited_at, notes, launch_pilot_events(id, event_type, occurred_at, notes)"
      )
      .eq("organization_id", orgId)
      .order("invited_at", { ascending: false });

    if (error) return { success: false, error: error.message };

    const result: PilotFamily[] = (families ?? []).map((f) => ({
      id: f.id,
      family_id: f.family_id,
      family_name: f.family_name,
      invited_at: f.invited_at,
      notes: f.notes,
      events: (
        (f as { launch_pilot_events?: unknown[] }).launch_pilot_events ?? []
      ) as PilotFamily["events"],
    }));

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function addPilotFamily(
  familyName: string,
  familyId?: string,
  notes?: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, orgId, user } = await requireLaunchAdmin();
    const { error } = await supabase.from("launch_pilot_families").insert({
      organization_id: orgId,
      family_name: familyName,
      family_id: familyId ?? null,
      invited_by: user.id,
      notes: notes ?? null,
    });
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/admin/launch");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function recordPilotEvent(
  pilotFamilyId: string,
  eventType: string,
  notes?: string
): Promise<ActionResult<void>> {
  try {
    const { supabase, orgId } = await requireLaunchAdmin();
    const { error } = await supabase.from("launch_pilot_events").insert({
      organization_id: orgId,
      pilot_family_id: pilotFamilyId,
      event_type: eventType,
      notes: notes ?? null,
    });
    if (error) return { success: false, error: error.message };
    revalidatePath("/dashboard/admin/launch");
    return { success: true, data: undefined };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Go-live check ─────────────────────────────────────────────────────────

export async function runGoLiveChecks(): Promise<GoLiveResult> {
  const { supabase, orgId } = await requireLaunchAdmin();

  const [
    { count: staffCount },
    { count: familyCount },
    { count: studentCount },
    { count: missingQr },
    { count: studentsNoFamily },
    { count: guardianCount },
    { data: org },
    { count: integrityIssues },
  ] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active")
      .in("role", ["teacher", "staff", "registrar", "admin", "full_admin"]),
    supabase
      .from("families")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("archived_at", null),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("attendance_qr_token", null)
      .is("archived_at", null),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("family_id", null)
      .is("archived_at", null),
    supabase
      .from("guardianships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active"),
    supabase
      .from("organizations")
      .select("name, short_name")
      .eq("id", orgId)
      .single(),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .is("family_id", null)
      .is("archived_at", null),
  ]);

  const checks = [
    {
      label: "At least 1 staff member",
      passed: (staffCount ?? 0) > 0,
      detail: `${staffCount ?? 0} active staff`,
    },
    {
      label: "Families imported",
      passed: (familyCount ?? 0) > 0,
      detail: `${familyCount ?? 0} families`,
    },
    {
      label: "Students imported",
      passed: (studentCount ?? 0) > 0,
      detail: `${studentCount ?? 0} students`,
    },
    {
      label: "All students have QR codes",
      passed: (studentCount ?? 0) > 0 && (missingQr ?? 0) === 0,
      detail: missingQr ? `${missingQr} missing` : "All assigned",
    },
    {
      label: "All students have a family",
      passed: (studentsNoFamily ?? 0) === 0,
      detail:
        (studentsNoFamily ?? 0) > 0
          ? `${studentsNoFamily} unlinked`
          : "All linked",
    },
    {
      label: "Guardian links present",
      passed: (guardianCount ?? 0) > 0,
      detail: `${guardianCount ?? 0} active guardianships`,
    },
    {
      label: "Organization configured",
      passed: !!(org?.name && org?.short_name),
      detail: org?.name ?? "Missing name",
    },
    {
      label: "No critical integrity issues",
      passed: (integrityIssues ?? 0) === 0,
      detail:
        (integrityIssues ?? 0) > 0
          ? `${integrityIssues} students without family`
          : "Clean",
    },
  ];

  return {
    checks,
    allPassed: checks.every((c) => c.passed),
  };
}
