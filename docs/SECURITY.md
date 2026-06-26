# SchoolCo — Security Architecture

**Version:** 0.1.1 (updated pre-Sprint 1)
**Last updated:** 2026-06-26
**Classification:** Internal — share only with authorized developers

---

## Core Security Principle

**Default deny.** No data is accessible unless an explicit, audited policy grants it.
This applies at every layer: database (RLS), application (server components), and API
(route handlers). Never rely on frontend hiding alone. Hiding a button is not security.

---

## Layers of Defense

SchoolCo uses defense in depth — each layer independently blocks unauthorized access.
A failure at one layer does not expose data.

```
Browser / Client
    ↓  HTTPS only
Next.js Middleware         ← Layer 1: Route protection, session validation
    ↓
Server Components          ← Layer 2: Re-validate user on every server render
    ↓
Server Actions / Route Handlers  ← Layer 3: Validate role before every mutation
    ↓
Supabase Client (anon key) ← Layer 4: RLS policies filter every query
    ↓
PostgreSQL RLS             ← Layer 5: Database-level enforcement — cannot be bypassed
    ↓
Audit Log                  ← Layer 6: Append-only record of every sensitive action
```

---

## Authentication

**Provider:** Supabase Auth (managed)
**Method:** Email + password only (Sprint 0–1). No OAuth in early sprints.
**Session:** JWT stored in cookies, refreshed by middleware on every request.
**Callback:** `/auth/callback` exchanges the Supabase auth code for a session cookie.

### Password Reset Security
The forgot-password flow always returns "Check your inbox" regardless of whether
the email exists. This prevents email enumeration. Supabase's `resetPasswordForEmail`
also silently no-ops for unknown addresses.

### Session Handling
- Sessions are refreshed in `src/middleware.ts` on every request via `@supabase/ssr`
- `createServerClient` with `cookies()` handles session reading and writing securely
- Sessions are invalidated on sign-out via `supabase.auth.signOut()`

---

## Row Level Security (RLS)

RLS is enabled on every table from day one. The default is DENY — if no policy
matches, the operation is rejected. Policies are never disabled, even in development.

### Policy Helper Functions

All policies use one or more of these functions, defined in `00002_rls_policies.sql`
and `00004_guardianship.sql`. All are `SECURITY DEFINER STABLE`.

| Helper Function | Purpose |
|----------------|---------|
| `is_org_member(org_id)` | User has any active membership in the org |
| `has_org_role(org_id, role)` | User has exactly this role |
| `is_org_admin(org_id)` | Role is admin or above |
| `is_full_admin_or_above(org_id)` | Role is full_admin or platform_admin |
| `is_platform_admin()` | Role is platform_admin in any org |
| `is_staff_or_above(org_id)` | Role is staff, registrar, admin, full_admin, or platform_admin |
| `has_min_org_role(org_id, min_role)` | Role rank >= the specified minimum |
| `is_guardian_of(student_id)` | User has an active guardianship row for this student |
| `can_view_student(student_id, field)` | Checks visibility_json for a data category |

### Table-Level RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| organizations | org members only | platform_admin | full_admin+ | ❌ Never |
| profiles | own + staff can view | via trigger only | own row only | ❌ Never |
| organization_members | own + org members | admin+ | admin+ | ❌ Never |
| audit_logs | full_admin+ only | any authenticated | ❌ Never | ❌ Never |
| students | staff+ or own guardian | registrar+ | registrar+ | ❌ Never |
| guardianships | staff+ or own row only | registrar+ | registrar+ | ❌ Never |

**No DELETE policy exists on any table.** Records are soft-deleted via `archived_at`.

---

## Role Hierarchy

Roles are ordered lowest to highest. `has_min_org_role()` enforces this using
`array_position()` on the ordered enum array.

```
student_future → parent → volunteer → teacher → staff
  → registrar → admin → full_admin → platform_admin
```

### Role Permission Matrix

| Role | Own data | Student list | Student records | Incidents | Staff notes | Audit logs | Org settings |
|------|----------|-------------|-----------------|-----------|-------------|------------|--------------|
| student_future | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| parent | ✓ | Own children | Per visibility_json | Per visibility_json | ✗ | ✗ | ✗ |
| volunteer | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| teacher | ✓ | Org students | Academics + attendance | View only | ✗ | ✗ | ✗ |
| staff | ✓ | Org students | All non-medical | All | ✗ | ✗ | ✗ |
| registrar | ✓ | Org students | All | All | ✓ | ✗ | Limited |
| admin | ✓ | Org students | All | All | ✓ | ✗ | ✓ |
| full_admin | ✓ | Org students | All | All | ✓ | ✓ | ✓ |
| platform_admin | ✓ | All orgs | All | All | ✓ | ✓ | All orgs |

---

## Split-Household Security

This is one of the highest-risk areas of the platform. A mistake here could expose
a student's location to a restricted guardian or reveal an incident report to a
parent whose custody agreement prohibits it.

### Rules (All enforced at the database level)

