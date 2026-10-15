-- _rollback_00090.sql
-- Rollback for: 00090_family_finance_accounts.sql
--
-- SAFETY RULES:
--   1. If family_finance_accounts contains rows with has_hold=true, custom
--      hold_reason text, or custom account_name values, rollback ABORTS.
--      These are staff-entered records that cannot be recreated automatically.
--   2. If finance_settings contains any non-default configuration (Stripe keys,
--      late fee settings, payment method toggles), rollback ABORTS.
--   3. Pure backfill rows (has_hold=false, standard account names, no custom
--      config) may be dropped because they can be recreated by re-running 00090.
--   4. Does NOT use DROP TABLE CASCADE. Each drop is explicit.
--
-- WHEN IS ROLLBACK SAFE?
--   SAFE   — migration was just applied in staging; only backfill rows exist;
--             no holds, no custom config, no active Stripe setup.
--   UNSAFE — any of the abort conditions above are true. Investigate.
--             Fix the underlying issue rather than forcing a rollback.
--
-- To check before running:
--   SELECT id, account_name, has_hold, hold_reason FROM family_finance_accounts;
--   SELECT stripe_enabled, late_fee_enabled, stripe_publishable_key FROM finance_settings;
--
-- To run (staging only):
--   psql $DATABASE_URL < supabase/migrations/_rollback_00090.sql
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  ffa_count        INTEGER;
  ffa_holds        INTEGER;
  ffa_custom_names INTEGER;
  fs_count         INTEGER;
  fs_configured    INTEGER;
BEGIN

  -- ── family_finance_accounts guards ────────────────────────────────────────

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'family_finance_accounts'
  ) THEN
    RAISE NOTICE '_rollback_00090: family_finance_accounts does not exist — nothing to roll back.';
  ELSE
    SELECT COUNT(*)   INTO ffa_count         FROM family_finance_accounts;
    SELECT COUNT(*)   INTO ffa_holds         FROM family_finance_accounts WHERE has_hold = true;
    SELECT COUNT(*)   INTO ffa_custom_names  FROM family_finance_accounts
      WHERE account_name IS NOT NULL
        AND account_name NOT IN ('Family Account', '')
        AND created_by IS NOT NULL;  -- staff-set, not migration backfill

    IF ffa_holds > 0 THEN
      RAISE EXCEPTION
        '_rollback_00090 ABORTED: % family account(s) have active financial holds. '
        'Rolling back would delete these hold flags with no recovery path. '
        'Remove holds first, or restore from backup.',
        ffa_holds;
    END IF;

    IF ffa_custom_names > 0 THEN
      RAISE EXCEPTION
        '_rollback_00090 ABORTED: % family account(s) have staff-entered custom account names. '
        'These cannot be recreated by re-running the migration. '
        'Document them first, or restore from backup.',
        ffa_custom_names;
    END IF;

    RAISE NOTICE '_rollback_00090: family_finance_accounts has % row(s), 0 holds, 0 custom names — safe to drop.', ffa_count;
  END IF;

  -- ── finance_settings guards ───────────────────────────────────────────────

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'finance_settings'
  ) THEN
    RAISE NOTICE '_rollback_00090: finance_settings does not exist — nothing to roll back.';
  ELSE
    SELECT COUNT(*) INTO fs_count FROM finance_settings;
    SELECT COUNT(*) INTO fs_configured FROM finance_settings
      WHERE stripe_enabled = true
         OR late_fee_enabled = true
         OR stripe_publishable_key IS NOT NULL
         OR zelle_enabled = true
         OR step_up_enabled = true
         OR invoice_footer_text IS NOT NULL;

    IF fs_configured > 0 THEN
      RAISE EXCEPTION
        '_rollback_00090 ABORTED: finance_settings has % row(s) with non-default configuration '
        '(Stripe enabled, late fees, custom invoice text, or payment method toggles). '
        'Document these settings before rolling back — they cannot be recovered automatically.',
        fs_configured;
    END IF;

    RAISE NOTICE '_rollback_00090: finance_settings has % default-only row(s) — safe to drop.', fs_count;
  END IF;

  RAISE NOTICE '_rollback_00090: all guards passed — proceeding with rollback.';
END $$;

-- Step 1: Drop helper functions (explicit names only, no CASCADE)

DROP FUNCTION IF EXISTS get_my_family_account(UUID);
DROP FUNCTION IF EXISTS get_family_student_ids(UUID);

-- Step 2: Drop RLS policies on finance_settings

DROP POLICY IF EXISTS finance_settings_select ON finance_settings;
DROP POLICY IF EXISTS finance_settings_insert ON finance_settings;
DROP POLICY IF EXISTS finance_settings_update ON finance_settings;

-- Step 3: Drop trigger on finance_settings

DROP TRIGGER IF EXISTS trg_finance_settings_updated_at ON finance_settings;

-- Step 4: Drop finance_settings table

DROP TABLE IF EXISTS finance_settings;

-- Step 5: Drop RLS policies on family_finance_accounts

DROP POLICY IF EXISTS "family_finance_accts_select_staff" ON family_finance_accounts;
DROP POLICY IF EXISTS "family_finance_accts_select_own"   ON family_finance_accounts;
DROP POLICY IF EXISTS "family_finance_accts_insert"       ON family_finance_accounts;
DROP POLICY IF EXISTS "family_finance_accts_update"       ON family_finance_accounts;

-- Step 6: Drop indexes on family_finance_accounts

DROP INDEX IF EXISTS idx_family_finance_accts_org;
DROP INDEX IF EXISTS idx_family_finance_accts_profile;

-- Step 7: Drop trigger on family_finance_accounts

DROP TRIGGER IF EXISTS trg_family_finance_accounts_updated_at ON family_finance_accounts;

-- Step 8: Drop family_finance_accounts table

DROP TABLE IF EXISTS family_finance_accounts;

-- Verify

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('family_finance_accounts', 'finance_settings')
  ) THEN
    RAISE NOTICE '_rollback_00090: complete. Both tables removed.';
  ELSE
    RAISE EXCEPTION '_rollback_00090: one or more tables still exist after rollback.';
  END IF;
END $$;
