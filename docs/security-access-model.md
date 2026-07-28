# SchoolCo — Security Access Model

Last updated: 2026-07-27
Maintained by: Engineering

---

## Roles

| Role | Description | Counts as Staff? |
|---|---|---|
| `platform_admin` | Cross-org super-admin | ✅ Yes |
| `full_admin` | Full org admin (settings, billing) | ✅ Yes |
| `admin` | Org admin (users, reports) | ✅ Yes |
| `registrar` | Enrollment management | ✅ Yes |
| `staff` | General staff | ✅ Yes |
| `teacher` | Classroom teacher | ✅ Yes |
| `volunteer` | Limited helper role | ⚠️ Partial (see below) |
| `parent` | Guardian of enrolled student | ❌ No |
| `student_future` | Future student (pre-enrollment) | ❌ No |

### Staff definition

`is_staff_or_above(org_id)` returns true for: `teacher`, `staff`, `registrar`, `admin`, `full_admin`, `platform_admin`.

Volunteers are **not** included in `is_staff_or_above()`.

---

## Organization Isolation

Every row in every student-facing table carries `organization_id`. All RLS policies enforce `organization_id` scope — either through a helper function or an inline membership check. No cross-org data leakage is possible at the database layer.

---

## Parent Access Rules

Parents are authenticated Supabase users with `role = 'parent'` in `organization_members`.

Parents may only read data for their own linked children. The database helper function `get_guardian_student_ids(org_id uuid)` returns the `student_id` set for which the current user has an active `guardianships` row in the given org.

### Tables where parents have intentionally scoped SELECT

| Table | Condition | Policy name |
|---|---|---|
| `attendance_records` | Any status — own children only | `parent_select_attendance` |
| `academic_progress` | `parent_visible = true` + own children | `parent_select_progress` |
| `student_goals` | `visibility = 'parent_visible'` + own children | `parent_select_goals` |
| `student_allergies` | Own children only | `parent_select_allergies` |
| `student_conditions` | Own children only | `parent_select_conditions` |
| `yearbook_portfolios` | `status = 'published'` + own children | `parent_select_yearbook` |
| `students` | Own linked children (guardianship) | (from migration 00004) |
| `guardianships` | Own rows only | (from migration 00004) |
| `families` | Own family via household membership | (from migration 00006) |
| `households` | Own household via membership | (from migration 00006) |
| `timeline_entries` | Own children only | (from migration 00008) |
| `org_settings` | Any active member (no PII) | (from migration 00010) |

Parents have **no INSERT, UPDATE, or DELETE** on any of the above tables.

---

## Staff-Only Tables

The following tables are restricted to `is_staff_or_above()` at the RLS level. Parents, volunteers, and student_future accounts receive empty result sets.

| Table | Notes |
|---|---|
| `incidents` | All incident reports |
| `medication_alerts` | Active medication instructions |
| `student_documents` | Uploaded documents |
| `student_drive_folders` | Drive folder metadata |
| `work_samples` | Student work uploads |
| `leadership_badges` | Badge awards |
| `entrepreneurship_projects` | Project records |
| `student_medical` | Doctor, insurance, conditions |
| `service_hours` | Service hour logs |
| `student_goals` (write) | Goals can be written by staff only |
| `support_flags` | Internal escalation flags |
| `curriculum_enrollments` | Curriculum enrollment records |
| `staff_notes` | Staff-only notes on students |
| `staff_compliance_records` | Background checks, training records |
| `staff_compliance_requirements` | Compliance requirement definitions |
| `assessments` | Assessment records |
| `learning_profiles` | Learning style profiles |
| `growth_goals`, `support_strategies`, `ssp_timeline`, `intervention_sessions` | SSP components |
| `success_plan_family_vision` | Family vision from SSP |
| `import_jobs` | Admin+ only |
| `audit_logs` | Admin+ only |

---

## Volunteer Access Rules

Volunteers are logged-in users with `role = 'volunteer'`.

| Area | Access |
|---|---|
| `attendance_records` INSERT/UPDATE | ✅ Yes — check-in kiosk use |
| `attendance_records` SELECT | ❌ No — read is staff-only |
| Medical tables | ❌ None |
| Student documents | ❌ None |
| Staff compliance | ❌ None |
| QR attendance endpoint | ✅ Yes — restricted response (see below) |

---

## QR Attendance Endpoint (`GET /api/attendance/qr/[token]`)

Response fields differ by role.

### Staff response (teacher, staff, registrar, admin, full_admin, platform_admin)

