-- Migration 00059: Student Finance Management
--
-- Tables created:
--   school_years            — canonical school year reference
--   student_charges         — charges billed to a student (flat rows; installments use
--                             plan_type + installment_number — no parent-child nesting)
--   charge_adjustments      — credits, discounts, waivers applied to a charge
--   student_payments        — money received from any source
--   payment_allocations     — how a payment is split across charges
--
-- Permissions:
--   organization_members.can_view_finances   — read-only finance access (non-admin)
--   organization_members.can_manage_finances — full finance write access (non-admin)
--   full_admin/platform_admin always have full finance access
--
-- RLS model:
--   has_finance_view_access(org_id)   — full_admin OR can_view/manage_finances
--   has_finance_manage_access(org_id) — full_admin OR can_manage_finances
--
-- Audit trail: every table has created_by, updated_by.
-- Soft-delete only: void/reverse with reason, never hard-delete.
-- Balances are COMPUTED, not stored: charge - adjustments - allocations.

-- ── Finance permission columns on organization_members ────────────────────

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS can_view_finances   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_finances BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organization_members.can_view_finances IS
  'Read-only access to student finance data. Applies to roles below admin.';
COMMENT ON COLUMN organization_members.can_manage_finances IS
  'Full write access to student finance data. Applies to roles below admin.
   Granting this does not elevate the user''s role — it only unlocks finance.';

-- ── Helper functions ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION has_finance_view_access(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   organization_members
    WHERE  organization_id = org_id
      AND  profile_id = auth_uid_to_profile_id()
      AND  status = 'active'
      AND (
        role IN ('full_admin', 'platform_admin')
        OR can_view_finances = true
        OR can_manage_finances = true
      )
  );
$$;

CREATE OR REPLACE FUNCTION has_finance_manage_access(org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   organization_members
    WHERE  organization_id = org_id
      AND  profile_id = auth_uid_to_profile_id()
      AND  status = 'active'
      AND (
        role IN ('full_admin', 'platform_admin')
        OR can_manage_finances = true
      )
  );
$$;

