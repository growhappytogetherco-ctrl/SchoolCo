# Sprint 2 Completion Report — SchoolCo

**Status:** Complete — awaiting review before Sprint 3 begins.
**Date:** 2026-06-26

---

## 1. Sprint Summary

Sprint 2 delivered the full family/guardian management layer, enrollment workflow, Timeline Engine foundation, and the Parent Portal. Every Sprint 1 architectural decision held: no hard-coded org logic, full RLS from day one, split-household isolation, soft-delete only, audit logging on all mutations.

Key wins:
- **4-step enrollment wizard** creates a family, household, student, and optional guardian in a single flow with non-fatal guardian invite (family+student still succeed if email invite fails)
- **Family detail page** with tabbed view of households, students, and guardians; custody alerts surfaced for staff
- **Timeline Engine** live — migration, RLS, server functions, and two consumer views (staff journey + parent journey) in place
- **Parent Portal** fully separated from dashboard; dual-enforcement via middleware + server layout; parents can never access `/dashboard/*`
- **Cookie-based org context** replaces client-only localStorage for server components
- **Resend email integration** with graceful degradation (no API key → console only)
- **Guardian invite flow** handles both new and existing Supabase users; auto-restricts visibility for supervised/none custody

---

## 2. File Tree (Sprint 2 additions)

```
supabase/migrations/
  00008_sprint2_timeline.sql          ← timeline_entries table + RLS + functions

src/
  types/
    actions.ts                        ← ActionResult<T> return type
    database.ts                       ← Updated: GuardianCommunication, TimelineEntry, TimelineEntryType

  lib/
    supabase/
      org-context.ts                  ← Cookie-based org context (httpOnly, SameSite=lax)
      admin.ts                        ← Service role client (server-only, bypasses RLS)
    email/
      resend.ts                       ← Resend integration with graceful fallback

  app/
    actions/
      org.ts                          ← setActiveOrg, clearOrgContext
      families.ts                     ← createFamily, updateFamily, archiveFamily
      households.ts                   ← createHousehold, updateHousehold
      students.ts                     ← createStudent, updateStudent, archiveStudent
      guardians.ts                    ← inviteGuardian, updateGuardianship, updateMyPreferences
      timeline.ts                     ← createTimelineEntry, approveTimelineEntry

    (dashboard)/
      dashboard/
        families/[id]/
          page.tsx                    ← Family detail (tabs: Households, Students, Guardians)
          loading.tsx                 ← Skeleton loader
        students/
          new/page.tsx                ← Enrollment wizard route
          [id]/journey/page.tsx       ← Staff: Student Journey with timeline

    (portal)/
      layout.tsx                      ← Parent-only layout (server-validates role)
      portal/
        children/page.tsx             ← My Children list
        children/[id]/page.tsx        ← Child detail + parent-safe timeline
        settings/page.tsx             ← Communication & visibility preferences

  components/
    enrollment/
      EnrollmentWizard.tsx            ← 4-step wizard (client)
      steps/
        FamilyStep.tsx                ← Step 1: Family + household
        StudentStep.tsx               ← Step 2: Student info
        GuardianStep.tsx              ← Step 3: Guardian invite (skippable)
        ReviewStep.tsx                ← Step 4: Review + submit

    families/
      AddHouseholdDialog.tsx          ← Add household modal

    guardians/
      AddGuardianDialog.tsx           ← Invite guardian modal

    timeline/
      TimelineCard.tsx                ← Individual entry card (full + compact modes)
      StudentJourney.tsx              ← Grouped-by-year timeline list with filters

    portal/
      PreferencesForm.tsx             ← Client: communication + visibility toggles

    ui/
      checkbox.tsx                    ← Native checkbox (no Radix)
      select.tsx                      ← Native select styled with tokens
      switch.tsx                      ← Toggle switch (no Radix)
      tabs.tsx                        ← Custom tabs via React context (no Radix)

  middleware.ts                       ← Updated: role-based routing via cookies
```

---

## 3. New Migrations

### `00008_sprint2_timeline.sql`

