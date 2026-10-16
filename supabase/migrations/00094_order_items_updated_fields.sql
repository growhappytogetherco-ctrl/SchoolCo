-- Migration 00094: Add updated_by / updated_at to order_items
--
-- The order_items table was created without audit columns for updates.
-- updateOrderItem() writes updated_by; without this column the action fails.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by  UUID        REFERENCES auth.users(id);
