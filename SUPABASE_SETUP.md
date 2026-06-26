# SchoolCo — Supabase Setup Guide

Follow these steps in order. This sets up a production-quality Supabase
foundation for SchoolCo from scratch.

---

## Environment Strategy

SchoolCo uses three separate Supabase projects — one per environment.
This prevents development mistakes from ever touching production data.

| Environment | Supabase Project     | URL                          |
|-------------|----------------------|------------------------------|
| Development | `schoolco-dev`       | localhost:3000               |
| Staging     | `schoolco-staging`   | staging.schoolco.app         |
| Production  | `schoolco-production`| schoolco.app / your domain   |

**Start with `schoolco-dev` only.** Do not create staging or production
until the development environment is stable and tested.

---

## Step 1 — Create the Dev Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Click **"New project"**.
3. Fill in:
   - **Organization**: Your personal org or create one called "SchoolCo"
   - **Project name**: `schoolco-dev`
   - **Database password**: Click "Generate a password" and save it securely in a password manager
   - **Region**: Choose the region closest to your users (e.g., `US East (N. Virginia)`)
   - **Plan**: Free tier is fine for development
4. Click **"Create new project"** and wait approximately 2 minutes for provisioning.

---

## Step 2 — Get Your API Keys

1. Go to **Settings → API** in the left sidebar.
2. Copy these values into your `.env.local` file:

| Supabase label        | .env.local variable              |
|-----------------------|----------------------------------|
| Project URL           | `NEXT_PUBLIC_SUPABASE_URL`       |
| anon (public) key     | `NEXT_PUBLIC_SUPABASE_ANON_KEY`  |
| service_role key      | `SUPABASE_SERVICE_ROLE_KEY`      |

Your `.env.local` should look like:
```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghij.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_ORGANIZATION_SLUG=rising-leaders-academy
```

> **Security rule:** `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS policies.
> Never prefix it with `NEXT_PUBLIC_`. Never import it in any client component.
> Treat it like a database root password.

---

## Step 3 — Run Migration 1: Initial Schema

1. In your Supabase project, click **SQL Editor** in the left sidebar.
2. Click **"New query"**.
3. Open `supabase/migrations/00001_initial_schema.sql` from this project folder.
4. Paste the entire file contents into the SQL Editor.
5. Click **"Run"** (or `Cmd+Enter`).
6. You should see: **"Success. No rows returned."**

---

## Step 4 — Run Migration 2: RLS Policies + Helper Functions

1. Click **"New query"** again.
2. Open `supabase/migrations/00002_rls_policies.sql`.
3. Paste and run it.
4. You should see: **"Success. No rows returned."**

**Verify RLS is active:** Run this query in the SQL Editor:
```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```
All four tables should show `rowsecurity = true`.

**Verify helper functions exist:**
```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_type = 'FUNCTION'
order by routine_name;
```
You should see: `has_min_org_role`, `has_org_role`, `is_full_admin_or_above`,
`is_org_admin`, `is_org_member`, `is_platform_admin`, `is_staff_or_above`.

**Verify tables exist:**
Go to **Table Editor** in the left sidebar. You should see 4 tables:
`organizations`, `profiles`, `organization_members`, `audit_logs`.

---

## Step 5 — Run Migration 3: Add Tagline Column

1. Click **"New query"** again.
2. Open `supabase/migrations/00003_add_tagline.sql`.
3. Paste and run it.
4. You should see: **"Success. No rows returned."**

This migration is idempotent (`ADD COLUMN IF NOT EXISTS`) — safe to run even
if the column already exists from migration 00001.

---

## Step 6 — Configure Auth Settings

1. Go to **Authentication → Settings**.
2. Under **"Site URL"**, enter: `http://localhost:3000`
3. Under **"Redirect URLs"**, add:
   - `http://localhost:3000/auth/callback`
4. Under **"Email Auth"**:
   - Ensure **"Enable email confirmations"** is **ON**
   - This sends a verification email when a new account is created
5. Click **"Save"**.

> You will add the production URL to Redirect URLs when you deploy to Vercel.

---

## Step 7 — Customize Auth Emails