**Rule 1 — Household isolation:** Parent A can never see Parent B's guardianship record,
even for the same student. The `guardianships_own_select` RLS policy restricts parents
to `WHERE profile_id = auth.uid()`.

**Rule 2 — Per-field visibility:** `can_view_student(student_id, field)` checks
`visibility_json` on the guardian's row before any data is returned. A field set to
`false` must not appear in any query result returned to that parent's session.

**Rule 3 — Court order notes are staff-only:** `court_order_notes` is never returned
to a parent session. A `guardianships_parent_view` database view (Sprint 1) will strip
this field automatically so it cannot be accidentally included in a parent-facing query.

**Rule 4 — Pickup restriction is physical safety data:** `can_pickup = false` is indexed
and must be surfaced to staff at dismissal. It is never hidden, even in simplified views.

**Rule 5 — Supervised custody is a hard alert:** Any student with a guardian where
`custody_type = 'supervised'` must display a prominent staff alert. This flag is never
optional in any staff-facing student view.

---

## API Key Security

### Supabase Anon Key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
Safe to expose in the browser. Its permissions are limited entirely by RLS policies.
Used in `src/lib/supabase/client.ts` (browser) and `src/lib/supabase/server.ts` (server).

### Supabase Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`)
**This key bypasses all RLS policies.**

Rules — no exceptions:
- Never prefix with `NEXT_PUBLIC_`
- Never import in any file under `src/components/`, `src/hooks/`, or any browser-executed path
- Only use in Server Actions, Route Handlers, or server-only lib utilities
- Only use when a specific operation legitimately requires bypassing RLS
- Store in Vercel environment variables as a server-only variable
- Treat it as a database root password

A violation of this rule is a critical security incident requiring immediate key rotation.

---

## Audit Logging

Every sensitive action is logged to `audit_logs`. This table is:

- **Append-only** — no UPDATE or DELETE policy exists at the database level
- **Restricted** — visible only to `full_admin` and `platform_admin`
- **Structured** — every entry has `action`, `entity_type`, `entity_id`,
  `previous_values`, `new_values`, `ip_address`, `device`, `session_id`

### Defined Audit Actions

```
auth.sign_in              auth.sign_out             auth.password_reset
member.invited            member.role_changed        member.suspended          member.removed
student.enrolled          student.updated            student.archived
guardian.added            guardian.updated           guardian.archived
incident.created          incident.reviewed          incident.approved
attendance.recorded       attendance.modified
org.settings_changed      org.logo_changed
audit.viewed
```

### Logger Redaction

`src/lib/logger.ts` redacts these patterns before any output:
`password`, `token`, `ssn`, `secret`, `key`, `credit_card`.

In production, all log output is JSON to stdout — never written to disk.

---

## AI Restrictions

The following actions are **permanently prohibited** for any AI feature, defined in
`src/lib/constants.ts` as `AI_RESTRICTED_ACTIONS`. Every Sprint 4+ AI feature
must be reviewed against this list before code is merged.

| Action | What AI may do instead |
|--------|----------------------|
| `approve_incident` | Draft summary for human approval |
| `modify_attendance` | Flag anomalies for human review |
| `change_medical_records` | No access to health_records table |
| `grant_permissions` | No access to organization_members mutations |
| `delete_records` | No access to archived_at mutations |
| `send_sensitive_communications` | Draft message for human to send |

---

## Data That Must Never Be Logged, Cached, or Exposed

- Passwords and password reset tokens
- Supabase JWT session tokens
- Social security numbers
- Full payment card numbers
- Court order document contents (text is stored in the DB; PDF files are Sprint 3)
- Medical diagnoses and medication names (health_records table, Sprint 3)
- Home addresses of students (stored in health_records with restricted RLS, Sprint 3)

---

## Security Headers

Enforced in both `next.config.ts` (development) and `vercel.json` (production):

```
X-Frame-Options: DENY                       — prevents clickjacking
X-Content-Type-Options: nosniff            — prevents MIME type sniffing
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

`robots: noindex, nofollow` is set on the root layout — SchoolCo is a private
platform and must not be indexed by search engines.

---

## Pre-Launch Security Checklist

Complete every item before any production deployment:

- [ ] `SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix — search entire codebase
- [ ] RLS active on all tables (`rowsecurity = true` in `pg_tables`)
- [ ] All 9 RLS helper functions present and tested
- [ ] Audit log table has no UPDATE or DELETE policies
- [ ] No parent session returns data without checking `can_view_student()`
- [ ] `court_order_notes` is never included in parent-facing responses
- [ ] `custody_type = 'supervised'` surfaces a staff alert in all dismissal views
- [ ] Email confirmation enabled in Supabase Auth settings
- [ ] Supabase Redirect URLs contain only known domains — no wildcards
- [ ] `.env.local` is not committed to git
- [ ] Database password stored only in a password manager
- [ ] Security headers present in `vercel.json` and `next.config.ts`
- [ ] Rate limiting configured on auth routes (before public launch)
- [ ] Penetration test scheduled before first real student data is entered
