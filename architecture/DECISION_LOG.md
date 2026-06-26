# SchoolCo — Architecture Decision Log

This log captures every significant architectural decision made during the build.
For major decisions, a full ADR is written. For smaller decisions, a summary entry is logged here.

---

## 2026-06-25 — Sprint 0

### [ADR-0001] Multi-tenant architecture with Supabase RLS
→ See `ADR-0001.md`

### tagline as a dedicated column
**Decision:** `organizations.tagline` is its own `TEXT` column, not stored in `settings_json`.
**Reason:** Tagline is displayed in mission switcher, login hero, and welcome banner on every page load.
Storing it in JSONB requires an extra parse step and can't be indexed cleanly.
**Impact:** Migration 00003 adds this column for environments that ran 00001 before this decision.

### localStorage for active org context (Sprint 0 only)
**Decision:** Active org stored in `localStorage` key `sc_active_org`.
**Reason:** Server-side cookie requires a Server Action with `cookies()` — the implementation
complexity is appropriate for Sprint 1, not Sprint 0 foundation work.
**Sprint 1 action:** Migrate to `cookies().set("sc_active_org", orgId)` in a Server Action,
enabling SSR access to org context without a client-side flash.

### Playfair Display + Inter typography
**Decision:** Serif heading font (Playfair Display) + sans-serif body (Inter).
**Reason:** Matches design screens. Playfair conveys the academic, regal quality of Rising Leaders
Academy without being generic corporate. Inter is highly legible on mobile at all weights.

### No student tables in Sprint 0
**Decision:** Student, enrollment, and guardianship tables are not created in Sprint 0.
**Reason:** Architecture review explicitly scoped Sprint 0 to foundation only.
Student data requires split-household permission modeling — rushing this creates security debt.
**Sprint 1:** Student table with full `StandardColumns` pattern, guardianship table,
and split-household visibility rules.

### Error email enumeration prevention
**Decision:** Forgot-password flow always shows the "Check your inbox" state, regardless of
whether the email exists in the system.
**Reason:** Revealing which emails are registered is a security vulnerability (email enumeration).
This is standard practice. Supabase's `resetPasswordForEmail` also silently no-ops for unknown emails.

### AI Philosophy (enforced in code)
**Decision:** AI capabilities are defined in `constants.ts` as `AI_RESTRICTED_ACTIONS`.
**Reason:** Documents clearly which actions AI may never autonomously execute. This list will grow
as AI features are added. Every AI-adjacent feature must check this list during code review.

### 9-role hierarchy with `has_min_org_role()` helper
**Decision:** `has_min_org_role(org_id, min_role)` takes a minimum role and uses `array_position`
to check rank, rather than hardcoding role lists in every policy.
**Reason:** As permissions evolve, updating the helper function propagates to all policies automatically.
**Risk:** If a new role is added to the enum but not to the helper function's array, it will silently
have the wrong rank. **Mitigation:** Add a database test in Sprint 1 that validates the array is complete.

---

## 2026-06-25 — Pre-Sprint 1

### [ADR-0002] Option A: Dedicated guardianship table for split-household support
→ See `ADR-0002.md`
**Key outcome:** `guardianships` table with `visibility_json` per guardian/student pair.
RLS guarantees Parent A never reads Parent B's record. Physical safety columns
(`can_pickup`, `court_order_on_file`, `custody_type`) are first-class, indexed fields.

### Resend chosen as Sprint 2 email provider
**Decision:** Resend (resend.com) is the designated transactional email provider for
Sprint 2 communications features.
**Reason:** Native Next.js SDK, clean API, excellent deliverability, generous free tier,
easy domain authentication. Will NOT be implemented until Sprint 2 begins.
**Sprint 2 action:** Install `resend` package, add `RESEND_API_KEY` to env, create
`src/lib/email/` module with typed send functions.

---

## Future Decisions (Documented for Sprint 1)

- [ ] Supabase Storage bucket structure for org-specific files
- [ ] Real-time subscription strategy for communications (Supabase Realtime vs. polling)
- [ ] File upload size limits and virus scanning strategy
- [ ] `guardianships_parent_view` database view to strip court_order_notes for parent sessions
