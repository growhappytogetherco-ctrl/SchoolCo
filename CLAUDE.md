# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build — always run before pushing
npm run type-check   # tsc --noEmit (TypeScript errors; build ignores them due to ignoreBuildErrors: true)
npm run lint         # ESLint (also ignored during build, but fix warnings anyway)
npm run audit:rls    # Run RLS policy audit SQL against production Supabase
npm run test:security # Role-scoped RLS regression tests (requires test credentials in .env.local)

npx supabase db push --linked   # Apply pending migrations to production
```

**Build notes**: `next.config.mjs` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true` because Supabase join queries break type inference on hand-written `Database` types. The build succeeds even with type errors — always run `type-check` separately to catch regressions.

---

## Architecture

### Route Groups

```
src/app/
  (auth)/          — Login, forgot-password, reset-password
  (dashboard)/     — Staff dashboard (/dashboard/*)
  (portal)/        — Parent portal (/portal/*)
  actions/         — Server Actions ("use server" files)
  api/             — Route Handlers (currently: /api/attendance/qr/[token])
```

The dashboard layout (`(dashboard)/dashboard/layout.tsx`) is a **client component** that loads org context from `localStorage` (`sc_active_org`) and verifies membership server-side. This is unusual — most pages inside it are server components but the layout itself is client-side.

### Auth and Org Context

- **`src/lib/supabase/server.ts`** — `createClient()`, `getUser()`, `getProfile()`, `getActiveOrgId()` (re-exported from org-context)
- **`src/lib/supabase/org-context.ts`** — reads/writes httpOnly cookies (`sc_active_org`, `sc_active_role`, `sc_portal_view`, `sc_has_parent`)
- **`src/lib/supabase/client.ts`** — browser-side Supabase client; never import in server components

`getActiveOrgId()` reads the `sc_active_org` cookie server-side. Never trust a client-supplied `orgId`. All server actions and server components must call `getActiveOrgId()` from `@/lib/supabase/server` (not from client state).

### Role System

Roles (lowest → highest): `student_future`, `parent`, `volunteer`, `teacher`, `staff`, `registrar`, `admin`, `full_admin`, `platform_admin`

Key helpers in `src/lib/constants.ts`:
- `ROLE_HIERARCHY[]` — ordered array for level comparisons
- `isStaffRole(role)` — true for teacher and above (excludes volunteer/parent)
- `isAdminRole(role)` — true for admin and above
- `getRoleLevel(role)` — numeric index into hierarchy

Role guards: `requireRole(minRole)`, `requireStaff()`, `requireAdmin()` in `src/lib/roleGuard.ts` — redirect to `/dashboard/home` if insufficient. These are defense-in-depth; **RLS is the real access control**.

Navigation by role is driven by `NAV_ITEMS_BY_ROLE` in `src/lib/constants.ts`. Adding a page to navigation requires updating that map for every role that should see it.

### Database / Supabase

- Project ref: `cgnqkaqbsquerohxqkqt`
- Migrations: `supabase/migrations/` — numbered `NNNNN_description.sql`, idempotent (`if not exists`, `drop policy if exists`)
- Apply with: `npx supabase db push --linked` (requires `SUPABASE_ACCESS_TOKEN` in `.env.local`)
- Supabase CLI is not globally installed — always use `npx supabase`

**RLS is mandatory** on every table. Helper functions (defined in `00002_rls_policies.sql`):
- `is_org_member(org_id)` — any active member **including** parents and volunteers; **do not use alone** on sensitive tables
- `is_staff_or_above(org_id)` — teacher through platform_admin; use for staff-only tables
- `is_org_admin(org_id)` — admin and above
- `get_guardian_student_ids(org_id)` — returns student IDs where current user is an active guardian; use for parent-facing SELECT policies

The full access model is documented in `docs/security-access-model.md`.

### Server Actions Pattern

All files in `src/app/actions/` use `"use server"` and follow this pattern:

1. `await getUser()` — returns null if unauthenticated
2. `await getActiveOrgId()` — from server cookie, never from client
3. Role check against DB (`organization_members` table)
4. Business logic with `supabase` client (RLS enforces org scope)
5. `revalidatePath()` for cache invalidation
6. Return `ActionResult<T>` (`{ success: true, data }` or `{ success: false, error }`)

`ActionResult<T>` is defined in `src/types/actions.ts`.

### Attendance

Attendance schema (migration `00009_rla_operations.sql`):
- One row per student per day in `attendance_records`
- Key columns: `status`, `check_in_at`, `check_out_at`, `check_in_method`, `is_late`, `is_early_pickup`
- Statuses: `present`, `absent`, `tardy`, `excused`, `checked_in`, `early_dismissal`
- Methods: `qr`, `manual`, `kiosk`, `parent_qr`
- Indexes on `(organization_id, date)`, `(student_id, date)`, `(organization_id, date, status)`

Server actions in `src/app/actions/attendance.ts`: `checkInStudent`, `checkOutStudent`, `markAttendance`, `undoAttendanceAction`, `correctAttendanceRecord`, `getTodayAttendance`.

Org-level timing settings in `org_settings`: `arrival_cutoff` (HH:MM:SS) and `dismissal_time` (HH:MM:SS).

### Design System

Tailwind classes use a custom `sc-*` prefix. Key tokens:
- Colors: `sc-navy`, `sc-teal`, `sc-teal-700`, `sc-cream`, `sc-gray`, `sc-gray-100`, `sc-gray-200`, `sc-gray-400`, `sc-rose`, `sc-rose-50`, `sc-rose-200`, `sc-rose-700`, `sc-gold-50`, `sc-gold-300`, `sc-gold-600`, `sc-gold-700`, `sc-gold-800`
- Typography: `text-heading-1`, `text-body-md`, `text-label-sm`, `text-label-md`
- Shadow: `shadow-card`
- Animation: `animate-fade-in`

UI components are shadcn/ui, located in `src/components/ui/`. Page components use `rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6` for cards.

### Sidebar Navigation

`AppSidebar` in `src/components/layout/AppSidebar.tsx` renders links from `NAV_ITEMS_BY_ROLE[role]`. Each `NavItem` has `{ label, href, icon }` where `icon` is a string key into the `ICON_MAP`. To add a page to the nav, add the entry to every applicable role's array in `NAV_ITEMS_BY_ROLE` and add the icon import/mapping if it's new.

### Logging and Audit

- `src/lib/logger.ts` — structured logger (`logger.info`, `logger.error`, etc.); never log tokens or PII
- `src/lib/audit.ts` — `logAudit()` writes to `audit_logs` table; call from server actions for sensitive mutations

### Security Constraints

- `SUPABASE_SERVICE_ROLE_KEY` must never have `NEXT_PUBLIC_` prefix and must never be imported in client components
- `.env.local` must never be committed to git
- `SUPABASE_ACCESS_TOKEN` (for CLI) must never be printed or logged
- QR token values must never appear in logs
- All org scoping comes from server-side cookies via `getActiveOrgId()`, never from browser state
- See `docs/security-access-model.md` for the full role/table access matrix
