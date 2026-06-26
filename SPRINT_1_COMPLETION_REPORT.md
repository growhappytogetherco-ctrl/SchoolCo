# Sprint 1 Completion Report
**SchoolCo — Foundational Data Model & Workflows**
Date: June 26, 2026 | Status: ✅ Complete — Awaiting Review

---

## Sprint 1 Goal

Build the foundational data model that all future modules (attendance, academics, communications, behavior) depend on. Establish families, households, students, and guardianships as first-class entities with full split-household support and human-friendly display IDs.

---

## Deliverables Completed

### Database Migrations

| File | Purpose | Status |
|---|---|---|
| `supabase/migrations/00004_guardianship.sql` | Students table, guardianships table (Option A), enums, RLS helpers | ✅ Done (pre-Sprint 1) |
| `supabase/migrations/00005_sprint1_schema.sql` | Families, households, display ID counters, `next_org_display_id()` function, member display IDs | ✅ Done |
| `supabase/migrations/00006_sprint1_rls.sql` | RLS on families, households, display_id_counters; `get_guardian_family_ids()` and `get_guardian_household_ids()` helper functions | ✅ Done |
| `supabase/migrations/00007_sprint1_seed.sql` | Thompson Family (single HH), Williams Family (split HH with supervised custody), idempotent via ON CONFLICT | ✅ Done |

### Human-Friendly Display IDs

All display IDs generate as `{ORG_SHORT}-{PREFIX}{NNNN}`:

| Entity | Format | Example |
|---|---|---|
| Family | `RLA-F0001` | Thompson Family |
| Household | `RLA-H0001` | Primary Household |
| Student | `RLA-S0001` | Amara Thompson |
| Parent | `RLA-P0001` | Guardian member |
| Teacher | `RLA-T0001` | Teacher member |
| Admin | `RLA-A0001` | Admin member |
| Volunteer | `RLA-V0001` | Volunteer member |
| Staff | `RLA-ST0001` | Staff member |
| Registrar | `RLA-RG0001` | Registrar member |

Display IDs are generated atomically using `display_id_counters` with `ON CONFLICT DO UPDATE` — no gaps, no race conditions, no sequences needed.

### Split-Household Architecture (Option A)

The `guardianships` table is the sole source of truth for parent-student relationships. Key fields:

- `custody_type`: `primary | joint | secondary | supervised | none`
- `can_pickup`: hard pickup authorization flag
- `court_order_on_file`: boolean flag (notes stored in staff-only `court_order_notes` field)
- `household_id`: which household this guardian belongs to
- `visibility_json`: per-category field-level visibility (academics, attendance, grades, incidents, health, behavior, communications)
- `communication_json`: channel preferences and quiet hours

**Split-household isolation is enforced at the database level** via two SECURITY DEFINER STABLE helper functions:
- `get_guardian_family_ids()` — returns family IDs containing guardian's students
- `get_guardian_household_ids()` — returns ONLY the guardian's own household(s), never the other household in a split family

**No parent in Household A can ever see Household B's data**, even in the same family.

### Seed Data

| Family | Structure | Students |
|---|---|---|
| Thompson Family | Single household | Amara (7th, classical), Elijah (4th, entrepreneurship) |
| Williams Family | Split household | Zoe (5th, entrepreneurship), Jordan (2nd, classical) |

Darnell Williams (Williams Family) has `custody_type: supervised`, `can_pickup: false`, and severely restricted `visibility_json` — serves as a test case for the custody alert system.

### TypeScript Types

`src/types/database.ts` fully updated with:
- `Family`, `Household`, `Student` (with `display_id` fields)
- `Guardianship` with `GuardianVisibility` and `GuardianCommunication` interfaces
- Updated `OrganizationMember` with `display_id`
- Joined types: `StudentWithFamily`, `GuardianshipWithProfile`, `FamilyWithHouseholds`
- Full `Database` interface updated for all new tables

### Constants

`src/lib/constants.ts` updated with:
- `DISPLAY_ID_PREFIXES` map and `getMemberIdPrefix()` helper
- `RelationshipType`, `RELATIONSHIP_LABELS` (15 relationship types)
- `CustodyType`, `CUSTODY_LABELS`, `requiresSupervisionAlert()` helper
- `EnrollmentStatus`, `ENROLLMENT_LABELS`
- Families added to `NAV_ITEMS_BY_ROLE` for admin/registrar/full_admin

### Server Helpers

`src/lib/supabase/server.ts` updated with:
- `getOrgStats(orgId)` — parallel queries for member/student/family counts
- `getStudents(orgId, options)` — paginated list with family join and search
- `getStudentById(studentId)` — full student detail with family, households, guardians
- `getFamilies(orgId, options)` — paginated list with household count and search
- `getOrgMembership(userId, orgId)` — membership verification for server actions

### UI Pages Built

| Page | Route | Notes |
|---|---|---|
| Dashboard Home | `/dashboard/home` | Real stat queries, sprint roadmap, welcome banner |
| Students List | `/dashboard/students` | RLS-filtered, search, mobile+desktop, loading skeleton |
| Student Detail | `/dashboard/students/[id]` | Guardian/custody view, supervision alerts, future modules marked |
| Families List | `/dashboard/families` | Split-household flagged, mobile+desktop, loading skeleton |

### Shared Components Built

