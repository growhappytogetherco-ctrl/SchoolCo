-- Migration 00088: Integer cents columns — EXPAND phase (non-breaking)
--
-- STRATEGY: expand-migrate-contract
--
--   EXPAND  (this migration): add INTEGER cents columns alongside existing
--           NUMERIC columns. Backfill. Add sync triggers so old and new
--           application code can safely coexist during the deployment window.
--           Existing columns are NOT renamed or dropped.
--
--   MIGRATE (application code): new code writes BOTH old NUMERIC column and
--           new INTEGER cents column on every INSERT/UPDATE.
--           Reads come exclusively from the cents columns.
--           Old NUMERIC columns remain as the NOT NULL anchor during transition.
--
--   CONTRACT (future migration, separate authorization): drop sync triggers,
--           drop original NUMERIC columns, tighten constraints. Only after
--           one full billing cycle confirms the cents columns are authoritative.
--
-- CONCURRENT WRITE SAFETY:
--   Sync triggers fire BEFORE INSERT OR UPDATE.
--   On INSERT: cents column is always set from the NUMERIC column (safe for
--     both old code that omits the cents column and new code that writes both).
--   On UPDATE: cents column is re-synced only when the NUMERIC column changes,
--     preventing the trigger from overwriting a cents value that was
--     deliberately set without touching the legacy NUMERIC column.
--
-- DO NOT APPLY TO PRODUCTION without explicit authorization.
-- After applying, run: npm run audit:balances
-- A zero-discrepancy result is required before any further steps.

-- ── student_charges ───────────────────────────────────────────────────────
-- Adds: original_amount_cents INTEGER NOT NULL CHECK (>= 0)
-- Keeps: original_amount NUMERIC(10,2) NOT NULL  (unchanged)

ALTER TABLE student_charges
  ADD COLUMN IF NOT EXISTS original_amount_cents INTEGER;

UPDATE student_charges
SET original_amount_cents = ROUND(original_amount * 100)::INTEGER
WHERE original_amount_cents IS NULL;

ALTER TABLE student_charges
  ALTER COLUMN original_amount_cents SET NOT NULL,
  ADD CONSTRAINT chk_student_charges_original_amount_cents_nonneg
    CHECK (original_amount_cents >= 0);

-- Sync trigger: keeps original_amount_cents in sync with original_amount.
-- On INSERT: always derives cents from numeric (new code writes both;
--   old code omits cents → trigger fills it in).
-- On UPDATE: only re-syncs cents when numeric column actually changes,
--   so a cents-only update by new code is never silently overwritten.
CREATE OR REPLACE FUNCTION sync_student_charges_cents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.original_amount_cents := ROUND(NEW.original_amount * 100)::INTEGER;
  ELSIF TG_OP = 'UPDATE'
    AND NEW.original_amount IS DISTINCT FROM OLD.original_amount
  THEN
    NEW.original_amount_cents := ROUND(NEW.original_amount * 100)::INTEGER;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_charges_cents ON student_charges;
CREATE TRIGGER trg_sync_student_charges_cents
  BEFORE INSERT OR UPDATE ON student_charges
  FOR EACH ROW EXECUTE FUNCTION sync_student_charges_cents();

-- ── charge_adjustments ────────────────────────────────────────────────────
-- Adds: amount_cents INTEGER NOT NULL  (no sign constraint — negatives allowed)
-- Keeps: amount NUMERIC(10,2) NOT NULL  (unchanged)

ALTER TABLE charge_adjustments
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER;

UPDATE charge_adjustments
SET amount_cents = ROUND(amount * 100)::INTEGER
WHERE amount_cents IS NULL;

ALTER TABLE charge_adjustments
  ALTER COLUMN amount_cents SET NOT NULL;
-- No non-negative CHECK: adjustments can be negative (discounts/waivers).

CREATE OR REPLACE FUNCTION sync_charge_adjustments_cents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.amount_cents := ROUND(NEW.amount * 100)::INTEGER;
  ELSIF TG_OP = 'UPDATE'
    AND NEW.amount IS DISTINCT FROM OLD.amount
  THEN
    NEW.amount_cents := ROUND(NEW.amount * 100)::INTEGER;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_charge_adjustments_cents ON charge_adjustments;
CREATE TRIGGER trg_sync_charge_adjustments_cents
  BEFORE INSERT OR UPDATE ON charge_adjustments
  FOR EACH ROW EXECUTE FUNCTION sync_charge_adjustments_cents();

-- ── student_payments ──────────────────────────────────────────────────────
-- Adds: amount_cents INTEGER NOT NULL CHECK (> 0)
-- Keeps: amount NUMERIC(10,2) NOT NULL  (unchanged)

ALTER TABLE student_payments
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER;

UPDATE student_payments
SET amount_cents = ROUND(amount * 100)::INTEGER
WHERE amount_cents IS NULL;

ALTER TABLE student_payments
  ALTER COLUMN amount_cents SET NOT NULL,
  ADD CONSTRAINT chk_student_payments_amount_cents_pos
    CHECK (amount_cents > 0);

CREATE OR REPLACE FUNCTION sync_student_payments_cents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.amount_cents := ROUND(NEW.amount * 100)::INTEGER;
  ELSIF TG_OP = 'UPDATE'
    AND NEW.amount IS DISTINCT FROM OLD.amount
  THEN
    NEW.amount_cents := ROUND(NEW.amount * 100)::INTEGER;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_payments_cents ON student_payments;
CREATE TRIGGER trg_sync_student_payments_cents
  BEFORE INSERT OR UPDATE ON student_payments
  FOR EACH ROW EXECUTE FUNCTION sync_student_payments_cents();

-- ── payment_allocations ───────────────────────────────────────────────────
-- Adds: amount_cents INTEGER NOT NULL CHECK (> 0)
-- Keeps: amount NUMERIC(10,2) NOT NULL  (unchanged)

ALTER TABLE payment_allocations
  ADD COLUMN IF NOT EXISTS amount_cents INTEGER;

UPDATE payment_allocations
SET amount_cents = ROUND(amount * 100)::INTEGER
WHERE amount_cents IS NULL;

ALTER TABLE payment_allocations
  ALTER COLUMN amount_cents SET NOT NULL,
  ADD CONSTRAINT chk_payment_alloc_amount_cents_pos
    CHECK (amount_cents > 0);

CREATE OR REPLACE FUNCTION sync_payment_allocations_cents()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.amount_cents := ROUND(NEW.amount * 100)::INTEGER;
  ELSIF TG_OP = 'UPDATE'
    AND NEW.amount IS DISTINCT FROM OLD.amount
  THEN
    NEW.amount_cents := ROUND(NEW.amount * 100)::INTEGER;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_allocations_cents ON payment_allocations;
CREATE TRIGGER trg_sync_payment_allocations_cents
  BEFORE INSERT OR UPDATE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION sync_payment_allocations_cents();

-- ── Post-migration validation ─────────────────────────────────────────────
-- Run immediately after applying this migration:
--
--   npm run audit:balances
--
-- The audit script compares every _cents column against ROUND(legacy * 100)
-- and flags any rows with >2 decimal places in the original NUMERIC value.
-- A zero-discrepancy result is required before proceeding with contract phase.
--
-- To rollback if the audit fails:
--   Run supabase/migrations/_rollback_00088.sql manually in the Supabase SQL editor.
