-- Migration 00098: Add voided order status and void metadata columns
--
-- Allows authorized staff to void issued invoices that have no payment history.
-- Voided orders are excluded from active balances but preserved in the audit trail.
-- Invoice numbers are never reused.
--
-- Rules enforced at application layer (not here):
--   - draft + no payments → hard delete (no DB record needed)
--   - invoiced/partial/paid + no payments → void (this migration enables it)
--   - any payment history → block until payments are reversed

-- 1. Drop the existing check constraint and replace with one that includes 'voided'.
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_order_status_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_order_status_check
    CHECK (order_status IN ('draft','invoiced','partial','paid','cancelled','voided'));

-- 2. Add void metadata columns.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by   UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

-- 3. Index for finance queries that exclude voided orders.
CREATE INDEX IF NOT EXISTS idx_orders_org_status_voided
  ON orders(organization_id, order_status)
  WHERE order_status NOT IN ('cancelled', 'voided');
