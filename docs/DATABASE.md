# SchoolCo — Database Architecture

**Version:** 0.1.1 (updated pre-Sprint 1)
**Last updated:** 2026-06-25
**Database:** PostgreSQL (Supabase managed)
**Project:** schoolco-dev → schoolco-staging → schoolco-production

---

## Overview

Every table in SchoolCo is multi-tenant by default. `organization_id` is a required
foreign key on every table except `organizations` and `profiles` themselves.
Row Level Security (RLS) is enabled on all tables from day one. Default policy is DENY.
No data is accessible unless an explicit RLS policy allows it.

Records are **never deleted**. Archival is done by setting `archived_at`. This is a
compliance requirement for student records and an audit requirement for all platform data.

---

## Standard Column Pattern

Every table (except `organizations` and `profiles`) follows this exact column order at the top:

```sql
id               uuid          default uuid_generate_v4() primary key,
organization_id  uuid          not null references organizations(id) on delete cascade,
created_at       timestamptz   default now() not null,
created_by       uuid          references profiles(id),
updated_at       timestamptz   default now() not null,
updated_by       uuid          references profiles(id),
status           text          default 'active' not null,
archived_at      timestamptz,
archived_by      uuid          references profiles(id),
```

`status` is application-level state (e.g., `active`, `pending`, `suspended`). `archived_at`
is the soft-delete timestamp. Both must be checked in application queries when filtering
for active records.

---

## Enums

### user_role
Roles ordered from lowest to highest privilege:

```sql
create type user_role as enum (
  'student_future',   -- Future student (pre-enrollment portal access)
  'parent',           -- Guardian of an enrolled student
  'volunteer',        -- Community volunteer with limited access
  'teacher',          -- Classroom teacher
  'staff',            -- Non-teaching staff
  'registrar',        -- Enrollment and records management
  'admin',            -- Organization administrator
  'full_admin',       -- Full organizational control (Director level)
  'platform_admin'    -- SchoolCo platform-level superadmin
);
```

Role hierarchy is enforced in `has_min_org_role()` using `array_position()`. If a new
role is added to this enum, the comparison array in that function must also be updated
and validated by a test.

### membership_status
```sql
create type membership_status as enum (
  'invited',    -- Invitation sent, not yet accepted
  'active',     -- Full access
  'suspended',  -- Temporarily blocked
  'removed'     -- Permanently removed (record preserved)
);
```

### relationship_type *(Sprint 1)*
```sql
create type relationship_type as enum (
  'mother', 'father', 'stepmother', 'stepfather',
  'grandmother', 'grandfather', 'aunt', 'uncle',
  'foster_parent', 'legal_guardian', 'other'
);
```

### custody_type *(Sprint 1)*
```sql
create type custody_type as enum (
  'primary',    -- Lives primarily with this guardian
  'joint',      -- Shared custody
  'secondary',  -- Visits / alternating weekends
  'supervised', -- Staff must supervise visits — alert flag
  'none'        -- Emergency contact only, no custody
);
```

### enrollment_status *(Sprint 1)*
```sql
create type enrollment_status as enum (
  'applicant', 'waitlisted', 'enrolled',
  'withdrawn', 'graduated', 'expelled'
);
```

---

## Tables

### organizations

The root tenant table. Every other table references this via `organization_id`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | Full name: "Rising Leaders Academy" |
| short_name | text | Abbreviated: "RLA" |
| slug | text | URL slug: "rising-leaders-academy". Unique. |
| organization_type | text | "academy", "foundation", "program", "church", "co-op", "other" |
| tagline | text | One-line mission statement, displayed everywhere |
| logo_url | text | Supabase Storage URL |
| primary_color | text | Hex color |
| secondary_color | text | Hex color |
| accent_color | text | Hex color |
| phone | text | |
| email | text | |
| website | text | |
| address | jsonb | `{street1, street2?, city, state, zip, country}` |
| timezone | text | IANA timezone string, e.g. "America/New_York" |
| is_active | boolean | |
| theme_json | jsonb | Custom theme overrides (Sprint 2+) |
| settings_json | jsonb | Feature flags and org-level settings |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**settings_json structure:**
```json
{
  "features": {
    "attendance": true, "grades": true, "communications": true,
    "giving": true, "badge_studio": true, "qr_checkin": true, "ai_assist": false
  },
  "enrollment": {
    "require_approval": true, "open_enrollment": false, "max_students": 120
  }
}
```

---

### profiles

Auto-created by `handle_new_user()` database trigger when a user signs up.
One profile per Supabase auth user — shared across all organizations.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK — matches `auth.users.id` exactly |
| email | text | Synced from auth.users |
| full_name | text | Display name |
| avatar_url | text | Supabase Storage URL |
| phone | text | Personal phone |
| created_at | timestamptz | |
| updated_at | timestamptz | |

`profiles` has no `organization_id`. Org membership is granted via `organization_members`.

---

### organization_members

Links a profile to an organization with a specific role. One row per (org, profile) pair.
Unique constraint: `(organization_id, profile_id)`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK → organizations |
| profile_id | uuid | FK → profiles |
| role | user_role | |
| status | membership_status | |
| invited_by | uuid | FK → profiles |
| joined_at | timestamptz | When invitation was accepted |
| created_at | timestamptz | |
| updated_at | timestamptz | |