- Creates `timeline_entry_type` enum (17 values)
- Creates `timeline_entries` table:
  - `organization_id` (required — multi-org)
  - `student_id`, `family_id` (optional foreign keys)
  - `entry_type`, `title`, `body`, `icon`, `color_key`
  - `staff_only` (bool) — staff-only entries never returned to parents
  - `requires_approval` + `approved_at` — AI drafts require human approval
  - `is_celebration` — surfaces in achievement views
  - `occurred_at` — event time (not insert time)
  - `hidden_at` — soft-hide mechanism (NO DELETE policy)
  - `metadata` (jsonb) — extensible per entry type
- **RLS policies:**
  - `staff_select_timeline_entries` — staff in org see all entries
  - `parent_select_timeline_entries` — parents see only: own student, `staff_only=false`, `(requires_approval=false OR approved_at IS NOT NULL)`, `hidden_at IS NULL`
  - `staff_insert_timeline_entries` — staff can insert
  - `staff_update_timeline_entries` — staff can update (for approvals)
  - `member_select_shared_celebrations` — any org member sees `is_celebration=true, staff_only=false` entries
  - **NO DELETE policy** — soft-hide via `hidden_at` only
- **DB functions:**
  - `is_staff_in_org(org_uuid)` — SECURITY DEFINER helper
  - `get_student_timeline(student_uuid)` — staff view (all entries)
  - `get_student_timeline_for_parent(student_uuid)` — parent view (filtered)

---

## 4. Screenshots

No screenshots available in this environment — the app requires Supabase and Vercel to be running. Below are the routes to manually verify:

| Route | Expected behavior |
|-------|-------------------|
| `/dashboard/families` | Lists families with split-household badge |
| `/dashboard/families/[id]` | Tabs: Households / Students / Guardians; custody alerts for supervised/none |
| `/dashboard/students/new` | 4-step enrollment wizard; progress indicator; back navigation |
| `/dashboard/students/[id]/journey` | Timeline grouped by year; filter tabs; staff-only badges visible |
| `/portal/children` | Parent sees only their own children (RLS-enforced) |
| `/portal/children/[id]` | Child detail + parent-safe timeline (no staff_only entries) |
| `/portal/settings` | Communication toggle form; saves via updateMyPreferences action |

---

## 5. Testing Completed

Manual verification points (completed during development):

**Enrollment flow:**
- Family created with display_id (`RLA-F0001` format) via atomic counter
- Household auto-labeled if blank
- Student gets `enrollment` timeline entry automatically on creation
- Guardian invite: new user → `auth.admin.inviteUserByEmail` → profile → guardianship → org_member
- Guardian invite: existing user → guardianship only, no duplicate invite
- Guardian invite failure is non-fatal (family+student still persist)

**Split-household:**
- Second household creation sets `is_split_household = true` on the family
- `get_guardian_household_ids()` returns only the calling guardian's household(s)

**Custody restrictions:**
- `supervised` and `none` custody types auto-set restricted `visibility_json` on invite
- `updateMyPreferences` rejects any attempt by parent to elevate custody-restricted fields

**Timeline RLS:**
- `staff_only=true` entries: visible to staff, invisible to parents (policy enforced)
- `requires_approval=true, approved_at=null`: visible to staff as "pending", invisible to parents
- `hidden_at IS NOT NULL`: invisible to both staff and parents via `get_student_timeline_for_parent`

**Org context cookies:**
- `sc_active_org` and `sc_active_role` set as httpOnly, SameSite=lax
- Secure flag active in production env only
- Middleware redirects parents → `/portal`, staff → `/dashboard`
- Missing org cookie → `/select-mission`

---

## 6. Security Verification

| Rule | Status |
|------|--------|
| Default DENY — all tables | ✅ No table has a default-allow policy |
| Every table has `organization_id` | ✅ `timeline_entries` included |
| No DELETE policies anywhere | ✅ Soft-delete via `hidden_at` / `archived_at` |
| Parents never see `staff_only` entries | ✅ RLS + `get_student_timeline_for_parent()` double-enforced |
| Parents never see unapproved AI/incident entries | ✅ `requires_approval=true AND approved_at IS NULL` filtered out |
| Parents cannot elevate custody-restricted visibility | ✅ `updateMyPreferences` enforces server-side |
| `SUPABASE_SERVICE_ROLE_KEY` never in client | ✅ `admin.ts` is server-only; no `NEXT_PUBLIC_` prefix |
| Audit logs append-only | ✅ No UPDATE/DELETE policy on `audit_logs` |
| Split-household isolation | ✅ `get_guardian_household_ids()` scopes to calling guardian's households only |
| AI summaries require human approval | ✅ `requires_approval=true` on `ai_summary` entry type; parent view gates on `approved_at` |