-- ── school_years ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS school_years (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label            TEXT        NOT NULL,  -- e.g. "2026-2027"
  start_date       DATE        NOT NULL,
  end_date         DATE        NOT NULL,
  is_current       BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (organization_id, label)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_years_current
  ON school_years(organization_id)
  WHERE is_current = true;

ALTER TABLE school_years ENABLE ROW LEVEL SECURITY;

-- Finance-view and above can read school years
CREATE POLICY "school_years_select"
  ON school_years FOR SELECT
  USING (has_finance_view_access(organization_id));

-- Finance-manage and above can insert/update
CREATE POLICY "school_years_insert"
  ON school_years FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

CREATE POLICY "school_years_update"
  ON school_years FOR UPDATE
  USING (has_finance_manage_access(organization_id));

-- ── student_charges ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_charges (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id        UUID        NOT NULL REFERENCES students(id)      ON DELETE CASCADE,
  school_year_id    UUID        NOT NULL REFERENCES school_years(id),
  charge_type       TEXT        NOT NULL,
  -- 'tuition' | 'enrollment_fee' | 'ua_fee' | 'other_fee'
  CHECK (charge_type IN ('tuition','enrollment_fee','ua_fee','other_fee')),
  description       TEXT        NOT NULL,
  original_amount   NUMERIC(10,2) NOT NULL CHECK (original_amount >= 0),
  due_date          DATE,
  -- Payment plan breakdown (null = not part of a plan)
  plan_type         TEXT        CHECK (plan_type IN ('annual','semester','quarterly','monthly','custom')),
  installment_number INT        CHECK (installment_number > 0),
  status            TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided')),
  notes             TEXT,
  void_reason       TEXT,
  voided_by         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  voided_at         TIMESTAMPTZ,
  created_by        UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  updated_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_student_charges_updated_at
  BEFORE UPDATE ON student_charges
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_student_charges_student_year
  ON student_charges(student_id, school_year_id);
CREATE INDEX IF NOT EXISTS idx_student_charges_org_year
  ON student_charges(organization_id, school_year_id);
CREATE INDEX IF NOT EXISTS idx_student_charges_due
  ON student_charges(organization_id, due_date) WHERE status = 'active';

ALTER TABLE student_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_charges_select"
  ON student_charges FOR SELECT
  USING (has_finance_view_access(organization_id));

CREATE POLICY "student_charges_insert"
  ON student_charges FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

CREATE POLICY "student_charges_update"
  ON student_charges FOR UPDATE
  USING (has_finance_manage_access(organization_id));

-- ── charge_adjustments ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS charge_adjustments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  charge_id        UUID        NOT NULL REFERENCES student_charges(id) ON DELETE CASCADE,
  adjustment_type  TEXT        NOT NULL,
  -- 'credit' | 'discount' | 'scholarship' | 'waiver' | 'other'
  CHECK (adjustment_type IN ('credit','discount','scholarship','waiver','other')),
  amount           NUMERIC(10,2) NOT NULL,  -- negative = reduces balance
  description      TEXT        NOT NULL,
  notes            TEXT,
  status           TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided')),
  void_reason      TEXT,
  voided_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  voided_at        TIMESTAMPTZ,
  created_by       UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_charge_adj_charge ON charge_adjustments(charge_id);

ALTER TABLE charge_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "charge_adj_select"
  ON charge_adjustments FOR SELECT
  USING (has_finance_view_access(organization_id));

CREATE POLICY "charge_adj_insert"
  ON charge_adjustments FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

CREATE POLICY "charge_adj_update"
  ON charge_adjustments FOR UPDATE
  USING (has_finance_manage_access(organization_id));

-- ── student_payments ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_payments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id       UUID        NOT NULL REFERENCES students(id)      ON DELETE CASCADE,
  school_year_id   UUID        NOT NULL REFERENCES school_years(id),
  payment_date     DATE        NOT NULL,
  amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  payment_source   TEXT        NOT NULL,
  -- 'parent_payment' | 'step_up_pep' | 'step_up_ua' | 'aaa' |
  -- 'scholarship' | 'cash' | 'check' | 'card_external' | 'other'
  CHECK (payment_source IN (
    'parent_payment','step_up_pep','step_up_ua','aaa',
    'scholarship','cash','check','card_external','other'
  )),
  reference_number TEXT,
  notes            TEXT,
  status           TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided')),
  void_reason      TEXT,
  voided_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  voided_at        TIMESTAMPTZ,
  created_by       UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  updated_by       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_student_payments_updated_at
  BEFORE UPDATE ON student_payments
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_student_payments_student_year
  ON student_payments(student_id, school_year_id);
CREATE INDEX IF NOT EXISTS idx_student_payments_org_year
  ON student_payments(organization_id, school_year_id);
CREATE INDEX IF NOT EXISTS idx_student_payments_source
  ON student_payments(organization_id, payment_source) WHERE status = 'active';

ALTER TABLE student_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_payments_select"
  ON student_payments FOR SELECT
  USING (has_finance_view_access(organization_id));

CREATE POLICY "student_payments_insert"
  ON student_payments FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

CREATE POLICY "student_payments_update"
  ON student_payments FOR UPDATE
  USING (has_finance_manage_access(organization_id));

-- ── payment_allocations ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_allocations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  UUID        NOT NULL REFERENCES student_payments(id) ON DELETE CASCADE,
  charge_id   UUID        NOT NULL REFERENCES student_charges(id)  ON DELETE CASCADE,
  amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  created_by  UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (payment_id, charge_id)  -- one allocation per payment-charge pair
);

CREATE INDEX IF NOT EXISTS idx_payment_alloc_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_charge  ON payment_allocations(charge_id);

ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_alloc_select"
  ON payment_allocations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM student_payments sp
      WHERE sp.id = payment_id
        AND has_finance_view_access(sp.organization_id)
    )
  );

CREATE POLICY "payment_alloc_insert"
  ON payment_allocations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM student_payments sp
      WHERE sp.id = payment_id
        AND has_finance_manage_access(sp.organization_id)
    )
  );

-- ── Seed 2026-2027 school year for RLA ───────────────────────────────────

DO $$
DECLARE
  rla_org uuid := '9fd43346-f43b-41d1-9b4c-fe8702471b07';
BEGIN
  INSERT INTO school_years (organization_id, label, start_date, end_date, is_current)
  VALUES (rla_org, '2026-2027', '2026-08-10', '2027-05-25', true)
  ON CONFLICT (organization_id, label) DO NOTHING;

  RAISE NOTICE 'school_years: 2026-2027 seeded for RLA';
END $$;