---

### audit_logs

Append-only by RLS design. No UPDATE or DELETE policies exist — those operations
are denied by default. This is enforced at the database level, not the application layer.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK → organizations (null = platform action) |
| actor_id | uuid | FK → profiles |
| action | text | Dot-notation: "member.invited", "auth.sign_in", "student.enrolled" |
| entity_type | text | Table name of the affected record |
| entity_id | uuid | The affected record's ID |
| previous_values | jsonb | State before the change |
| new_values | jsonb | State after the change |
| ip_address | text | From x-forwarded-for |
| user_agent | text | Browser/device string |
| device | text | Parsed device type |
| session_id | text | Supabase auth session ID |
| created_at | timestamptz | |

Visible to `full_admin` and `platform_admin` only.

---

### students *(Sprint 1 — migration 00004)*

Enrolled and prospective students. Intentionally minimal. Health data goes in
`health_records` (Sprint 3) with a separate, stricter RLS policy.

| Column | Type | Notes |
|--------|------|-------|
| [standard columns] | | |
| first_name | text | |
| last_name | text | |
| preferred_name | text | Nickname shown in UI |
| grade_level | text | "K", "1st", "3rd" — flexible text, not enum |
| enrollment_status | enrollment_status | |
| enrollment_date | date | |
| expected_graduation | date | |
| track | text | "classical", "entrepreneurship", etc. |
| homeroom_teacher | uuid | FK → profiles |

No DOB, SSN, or medical data in this table.

---

### guardianships *(Sprint 1 — migration 00004)*

One row per (guardian, student) pair. Core of split-household support.
See ADR-0002 for the full design rationale.

| Column | Type | Notes |
|--------|------|-------|
| [standard columns] | | |
| profile_id | uuid | FK → profiles (the guardian) |
| student_id | uuid | FK → students |
| relationship_type | relationship_type | |
| household_label | text | "Johnson Family – Primary" |
| custody_type | custody_type | |
| is_legal_guardian | boolean | |
| court_order_on_file | boolean | Staff-visible only |
| court_order_notes | text | **Staff-only** — stripped from parent-facing queries |
| is_primary_contact | boolean | |
| is_emergency_contact | boolean | |
| emergency_contact_order | smallint | 1 = first to call |
| can_pickup | boolean | Indexed — physical safety |
| pickup_restrictions | text | Staff-visible notes |
| visibility_json | jsonb | Per-field access flags per guardian |
| communication_json | jsonb | Email/SMS/app notification preferences |

**visibility_json:**
```json
{
  "academics": true, "attendance": true, "report_cards": true,
  "communications": true, "health_records": true,
  "incidents": true, "behavior_notes": true
}
```

---

## RLS Helper Functions

All functions are `SECURITY DEFINER STABLE` and live in the `public` schema.

| Function | What it checks |
|----------|---------------|
| `is_org_member(org_id)` | Current user has any active membership in the org |
| `has_org_role(org_id, role)` | Current user has exactly this role in the org |
| `is_org_admin(org_id)` | Role is admin or above |
| `is_full_admin_or_above(org_id)` | Role is full_admin or platform_admin |
| `is_platform_admin()` | Role is platform_admin in any org |
| `is_staff_or_above(org_id)` | Role is staff, registrar, admin, full_admin, or platform_admin |
| `has_min_org_role(org_id, min_role)` | Role rank is >= the specified minimum role |
| `is_guardian_of(student_id)` | Current user has an active guardianship row for this student |
| `can_view_student(student_id, field)` | Checks visibility_json for the specified field |

---

## Planned Tables (Future Sprints)

| Table | Sprint | Purpose |
|-------|--------|---------|
| `enrollments` | 1 | Formal enrollment applications and approval workflow |
| `announcements` | 2 | Org-wide or role-targeted announcements |
| `messages` | 2 | Staff ↔ family direct messaging |
| `attendance_records` | 3 | Daily check-in/out per student |
| `incidents` | 3 | Behavior, medical, safety incidents |
| `health_records` | 3 | Allergies, conditions, medications — strictest RLS |
| `grades` | 3 | Academic grades and assessments |
| `badges` | 4 | Badge catalog per org |
| `badge_awards` | 4 | Awarded badges per student |
| `giving_records` | 4 | Charitable giving and donations |

---

## Migration History

| File | Applied | Contents |
|------|---------|---------|
| `00001_initial_schema.sql` | Sprint 0 | Core tables, enums, triggers, auto-profile |
| `00002_rls_policies.sql` | Sprint 0 | RLS + 7 helper functions + all Sprint 0 policies |
| `00003_add_tagline.sql` | Sprint 0 | Idempotent tagline column on organizations |
| `00004_guardianship.sql` | Pre-Sprint 1 | students + guardianships + 2 new helpers |

---

## Data Retention Policy

- **Student records:** Preserved indefinitely (archived, never deleted). Legal requirement.
- **Audit logs:** Append-only, never modified or deleted. Compliance requirement.
- **Guardianship records:** Archived, never deleted. Custody history is permanent.
- **Organization records:** Archived on deactivation, never deleted.
- **Profile records:** Retained even if user leaves all orgs. Membership row archived.
