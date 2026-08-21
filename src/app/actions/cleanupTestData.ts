"use server";

import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/supabase/server";
import { trashDriveFolder } from "@/lib/drive/driveClient";

const FAKE_STUDENT_IDS = [
  "7c7ce9fa-7dbc-46f8-954b-cd1419485d40", // Mia Johnson (TEST-STU-001)
  "51000000-0000-0000-0000-000000000001",  // Amara Thompson
  "52000000-0000-0000-0000-000000000002",  // Elijah Thompson
  "53000000-0000-0000-0000-000000000003",  // Zoe Williams
  "54000000-0000-0000-0000-000000000004",  // Jordan Williams
] as const;

export interface CleanupInventory {
  students: Array<{
    id: string;
    display_id: string;
    full_name: string;
    google_drive_folder_id: string | null;
    drive_folder_count: number;
  }>;
  driveCounters: {
    s_prefix: number | null;
    f_prefix: number | null;
    h_prefix: number | null;
  };
}

export interface DriveCleanupResult {
  studentId: string;
  displayId: string;
  name: string;
  folderId: string | null;
  result: "trashed" | "no_folder" | "error";
  error?: string;
}

export async function getCleanupInventory(): Promise<{ success: true; data: CleanupInventory } | { success: false; error: string }> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active org" };

  const supabase = await createClient();

  // Verify admin role
  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("profile_id", user.id)
    .single();
  if (!member || !["admin", "full_admin", "platform_admin"].includes(member.role)) {
    return { success: false, error: "Admin access required" };
  }

  const { data: students, error } = await supabase
    .from("students")
    .select("id, student_display_id, first_name, last_name, google_drive_folder_id")
    .in("id", [...FAKE_STUDENT_IDS])
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  // Count student_drive_folders rows for each
  const studentsWithCounts = await Promise.all(
    (students ?? []).map(async (s) => {
      const { count } = await supabase
        .from("student_drive_folders")
        .select("*", { count: "exact", head: true })
        .eq("student_id", s.id);
      return {
        id: s.id,
        display_id: s.student_display_id ?? "(none)",
        full_name: `${s.first_name} ${s.last_name}`,
        google_drive_folder_id: s.google_drive_folder_id,
        drive_folder_count: count ?? 0,
      };
    })
  );

  const { data: counters } = await supabase
    .from("display_id_counters")
    .select("prefix, last_value")
    .eq("organization_id", orgId)
    .in("prefix", ["S", "F", "H"]);

  const counterMap = Object.fromEntries((counters ?? []).map((c) => [c.prefix, c.last_value]));

  return {
    success: true,
    data: {
      students: studentsWithCounts,
      driveCounters: {
        s_prefix: counterMap["S"] ?? null,
        f_prefix: counterMap["F"] ?? null,
        h_prefix: counterMap["H"] ?? null,
      },
    },
  };
}

export async function runDriveCleanup(): Promise<{ success: true; results: DriveCleanupResult[] } | { success: false; error: string }> {
  const user = await getUser();
  if (!user) return { success: false, error: "Not authenticated" };
  const orgId = await getActiveOrgId();
  if (!orgId) return { success: false, error: "No active org" };

  const supabase = await createClient();

  const { data: member } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", orgId)
    .eq("profile_id", user.id)
    .single();
  if (!member || !["admin", "full_admin", "platform_admin"].includes(member.role)) {
    return { success: false, error: "Admin access required" };
  }

  const { data: students, error } = await supabase
    .from("students")
    .select("id, student_display_id, first_name, last_name, google_drive_folder_id")
    .in("id", [...FAKE_STUDENT_IDS])
    .eq("organization_id", orgId);

  if (error) return { success: false, error: error.message };

  const results: DriveCleanupResult[] = await Promise.all(
    (students ?? []).map(async (s) => {
      const base = {
        studentId: s.id,
        displayId: s.student_display_id ?? "(none)",
        name: `${s.first_name} ${s.last_name}`,
        folderId: s.google_drive_folder_id,
      };
      if (!s.google_drive_folder_id) {
        return { ...base, result: "no_folder" as const };
      }
      const r = await trashDriveFolder(s.google_drive_folder_id);
      if (r.success) {
        return { ...base, result: "trashed" as const };
      }
      return { ...base, result: "error" as const, error: r.error };
    })
  );

  return { success: true, results };
}
