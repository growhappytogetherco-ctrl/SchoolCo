-- ════════════════════════════════════════════════════════════════
-- 00011 — Student Profile System
-- New tables: staff_notes, student_medical, service_hours
-- student ALTER: add avatar_url
-- ════════════════════════════════════════════════════════════════

-- ── Students: add photo URL ───────────────────────────────────
ALTER TABLE students ADD COLUMN IF NOT EXISTS avatar_url text;

-- ════════════════════════════════════════════════════════════════
-- staff_notes
-- Private internal notes. Never surfaced to parents under any path.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE staff_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id)      ON DELETE CASCADE,
  author_id       uuid NOT NULL REFERENCES profiles(id),
  category        text NOT NULL DEFAULT 'general'
    CHECK (category IN ('academic','behavioral','health','safety','family','attendance','general')),
  priority        text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  title           text,
  body            text NOT NULL,
  is_pinned       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_notes_student ON staff_notes (student_id);
CREATE INDEX idx_staff_notes_org     ON staff_notes (organization_id, created_at DESC);

CREATE TRIGGER staff_notes_updated_at
  BEFORE UPDATE ON staff_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE staff_notes ENABLE ROW LEVEL SECURITY;

-- Any org member can read/create notes for their org
CREATE POLICY "staff_notes_select"
  ON staff_notes FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "staff_notes_insert"
  ON staff_notes FOR INSERT
  WITH CHECK (is_org_member(organization_id));

-- Author can edit own note; admins can edit any
CREATE POLICY "staff_notes_update"
  ON staff_notes FOR UPDATE
  USING (author_id = auth.uid() OR is_org_admin(organization_id));

CREATE POLICY "staff_notes_delete"
  ON staff_notes FOR DELETE
  USING (author_id = auth.uid() OR is_org_admin(organization_id));

-- ════════════════════════════════════════════════════════════════
-- student_medical
-- One row per student. Structured doctor, insurance, conditions.
-- Complements students.allergies + students.medical_notes.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE student_medical (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id            uuid UNIQUE NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  primary_doctor_name   text,
  primary_doctor_phone  text,
  primary_doctor_fax    text,
  insurance_provider    text,
  insurance_policy_number text,
  insurance_group_number  text,
  insurance_phone       text,
  medical_conditions    text[] NOT NULL DEFAULT '{}',
  special_accommodations text[] NOT NULL DEFAULT '{}',
  notes                 text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES profiles(id)
);

CREATE INDEX idx_student_medical_student ON student_medical (student_id);

ALTER TABLE student_medical ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_medical_select"
  ON student_medical FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "student_medical_write"
  ON student_medical FOR ALL
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ════════════════════════════════════════════════════════════════
-- service_hours
-- Community service tracking for the Leadership tab.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE service_hours (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL REFERENCES students(id)      ON DELETE CASCADE,
  activity_name    text NOT NULL,
  organization_name text,
  hours            numeric(5,2) NOT NULL CHECK (hours > 0),
  service_date     date NOT NULL,
  description      text,
  verified         boolean NOT NULL DEFAULT false,
  verified_by      uuid REFERENCES profiles(id),
  verified_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES profiles(id)
);

CREATE INDEX idx_service_hours_student ON service_hours (student_id, service_date DESC);

ALTER TABLE service_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_hours_all"
  ON service_hours FOR ALL
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));