1. Go to **Authentication → Email Templates**.
2. Customize the **"Confirm signup"** email:
   - Reference `{{ .ConfirmationURL }}` for the verification link
   - Add your organization's name and branding
3. Customize the **"Reset password"** email similarly.

---

## Step 8 — Create Rising Leaders Academy

1. In **SQL Editor**, run this query:

```sql
insert into organizations (
  name,
  short_name,
  slug,
  organization_type,
  tagline,
  primary_color,
  secondary_color,
  accent_color,
  timezone,
  is_active
)
values (
  'Rising Leaders Academy',
  'RLA',
  'rising-leaders-academy',
  'academy',
  'Raising the next generation of leaders with faith, character, and purpose.',
  '#046264',
  '#0B1747',
  '#E64E72',
  'America/New_York',
  true
)
returning id;
```

2. **Copy the `id` value** from the result — you will use it in Step 8.

---

## Step 9 — Create Your Admin Account

1. Go to **Authentication → Users → "Invite user"**.
2. Enter your email address and click **"Invite"**.
3. Check your email and click the confirmation link.
4. You will be redirected to `localhost:3000/auth/callback`.

5. Back in **SQL Editor**, find your user ID:
   ```sql
   select id, email from auth.users order by created_at desc limit 5;
   ```

6. Assign yourself as `full_admin` of Rising Leaders Academy:
```sql
insert into organization_members (
  organization_id,
  profile_id,
  role,
  status,
  joined_at
)
values (
  '<your-organization-id>',   -- from Step 7
  '<your-user-id>',           -- from the query above
  'full_admin',               -- Director-level access for your organization
  'active',
  now()
);
```

> **Note:** `full_admin` gives you complete control over your organization.
> `platform_admin` is reserved for SchoolCo platform-level administration
> and is assigned separately during platform setup.

---

## Step 10 — Run the App

```bash
# From the SchoolCo project folder:

# Install all dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

You will be redirected to the login page. Sign in with your email.
After login, you will land on the Mission Selector, where Rising Leaders Academy
appears as your first mission. Select it to enter the dashboard.

---

## Step 11 — Deploy to Vercel (When Ready)

1. Push this project to a GitHub repository.
2. Go to [https://vercel.com](https://vercel.com) → **"Add New → Project"**.
3. Import your GitHub repository.
4. Under **"Environment Variables"**, add all five variables from your `.env.local`.
   - Set the correct production values (not localhost values).
5. Set **"Framework Preset"** to `Next.js`.
6. Click **"Deploy"**.

After deploying:
- Go back to Supabase **Authentication → Settings**
- Change **Site URL** to your Vercel domain
- Add your Vercel URL to **Redirect URLs**: `https://your-domain.vercel.app/auth/callback`

---

## Pre-Launch Security Checklist

- [ ] `SUPABASE_SERVICE_ROLE_KEY` is never in any client-side code or `NEXT_PUBLIC_` variable
- [ ] Email confirmations are enabled
- [ ] Redirect URLs include only your known domains
- [ ] RLS is active on all 4 tables (verified in Step 4)
- [ ] All 7 helper functions are present (verified in Step 4)
- [ ] Audit log table has no UPDATE or DELETE policies (append-only)
- [ ] Database password is stored in a password manager, not in any file
- [ ] `.env.local` is in `.gitignore` and not committed to git

---

## Troubleshooting

**"relation 'profiles' does not exist"**
→ Migration 00001 did not run successfully. Check for errors in the SQL Editor output and re-run the full file.

**"new row violates row-level security policy"**
→ Correct behavior — RLS is working. Either your session is not authenticated, or a policy is intentionally blocking the action. Check that your organization_member record exists and has `status = 'active'`.

**Redirect loop on /login**
→ Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correctly set in `.env.local` and restart the dev server.

**Auth callback returns 404**
→ Ensure `http://localhost:3000/auth/callback` is in Supabase's **Redirect URLs** list.

**"function is_org_member does not exist"**
→ Migration 00002 did not run successfully. Re-run it in the SQL Editor.

**"type user_role does not exist"**
→ Migration 00001 did not run successfully. Re-run 00001 first, then 00002.
