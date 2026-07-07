-- ── Stage 3D.3: Medical Management v2 ────────────────────────────────────────
-- Creates student_allergies, student_conditions tables.
-- Extends medication_alerts and student_medical with new columns.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── student_allergies ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_allergies (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id                  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  allergy_name                text NOT NULL,
  reaction                    text,
  severity                    text NOT NULL CHECK (severity IN ('mild','moderate','severe','life_threatening')),
  emergency_medication_required boolean NOT NULL DEFAULT false,
  notes                       text,
  is_active                   boolean NOT NULL DEFAULT true,
  archived_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_allergies_student ON student_allergies(student_id);
CREATE INDEX IF NOT EXISTS idx_student_allergies_org ON student_allergies(organization_id);
CREATE INDEX IF NOT EXISTS idx_student_allergies_severity ON student_allergies(organization_id, severity) WHERE is_active = true AND archived_at IS NULL;

ALTER TABLE student_allergies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_member_select_allergies" ON student_allergies
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "org_member_insert_allergies" ON student_allergies
  FOR INSERT WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_member_update_allergies" ON student_allergies
  FOR UPDATE USING (is_org_member(organization_id));

-- ── student_conditions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_conditions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id                  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  condition_name              text NOT NULL,
  description                 text,
  emergency_action_needed     boolean NOT NULL DEFAULT false,
  action_instructions         text,
  notes                       text,
  is_active                   boolean NOT NULL DEFAULT true,
  archived_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_conditions_student ON student_conditions(student_id);
CREATE INDEX IF NOT EXISTS idx_student_conditions_org ON student_conditions(organization_id);
CREATE INDEX IF NOT EXISTS idx_student_conditions_emergency ON student_conditions(organization_id) WHERE emergency_action_needed = true AND is_active = true AND archived_at IS NULL;

ALTER TABLE student_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_member_select_conditions" ON student_conditions
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "org_member_insert_conditions" ON student_conditions
  FOR INSERT WITH CHECK (is_org_member(organization_id));

CREATE POLICY "org_member_update_conditions" ON student_conditions
  FOR UPDATE USING (is_org_member(organization_id));

-- ── Extend medication_alerts ──────────────────────────────────────────────────
ALTER TABLE medication_alerts
  ADD COLUMN IF NOT EXISTS schedule         text,
  ADD COLUMN IF NOT EXISTS stored_on_campus boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at      timestamptz;

-- ── Extend student_medical ────────────────────────────────────────────────────
ALTER TABLE student_medical
  ADD COLUMN IF NOT EXISTS preferred_hospital text;
