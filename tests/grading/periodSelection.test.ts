/**
 * Period selection helper tests.
 * Run with: npx tsx tests/grading/periodSelection.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { resolveDefaultPeriodId, type PeriodRow } from "../../src/lib/grading/periodSelection.js";

// RLA 2026-2027 production periods (is_assignment_period=true ones)
const Q1: PeriodRow = { id: "q1", period_type: "quarter", is_assignment_period: true, start_date: "2026-08-10", end_date: "2026-10-09", sequence: 1 };
const Q2: PeriodRow = { id: "q2", period_type: "quarter", is_assignment_period: true, start_date: "2026-10-12", end_date: "2026-12-18", sequence: 2 };
const Q3: PeriodRow = { id: "q3", period_type: "quarter", is_assignment_period: true, start_date: "2027-01-04", end_date: "2027-03-05", sequence: 4 };
const Q4: PeriodRow = { id: "q4", period_type: "quarter", is_assignment_period: true, start_date: "2027-03-08", end_date: "2027-05-25", sequence: 5 };
const FY: PeriodRow = { id: "fy", period_type: "full_year", is_assignment_period: true, start_date: "2026-08-10", end_date: "2027-05-25", sequence: 7 };

const PERIODS = [Q1, Q2, Q3, Q4, FY];

describe("resolveDefaultPeriodId — quarter selection", () => {
  test("returns Q1 when today is during Q1", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-09-01"), "q1");
  });

  test("returns Q1 on Q1 last day", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-10-09"), "q1");
  });

  test("returns Q1 (most recently ended) during Oct 10 gap, NOT Full Year", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-10-10"), "q1");
  });

  test("returns Q1 (most recently ended) during Oct 11 gap, NOT Full Year — P0 scenario", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-10-11"), "q1");
  });

  test("returns Q2 on Q2 first day", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-10-12"), "q2");
  });

  test("returns Q2 during Q2", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-11-15"), "q2");
  });

  test("returns Q2 (most recently ended) during winter break Dec 19", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-12-19"), "q2");
  });

  test("returns Q2 (most recently ended) during winter break Jan 3", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2027-01-03"), "q2");
  });

  test("returns Q3 on Q3 first day", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2027-01-04"), "q3");
  });

  test("returns Q3 (most recently ended) during Q3/Q4 gap Mar 6", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2027-03-06"), "q3");
  });

  test("returns Q3 (most recently ended) during Q3/Q4 gap Mar 7", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2027-03-07"), "q3");
  });

  test("returns Q4 during Q4", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2027-04-01"), "q4");
  });

  test("returns Q4 after school year ends", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2027-06-01"), "q4");
    assert.equal(resolveDefaultPeriodId(PERIODS, "2027-12-31"), "q4");
  });

  test("returns Q1 (earliest upcoming) before school starts", () => {
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-07-01"), "q1");
    assert.equal(resolveDefaultPeriodId(PERIODS, "2026-08-09"), "q1");
  });

  test("never returns Full Year when quarters are available", () => {
    // Q1/Q2 gap
    assert.notEqual(resolveDefaultPeriodId(PERIODS, "2026-10-11"), "fy");
    // During Q2
    assert.notEqual(resolveDefaultPeriodId(PERIODS, "2026-11-01"), "fy");
    // Winter break
    assert.notEqual(resolveDefaultPeriodId(PERIODS, "2026-12-25"), "fy");
  });

  test("returns null when no periods exist", () => {
    assert.equal(resolveDefaultPeriodId([], "2026-10-11"), null);
  });

  test("falls back to Full Year when no quarters exist", () => {
    assert.equal(resolveDefaultPeriodId([FY], "2026-10-11"), "fy");
  });

  test("works without sequence field", () => {
    const p1: PeriodRow = { id: "a", period_type: "quarter", is_assignment_period: true, start_date: "2026-08-10", end_date: "2026-10-09" };
    const p2: PeriodRow = { id: "b", period_type: "quarter", is_assignment_period: true, start_date: "2026-10-12", end_date: "2026-12-18" };
    assert.equal(resolveDefaultPeriodId([p1, p2], "2026-10-11"), "a");
  });
});
