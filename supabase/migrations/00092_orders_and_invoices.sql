-- Migration 00092: Orders & Invoices — Phase 1 (Catalog + Draft Orders)
--
-- Tables created:
--   store_items   — reusable item catalog (shirts, uniforms, field trips, supplies)
--   orders        — family-level purchase orders (draft → invoiced → paid/partial)
--   order_items   — line items within an order, with optional per-item student assignment
--
-- NOT in this migration (Phase 2+):
--   order_payments    — recorded payments against orders
--   invoice sequences — generated on invoiced transition
--
-- Design principles:
--   - Completely separate from student_charges / student_payments tuition engine
--   - Orders belong to family_finance_accounts, not to individual students
--   - Per-item student assignment is optional (some items are family-level)
--   - Prices are snapshotted on order_items at creation; catalog changes don't affect existing orders
--   - Subtotal is COMPUTED (not stored) from order_items — prevents stale denormalization
--   - RLS reuses has_finance_view_access() / has_finance_manage_access()
--   - Soft-delete only: orders can be cancelled, items voided — no hard deletes
--   - Integer cents throughout

-- ── store_items ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS store_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name             TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description      TEXT,
  category         TEXT        NOT NULL DEFAULT 'other'
                               CHECK (category IN ('shirt','polo','uniform','field_trip','supplies','fee','other')),

  -- Price in cents (e.g. 1800 = $18.00)
  unit_price_cents INTEGER     NOT NULL CHECK (unit_price_cents >= 0),

  -- Available sizes; NULL means no size selection required
  available_sizes  TEXT[]      DEFAULT NULL,

  is_active        BOOLEAN     NOT NULL DEFAULT true,
  sort_order       INTEGER     NOT NULL DEFAULT 0,

  created_by       UUID        REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES profiles(id)
);

CREATE TRIGGER trg_store_items_updated_at
  BEFORE UPDATE ON store_items
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_store_items_org
  ON store_items(organization_id, is_active, sort_order);

ALTER TABLE store_items ENABLE ROW LEVEL SECURITY;

-- Finance-view can read the catalog
CREATE POLICY "store_items_select"
  ON store_items FOR SELECT
  USING (has_finance_view_access(organization_id));

-- Finance-manage can create/update catalog items (no hard delete)
CREATE POLICY "store_items_insert"
  ON store_items FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

CREATE POLICY "store_items_update"
  ON store_items FOR UPDATE
  USING (has_finance_manage_access(organization_id));

-- ── orders ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Billing recipient: the guardian who placed / will receive the invoice
  family_account_id UUID       NOT NULL REFERENCES family_finance_accounts(id) ON DELETE RESTRICT,

  -- Order lifecycle
  -- draft       → being assembled, no invoice number yet
  -- invoiced    → invoice issued and sent (or ready to send), items locked
  -- partial     → at least one payment recorded, balance > 0
  -- paid        → fully paid
  -- cancelled   → voided before or after invoicing (with reason)
  order_status     TEXT        NOT NULL DEFAULT 'draft'
                               CHECK (order_status IN ('draft','invoiced','partial','paid','cancelled')),

  -- Fulfillment is tracked independently of payment
  -- Items can be delivered before payment is complete, or vice versa
  fulfillment_status TEXT      NOT NULL DEFAULT 'pending'
                               CHECK (fulfillment_status IN ('pending','partial','fulfilled')),

  -- Invoice fields — populated when status transitions to 'invoiced'
  invoice_number   TEXT        UNIQUE,   -- e.g. RLA-2027-0001; NULL while draft
  invoice_date     DATE,
  due_date         DATE,

  -- Invoice tracking
  invoice_sent_at  TIMESTAMPTZ,
  invoice_sent_by  UUID        REFERENCES profiles(id),
  invoice_sent_to  TEXT,       -- email address at time of send

  -- Cancellation
  cancelled_at     TIMESTAMPTZ,
  cancelled_by     UUID        REFERENCES profiles(id),
  cancel_reason    TEXT,

  -- Fulfilment
  fulfilled_at     TIMESTAMPTZ,
  fulfilled_by     UUID        REFERENCES profiles(id),

  -- Staff notes
  notes            TEXT,

  created_by       UUID        REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES profiles(id)
);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_orders_org
  ON orders(organization_id, order_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_family_account
  ON orders(family_account_id);

CREATE INDEX IF NOT EXISTS idx_orders_invoice_number
  ON orders(invoice_number) WHERE invoice_number IS NOT NULL;

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_staff"
  ON orders FOR SELECT
  USING (has_finance_view_access(organization_id));

CREATE POLICY "orders_insert"
  ON orders FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

CREATE POLICY "orders_update"
  ON orders FOR UPDATE
  USING (has_finance_manage_access(organization_id));

-- ── order_items ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Source catalog item (nullable: item may be deleted from catalog later)
  store_item_id    UUID        REFERENCES store_items(id) ON DELETE SET NULL,

  -- Price and description are SNAPSHOTTED at order creation.
  -- Catalog changes after ordering do not affect existing line items.
  item_name        TEXT        NOT NULL CHECK (char_length(item_name) BETWEEN 1 AND 200),
  size             TEXT,       -- NULL if item has no sizes
  quantity         INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER     NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents INTEGER     NOT NULL
                               GENERATED ALWAYS AS (quantity * unit_price_cents) STORED,

  -- Optional: which student this item is for
  -- NULL means it's a family-level purchase (e.g. donation, general supplies)
  student_id       UUID        REFERENCES students(id) ON DELETE SET NULL,

  -- Soft-void: an item can be removed from an order without deleting the row.
  -- This preserves the audit trail while zeroing the line total for calculations.
  -- Voided items are excluded from subtotal queries.
  is_voided        BOOLEAN     NOT NULL DEFAULT false,
  voided_at        TIMESTAMPTZ,
  voided_by        UUID        REFERENCES profiles(id),
  void_reason      TEXT,

  created_by       UUID        REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No updated_at: line items are immutable once the order is invoiced.
  -- In draft: items may be added or voided, but not edited (void + re-add).
);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_id) WHERE NOT is_voided;