```
student.id, first_name, last_name, preferred_name, grade_level,
medical_notes, allergies[], authorized_pickup_notes
today_record: { status, check_in_at, check_out_at, is_late, is_early_pickup }
medication_alerts[]: { medication_name, dosage, instructions, is_emergency, storage_location }
allergy_details[]: { allergy_name, severity, emergency_medication_required, reaction }
alert_summary: { critical, high, alerts[] }
```

### Volunteer response (volunteer)

```
student.id, first_name, last_name, preferred_name, grade_level
today_record: { status, check_in_at, check_out_at, is_late, is_early_pickup }
has_critical_alert: boolean
critical_alert_message: string | null  ("See authorized staff immediately" if true)
```

No medical details, medication names, allergy specifics, or internal notes.

### Security controls on the endpoint

- Authentication required (401 if no session)
- Staff or volunteer role required (403 otherwise)
- Token must match `ATT-[A-Za-z0-9_-]+` pattern (404 for invalid format)
- Student must be enrolled in caller's active org (404 for mismatch)
- Rate limit: 120 requests/minute per user (per-instance; add Redis for distributed enforcement)
- `Cache-Control: no-store, private` on all responses
- Token values are never written to logs
- Generic 404 for both bad tokens and org mismatches (no enumeration signal)

---

## Helper Functions

### `is_org_member(org_id uuid) → boolean`
Returns true for **any** active member including parents, volunteers, student_future.
**DO NOT use alone** as a guard on sensitive tables.

### `is_staff_or_above(org_id uuid) → boolean`
Returns true for teacher, staff, registrar, admin, full_admin, platform_admin.
Use this for staff-only tables.

### `is_org_admin(org_id uuid) → boolean`
Returns true for admin, full_admin, platform_admin.

### `is_full_admin_or_above(org_id uuid) → boolean`
Returns true for full_admin, platform_admin.

### `has_min_org_role(org_id uuid, min_role text) → boolean`
Hierarchical check. Use for registrar+ gates.

### `get_guardian_student_ids(org_id uuid) → setof uuid`
Returns student IDs where the current user has an active guardianship.
Use in parent-facing SELECT policies.

---

## The Core Rule

> `is_org_member()` alone **must never** be used on a table that contains student PII, medical data, incident reports, internal staff notes, compliance records, or any data parents should not see.

Every new migration that adds RLS policies must be reviewed against this rule. Run `npm run audit:rls` to detect violations automatically.

---

## Running the RLS Regression Tests

### Policy audit (no credentials needed — queries production policy catalog)

```bash
npm run audit:rls
```

This runs `tests/security/rls-policy-audit.sql` against the production database and returns any policies still using `is_org_member()` on sensitive tables. Zero rows is the correct result.

### Full regression test (requires test account credentials)

1. Add test account environment variables to `.env.local`:

```
TEST_PARENT_A_EMAIL=...
TEST_PARENT_A_PASSWORD=...
TEST_PARENT_B_EMAIL=...
TEST_PARENT_B_PASSWORD=...
TEST_TEACHER_EMAIL=...
TEST_TEACHER_PASSWORD=...
TEST_VOLUNTEER_EMAIL=...
TEST_VOLUNTEER_PASSWORD=...
TEST_ORG_ID=...
TEST_ORG_B_ID=...
TEST_PARENT_A_STUDENT_ID=...
TEST_PARENT_B_STUDENT_ID=...
```

2. Create these accounts in Supabase dashboard with synthetic (non-PII) student data.

3. Run:

```bash
npm run test:security
```

Tests exercise actual RLS — not mocks, not middleware, not server action auth checks. Each test signs in as the target role and attempts a direct Supabase client query.

---

## What Changed — Migration History

| Migration | Change |
|---|---|
| 00002 | Defined `is_org_member`, `is_staff_or_above`, `has_min_org_role`, etc. |
| 00004 | Guardianship RLS — parents see only own-child rows |
| 00006 | Family/household RLS — parents scoped to own family |
| 00022 | Tightened `assessments` to staff-only |
| 00023 | Tightened `academic_progress` to staff-only |
| 00025 | Tightened `staff_notes` to staff-only (was previously broken) |
| **00030** | **CRITICAL FIX — Replaced is_org_member() on 16 tables with is_staff_or_above() or get_guardian_student_ids() scoped parent policies** |
| **00031** | **Fixed yearbook_portfolios — staff-only write, parents see only published portfolios for own children** |
