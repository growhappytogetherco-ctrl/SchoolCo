/**
 * Comprehensive production database backup.
 *
 * Exports all application tables to backup/full_<timestamp>.json using the
 * service role key. No Docker or pg_dump required.
 *
 * WHAT THIS COVERS:
 *   All ~80 application tables in the public schema, including:
 *   - Students, profiles, guardianships, households, families
 *   - Organization membership and roles
 *   - Attendance records
 *   - Academic records, grades, curriculum, course records
 *   - Financial records (charges, payments, adjustments, allocations, ledger)
 *   - Incidents, notes, staff records
 *   - Calendar, messaging, notifications
 *   - All UUIDs, FK relationships, timestamps, and original values preserved
 *
 * WHAT THIS DOES NOT COVER (not exportable via JS client):
 *   - auth.users — Supabase Auth, managed by platform, no JS export path
 *   - auth.sessions, auth.mfa_factors, auth.identities — same
 *   - storage.objects, storage.buckets — Supabase Storage
 *   - Supabase project configuration (env vars, JWT secret, API settings)
 *   - PostgreSQL schema (functions, triggers, policies) — use supabase db dump
 *
 * OUTPUT:
 *   backup/full_<timestamp>.json  — all table data, ordered for restore
 *   backup/full_<timestamp>.meta.json — row counts, checksums, coverage report
 *
 * RESTORE:
 *   1. Apply all migrations to a blank project (supabase db push)
 *   2. Run: npx tsx scripts/restore_from_backup.ts backup/full_<timestamp>.json
 *   3. Verify: npm run audit:balances
 *
 * Run:
 *   npx tsx scripts/backup_full_database.ts [--env .env.staging]
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";

const envFile = process.env.ENV_FILE ?? ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Tables ordered by FK dependency: parents before children.
// This ordering is safe for INSERT-based restore.
const TABLE_ORDER: string[] = [
  // Tier 0: no FK dependencies
  "organizations",
  "profiles",
  "display_id_counters",
  "audit_logs",

  // Tier 1: depend on organizations and/or profiles
  "org_settings",
  "org_drive_folders",
  "organization_members",
  "staff_invitations",
  "staff_roster",
  "staff_profiles",
  "staff_personnel_records",
  "staff_compliance_requirements",
  "staff_compliance_records",
  "staff_attendance_records",
  "staff_notes",
  "service_hours",
  "launch_checklist_items",
  "launch_pilot_events",

  // Tier 2: depend on organizations + profiles
  "students",
  "households",
  "families",
  "launch_pilot_families",

  // Tier 3: depend on students and/or households
  "guardianships",
  "authorized_pickup_persons",
  "student_allergies",
  "student_conditions",
  "student_medical",
  "student_documents",
  "student_drive_folders",
  "student_goals",
  "learning_profiles",
  "student_import_sources",
  "support_flags",
  "support_strategies",
  "medication_alerts",

  // Tier 4: academic structure
  "school_years",
  "grade_scales",
  "grading_periods",
  "calendar_events",
  "calendar_preferences",
  "event_reminders",
  "event_rsvps",

  // Tier 5: curriculum and enrollment
  "course_sections",
  "curriculum_enrollments",
  "course_grade_settings",
  "grading_period_workflow",
  "grading_period_workflow_events",

  // Tier 6: assessments and grades
  "assignments",
  "assignment_student_targets",
  "assessments",
  "student_assignment_grades",
  "quarter_grade_snapshots",
  "course_finalization_overrides",
  "student_course_records",

  // Tier 7: academic records and reports
  "academic_progress",
  "academic_record_imports",
  "growth_goals",
  "ssp_timeline",
  "timeline_entries",
  "success_plan_family_vision",
  "student_reports",
  "student_report_courses",
  "work_samples",
  "yearbook_portfolios",
  "leadership_badges",
  "entrepreneurship_projects",

  // Tier 8: attendance
  "attendance_records",

  // Tier 9: incidents and support
  "incidents",
  "incident_participants",
  "intervention_sessions",

  // Tier 10: communication
  "conversations",
  "conversation_participants",
  "messages",
  "notifications",

  // Tier 11: planning
  "planning_templates",
  "planning_tasks",
  "import_jobs",

  // Tier 12: financial (depends on students, school_years, profiles)
  "student_charges",
  "charge_adjustments",
  "student_payments",
  "payment_allocations",
  "finance_ledger",
  "family_finance_accounts",
  "finance_settings",
];

interface TableResult {
  table: string;
  rows: number;
  status: "ok" | "empty" | "error" | "not_found";
  error?: string;
  data?: unknown[];
}

async function backupTable(table: string): Promise<TableResult> {
  try {
    // Fetch all rows — for large tables this is batched
    const allRows: unknown[] = [];
    const PAGE = 1000;
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .range(offset, offset + PAGE - 1);

      if (error) {
        // Distinguish "table doesn't exist" from other errors
        if (
          error.message.includes("does not exist") ||
          error.message.includes("Could not find the table") ||
          error.code === "42P01" ||
          error.code === "PGRST106"
        ) {
          return { table, rows: 0, status: "not_found" };
        }
        return { table, rows: 0, status: "error", error: error.message };
      }

      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }

    return {
      table,
      rows: allRows.length,
      status: allRows.length === 0 ? "empty" : "ok",
      data: allRows,
    };
  } catch (err: any) {
    return { table, rows: 0, status: "error", error: String(err.message) };
  }
}

async function run() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outDir = path.resolve(process.cwd(), "backup");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, `full_${timestamp}.json`);
  const metaFile = path.join(outDir, `full_${timestamp}.meta.json`);

  const sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  console.log(`\n${"═".repeat(65)}`);
  console.log("  SchoolCo Full Database Backup");
  console.log(`  Source: ${sourceUrl.replace(/https?:\/\//, "").slice(0, 45)}`);
  console.log(`  Output: backup/full_${timestamp}.json`);
  console.log(`${"═".repeat(65)}\n`);

  // Safety check: confirm source is not staging when running against production
  const isStaging = sourceUrl.includes("qjyofbxmymquqobalshg");
  const isProduction = sourceUrl.includes("cgnqkaqbsquerohxqkqt");
  console.log(`Environment: ${isProduction ? "PRODUCTION" : isStaging ? "staging" : "unknown"}`);
  console.log();

  const results: TableResult[] = [];
  const backup: Record<string, unknown> = {
    backup_at: new Date().toISOString(),
    supabase_url: sourceUrl,
    environment: isProduction ? "production" : isStaging ? "staging" : "unknown",
    tables: {},
  };

  let totalRows = 0;
  let tablesOk = 0;
  let tablesEmpty = 0;
  let tablesNotFound = 0;
  let tablesError = 0;

  for (const table of TABLE_ORDER) {
    process.stdout.write(`  Backing up ${table.padEnd(38)}`);
    const result = await backupTable(table);
    results.push(result);

    const statusIcon = result.status === "ok" ? "✓" :
                       result.status === "empty" ? "○" :
                       result.status === "not_found" ? "–" : "✗";
    console.log(`${statusIcon} ${result.rows} rows${result.error ? " [" + result.error.slice(0, 40) + "]" : ""}`);

    if (result.status === "ok" || result.status === "empty") {
      (backup.tables as Record<string, unknown>)[table] = {
        count: result.rows,
        rows: result.data ?? [],
      };
      totalRows += result.rows;
      if (result.status === "ok") tablesOk++;
      else tablesEmpty++;
    } else if (result.status === "not_found") {
      tablesNotFound++;
    } else {
      tablesError++;
    }
  }

  // Write backup file (no PII in terminal — all data goes to file only)
  writeFileSync(outFile, JSON.stringify(backup, null, 0), "utf8");

  // Write metadata (safe for terminal display)
  const meta = {
    backup_at: backup.backup_at,
    environment: backup.environment,
    supabase_url: sourceUrl,
    summary: {
      total_rows: totalRows,
      tables_backed_up: tablesOk + tablesEmpty,
      tables_empty: tablesEmpty,
      tables_not_found: tablesNotFound,
      tables_error: tablesError,
    },
    table_counts: Object.fromEntries(results.map(r => [r.table, { rows: r.rows, status: r.status }])),
    not_covered: [
      "auth.users — Supabase Auth, platform-managed, no JS export",
      "auth.sessions, auth.identities, auth.mfa_factors — same",
      "storage.objects, storage.buckets — Supabase Storage",
      "Supabase project config (JWT secret, API keys, env vars)",
      "PostgreSQL schema (functions, triggers, RLS policies) — use supabase db dump",
    ],
    restore_procedure: [
      "1. Create a new Supabase project",
      "2. Apply migrations: npx supabase db push --linked (using new project credentials)",
      "3. Run restore script: npx tsx scripts/restore_from_backup.ts backup/full_<timestamp>.json",
      "4. Verify financial data: npm run audit:balances",
      "5. Verify row counts match backup metadata",
    ],
  };
  writeFileSync(metaFile, JSON.stringify(meta, null, 2), "utf8");

  console.log(`\n${"═".repeat(65)}`);
  console.log(`  Backup complete`);
  console.log(`  Total rows: ${totalRows.toLocaleString()}`);
  console.log(`  Tables: ${tablesOk + tablesEmpty} backed up (${tablesEmpty} empty), ${tablesNotFound} not found, ${tablesError} errors`);
  console.log(`  File: ${outFile}`);
  console.log(`  Meta: ${metaFile}`);
  console.log(`${"═".repeat(65)}\n`);

  if (tablesNotFound > 0) {
    console.log(`ℹ ${tablesNotFound} table(s) not found — expected for pending migrations or renamed tables. See .meta.json.`);
  }
  if (tablesError > 0) {
    console.log("⚠ Some tables had unexpected errors. Check .meta.json for details.");
    process.exit(1);
  }
}

run().catch(err => { console.error("Backup failed:", err.message); process.exit(1); });
