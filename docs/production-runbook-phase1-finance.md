# Production Runbook — Phase 1 Financial Foundation

**Scope:** Migrations 00088, 00089, 00090  
**Prepared:** 2026-10-14  
**Status:** READY FOR AUTHORIZATION

---

## Overview

Three migrations deploy sequentially. Each is independent and safe to roll back individually, in reverse order (00090 → 00089 → 00088). A fourth step — the historical ledger backfill — is a **separate authorized operation** that runs only after all three migrations are confirmed healthy.

| Step | Action | Reversible? | Requires separate approval? |
|------|--------|-------------|---------------------------|
| 1 | Pre-deployment backup | — | No |
| 2 | Production health check | — | No |
| 3 | Apply migrations 00088–00090 | Yes (rollback scripts) | **Yes — migration push** |
| 4 | Post-migration smoke test | — | No |
| 5 | Historical ledger backfill | Yes (delete ledger rows) | **Yes — separate authorization** |
| 6 | Post-backfill reconciliation | — | No |
| 7 | Go/No-Go decision | — | No |

---

## Step 1 — Pre-Deployment Backup

**Purpose:** Capture the current state of all production tables before any changes.

```bash
# Run from project root, reads .env.local (production)
npx tsx scripts/backup_full_database.ts
```

**Expected output:**
- `backup/full_<timestamp>.json` — all ~80 tables
- `backup/full_<timestamp>.meta.json` — row counts and coverage report

**Verify:** Check the `.meta.json` for errors. Confirm `student_charges`, `student_payments`, `charge_adjustments` counts match the last known audit totals (45 charges, 22 payments, 6 adjustments).

**Stop if:** Any financial table errors. Investigate before proceeding.

---

## Step 2 — Production Health Check

Verify production is in the expected state before pushing.

```bash
# Check current migration status
npx supabase@1.207.9 db remote status --linked
```

**Expected:** 87 migrations applied, status `upToDate: false` (migrations 00088–00090 pending).

```bash
# Verify current production financial totals (read-only)
ENV_FILE=.env.local npx tsx scripts/audit_finance_reconciliation.ts
```

**Expected:** 45 charges, 22 payments, 6 adjustments, balance $83,850 outstanding.

**Stop if:** Unexpected migration count or balance discrepancy.

---

## Step 3 — Apply Migrations ⚠ REQUIRES AUTHORIZATION

> **This step requires explicit "proceed" from the user.**  
> Do not run `supabase db push --linked` without a clear "yes, apply migrations to production."

```bash
npx supabase db push --linked
```

**What this deploys:**

### 00088 — Expand: Add `_cents` columns
- Adds `original_amount_cents` to `student_charges`, `charge_adjustments`
- Adds `amount_cents` to `student_payments`, `payment_allocations`
- Sync triggers keep NUMERIC and INTEGER columns in sync
- **Zero risk to existing data.** Old app code uses NUMERIC columns unchanged.
- **Rollback:** `_rollback_00088.sql` — drops cents columns and sync triggers

### 00089 — Append-Only Ledger
- Creates `finance_ledger` table (empty at migration time)
- Adds immutability triggers (no UPDATE or DELETE ever)
- Adds forward-going INSERT triggers on charges/payments/adjustments
- **Does NOT backfill historical records** (Step 5 below)
- **Rollback:** `_rollback_00089.sql` — safe only while ledger is empty

### 00090 — Family Finance Accounts
- Creates `family_finance_accounts` and `finance_settings` tables
- Backfills one account row per active guardian per org
- Creates default `finance_settings` row for the org
- **Rollback:** `_rollback_00090.sql` — drops both tables; backfill rows are recreatable

**Verify migration applied:**
```bash
npx supabase@1.207.9 db remote status --linked
# Expected: 90 migrations, upToDate: true
```

---

## Step 4 — Post-Migration Smoke Tests

Run immediately after the migration push succeeds.

### 4a. Verify tables exist
```bash
ENV_FILE=.env.local npx tsx -e "
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  for (const t of ['finance_ledger', 'family_finance_accounts', 'finance_settings']) {
    const { count } = await db.from(t).select('id', { count: 'exact', head: true });
    console.log(t + ':', count, 'rows');
  }
})();
"
```

**Expected:**
- `finance_ledger`: 0 rows (empty until backfill or new transactions)
- `family_finance_accounts`: 1+ rows (one per active guardian, from migration backfill)
- `finance_settings`: 1 row (one per org)

### 4b. Verify cents sync triggers
```bash
ENV_FILE=.env.local npx tsx scripts/audit_finance_reconciliation.ts
```

**Expected:** Same totals as Step 2. No cents-column discrepancies.

### 4c. Verify ledger triggers fire on new transaction
Create a test charge via the app (staff interface), then:
```bash
ENV_FILE=.env.local npx tsx -e "
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  const { count } = await db.from('finance_ledger').select('id', { count: 'exact', head: true });
  console.log('Ledger rows (expect > 0 after first real transaction):', count);
})();
"
```

**Stop if:** Any table is missing, cents mismatch exists, or financial totals have changed unexpectedly.

---

## Step 5 — Historical Ledger Backfill ⚠ REQUIRES SEPARATE AUTHORIZATION

> **This step requires a separate explicit "proceed" from the user, distinct from Step 3.**  
> The backfill writes permanent immutable rows to `finance_ledger`.  
> Once written, these rows cannot be updated or deleted (trigger-enforced).

The backfill creates one ledger entry for each pre-migration charge, payment, and adjustment.

**Pre-check (always run dry-run first):**
```bash
# If ledger is empty (no transactions since Step 3):
ENV_FILE=.env.local npx tsx scripts/migrate_ledger_backfill.ts --dry-run

# If ledger has rows (new transactions entered after Step 3):
ENV_FILE=.env.local npx tsx scripts/migrate_ledger_backfill.ts --dry-run --force
```

