-- Migration 00072: Guardian read-only access to their children's finance data
-- Parents/guardians can see charges, adjustments, and payments for students
-- they are actively linked to via guardianships. No write access.

-- ── guardian finance SELECT helper ───────────────────────────────────────────
-- Returns true if the current user is an active guardian of the given student
-- within the given org.

CREATE OR REPLACE FUNCTION is_guardian_of_student(org_id uuid, s_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   guardianships g
    JOIN   profiles p ON p.id = g.profile_id
    WHERE  g.organization_id = org_id
      AND  g.student_id      = s_id
      AND  g.status          = 'active'
      AND  g.archived_at     IS NULL
      AND  p.auth_user_id    = auth.uid()
  );
$$;

-- ── student_charges ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "guardian_view_student_charges" ON student_charges;
CREATE POLICY "guardian_view_student_charges"
  ON student_charges FOR SELECT
  USING (is_guardian_of_student(organization_id, student_id));

-- ── charge_adjustments ────────────────────────────────────────────────────────
-- Adjustments don't have student_id — join through the charge.
DROP POLICY IF EXISTS "guardian_view_charge_adjustments" ON charge_adjustments;
CREATE POLICY "guardian_view_charge_adjustments"
  ON charge_adjustments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM student_charges sc
      WHERE sc.id = charge_id
        AND is_guardian_of_student(sc.organization_id, sc.student_id)
    )
  );

-- ── student_payments ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "guardian_view_student_payments" ON student_payments;
CREATE POLICY "guardian_view_student_payments"
  ON student_payments FOR SELECT
  USING (is_guardian_of_student(organization_id, student_id));

-- ── payment_allocations ───────────────────────────────────────────────────────
-- Already joins through student_payments; add guardian path.
DROP POLICY IF EXISTS "guardian_view_payment_allocations" ON payment_allocations;
CREATE POLICY "guardian_view_payment_allocations"
  ON payment_allocations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM student_payments sp
      WHERE sp.id = payment_id
        AND is_guardian_of_student(sp.organization_id, sp.student_id)
    )
  );