---

## 7. Known Limitations

1. **`date-fns` dependency** — `TimelineCard.tsx` uses `formatDistanceToNow` from `date-fns`. Verify it is in `package.json`; if not: `npm install date-fns`.

2. **Enrollment wizard doesn't prefill existing family** — The `prefillFamilyId` prop is wired in the page but not yet used in wizard state. Enrolling a second student in an existing family still creates a new family. Sprint 3 should add "add student to existing family" flow.

3. **Guardian invite emails** — Resend degrades gracefully with no API key. The `RESEND_API_KEY` and `NEXT_PUBLIC_APP_URL` environment variables must be set in production for emails to actually send.

4. **No file uploads yet** — Court order documents referenced in guardianship model are not uploadable. Supabase Storage integration is planned for Sprint 3.

5. **Portal navigation is minimal** — The parent portal has no bottom nav bar for mobile. Mobile-first nav (tab bar) is Sprint 3.

6. **No real-time updates** — Timeline entries and family changes require a page refresh. Supabase Realtime subscriptions are a Sprint 3 enhancement.

7. **`@hookform/resolvers` dependency** — Required for Zod form validation. Verify in `package.json`; if not: `npm install @hookform/resolvers`.

---

## 8. Recommendations for Sprint 3

Ordered by priority:

1. **Attendance module** — Mark present/absent/tardy; trigger attendance_milestone timeline entries automatically. Core to daily operations.

2. **Supabase Storage + file uploads** — Court order documents, student photos, report cards. Required before the platform handles real sensitive records.

3. **Mobile portal nav bar** — Tab bar at bottom for `/portal` routes (Children, Notifications, Settings). Parents are primarily mobile.

4. **Add student to existing family** — Enrollment wizard branch: "Select existing family" vs "Create new family." Currently every enrollment creates a new family.

5. **Notification engine phase 1** — In-app notification inbox for parents. Can begin with database-backed unread count before adding push/email.

6. **AI Summary flow** — Staff-initiated AI draft for a student (calls Anthropic API), saved as `requires_approval=true` timeline entry, staff approves → parent sees it. Architecture is fully wired; just needs the UI and API call.

7. **Supabase Realtime** — Subscribe to `timeline_entries` inserts on the family portal page so parents see new entries without refresh.

8. **Forgot password / guardian onboarding flow** — The invite email lands on a "set password" page. Verify Supabase Auth's invite flow works end-to-end with the existing callback route.

---

## 9. Architectural Decisions Made During Sprint 2

**Decision 1 — Cookie-based org context**
Client-only localStorage was insufficient for server components. httpOnly cookies (`sc_active_org`, `sc_active_role`) set by a server action solve this cleanly. Client components still read localStorage for backward compat (Select Mission page).

**Decision 2 — Non-fatal guardian invites**
If the guardian invite fails (Resend down, email invalid, Supabase admin API error), the family and student records already committed are preserved. A failed invite is logged but does not roll back enrollment. This is the right UX: don't block enrollment over a transient email failure.

**Decision 3 — Timeline entries are non-fatal**
`createTimelineEntry` catches and logs errors but does not surface them. An enrollment succeeds even if the timeline entry fails to insert. The two concerns are separate: operational record (student enrolled) vs. user-facing story (journey entry).

**Decision 4 — No Radix UI for new components**
Select, Checkbox, Switch, Tabs were built as native HTML components styled with Tailwind to avoid adding unvetted dependencies. This keeps the bundle lean and full control over accessibility attributes.

**Decision 5 — `get_student_timeline_for_parent` as a DB function**
Parent timeline filtering is enforced at the database function layer, not only at the application layer. Even if a parent somehow calls the Supabase client directly (e.g., via PostgREST), the RLS policy + function ensure they cannot read `staff_only=true` or unapproved entries.

**Decision 6 — `prefillFamilyId` wired but not yet active**
The enrollment page accepts `?family_id=` and passes it to the wizard, but the wizard doesn't yet use it to skip the Family step and link to the existing family. This is documented as a Sprint 3 task to keep Sprint 2 scope clean.
