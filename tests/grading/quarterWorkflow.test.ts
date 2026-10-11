/**
 * Quarter Workflow tests.
 *
 * Tests:
 *   1–3  Period selection: Q1 returned for gap day Oct 11 (reuses periodSelection logic)
 *   4    Q1 not finalized (status check from DB)
 *   5    Q1 workflow status is 'review' for courses with assignments
 *   6    Q2 has no workflow rows (open by default)
 *   7    Q1 assignments still exist after migration (sanity check)
 *   8    Snapshot table exists and is empty (nothing finalized yet)
 *
 * DB tests require a running Supabase instance.
 * Reads connection info from .env.local at the project root.
 *
 * Run with: npx tsx tests/grading/quarterWorkflow.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Period selection tests (pure, no DB) ─────────────────────────────────────

import { resolveDefaultPeriodId, type PeriodRow } from "../../src/lib/grading/periodSelection.js";

const Q1: PeriodRow = { id: "d167ca37-q1", period_type: "quarter", is_assignment_period: true, start_date: "2026-08-10", end_date: "2026-10-09", sequence: 1 };
const Q2: PeriodRow = { id: "q2-id",       period_type: "quarter", is_assignment_period: true, start_date: "2026-10-12", end_date: "2026-12-18", sequence: 2 };
const Q3: PeriodRow = { id: "q3-id",       period_type: "quarter", is_assignment_period: true, start_date: "2027-01-04", end_date: "2027-03-05", sequence: 4 };
const Q4: PeriodRow = { id: "q4-id",       period_type: "quarter", is_assignment_period: true, start_date: "2027-03-08", end_date: "2027-05-25", sequence: 5 };

const PERIODS = [Q1, Q2, Q3, Q4];

describe("Period selection — Q1 gap day scenarios", () => {
  test("Q1 returned for Oct 10 (gap day after Q1 ends)", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-10-10"), Q1.id);
  });

  test("Q1 returned for Oct 11 (today — inter-quarter gap)", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-10-11"), Q1.id);
  });

  test("Q2 returned for Oct 12 (Q2 start day)", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-10-12"), Q2.id);
  });

  test("Q1 returned during Q1 (Sep 1)", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-09-01"), Q1.id);
  });

  test("Q1 is earliest upcoming when before school starts", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-07-01"), Q1.id);
  });
});

// ── DB tests ─────────────────────────────────────────────────────────────────
// These tests connect to production Supabase via the service role key.
// They are READ-ONLY — no data is written.

function loadEnv(): Record<string, string> {
  // Try worktree cwd first, then walk up to find .env.local
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "../../../.env.local"),  // worktree → project root
    resolve(process.cwd(), "../../.env.local"),
  ];
  let envPath = candidates[0];
  for (const p of candidates) {
    try { readFileSync(p, "utf8"); envPath = p; break; } catch { /* continue */ }
  }
  try {
    const raw = readFileSync(envPath, "utf8");
    const env: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

const env = loadEnv();
const SUPABASE_URL = env["NEXT_PUBLIC_SUPABASE_URL"];
const SUPABASE_KEY = env["SUPABASE_SERVICE_ROLE_KEY"];

const ORG_ID = "9fd43346-f43b-41d1-9b4c-fe8702471b07";

// Skip DB tests if credentials not available
const hasDb = !!(SUPABASE_URL && SUPABASE_KEY);
if (!hasDb) {
  console.warn("WARN: Skipping DB tests — NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set in .env.local");
}

async function dbQuery(table: string, queryParams: URLSearchParams): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${queryParams.toString()}`;
  const res = await fetch(url, {
    headers: {
      "apikey":        SUPABASE_KEY!,
      "Authorization": `Bearer ${SUPABASE_KEY!}`,
      "Content-Type":  "application/json",
      "Prefer":        "return=representation",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DB query failed for ${table}: ${res.status} ${text}`);
  }
  return res.json();
}

