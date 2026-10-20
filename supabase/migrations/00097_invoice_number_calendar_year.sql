-- Migration 00097: Revert invoice number year to calendar year
--
-- Problem: migration 00093 changed generate_invoice_number() to use the
-- school year's end_date (e.g. 2027 for the 2026-2027 academic year).
-- An invoice issued in October 2026 received number RLA-2027-0002.
--
-- Fix: use EXTRACT(YEAR FROM now()) — the calendar year at issuance.
-- An invoice issued in October 2026 will now receive RLA-2026-NNNN.
-- An invoice issued in January 2027 will receive RLA-2027-NNNN.
--
-- Affected invoices: 1 existing invoice (RLA-2027-0002, issued 2026-10-20).
-- That invoice is NOT renumbered here. Staff must approve renumbering
-- separately if desired.
--
-- Sequence state after this migration:
--   year=2027, last_seq=2  — kept intact (used for 2027 invoices later)
--   year=2026 row         — will be created on next 2026 invoice issuance

CREATE OR REPLACE FUNCTION generate_invoice_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year    INTEGER;
  v_seq     INTEGER;
  v_short   TEXT;
BEGIN
  -- Use the calendar year of the invoice issue date.
  v_year := EXTRACT(YEAR FROM now())::INTEGER;

  -- Atomically increment the per-org per-year counter.
  -- UPSERT ensures concurrent callers get unique sequence values.
  INSERT INTO invoice_sequences (organization_id, year, last_seq)
  VALUES (p_org_id, v_year, 1)
  ON CONFLICT (organization_id, year)
  DO UPDATE SET last_seq = invoice_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;

  -- Org short name (e.g. "RLA") — trimmed and uppercased.
  SELECT COALESCE(NULLIF(TRIM(short_name), ''), 'SCH')
  INTO   v_short
  FROM   organizations
  WHERE  id = p_org_id;

  RETURN upper(v_short) || '-' || v_year || '-' || lpad(v_seq::TEXT, 4, '0');
END;
$$;
