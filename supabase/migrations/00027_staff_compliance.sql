-- Stage 3D.4 — Staff Compliance Tracking & Admin Alerts
-- Creates staff_compliance_records and staff_compliance_requirements tables

-- ── staff_compliance_records ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_compliance_records (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_member_id         uuid NOT NULL REFERENCES staff_roster(id) ON DELETE CASCADE,

  requirement_type        text NOT NULL,
  custom_requirement_name text,

  verification_status     text NOT NULL DEFAULT 'not_started',
  completion_date         date,
  expiration_date         date,
  verified_at             timestamptz,
  verified_by             uuid REFERENCES profiles(id) ON DELETE SET NULL,
  credential_number       text,
  provider_name           text,
  notes                   text,
  document_url            text,
  reminder_enabled        boolean NOT NULL DEFAULT false,

  created_by              uuid REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by              uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  archived_at             timestamptz,

  CONSTRAINT chk_requirement_type CHECK (requirement_type IN (
    'background_screening','child_safety_training','cpr_certification',
    'first_aid_certification','mandated_reporter_training','volunteer_orientation',
    'staff_handbook_acknowledgment','confidentiality_agreement',
    'emergency_procedures_training','other'
  )),
  CONSTRAINT chk_verification_status CHECK (verification_status IN (
    'not_started','pending','current','expiring_soon','expired','waived','not_required'
  ))
);

ALTER TABLE staff_compliance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_records_select" ON staff_compliance_records
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "compliance_records_insert" ON staff_compliance_records
  FOR INSERT WITH CHECK (is_org_member(organization_id));

CREATE POLICY "compliance_records_update" ON staff_compliance_records
  FOR UPDATE USING (is_org_member(organization_id));

-- Indexes
CREATE INDEX idx_compliance_records_staff ON staff_compliance_records (staff_member_id, archived_at);
CREATE INDEX idx_compliance_records_org_status ON staff_compliance_records (organization_id, verification_status)
  WHERE archived_at IS NULL;
CREATE INDEX idx_compliance_records_expiry ON staff_compliance_records (organization_id, expiration_date)
  WHERE archived_at IS NULL;

-- updated_at trigger
CREATE TRIGGER handle_updated_at_compliance_records
  BEFORE UPDATE ON staff_compliance_records
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ── staff_compliance_requirements ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS staff_compliance_requirements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  staff_type        text NOT NULL,
  requirement_type  text NOT NULL,
  is_required       boolean NOT NULL DEFAULT true,
  reminder_days     int NOT NULL DEFAULT 30,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE(organization_id, staff_type, requirement_type)
);

ALTER TABLE staff_compliance_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_req_select" ON staff_compliance_requirements
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "compliance_req_insert" ON staff_compliance_requirements
  FOR INSERT WITH CHECK (is_org_member(organization_id));

CREATE POLICY "compliance_req_update" ON staff_compliance_requirements
  FOR UPDATE USING (is_org_member(organization_id));

CREATE INDEX idx_compliance_requirements_org ON staff_compliance_requirements (organization_id, staff_type);

CREATE TRIGGER handle_updated_at_compliance_requirements
  BEFORE UPDATE ON staff_compliance_requirements
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