CREATE INDEX IF NOT EXISTS idx_order_items_org
  ON order_items(organization_id);

CREATE INDEX IF NOT EXISTS idx_order_items_student
  ON order_items(student_id) WHERE student_id IS NOT NULL;

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_select_staff"
  ON order_items FOR SELECT
  USING (has_finance_view_access(organization_id));

CREATE POLICY "order_items_insert"
  ON order_items FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

-- Voiding is an update (is_voided = true); only allowed by finance-manage
CREATE POLICY "order_items_update"
  ON order_items FOR UPDATE
  USING (has_finance_manage_access(organization_id));

-- ── Guard: prevent editing locked orders ──────────────────────────────────
-- Items cannot be added to a non-draft order.
-- Items in a non-draft order can only be voided, not added.
-- Enforced at the application layer in server actions; this trigger is defense-in-depth.

CREATE OR REPLACE FUNCTION prevent_order_item_on_locked_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT order_status INTO v_status FROM orders WHERE id = NEW.order_id;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'order_items_locked: cannot add items to order % with status %',
      NEW.order_id, v_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_items_lock_check
  BEFORE INSERT ON order_items
  FOR EACH ROW EXECUTE FUNCTION prevent_order_item_on_locked_order();

-- ── Helper: compute order subtotal from active line items ─────────────────
-- Returns the sum of non-voided line totals for an order.
-- Use this in server actions and reports; do not store the subtotal.

CREATE OR REPLACE FUNCTION get_order_subtotal(p_order_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(SUM(line_total_cents), 0)::INTEGER
  FROM   order_items
  WHERE  order_id  = p_order_id
    AND  is_voided = false;
$$;

-- ── Helper: invoice number sequence ───────────────────────────────────────
-- Called when an order transitions draft → invoiced.
-- Format: {org_short_name}-{YYYY}-{zero-padded 4-digit seq}
-- Each org has its own counter, reset per calendar year.

CREATE TABLE IF NOT EXISTS invoice_sequences (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year             INTEGER     NOT NULL,
  last_seq         INTEGER     NOT NULL DEFAULT 0,
  UNIQUE (organization_id, year)
);

ALTER TABLE invoice_sequences ENABLE ROW LEVEL SECURITY;

-- Finance-manage can read/update the sequence (needed by generate function)
CREATE POLICY "invoice_seq_select"
  ON invoice_sequences FOR SELECT
  USING (has_finance_manage_access(organization_id));

CREATE POLICY "invoice_seq_insert"
  ON invoice_sequences FOR INSERT
  WITH CHECK (has_finance_manage_access(organization_id));

CREATE POLICY "invoice_seq_update"
  ON invoice_sequences FOR UPDATE
  USING (has_finance_manage_access(organization_id));

CREATE OR REPLACE FUNCTION generate_invoice_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year    INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_seq     INTEGER;
  v_short   TEXT;
BEGIN
  -- Upsert the sequence row and atomically increment
  INSERT INTO invoice_sequences (organization_id, year, last_seq)
  VALUES (p_org_id, v_year, 1)
  ON CONFLICT (organization_id, year)
  DO UPDATE SET last_seq = invoice_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  SELECT COALESCE(NULLIF(TRIM(short_name), ''), 'INV')
  INTO   v_short
  FROM   organizations
  WHERE  id = p_org_id;

  RETURN upper(v_short) || '-' || v_year || '-' || lpad(v_seq::TEXT, 4, '0');
END;
$$;

-- ── Guard: immutable items once invoiced ──────────────────────────────────
-- Once an order is invoiced, existing items can only be voided (is_voided = true).
-- Staff may not change quantity, size, or price after invoicing.

CREATE OR REPLACE FUNCTION prevent_order_item_edit_after_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT order_status INTO v_status FROM orders WHERE id = NEW.order_id;
  -- Allow only the void fields to change post-invoice
  IF v_status <> 'draft' THEN
    IF (NEW.quantity         <> OLD.quantity         OR
        NEW.unit_price_cents <> OLD.unit_price_cents OR
        NEW.item_name        <> OLD.item_name        OR
        NEW.size             IS DISTINCT FROM OLD.size OR
        NEW.student_id       IS DISTINCT FROM OLD.student_id) THEN
      RAISE EXCEPTION 'order_items_immutable: cannot edit item fields on order % with status %',
        NEW.order_id, v_status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_order_items_immutable
  BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION prevent_order_item_edit_after_invoice();
