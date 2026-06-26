# SchoolCo — Changelog

All notable changes to the SchoolCo platform.
Format: [Semantic version or sprint] — Date — Summary

---

## [0.1.0] — 2026-06-25 — Sprint 0: Foundation

### Added
- Next.js 14 App Router project with TypeScript (strict mode)
- SchoolCo Harmony design system: Tailwind tokens, Playfair Display + Inter typography
- shadcn/ui base components: Button, Input, Label, Card, Avatar, Badge, Skeleton,
  Separator, Dialog, Tooltip, ScrollArea, Textarea, Alert, Progress, DropdownMenu
- Supabase integration: browser client, server client, middleware session refresh
- Supabase Auth: email/password sign-in, forgot-password flow, auth callback route
- Route protection middleware: default deny for all `/dashboard/*` routes
- Root layout with React Query provider
- Login page (Screen 001): responsive two-column layout, rotating hero, Today's Blessing
- Forgot-password page with email enumeration prevention
- Mission Switcher (Screen 002): multi-org selection with role display
- Dashboard shell: role-based sidebar, sticky header, org switcher, profile dropdown
- Dashboard home: welcome banner, platform status cards, build roadmap
- 9-role model: student_future, parent, volunteer, teacher, staff, registrar, admin, full_admin, platform_admin
- Role-based navigation: each role has a distinct sidebar nav set
- Organizations table: name, short_name, slug, org_type, tagline, full branding fields, timezone, theme_json, settings_json
- Profiles table: auto-created on sign-up via database trigger
- Organization members table: multi-org membership with role and status
- Audit logs table: append-only with previous_values, new_values, device, session_id
- RLS policies: default deny on all 4 tables
- SQL helper functions: is_org_member, has_org_role, is_org_admin, is_full_admin_or_above, is_platform_admin, is_staff_or_above, has_min_org_role
- Audit log helper: writeAuditLog() with AUDIT_ACTIONS constants
- Structured logger: colorized dev output, JSON production output
- Error utilities: typed AppError, AuthError, ForbiddenError, NotFoundError, ValidationError; ActionResult pattern
- Custom hooks: useOrganization, useProfile
- Error boundaries: root error.tsx, dashboard error.tsx
- Loading states: root loading.tsx, dashboard/home loading.tsx
- Not-found page (404)
- Profile and Settings page stubs (Sprint 1 implementation)
- Architecture docs: ADR-0001, DECISION_LOG, CHANGELOG
- Documentation placeholders: PRD, SRS, DATABASE, API, SECURITY, DESIGN_SYSTEM, AUTOMATIONS, AI_ENGINE, USER_GUIDE
- Sample data: organizations, users, families, students, attendance, incidents, badges (no real PII)
- README.md with full project overview
- vercel.json with security headers
- .eslintrc.json with strict TypeScript rules
- .gitignore
- .env.example with all required variables
- SUPABASE_SETUP.md: step-by-step guide for new project creation
- 3 SQL migration files: 00001_initial_schema, 00002_rls_policies, 00003_add_tagline

### Architecture Decisions
- Multi-tenant via RLS (see ADR-0001)
- Active org stored in localStorage for Sprint 0 (migrate to cookie in Sprint 1)
- tagline as dedicated column on organizations
- Email enumeration prevention on forgot-password

### Known Limitations
- localStorage for org context is not SSR-compatible — Sprint 1 migration planned
- Dashboard home is a status page — real role dashboards are Sprint 1
- No real-time features yet
- No file upload yet
- No email sending configured beyond Supabase Auth emails
- AI features not yet implemented

---

## Upcoming

### [0.2.0] — Sprint 1 — Dashboards (Planned)
- Role-specific dashboard widgets
- Student records (without PII beyond name/grade)
- Guardianship / split-household table
- Server-side active org cookie
- Profile editing
- Organization settings UI

### [0.3.0] — Sprint 2 — Communications (Planned)
- Family messaging hub
- Announcements
- Staff-only channels
- Push notification setup

### [0.4.0] — Sprint 3 — Attendance & Academics (Planned)
- QR check-in
- Attendance tracking and reports
- Grade recording
- Enrollment management

### [0.5.0] — Sprint 4 — Leadership & Badges (Planned)
- Leadership Passport
- Badge Studio
- Student growth portfolios
