-- Migration 00095: Orders Phase 2 — invoicing, payments, email log
--
-- Adds:
--   • invoice fields to orders (billing recipient snapshot, due date)
--   • payment config columns to finance_settings (Zelle, check, cash)
--   • order_payments table (full/partial payment recording with verification)
--   • order_email_log table (Resend tracking, idempotency)
--   • DB-level overpayment guard trigger on order_payments

-- ── orders: invoice metadata ──────────────────────────────────────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoiced_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_date                 DATE,
  ADD COLUMN IF NOT EXISTS billing_recipient_id     UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS billing_recipient_name   TEXT,
  ADD COLUMN IF NOT EXISTS billing_recipient_email  TEXT,
  ADD COLUMN IF NOT EXISTS invoice_sent_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_sent_count       INTEGER NOT NULL DEFAULT 0;

-- ── finance_settings: payment configuration ───────────────────────────────

ALTER TABLE finance_settings
  ADD COLUMN IF NOT EXISTS zelle_recipient    TEXT,   -- phone or email
  ADD COLUMN IF NOT EXISTS zelle_type         TEXT    DEFAULT 'phone'
                                              CHECK (zelle_type IN ('phone','email')),
  ADD COLUMN IF NOT EXISTS check_payee        TEXT,
  ADD COLUMN IF NOT EXISTS cash_instructions  TEXT;

-- ── order_payments ─────────────────────────────────────────────────────────
-- One row per payment attempt. Payments start as 'pending' and are
-- verified by finance staff. Reversed payments are never deleted.

CREATE TABLE IF NOT EXISTS order_payments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_id          UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,

  amount_cents      INTEGER     NOT NULL CHECK (amount_cents > 0),
  payment_method    TEXT        NOT NULL
                    CHECK (payment_method IN ('zelle','cash','check','other')),
  payment_date      DATE        NOT NULL,
  reference_number  TEXT,       -- check #, Zelle confirmation code, etc.
  notes             TEXT,

  status            TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','verified','reversed')),

  verified_by       UUID        REFERENCES auth.users(id),
  verified_at       TIMESTAMPTZ,
  reversed_by       UUID        REFERENCES auth.users(id),
  reversed_at       TIMESTAMPTZ,
  reversal_reason   TEXT,

  created_by        UUID        NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order_id
  ON order_payments (order_id);

CREATE INDEX IF NOT EXISTS idx_order_payments_org_date
  ON order_payments (organization_id, payment_date);

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_payments_select"
  ON order_payments FOR SELECT
  USING (has_finance_view_access(organization_id));

CREATE POLICY "order_payments_insert"
  ON order_payments FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

CREATE POLICY "order_payments_update"
  ON order_payments FOR UPDATE
  USING (has_finance_manage_access(organization_id));

-- ── Overpayment guard ─────────────────────────────────────────────────────
-- Defense-in-depth: DB trigger rejects any INSERT/UPDATE that would cause
-- the sum of non-reversed payments to exceed the order subtotal.

CREATE OR REPLACE FUNCTION check_no_overpayment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal  INTEGER;
  v_paid      INTEGER;
  v_balance   INTEGER;
BEGIN
  -- Skip check when reversing a payment (amount not changing)
  IF TG_OP = 'UPDATE' AND NEW.status = 'reversed' THEN
    RETURN NEW;
  END IF;

  SELECT get_order_subtotal(NEW.order_id) INTO v_subtotal;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_paid
  FROM   order_payments
  WHERE  order_id = NEW.order_id
    AND  status  != 'reversed'
    AND  id      != NEW.id;   -- exclude self on UPDATE

  v_balance := v_subtotal - v_paid;

  IF NEW.amount_cents > v_balance THEN
    RAISE EXCEPTION 'Payment of $% would exceed the remaining balance of $%. Reduce the amount.',
      (NEW.amount_cents::NUMERIC / 100)::TEXT,
      (v_balance::NUMERIC / 100)::TEXT;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_payments_no_overpay ON order_payments;
CREATE TRIGGER trg_order_payments_no_overpay
  BEFORE INSERT OR UPDATE ON order_payments
  FOR EACH ROW EXECUTE FUNCTION check_no_overpayment();

-- ── order_email_log ───────────────────────────────────────────────────────
-- Tracks every invoice email send attempt. Used to prevent duplicate sends
-- and to surface failures.

CREATE TABLE IF NOT EXISTS order_email_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  recipient_email  TEXT        NOT NULL,
  resend_id        TEXT,       -- Resend message ID on success
  status           TEXT        NOT NULL CHECK (status IN ('sent','failed')),
  error_message    TEXT,

  sent_by          UUID        NOT NULL REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_email_log_order_id
  ON order_email_log (order_id);

ALTER TABLE order_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_email_log_select"
  ON order_email_log FOR SELECT
  USING (has_finance_view_access(organization_id));

CREATE POLICY "order_email_log_insert"
  ON order_email_log FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

-- ── Helper: get_order_paid_cents ──────────────────────────────────────────
-- Returns sum of verified + pending (non-reversed) payments for an order.

CREATE OR REPLACE FUNCTION get_order_paid_cents(p_order_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount_cents), 0)::INTEGER
  FROM   order_payments
  WHERE  order_id = p_order_id
    AND  status  != 'reversed';
$$;

-- ── Helper: get_order_verified_cents ─────────────────────────────────────
-- Returns sum of verified-only payments (what staff have confirmed received).

CREATE OR REPLACE FUNCTION get_order_verified_cents(p_order_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount_cents), 0)::INTEGER
  FROM   order_payments
  WHERE  order_id = p_order_id
    AND  status  = 'verified';
$$;