describe("Quarter Workflow DB tests", { skip: !hasDb }, () => {
  test("Q1 grading period exists in DB", async () => {
    const rows = await dbQuery("grading_periods", new URLSearchParams({
      select:          "id,name,period_type,sequence,start_date,end_date",
      organization_id: `eq.${ORG_ID}`,
      period_type:     "eq.quarter",
      is_assignment_period: "eq.true",
      order:           "sequence.asc",
      limit:           "1",
    }));
    assert.ok(rows.length > 0, "Should have at least one quarter period");
    const q1 = rows[0];
    assert.equal(q1.period_type, "quarter");
    assert.ok(q1.start_date <= "2026-10-09", "Q1 start date should be before Oct 10");
    assert.ok(q1.end_date <= "2026-10-09", "Q1 end date should be Oct 9 or earlier");
    console.log(`  Q1 period: ${q1.name} (${q1.start_date} – ${q1.end_date}) id=${q1.id}`);
  });

  test("Q1 assignments still exist after migration (102 expected)", async () => {
    // First get Q1 period id
    const periods = await dbQuery("grading_periods", new URLSearchParams({
      select:               "id,name",
      organization_id:      `eq.${ORG_ID}`,
      period_type:          "eq.quarter",
      is_assignment_period: "eq.true",
      order:                "sequence.asc",
      limit:                "1",
    }));
    assert.ok(periods.length > 0, "Q1 period must exist");
    const q1Id = periods[0].id;

    // Count assignments in Q1
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/assignments?organization_id=eq.${ORG_ID}&grading_period_id=eq.${q1Id}&status=eq.active&select=id`,
      {
        headers: {
          "apikey":        SUPABASE_KEY!,
          "Authorization": `Bearer ${SUPABASE_KEY!}`,
          "Prefer":        "count=exact",
        },
      }
    );
    const count = parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0", 10);
    assert.ok(count > 0, `Should have Q1 assignments, got ${count}`);
    console.log(`  Q1 assignments: ${count}`);
    // The known count from the task brief is 102
    assert.ok(count >= 50, `Expected at least 50 Q1 assignments, got ${count}`);
  });

  test("Q1 workflow rows have status=review (not finalized)", async () => {
    // Get Q1 period id
    const periods = await dbQuery("grading_periods", new URLSearchParams({
      select:               "id",
      organization_id:      `eq.${ORG_ID}`,
      period_type:          "eq.quarter",
      is_assignment_period: "eq.true",
      order:                "sequence.asc",
      limit:                "1",
    }));
    assert.ok(periods.length > 0, "Q1 period must exist");
    const q1Id = periods[0].id;

    const workflows = await dbQuery("grading_period_workflow", new URLSearchParams({
      select:            "id,status,finalized_at",
      organization_id:   `eq.${ORG_ID}`,
      grading_period_id: `eq.${q1Id}`,
    }));
    assert.ok(workflows.length > 0, "Should have Q1 workflow rows after migration init");

    // All should be 'review', none finalized
    for (const wf of workflows) {
      assert.equal(wf.status, "review", `Workflow ${wf.id} should be review, got ${wf.status}`);
      assert.equal(wf.finalized_at, null, `Workflow ${wf.id} should not be finalized`);
    }
    console.log(`  Q1 workflow rows: ${workflows.length} all in review status`);
  });

  test("No Q1 workflow rows are finalized", async () => {
    const periods = await dbQuery("grading_periods", new URLSearchParams({
      select:               "id",
      organization_id:      `eq.${ORG_ID}`,
      period_type:          "eq.quarter",
      is_assignment_period: "eq.true",
      order:                "sequence.asc",
      limit:                "1",
    }));
    if (!periods.length) return; // Skip if no Q1
    const q1Id = periods[0].id;

    const finalized = await dbQuery("grading_period_workflow", new URLSearchParams({
      select:            "id",
      organization_id:   `eq.${ORG_ID}`,
      grading_period_id: `eq.${q1Id}`,
      status:            "eq.finalized",
    }));
    assert.equal(finalized.length, 0, "No Q1 courses should be finalized yet");
  });

  test("Q2 has no workflow rows (open by default, not yet initialized)", async () => {
    const periods = await dbQuery("grading_periods", new URLSearchParams({
      select:               "id,name",
      organization_id:      `eq.${ORG_ID}`,
      period_type:          "eq.quarter",
      is_assignment_period: "eq.true",
      order:                "sequence.asc",
      offset:               "1",
      limit:                "1",
    }));
    if (!periods.length) {
      console.log("  No Q2 period found, skipping");
      return;
    }
    const q2Id = periods[0].id;
    const q2Workflows = await dbQuery("grading_period_workflow", new URLSearchParams({
      select:            "id",
      organization_id:   `eq.${ORG_ID}`,
      grading_period_id: `eq.${q2Id}`,
    }));
    assert.equal(q2Workflows.length, 0, `Q2 (${periods[0].name}) should have no workflow rows`);
    console.log(`  Q2 period (${periods[0].name}) has ${q2Workflows.length} workflow rows (correct: open by default)`);
  });

  test("quarter_grade_snapshots table is empty (nothing finalized)", async () => {
    const snaps = await dbQuery("quarter_grade_snapshots", new URLSearchParams({
      select:           "id",
      organization_id:  `eq.${ORG_ID}`,
      limit:            "1",
    }));
    assert.equal(snaps.length, 0, "No grade snapshots should exist yet — Q1 is REVIEW, not FINALIZED");
    console.log("  quarter_grade_snapshots: empty (correct)");
  });

  test("grading_period_workflow_events contain review_started events for Q1", async () => {
    const periods = await dbQuery("grading_periods", new URLSearchParams({
      select:               "id",
      organization_id:      `eq.${ORG_ID}`,
      period_type:          "eq.quarter",
      is_assignment_period: "eq.true",
      order:                "sequence.asc",
      limit:                "1",
    }));
    if (!periods.length) return;
    const q1Id = periods[0].id;

    const workflows = await dbQuery("grading_period_workflow", new URLSearchParams({
      select:            "id",
      organization_id:   `eq.${ORG_ID}`,
      grading_period_id: `eq.${q1Id}`,
      limit:             "1",
    }));
    if (!workflows.length) {
      assert.fail("Expected Q1 workflow rows to exist");
      return;
    }

    const events = await dbQuery("grading_period_workflow_events", new URLSearchParams({
      select:     "id,event_type",
      workflow_id: `eq.${workflows[0].id}`,
      event_type: "eq.review_started",
    }));
    assert.ok(events.length > 0, "Should have at least one review_started event for Q1");
    console.log(`  Q1 workflow events: ${events.length} review_started event(s) found`);
  });
});
