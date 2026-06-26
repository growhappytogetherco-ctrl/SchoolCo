# SchoolCo — API Architecture

**Version:** 0.1.1 (updated pre-Sprint 1)
**Last updated:** 2026-06-26

---

## Overview

SchoolCo does not expose a traditional REST or GraphQL API to external consumers.
All data access follows one of three internal patterns:

1. **Server Components** — fetch data directly on the server using the Supabase server client
2. **Server Actions** — handle mutations from client components without exposing an endpoint
3. **Route Handlers** — used only for specific cases where a URL is required (e.g., auth callback, webhooks)

This architecture means there are no API keys to manage, no API versioning, and no
external API surface to harden against. The Supabase anon key handles all client-side
data access, filtered entirely by RLS.

---

## Data Access Patterns

### Pattern 1: Server Component (read)

Used for any page that needs data rendered on the server. The Supabase server client
reads cookies automatically to authenticate the request.

```typescript
// src/app/(dashboard)/dashboard/home/page.tsx
import { getUser, getProfile } from "@/lib/supabase/server";

export default async function DashboardHomePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.id);
  // render with profile data...
}
```

**When to use:** Page-level data that benefits from SSR, SEO (not applicable here —
this is a private platform), or avoiding a client-side loading flash.

### Pattern 2: Server Action (mutation)

Used for form submissions and any write operation from a client component.
Server Actions run on the server — the Supabase service role key is safe here if needed.

```typescript
// src/app/(dashboard)/dashboard/profile/actions.ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: formData.get("full_name") })
    .eq("id", user.id);

  if (!error) {
    await writeAuditLog(supabase, { action: "profile.updated", entity_type: "profiles", entity_id: user.id });
  }
  return error ? fail(error.message) : ok(null);
}
```

**When to use:** Any write (INSERT, UPDATE) from a form or user interaction.

### Pattern 3: Route Handler (URL-required)

Used only when a URL endpoint is necessary — auth callbacks, Supabase webhooks, or
future Resend email webhooks. Not used for general data access.

```
src/app/auth/callback/route.ts    ← Supabase OAuth/email callback
```

**When to use:** External services that need to POST to a URL (Supabase Auth, Resend, webhooks).

---

## Existing Route Handlers

### `GET /auth/callback`

Exchanges a Supabase auth code for a session cookie.

| | |
|--|--|
| Path | `/auth/callback` |
| Method | `GET` |
| Auth required | No |
| Query params | `code` (Supabase auth code), `next` (optional redirect path) |
| Success redirect | `/select-mission` or `?next=` value |
| Error redirect | `/login?error=auth` |

**Security:** The `code` param is single-use. Supabase invalidates it after exchange.
If exchange fails, the user is redirected to login — no error details are exposed.

---

## Planned Route Handlers (Sprint 2+)

### `POST /api/webhooks/resend` *(Sprint 2)*

Receives delivery status webhooks from Resend. Validates the `Resend-Signature`
header before processing. Updates communication send-status records.

### `POST /api/webhooks/supabase` *(Sprint 3)*

Receives database webhooks for attendance anomaly detection and automated
badge award triggers. Validates `x-supabase-webhook-secret` before processing.

---

## Supabase Client Helpers (`src/lib/supabase/server.ts`)

These server-side helpers are used throughout server components and server actions.
They wrap common queries and enforce that the caller is authenticated.

### `getUser()`
Returns the authenticated `User` object from Supabase Auth, or `null` if unauthenticated.
Always call this first in any server component or action that touches user data.

```typescript
const user = await getUser();
if (!user) redirect("/login");
```

### `getProfile(userId: string)`
Returns the `Profile` row for the given user ID, or `null` if not found.

```typescript
const profile = await getProfile(user.id);
```

### `getUserOrganizations(userId: string)`
Returns all active `organization_members` rows for the given user, joined with the
`organizations` table. Used by the mission switcher to list available orgs.

```typescript
const memberships = await getUserOrganizations(user.id);
```

---

## React Query Usage (client-side)

For client components that need to fetch or refetch data after user interaction,
React Query (`@tanstack/react-query`) is used. The `QueryClient` is configured in
`src/providers/QueryProvider.tsx` with:

- `staleTime: 60_000` — data is considered fresh for 60 seconds
- `retry: 1` — one retry on failure
- `refetchOnWindowFocus: false` — prevents unnecessary refetches

### Query Key Convention

Query keys follow the pattern `[entity, scope, id?]`:

```typescript
["organizations", "mine"]              // all orgs for current user
["profile", userId]                    // a specific profile
["students", orgId]                    // all students in an org
["guardianships", studentId]           // all guardians for a student
["guardianships", "mine", studentId]   // current user's own guardianship for a student
```

---

## Error Handling

All server actions return an `ActionResult<T>` — a discriminated union:

```typescript
type ActionResult<T> =
  | { success: true;  data: T }
  | { success: false; error: string };
```

Helpers: `ok<T>(data)` and `fail(message)` from `src/lib/errors.ts`.

Client components check `result.success` before reading `result.data`:

```typescript
const result = await updateProfile(formData);
if (!result.success) {
  setError(result.error);
  return;
}
```

HTTP status code mapping (for Route Handlers):

| Error class | Status |
|------------|--------|
| `AuthError` | 401 |
| `ForbiddenError` | 403 |
| `NotFoundError` | 404 |
| `ValidationError` | 400 |
| `RateLimitError` | 429 |
| `AppError` (generic) | 500 |

---

## Data Validation

All form inputs are validated with **Zod** before reaching the database.
Schemas are co-located with their Server Actions. No raw `FormData` is passed
to Supabase without validation.

```typescript
import { z } from "zod";

const UpdateProfileSchema = z.object({
  full_name: z.string().min(1).max(120),
  phone: z.string().regex(/^\+?[\d\s\-()]{7,20}$/).optional(),
});

export async function updateProfile(formData: FormData) {
  const parsed = UpdateProfileSchema.safeParse({
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return fail("Invalid input");
  // proceed...
}
```

---

## Planned Server Actions (Sprint 1)

| Action | File | Who can call |
|--------|------|-------------|
| `updateProfile` | `dashboard/profile/actions.ts` | Own profile |
| `updateOrgSettings` | `dashboard/settings/actions.ts` | full_admin+ |
| `inviteMember` | `dashboard/members/actions.ts` | admin+ |
| `updateMemberRole` | `dashboard/members/actions.ts` | admin+ |
| `enrollStudent` | `dashboard/students/actions.ts` | registrar+ |
| `addGuardian` | `dashboard/students/actions.ts` | registrar+ |
| `updateGuardianship` | `dashboard/students/actions.ts` | registrar+ |
| `setActiveOrg` | `actions/org.ts` | any authenticated (own memberships) |

All actions: validate input with Zod → check role → execute mutation → write audit log → return `ActionResult`.

---

## No Public API

SchoolCo does not offer a public developer API in Sprints 0–4. All data access
is through the internal patterns above. If a third-party integration is added
(e.g., curriculum platforms, payment processors), a dedicated Route Handler with
webhook signature verification will be created and documented here.