**Expected dry-run output:** 45 charges + 6 adjustments + 22 payments = 73 entries minimum  
If post-migration transactions occurred, count will be higher — that is correct.

**Execute (only after authorization and after dry-run confirms expected count):**
```bash
# Ledger empty (no transactions since Step 3):
ENV_FILE=.env.local npx tsx scripts/migrate_ledger_backfill.ts

# Ledger has rows (new transactions since Step 3) — safe, see mid-window note below:
ENV_FILE=.env.local npx tsx scripts/migrate_ledger_backfill.ts --force
```

**Mid-window safety:** If new charges or payments are entered via the app between Step 3 and this step, the INSERT triggers will have already created ledger rows for those new records. The backfill handles this correctly:

- Pre-migration records (uuid-A): not in ledger yet → **inserted** by backfill
- Post-migration records (uuid-B): already in ledger from trigger → **silently skipped** (`ON CONFLICT DO NOTHING` on `(source_table, source_id, entry_type)`)
- Result: no double-entries, no missing entries, regardless of timing

When this scenario occurs, `--force` is required (ledger is not empty). Always run `--dry-run` first:
```bash
# Step 5a — dry-run first, always
ENV_FILE=.env.local npx tsx scripts/migrate_ledger_backfill.ts --dry-run --force
# Expected: 45 + 6 + 22 = 73 entries
# If count is higher, extra entries = post-migration transactions (correct)

# Step 5b — execute (only if dry-run output is as expected)
ENV_FILE=.env.local npx tsx scripts/migrate_ledger_backfill.ts --force
```

---

## Step 6 — Post-Backfill Reconciliation

```bash
ENV_FILE=.env.local npx tsx scripts/audit_finance_reconciliation.ts
```

**Expected after backfill:** 
- All financial totals unchanged (backfill does not change charges/payments/adjustments)
- Ledger row count = pre-existing rows + 73 historical backfill entries
- No cents-precision discrepancies

---

## Step 7 — Go/No-Go

| Check | Pass condition |
|-------|---------------|
| All 90 migrations applied | `upToDate: true` |
| `finance_ledger` exists and has rows | `> 0 rows` |
| `family_finance_accounts` has guardian rows | `>= 1 row` |
| `finance_settings` has org row | `= 1 row` |
| Cents sync audit passes | Zero discrepancies |
| Financial totals unchanged | Match pre-migration audit |
| No application errors in Vercel logs | Zero 500 errors on finance pages |

**Go:** Deploy application code changes (the finance server actions that use `_cents` columns).  
**No-Go:** Roll back in reverse order: 00090 → 00089 → 00088 using the `_rollback_*.sql` scripts.

---

## Rollback Procedures

### Roll back 00090 (family_finance_accounts + finance_settings)

```bash
# Check row counts first
ENV_FILE=.env.local npx tsx -e "
const dotenv = require('dotenv'); dotenv.config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  const { count: f } = await db.from('family_finance_accounts').select('id', { count: 'exact', head: true });
  const { count: s } = await db.from('finance_settings').select('id', { count: 'exact', head: true });
  console.log('family_finance_accounts:', f, '  finance_settings:', s);
})();
"
# Then apply the rollback (requires direct DB access)
# psql $DATABASE_URL < supabase/migrations/_rollback_00090.sql
```

### Roll back 00089 (finance_ledger)

> **ONLY safe if the ledger is empty.** If the ledger has rows (from new transactions or backfill), rolling back means permanent loss of the audit trail. Restore from the Step 1 backup instead.

```bash
ENV_FILE=.env.local npx tsx -e "
const dotenv = require('dotenv'); dotenv.config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
(async () => {
  const { count } = await db.from('finance_ledger').select('id', { count: 'exact', head: true });
  console.log('finance_ledger row count:', count, count > 0 ? '— UNSAFE to rollback' : '— safe to rollback');
})();
"
# If empty, apply rollback:
# psql $DATABASE_URL < supabase/migrations/_rollback_00089.sql
```

### Roll back 00088 (cents columns)

```bash
# psql $DATABASE_URL < supabase/migrations/_rollback_00088.sql
```

Safe at any time — only drops the `_cents` columns and sync triggers, NUMERIC columns untouched.

---

## Files Referenced

| File | Purpose |
|------|---------|
| `scripts/backup_full_database.ts` | Comprehensive JS-client backup of all ~80 tables |
| `scripts/audit_finance_reconciliation.ts` | Read-only reconciliation audit |
| `scripts/migrate_ledger_backfill.ts` | Historical backfill (separate authorization) |
| `supabase/migrations/00088_finance_cents_conversion.sql` | Expand: add `_cents` columns |
| `supabase/migrations/00089_finance_ledger.sql` | Append-only ledger |
| `supabase/migrations/00090_family_finance_accounts.sql` | Family accounts |
| `supabase/migrations/_rollback_00088.sql` | Rollback for 00088 |
| `supabase/migrations/_rollback_00089.sql` | Rollback for 00089 |
| `supabase/migrations/_rollback_00090.sql` | Rollback for 00090 |
| `docs/security-access-model.md` | RLS policy reference |

---

## What Cannot Be Backed Up (JS client limitations)

- `auth.users`, `auth.sessions`, `auth.identities` — Supabase Auth, platform-managed
- `storage.objects`, `storage.buckets` — Supabase Storage
- Supabase project configuration (JWT secret, API keys, environment variables)
- PostgreSQL schema (functions, triggers, RLS policies) — requires `supabase db dump` with Docker/pg_dump

The `backup_full_database.ts` script covers all ~80 application tables in the `public` schema. The `.meta.json` file documents exactly what was and was not captured.
