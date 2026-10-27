# Parent Portal Regression Tests

Tests for the administrator-assigned parent login workflow. All tests run against **staging** (`qjyofbxmymquqobalshg`) with dedicated test records — never production.

---

## Staging Test Records

| Record | Value |
|---|---|
| Family | TEST — Staging Test Family (`04b3c73f-8880-45f5-ac16-3e6453f7e1ef`) |
| Guardian | TEST Guardian Alpha (`aaaaaaaa-0001-0001-0001-000000000001`) |
| Guardian email | `mumnherprinces@gmail.com` |
| Student | TEST Student-Staging (`b360a9df-95d3-4a86-8a4b-5e7ade4f337f`) |
| Org | Rising Leaders Academy (`9fd43346-f43b-41d1-9b4c-fe8702471b07`) |

**Default state**: Guardian portal access `inactive` (disabled). Reset with `scripts/disable_guardian_for_test.ts`.

---

## Phase 3 — Guardian Editing (independent of portal status)

**Tested**: 2026-10-27 | **Result: PASS**

| Step | Expected | Result |
|---|---|---|
| Admin creates new household via admin UI | Household saved | ✅ PASS |
| Admin edits household fields | Changes persist on reload | ✅ PASS |
| Guardian with "No Portal Account" badge can still be edited | Edit saves without error | ✅ PASS |
| No portal account auto-created on edit | Badge remains "No Portal Account" | ✅ PASS |

---

## Phase 4 — Administrator-Assigned Parent Login Workflow

**Tested**: 2026-10-27 | **Result: ALL PASS**

### Step 1 — Account creation (no email sent)

| Step | Expected | Result |
|---|---|---|
| Admin clicks "Create Login Account" | TempPasswordModal appears | ✅ PASS |
| Admin enters temp password | Guardian email pre-filled, password field editable | ✅ PASS |
| Modal submits | No email sent to guardian | ✅ PASS — `email_confirm: true` suppresses email |
| Admin UI refreshes | Badge shows "Setup Pending" (no first login yet) | ✅ PASS |

### Step 2 — Force-password-change enforcement

| Step | Expected | Result |
|---|---|---|
| Guardian logs in with temp password | Immediately redirected to `/auth/change-password` | ✅ PASS |
| Change-password page | Shows "Account was set up by an administrator" message | ✅ PASS |
| Guardian enters new password | Account updated, redirected to login | ✅ PASS |

### Step 3 — Old temp password rejected after change

| Step | Expected | Result |
|---|---|---|
| Guardian tries to log in with temp password after changing it | Login fails | ✅ PASS |
| Guardian logs in with new password | Login succeeds | ✅ PASS |

### Step 4 — Parent visibility restrictions

| Step | Expected | Result |
|---|---|---|
| Guardian logs in, selects org | Portal shows only linked student (TEST Student-Staging) | ✅ PASS |
| Guardian navigates to `/dashboard` | Redirected away (staff-only) | ✅ PASS |
| Guardian navigates to `/portal/children` | Shows only TEST Student-Staging | ✅ PASS |

### Step 5 — Login after disable

| Step | Expected | Result |
|---|---|---|
| Admin disables guardian via "Disable" button | UI shows "Portal Disabled" | ✅ PASS |
| Guardian signs out and attempts login | Redirected to `/select-mission` with "No active missions found" | ✅ PASS |

---

## Phase 5 — Active Session Revocation

**Tested**: 2026-10-27 | **Result: PASS** (after fix applied — commit to follow)

### Before fix (initial finding)

| Step | Expected | Actual | Result |
|---|---|---|---|
| Guardian logs in, selects org | Portal accessible | Portal accessible | ✅ |
| Admin disables guardian org_member (status = inactive) | Active session blocked immediately | Session NOT blocked; guardian continues browsing | ❌ FAIL |
| Guardian navigates to `/portal/children` without logout | Blocked/redirected | Page loads normally | ❌ FAIL |

**Root cause**: The portal layout (`src/app/(portal)/layout.tsx:32`) checked access via the `sc_active_role` cookie only, not by re-querying `organization_members.status` on each request.

### Fix applied (`src/app/(portal)/layout.tsx`)

Added redirect when the DB membership query (which already filters `status = 'active'`) returns null — meaning the guardian has been disabled. The existing query was already running; its result just wasn't used for access gating until this change.

```typescript
// Deny access if no active membership found in DB
if (!membership) redirect("/select-mission");
```

### After fix — verified in staging

| Step | Expected | Actual | Result |
|---|---|---|---|
| Guardian logs in, selects org, enters portal | Portal accessible | Portal accessible at `/portal/home` | ✅ PASS |
| Admin disables guardian (org_member status = inactive) via script | — | Status set to inactive in DB | — |
| Guardian navigates to `/portal/children` without logout | Blocked/redirected | Redirected to `/select-mission` | ✅ PASS |
| Guardian navigates to `/portal/home` without logout | Blocked/redirected | Redirected to `/select-mission` | ✅ PASS |
| Guardian re-enabled, selects org again | Portal accessible | Portal accessible at `/portal/home` | ✅ PASS |
| `select-mission` shows "No active missions found" when disabled | "No active missions found" | "No active missions found. Contact your organization administrator for access." | ✅ PASS |

---

## Environment Notes

- **`.env.local` during these tests**: Staging (`qjyofbxmymquqobalshg`). Must be restored to production before shipping.
- **Production ref**: `cgnqkaqbsquerohxqkqt` — all scripts abort if this appears in the URL.
- **Test records exist only in staging**: Verified by ID prefix `aaaaaaaa-0001-...` (test guardian) not present in production.

---

## Pending UX Improvement (not implemented)

After a parent completes the forced password change, show:
> "Your password has been updated. Please sign in with your new password."

Currently the page redirects to the login form without a confirmation message. **Do not implement without approval.**

---

## How to Reset Test State

```bash
# Disable guardian (return to default state)
npx tsx scripts/disable_guardian_for_test.ts

# Re-enable guardian for future testing
npx tsx scripts/check_and_enable_guardian.ts
```