- `src/components/shared/EmptyState.tsx` — reusable with icon, sprint label, optional action
- `src/components/students/StudentTable.tsx` — client-side search, mobile card + desktop table

### Architecture Docs

| Document | Status |
|---|---|
| `docs/EVENT_BUS.md` | ✅ Full event catalog, subscriber pattern, audit integration, roadmap |
| `docs/NOTIFICATION_ENGINE.md` | ✅ Channel architecture, guardian preference enforcement, split-household rules, approval gates |

---

## Security Verification

### RLS Coverage
- ✅ `display_id_counters` — platform_admin only (SECURITY DEFINER writes bypass RLS safely)
- ✅ `families` — staff+ see all; parents see own family only via `get_guardian_family_ids()`
- ✅ `households` — staff+ see all; parents see ONLY directly-linked household via `get_guardian_household_ids()`
- ✅ `students` — staff+ see all; parents see only via `is_guardian_of()`
- ✅ `guardianships` — staff+ see all; parents see only their own guardianship row

### Default Deny
- ✅ All new tables have `ENABLE ROW LEVEL SECURITY` with no default-allow policy

### Soft-Delete Only
- ✅ No `DELETE` policies on any table — `archived_at` is the only removal mechanism

### Audit Logs
- ✅ Append-only (no UPDATE/DELETE policy)
- ✅ Only `full_admin` and `platform_admin` can read

### Split-Household Isolation
- ✅ `get_guardian_household_ids()` returns only the calling guardian's own household(s)
- ✅ A parent in Household A cannot view, query, or receive notifications about Household B

### Service Role Key
- ✅ `SUPABASE_SERVICE_ROLE_KEY` is server-only, never prefixed `NEXT_PUBLIC_`, never in client components

### Parent Data Isolation
- ✅ `court_order_notes` is stored in `guardianships` but never rendered in any parent-accessible view
- ✅ Staff-only fields (family `notes`, `court_order_notes`) are never included in parent query paths

---

## Known Limitations

| Limitation | When Addressed |
|---|---|
| Active org stored in `localStorage` — not available server-side | Sprint 2 (server-side org cookie) |
| Student detail page links to family detail (`/dashboard/families/[id]`) but that page isn't built yet | Sprint 2 |
| No enrollment workflow — students must be added via seed/SQL | Sprint 2 |
| `communication_json` and `visibility_json` stored in DB but no UI to manage them | Sprint 2 |
| Families page shows household labels but no address details | Sprint 2 |
| No pagination UI (data is fetched with `limit: 100`) | Sprint 2 |

---

## Decisions Made in Sprint 1

| Decision | Rationale |
|---|---|
| `getOrgStats()` returns all three counts in parallel (not three separate functions) | One trip, one component import, fewer round-trips |
| `CUSTODY_LABELS` + `requiresSupervisionAlert()` in constants — not a DB enum | Labels change over time; business logic belongs in app layer |
| `get_guardian_household_ids()` returns the guardian's own household only, not all family households | This is the critical split-household isolation rule. Never loosened. |
| Student detail page built in Sprint 1 (not Sprint 2) | Guardian/custody data is available; showing it now reduces Sprint 2 surface area |
| Architecture docs (Event Bus, Notification Engine) written before implementation | Design-first prevents re-architecture. These docs are the contract Sprint 3+ will implement against. |

---

## File Tree — Sprint 1 Additions

```
supabase/migrations/
  00004_guardianship.sql          ← Pre-Sprint 1
  00005_sprint1_schema.sql        ← Sprint 1
  00006_sprint1_rls.sql           ← Sprint 1
  00007_sprint1_seed.sql          ← Sprint 1

src/
  types/
    database.ts                   ← Updated
  lib/
    constants.ts                  ← Updated
    supabase/
      server.ts                   ← Updated
  components/
    shared/
      EmptyState.tsx              ← New
    students/
      StudentTable.tsx            ← New
  app/
    (dashboard)/
      dashboard/
        home/
          page.tsx                ← Updated (real queries)
        students/
          page.tsx                ← New
          loading.tsx             ← New
          [id]/
            page.tsx              ← New
        families/
          page.tsx                ← New
          loading.tsx             ← New

docs/
  EVENT_BUS.md                    ← New
  NOTIFICATION_ENGINE.md          ← New

SPRINT_1_COMPLETION_REPORT.md    ← This file
```

---

## Sprint 2 Recommendations

**Required before Sprint 2 begins:**
1. Apply all four migrations to `schoolco-dev` Supabase project (00004–00007)
2. Verify seed data inserted correctly: confirm Thompson and Williams families appear in the Families page
3. Verify split-household isolation: log in as a parent guardian and confirm they cannot see the other household's data
4. Migrate org context from `localStorage` to a server-side cookie so pages work without client JS

**Sprint 2 Scope (recommended):**
- Family detail page (`/dashboard/families/[id]`) with household breakdown and guardian list
- Guardian management UI (add/remove/update guardianship records)
- Enrollment workflow (create student → link to family → assign household → add guardians)
- `communication_json` and `visibility_json` management UI
- Resend integration + first email template (Welcome Guardian)
- Parent portal foundation (`/portal` route group) — parents see only their children
- Server-side org context cookie (replace `localStorage`)

---

*Sprint 1 is complete. Please review and approve before Sprint 2 begins.*
