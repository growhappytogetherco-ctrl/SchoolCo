-- _rollback_00089.sql
-- Rollback for: 00089_finance_ledger.sql
--
-- SAFETY RULES:
--   1. If finance_ledger has ANY rows, this script refuses to drop the table.
--      Ledger rows are immutable audit records — they cannot be recreated.
--      Investigate and resolve before rolling back.
--   2. Forward-going ledger triggers on student_charges, student_payments,
--      and charge_adjustments are dropped first so no new rows are created
--      during rollback.
--   3. Does NOT use DROP TABLE CASCADE. Only explicit drops.
--
-- WHEN IS ROLLBACK SAFE?
--   SAFE   — migration was just applied in a test/staging environment and
--             the ledger table is empty (no INSERT triggers fired yet).
--   UNSAFE — finance_ledger contains rows. Those rows are the append-only
--             audit trail. Dropping them is an irreversible loss. Restore
--             from backup instead of rolling back.
--
-- To check before running:
--   SELECT COUNT(*) FROM finance_ledger;
--
-- To run (staging only):
--   psql $DATABASE_URL < supabase/migrations/_rollback_00089.sql
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  ledger_count INTEGER;
BEGIN
  -- Guard: refuse if the table doesn't exist yet (migration never applied)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'finance_ledger'
  ) THEN
    RAISE NOTICE '_rollback_00089: finance_ledger does not exist — nothing to roll back.';
    RETURN;
  END IF;

  -- Guard: refuse if ledger has rows
  SELECT COUNT(*) INTO ledger_count FROM finance_ledger;
  IF ledger_count > 0 THEN
    RAISE EXCEPTION
      '_rollback_00089 ABORTED: finance_ledger contains % row(s). '
      'These are immutable audit records and cannot be recreated. '
      'Roll back is unsafe. Restore from backup if needed.',
      ledger_count;
  END IF;

  RAISE NOTICE '_rollback_00089: finance_ledger is empty — proceeding with rollback.';
END $$;

-- Step 1: Drop forward-going INSERT/UPDATE triggers on source tables
--         (prevents new ledger rows from being created during rollback)

DROP TRIGGER IF EXISTS trg_student_charges_ledger  ON student_charges;
DROP TRIGGER IF EXISTS trg_student_payments_ledger  ON student_payments;
DROP TRIGGER IF EXISTS trg_charge_adjustments_ledger ON charge_adjustments;

-- Step 2: Drop trigger functions

DROP FUNCTION IF EXISTS trg_ledger_on_charge();
DROP FUNCTION IF EXISTS trg_ledger_on_payment();
DROP FUNCTION IF EXISTS trg_ledger_on_adjustment();

-- Step 3: Drop the immutability trigger and function on finance_ledger itself

DROP TRIGGER IF EXISTS trg_finance_ledger_immutable ON finance_ledger;
DROP FUNCTION IF EXISTS raise_ledger_immutable();

-- Step 4: Drop RLS policies on finance_ledger

DROP POLICY IF EXISTS finance_ledger_select_staff  ON finance_ledger;
DROP POLICY IF EXISTS finance_ledger_select_parent  ON finance_ledger;
DROP POLICY IF EXISTS finance_ledger_insert_trigger ON finance_ledger;

-- Step 5: Drop indexes on finance_ledger

DROP INDEX IF EXISTS idx_finance_ledger_no_dup;
DROP INDEX IF EXISTS idx_finance_ledger_org_date;
DROP INDEX IF EXISTS idx_finance_ledger_student;
DROP INDEX IF EXISTS idx_finance_ledger_source;

-- Step 6: Drop the table (only reached if empty guard passed above)

DROP TABLE IF EXISTS finance_ledger;

-- Verify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'finance_ledger'
  ) THEN
    RAISE NOTICE '_rollback_00089: complete. finance_ledger removed.';
  ELSE
    RAISE EXCEPTION '_rollback_00089: finance_ledger still exists after rollback attempt.';
  END IF;
END $$;
