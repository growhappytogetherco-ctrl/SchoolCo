-- Migration 00090: Family Finance Accounts and Finance Settings
--
-- Creates:
--   family_finance_accounts — one account per guardian profile per org.
--                             Groups all of a guardian's enrolled students
--                             under one financial identity.
--   finance_settings        — per-org finance configuration.
--
-- DESIGN DECISIONS:
--   - A "family account" is scoped to a guardian's profile within an org.
--     One guardian = one family account per org. This preserves the
--     split-household isolation already established in guardianships:
--     Parent A and Parent B of the same student each have their own account.
--   - The account is created lazily (when a charge is first added for a
--     student with known guardians) or explicitly by staff.
--   - The account_balance_cents view is computed from finance_ledger, not stored.
--
-- BACKFILL:
--   Creates one family_finance_accounts row per distinct active guardian
--   (profile_id, organization_id) pair found in guardianships.
--   No financial data is moved or changed.

-- ── family_finance_accounts ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_finance_accounts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id       UUID        NOT NULL REFERENCES profiles(id)      ON DELETE RESTRICT,

  -- Display name for this account (e.g. "Johnson Family")
  account_name     TEXT,

  -- Financial hold flag: when true, enrollment actions should warn staff
  has_hold         BOOLEAN     NOT NULL DEFAULT false,
  hold_reason      TEXT,

  status           TEXT        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'archived')),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES profiles(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES profiles(id),

  UNIQUE (organization_id, profile_id)
);

CREATE TRIGGER trg_family_finance_accounts_updated_at
  BEFORE UPDATE ON family_finance_accounts
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_family_finance_accts_org
  ON family_finance_accounts(organization_id);
CREATE INDEX IF NOT EXISTS idx_family_finance_accts_profile
  ON family_finance_accounts(profile_id);

ALTER TABLE family_finance_accounts ENABLE ROW LEVEL SECURITY;

-- Staff with finance-view can read all accounts in their org
CREATE POLICY "family_finance_accts_select_staff"
  ON family_finance_accounts FOR SELECT
  USING (has_finance_view_access(organization_id));

-- Guardians can read their own account
CREATE POLICY "family_finance_accts_select_own"
  ON family_finance_accounts FOR SELECT
  USING (
    profile_id = auth_uid_to_profile_id()
    AND status = 'active'
  );

-- Finance-manage roles can insert/update
CREATE POLICY "family_finance_accts_insert"
  ON family_finance_accounts FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

CREATE POLICY "family_finance_accts_update"
  ON family_finance_accounts FOR UPDATE
  USING (has_finance_manage_access(organization_id));

-- ── Backfill: one account per active guardian per org ─────────────────────

INSERT INTO family_finance_accounts (organization_id, profile_id, account_name, status)
SELECT DISTINCT
  g.organization_id,
  g.profile_id,
  COALESCE(NULLIF(p.full_name, ''), 'Family Account') AS account_name,
  'active'
FROM guardianships g
JOIN profiles p ON p.id = g.profile_id
WHERE g.status = 'active'
  AND g.archived_at IS NULL
ON CONFLICT (organization_id, profile_id) DO NOTHING;

-- ── finance_settings ─────────────────────────────────────────────────────
-- Per-org configuration for the financial module.
-- One row per organization. Created on first access.

CREATE TABLE IF NOT EXISTS finance_settings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- Late fee configuration
  late_fee_enabled         BOOLEAN     NOT NULL DEFAULT false,
  late_fee_amount_cents    INTEGER     CHECK (late_fee_amount_cents >= 0),
  late_fee_grace_days      INTEGER     NOT NULL DEFAULT 5 CHECK (late_fee_grace_days >= 0),

  -- Payment source toggles (which methods are enabled for this org)
  stripe_enabled           BOOLEAN     NOT NULL DEFAULT false,
  zelle_enabled            BOOLEAN     NOT NULL DEFAULT false,
  step_up_enabled          BOOLEAN     NOT NULL DEFAULT false,
  manual_payments_enabled  BOOLEAN     NOT NULL DEFAULT true,

  -- Stripe configuration (publishable key is safe to store; secret key is Vercel env only)
  stripe_publishable_key   TEXT,       -- populated when Stripe is configured; not the secret key

  -- Invoice settings
  invoice_due_days         INTEGER     NOT NULL DEFAULT 30 CHECK (invoice_due_days > 0),
  invoice_footer_text      TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_finance_settings_updated_at
  BEFORE UPDATE ON finance_settings
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;

-- Finance-view can read settings
CREATE POLICY "finance_settings_select"
  ON finance_settings FOR SELECT
  USING (has_finance_view_access(organization_id));

-- Finance-manage can insert/update
CREATE POLICY "finance_settings_insert"
  ON finance_settings FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

CREATE POLICY "finance_settings_update"
  ON finance_settings FOR UPDATE
  USING (has_finance_manage_access(organization_id));

-- ── Seed default finance_settings for existing orgs ──────────────────────

INSERT INTO finance_settings (organization_id)
SELECT id FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

-- ── Guardian access to their own family finance account ───────────────────
-- Update guardian_finance_rls (from 00072) to also allow guardians to see
-- their own family_finance_accounts row when querying finance data.
-- (No change to existing policies needed — new table has its own SELECT policy above.)

-- ── Helper: get family account for current guardian in an org ─────────────

CREATE OR REPLACE FUNCTION get_my_family_account(org_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
STABLE
AS $$
  SELECT id
  FROM   family_finance_accounts
  WHERE  organization_id = org_id
    AND  profile_id      = auth_uid_to_profile_id()
    AND  status          = 'active'
  LIMIT 1;
$$;

-- ── Helper: get all student ids for a family account ──────────────────────

CREATE OR REPLACE FUNCTION get_family_student_ids(p_family_account_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
STABLE
AS $$
  SELECT DISTINCT g.student_id
  FROM   family_finance_accounts ffa
  JOIN   guardianships g ON g.profile_id = ffa.profile_id
                        AND g.organization_id = ffa.organization_id
  WHERE  ffa.id     = p_family_account_id
    AND  g.status   = 'active'
    AND  g.archived_at IS NULL;
$$;
