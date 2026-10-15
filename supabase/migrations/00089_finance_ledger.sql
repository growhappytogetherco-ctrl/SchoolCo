-- Migration 00089: Immutable Finance Ledger
--
-- Creates finance_ledger — an append-only table that records every financial
-- event as a debit or credit. This is the audit trail for all financial activity.
--
-- DESIGN RULES:
--   - INSERT is allowed for finance-manage roles (and service_role for triggers).
--   - UPDATE and DELETE are explicitly denied via RLS — even for full_admin.
--   - Balances are computed from the ledger (sum of credits minus debits).
--   - One ledger entry per source event (charge, payment, adjustment, void).
--   - Corrections are reversing entries, never edits.
--
-- IMPORTANT: This migration does NOT backfill historical records.
--   Historical backfill (one ledger row per existing charge/payment/adjustment)
--   requires a separate authorized step: npm run migrate:ledger-backfill
--   That script verifies completeness before writing and is run separately.
--
-- Triggers added by this migration write new ledger entries automatically
-- for all future inserts/voids on student_charges, student_payments,
-- and charge_adjustments.

-- ── Entry type enum ───────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE finance_entry_type AS ENUM (
    'charge_posted',        -- charge added to a student's account
    'charge_voided',        -- charge reversed (credit)
    'payment_received',     -- payment recorded (credit)
    'payment_voided',       -- payment reversed (debit)
    'adjustment_applied',   -- credit/discount/waiver applied (credit)
    'adjustment_voided'     -- adjustment reversed (debit)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── finance_ledger ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS finance_ledger (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  student_id       UUID         NOT NULL REFERENCES students(id)      ON DELETE RESTRICT,
  school_year_id   UUID         REFERENCES school_years(id),

  -- Entry classification
  entry_type       finance_entry_type NOT NULL,

  -- Amounts in integer cents.
  -- debit_cents:  money owed / obligation added (positive)
  -- credit_cents: money received / obligation reduced (positive)
  -- Exactly one of these is non-zero per row.
  debit_cents      INTEGER      NOT NULL DEFAULT 0 CHECK (debit_cents  >= 0),
  credit_cents     INTEGER      NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),

  -- Source reference (which row triggered this entry)
  source_table     TEXT         NOT NULL,  -- 'student_charges' | 'student_payments' | 'charge_adjustments'
  source_id        UUID         NOT NULL,  -- the row's id in source_table

  -- Human-readable description for display
  description      TEXT         NOT NULL,

  -- Immutable provenance
  posted_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  posted_by        UUID         REFERENCES profiles(id) ON DELETE RESTRICT,

  -- Exactly one side must be positive; zero on both sides is not a valid entry
  CONSTRAINT chk_ledger_one_side CHECK (
    (debit_cents > 0 AND credit_cents = 0)
    OR
    (credit_cents > 0 AND debit_cents = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_finance_ledger_student
  ON finance_ledger(student_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_ledger_org_year
  ON finance_ledger(organization_id, school_year_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_ledger_source
  ON finance_ledger(source_table, source_id);

-- Prevent duplicate entries for the same source row and entry type.
-- source_id is the PRIMARY KEY of the source table row, so:
--   - each charge can have exactly one charge_posted entry
--   - each charge can have exactly one charge_voided entry
--   - each payment can have exactly one payment_received entry
--   - each adjustment row can have exactly one adjustment_applied entry
-- Multiple adjustments on one charge each have DIFFERENT source_ids (their
-- own rows), so the index correctly allows them — no exclusion needed.
-- This index blocks double-firing triggers and concurrent race conditions
-- for ALL entry types including adjustments.
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_ledger_no_dup
  ON finance_ledger(source_table, source_id, entry_type);

-- ── RLS: append-only ─────────────────────────────────────────────────────

ALTER TABLE finance_ledger ENABLE ROW LEVEL SECURITY;

-- Staff with finance-view can read
CREATE POLICY "ledger_select_staff"
  ON finance_ledger FOR SELECT
  USING (has_finance_view_access(organization_id));

-- Guardians can read their own children's ledger entries
CREATE POLICY "ledger_select_guardian"
  ON finance_ledger FOR SELECT
  USING (is_guardian_of_student(organization_id, student_id));

-- Finance-manage roles can insert new entries
CREATE POLICY "ledger_insert"
  ON finance_ledger FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

-- UPDATE is DENIED for all roles (append-only guarantee)
-- No UPDATE policy = denied by default under RLS.

-- DELETE is DENIED for all roles (immutable guarantee)
-- No DELETE policy = denied by default under RLS.

-- IMPORTANT: RLS alone does not protect against privileged roles (postgres,
-- service_role) or SECURITY DEFINER functions, which bypass RLS entirely.
-- The triggers below enforce immutability at the database engine level
-- for ALL callers regardless of role or privilege.

-- ── Database-level immutability (bypasses RLS, applies to all roles) ─────
-- These triggers fire BEFORE UPDATE/DELETE and raise an exception.
-- They cannot be bypassed by service_role, postgres, or SECURITY DEFINER
-- functions. Corrections must be made via reversing ledger entries.

CREATE OR REPLACE FUNCTION raise_ledger_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RAISE EXCEPTION
    'finance_ledger is append-only. % is not permitted. '
    'Post a reversing entry to correct an error.',
    TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_ledger_no_update ON finance_ledger;
CREATE TRIGGER trg_ledger_no_update
  BEFORE UPDATE ON finance_ledger
  FOR EACH ROW EXECUTE FUNCTION raise_ledger_immutable();

DROP TRIGGER IF EXISTS trg_ledger_no_delete ON finance_ledger;
CREATE TRIGGER trg_ledger_no_delete
  BEFORE DELETE ON finance_ledger
  FOR EACH ROW EXECUTE FUNCTION raise_ledger_immutable();

-- ── Trigger: auto-insert ledger on student_charges events ─────────────────

CREATE OR REPLACE FUNCTION trg_ledger_on_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO finance_ledger (
      organization_id, student_id, school_year_id,
      entry_type, debit_cents, credit_cents,
      source_table, source_id, description, posted_by
    ) VALUES (
      NEW.organization_id, NEW.student_id, NEW.school_year_id,
      'charge_posted',
      NEW.original_amount_cents, 0,
      'student_charges', NEW.id,
      NEW.description,
      NEW.created_by
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'voided' AND OLD.status = 'active' THEN
    INSERT INTO finance_ledger (
      organization_id, student_id, school_year_id,
      entry_type, debit_cents, credit_cents,
      source_table, source_id, description, posted_by
    ) VALUES (
      NEW.organization_id, NEW.student_id, NEW.school_year_id,
      'charge_voided',
      0, NEW.original_amount_cents,
      'student_charges', NEW.id,
      'VOID: ' || COALESCE(NEW.void_reason, NEW.description),
      NEW.voided_by
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_charges_ledger ON student_charges;
CREATE TRIGGER trg_student_charges_ledger
  AFTER INSERT OR UPDATE ON student_charges
  FOR EACH ROW EXECUTE FUNCTION trg_ledger_on_charge();

-- ── Trigger: auto-insert ledger on student_payments events ────────────────

CREATE OR REPLACE FUNCTION trg_ledger_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO finance_ledger (
      organization_id, student_id, school_year_id,
      entry_type, debit_cents, credit_cents,
      source_table, source_id, description, posted_by
    ) VALUES (
      NEW.organization_id, NEW.student_id, NEW.school_year_id,
      'payment_received',
      0, NEW.amount_cents,
      'student_payments', NEW.id,
      COALESCE(NEW.notes, 'Payment via ' || NEW.payment_source),
      NEW.created_by
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'voided' AND OLD.status = 'active' THEN
    INSERT INTO finance_ledger (
      organization_id, student_id, school_year_id,
      entry_type, debit_cents, credit_cents,
      source_table, source_id, description, posted_by
    ) VALUES (
      NEW.organization_id, NEW.student_id, NEW.school_year_id,
      'payment_voided',
      NEW.amount_cents, 0,
      'student_payments', NEW.id,
      'VOID: ' || COALESCE(NEW.void_reason, 'Payment reversed'),
      NEW.voided_by
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_payments_ledger ON student_payments;
CREATE TRIGGER trg_student_payments_ledger
  AFTER INSERT OR UPDATE ON student_payments
  FOR EACH ROW EXECUTE FUNCTION trg_ledger_on_payment();

-- ── Trigger: auto-insert ledger on charge_adjustments events ──────────────

CREATE OR REPLACE FUNCTION trg_ledger_on_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_student_id    UUID;
  v_org_id        UUID;
  v_school_year   UUID;
BEGIN
  -- Look up student and org from the parent charge
  SELECT sc.student_id, sc.organization_id, sc.school_year_id
  INTO v_student_id, v_org_id, v_school_year
  FROM student_charges sc
  WHERE sc.id = NEW.charge_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO finance_ledger (
      organization_id, student_id, school_year_id,
      entry_type, debit_cents, credit_cents,
      source_table, source_id, description, posted_by
    ) VALUES (
      v_org_id, v_student_id, v_school_year,
      'adjustment_applied',
      -- Negative adjustment_cents = reduction (credit); positive = additional charge (debit)
      CASE WHEN NEW.amount_cents < 0 THEN 0 ELSE NEW.amount_cents END,
      CASE WHEN NEW.amount_cents < 0 THEN ABS(NEW.amount_cents) ELSE 0 END,
      'charge_adjustments', NEW.id,
      NEW.description,
      NEW.created_by
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'voided' AND OLD.status = 'active' THEN
    -- Reverse the original adjustment entry
    INSERT INTO finance_ledger (
      organization_id, student_id, school_year_id,
      entry_type, debit_cents, credit_cents,
      source_table, source_id, description, posted_by
    ) VALUES (
      v_org_id, v_student_id, v_school_year,
      'adjustment_voided',
      CASE WHEN NEW.amount_cents < 0 THEN ABS(NEW.amount_cents) ELSE 0 END,
      CASE WHEN NEW.amount_cents < 0 THEN 0 ELSE NEW.amount_cents END,
      'charge_adjustments', NEW.id,
      'VOID: ' || COALESCE(NEW.void_reason, NEW.description),
      NEW.voided_by
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_charge_adjustments_ledger ON charge_adjustments;
CREATE TRIGGER trg_charge_adjustments_ledger
  AFTER INSERT OR UPDATE ON charge_adjustments
  FOR EACH ROW EXECUTE FUNCTION trg_ledger_on_adjustment();

-- ── Balance view helper ───────────────────────────────────────────────────
-- Computes current balance from ledger for a student and school year.
-- Used by getStudentFinanceSummary for ledger-based balance verification.

CREATE OR REPLACE FUNCTION get_student_ledger_balance(
  p_student_id    UUID,
  p_school_year_id UUID
)
RETURNS TABLE (
  total_debits_cents  INTEGER,
  total_credits_cents INTEGER,
  balance_cents       INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
STABLE
AS $$
  SELECT
    COALESCE(SUM(debit_cents), 0)::INTEGER  AS total_debits_cents,
    COALESCE(SUM(credit_cents), 0)::INTEGER AS total_credits_cents,
    (COALESCE(SUM(debit_cents), 0) - COALESCE(SUM(credit_cents), 0))::INTEGER AS balance_cents
  FROM finance_ledger
  WHERE student_id     = p_student_id
    AND school_year_id = p_school_year_id;
$$;
