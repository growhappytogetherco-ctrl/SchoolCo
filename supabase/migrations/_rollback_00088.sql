-- Rollback for migration 00088 (expand phase)
--
-- Drops the INTEGER cents columns and their sync triggers.
-- All original NUMERIC columns are left intact (they were never renamed or dropped).
-- Run manually via the Supabase SQL editor if the post-migration audit fails.
--
-- DO NOT apply this as a numbered migration — the leading underscore prevents
-- the Supabase CLI from treating it as a migration.

-- ── Remove sync triggers ──────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_sync_student_charges_cents     ON student_charges;
DROP TRIGGER IF EXISTS trg_sync_charge_adjustments_cents  ON charge_adjustments;
DROP TRIGGER IF EXISTS trg_sync_student_payments_cents    ON student_payments;
DROP TRIGGER IF EXISTS trg_sync_payment_allocations_cents ON payment_allocations;

DROP FUNCTION IF EXISTS sync_student_charges_cents();
DROP FUNCTION IF EXISTS sync_charge_adjustments_cents();
DROP FUNCTION IF EXISTS sync_student_payments_cents();
DROP FUNCTION IF EXISTS sync_payment_allocations_cents();

-- ── Drop cents columns ────────────────────────────────────────────────────

ALTER TABLE student_charges
  DROP CONSTRAINT IF EXISTS chk_student_charges_original_amount_cents_nonneg,
  DROP COLUMN IF EXISTS original_amount_cents;

ALTER TABLE charge_adjustments
  DROP COLUMN IF EXISTS amount_cents;

ALTER TABLE student_payments
  DROP CONSTRAINT IF EXISTS chk_student_payments_amount_cents_pos,
  DROP COLUMN IF EXISTS amount_cents;

ALTER TABLE payment_allocations
  DROP CONSTRAINT IF EXISTS chk_payment_alloc_amount_cents_pos,
  DROP COLUMN IF EXISTS amount_cents;

-- After running this rollback, redeploy the previous application version
-- (which reads original_amount / amount, not the _cents columns).
