-- Migration 00093: Fix invoice number format to use school year end year
--
-- Problem: generate_invoice_number() used EXTRACT(YEAR FROM now()) = calendar year.
-- For school year 2026-2027, this produces RLA-2026-0001 instead of RLA-2027-0001.
--
-- Fix: look up the current school year's end_date for the org and use its year.
-- Falls back to calendar year if no current school year is found.
--
-- Also fixes the fallback short_name: use 'SCH' instead of 'INV' for unknown orgs.
-- (The 'INV' value appeared in tests only because a fake org UUID was used.)

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
  -- Use the end year of the active school year for this org.
  -- Example: school year 2026-2027 has end_date ~ 2027-06-30 → year 2027.
  SELECT EXTRACT(YEAR FROM end_date)::INTEGER INTO v_year
  FROM   school_years
  WHERE  organization_id = p_org_id
    AND  is_current = true
  LIMIT 1;

  IF v_year IS NULL THEN
    v_year := EXTRACT(YEAR FROM now())::INTEGER;
  END IF;

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
