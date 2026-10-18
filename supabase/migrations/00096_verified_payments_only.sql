-- Migration 00096: Verified-only payments in balance calculations
--
-- BEFORE: get_order_paid_cents() counted status != 'reversed' (pending + verified).
--         A pending payment would show $0 balance on the invoice and set
--         order_status to "paid" before staff verification.
--
-- AFTER:  get_order_paid_cents() counts status = 'verified' only.
--         Pending payments are visible in payment history but do not
--         reduce the invoice balance, PDF paid amount, or order status.
--
-- check_no_overpayment trigger is intentionally left unchanged at != 'reversed'
-- so that recording a pending payment still blocks double-recording.

CREATE OR REPLACE FUNCTION get_order_paid_cents(p_order_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount_cents), 0)::INTEGER
  FROM   order_payments
  WHERE  order_id = p_order_id
    AND  status   = 'verified';
$$;
