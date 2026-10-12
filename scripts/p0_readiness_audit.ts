/**
 * Phase 4 Readiness Audit — read-only
 *
 * For each Q1 course section, computes the exact number of:
 *   - Enrolled students
 *   - Assignments per student (considering target_mode)
 *   - Grade rows (any status)
 *   - Missing entries (no grade row at all)
 *   - Explicit not_graded / missing status entries
 *
 * Reports true readiness vs what the dashboard currently shows.
 *
 * Run: npx tsx scripts/p0_readiness_audit.ts
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(".env.local", "utf8");
const vars: Record<string, string> = {};
for (const line of env.split("\n")) {
  const m = line.match(/^([^=#][^=]*)=(.*)$/);
  if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = "9fd43346-f43b-41d1-9b4c-fe8702471b07";

async function main() {
  console.log("=== PHASE 4 READINESS AUDIT (read-only) ===\n");

  // Q1 period
  const { data: q1 } = await supabase
    .from("grading_periods")
    .select("id, name")
    .eq("organization_id", ORG_ID)
    .eq("period_type", "quarter")
    .order("sequence")
    .limit(1)
    .single();
  const q1Id = (q1 as any).id as string;
  console.log(`Q1 period: ${(q1 as any).name} (${q1Id})\n`);

  // Get all active course sections that have Q1 assignments
  const { data: sections } = await supabase
    .from("course_sections")
    .select("id, course_name, grading_method")
    .eq("organization_id", ORG_ID)
    .eq("status", "active");

  // Get Q1 assignments per section
  const { data: allAssignments } = await supabase
    .from("assignments")
    .select("id, course_section_id, target_mode")
    .eq("organization_id", ORG_ID)
    .eq("grading_period_id", q1Id)
    .eq("status", "active");

  const assignmentsBySectionMap = new Map<string, Array<{id: string; target_mode: string | null}>>();
  for (const a of (allAssignments ?? []) as any[]) {
    if (!assignmentsBySectionMap.has(a.course_section_id)) {
      assignmentsBySectionMap.set(a.course_section_id, []);
    }
    assignmentsBySectionMap.get(a.course_section_id)!.push({ id: a.id, target_mode: a.target_mode });
  }

  // Get all enrollments per section
  const { data: allEnrollments } = await supabase
    .from("curriculum_enrollments")
    .select("id, student_id, course_section_id")
    .eq("organization_id", ORG_ID)
    .eq("status", "active")
    .not("course_section_id", "is", null);
  const enrollmentsBySectionMap = new Map<string, Array<{id: string; student_id: string}>>();
  for (const e of (allEnrollments ?? []) as any[]) {
    if (!enrollmentsBySectionMap.has(e.course_section_id)) {
      enrollmentsBySectionMap.set(e.course_section_id, []);
    }
    enrollmentsBySectionMap.get(e.course_section_id)!.push({ id: e.id, student_id: e.student_id });
  }

  // Get all grade records for Q1 assignments
  const allAIds = (allAssignments ?? []).map((a: any) => a.id);
  const { data: allGrades } = await supabase
    .from("student_assignment_grades")
    .select("assignment_id, student_id, grade_status")
    .in("assignment_id", allAIds);

  // Build grade lookup: "assignmentId:studentId" → grade_status
  const gradeKeyMap = new Map<string, string>();
  for (const g of (allGrades ?? []) as any[]) {
    gradeKeyMap.set(`${g.assignment_id}:${g.student_id}`, g.grade_status);
  }

  // Get all assignment targets
  const { data: allTargets } = await supabase
    .from("assignment_student_targets")
    .select("assignment_id, student_id")
    .in("assignment_id", allAIds);
  const targetSet = new Set<string>();
  for (const t of (allTargets ?? []) as any[]) {
    targetSet.add(`${t.assignment_id}:${t.student_id}`);
  }

  let totalReady = 0;
  let totalNeedsReview = 0;
  let sectionsWithQ1 = 0;

  console.log("Section                       Enroll Assign Unsubmit Ungraded Missing  Ready?");
  console.log("─────────────────────────────────────────────────────────────────────────────");

  for (const sec of (sections ?? []) as any[]) {
    const assignments = assignmentsBySectionMap.get(sec.id) ?? [];
    if (assignments.length === 0) continue;
    sectionsWithQ1++;

    const enrolled = enrollmentsBySectionMap.get(sec.id) ?? [];
    let unsubmittedCount = 0;
    let notGradedCount = 0;
    let missingCount = 0;

    for (const enr of enrolled) {
      for (const a of assignments) {
        // Determine if this student is targeted
        const isTargeted = a.target_mode === null
          || targetSet.has(`${a.id}:${enr.student_id}`);
        if (!isTargeted) continue;

        const key = `${a.id}:${enr.student_id}`;
        const status = gradeKeyMap.get(key);
        if (!status) {
          unsubmittedCount++;  // No grade row at all
        } else if (status === "not_graded") {
          notGradedCount++;
        } else if (status === "missing") {
          missingCount++;
        }
      }
    }

    const totalIssues = unsubmittedCount + notGradedCount + missingCount;
    const ready = totalIssues === 0;
    if (ready) totalReady++; else totalNeedsReview++;

    const name = sec.course_name.substring(0, 28).padEnd(28);
    console.log(
      `${name}  ${String(enrolled.length).padStart(6)}  ${String(assignments.length).padStart(5)}  ` +
      `${String(unsubmittedCount).padStart(8)}  ${String(notGradedCount).padStart(7)}  ` +
      `${String(missingCount).padStart(7)}  ${ready ? "✅ YES" : "⚠️  NO"}`
    );
  }

  console.log("\n─────────────────────────────────────────────────────────────────────────────");
  console.log(`Sections with Q1 assignments: ${sectionsWithQ1}`);
  console.log(`Ready (no missing/ungraded):  ${totalReady}`);
  console.log(`Needs review:                 ${totalNeedsReview}`);
  console.log("\n=== READINESS AUDIT COMPLETE ===");
}

main().catch(console.error);
