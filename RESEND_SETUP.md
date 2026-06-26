# SchoolCo — Resend Email Provider Setup

**Status:** Prepared for Sprint 2 — Do not implement until Sprint 2 begins.
**Decision recorded in:** `architecture/DECISION_LOG.md`
**Provider:** Resend (resend.com)

---

## Why Resend

Resend was selected over Supabase built-in, SendGrid, and Mailgun for these reasons:

- **Native Next.js SDK** — `resend` npm package is built for React and Server Actions
- **React Email** — email templates are written as React components, version-controlled
  alongside the rest of the codebase, and previewed in a browser during development
- **Clean API** — simple, well-documented. One function call to send an email.
- **Excellent deliverability** — domain authentication via DKIM/DMARC is straightforward
- **Generous free tier** — 3,000 emails/month, 100/day on free plan. Sufficient for Sprint 2.
- **Webhook support** — delivery status, bounce, and complaint events can be received
  via a Route Handler (planned `POST /api/webhooks/resend` in Sprint 2)

---

## Environment Variable to Add

Add this to `.env.local` when Sprint 2 begins:

```bash
# ── Resend (Sprint 2 — do not add until Sprint 2) ────────────
# Found in: resend.com → API Keys → Create API Key
# Name the key: schoolco-dev (one key per environment)
# Permission: Full access (required for sending and webhook management)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
```

Add the production value to Vercel environment variables as a **server-only** variable.
Never prefix with `NEXT_PUBLIC_`. This key must never reach the browser.

---

## Package to Install (Sprint 2)

```bash
npm install resend @react-email/components
```

Do not install these packages until Sprint 2 begins.

---

## Planned Email Module Structure (Sprint 2)

```
src/lib/email/
├── index.ts              ← sendEmail() wrapper, validates RESEND_API_KEY exists
├── types.ts              ← EmailPayload, EmailResult types
└── templates/
    ├── MemberInvite.tsx          ← Invitation email (React Email component)
    ├── PasswordReset.tsx         ← Custom reset email (overrides Supabase default)
    ├── IncidentNotification.tsx  ← Parent incident alert
    ├── AttendanceAlert.tsx       ← Absence notification to guardian
    └── Announcement.tsx          ← Org-wide or role-targeted announcement
```

---

## Planned Use Cases (Sprint 2)

| Trigger | Template | Recipient | Role required to send |
|---------|----------|-----------|----------------------|
| Member invited | MemberInvite | New member | admin+ |
| Incident created | IncidentNotification | Guardian(s) with `incidents: true` visibility | staff+ |
| Absence recorded | AttendanceAlert | Primary contact guardian | staff+ |
| Announcement published | Announcement | Role-targeted org members | admin+ |
| Password reset (custom) | PasswordReset | Requesting user | N/A (self-service) |

---

## Domain Authentication Steps (Before Sprint 2 Launch)

Resend requires domain authentication to ensure reliable delivery. Complete this
before Sprint 2 go-live. Do not skip — emails sent from unauthenticated domains
land in spam.

1. Go to [resend.com](https://resend.com) → **Domains → Add Domain**
2. Enter your sending domain (e.g., `mail.schoolco.app` or `mail.risingleadersacademy.org`)
3. Resend will provide three DNS records to add to your domain registrar:
   - SPF record (`TXT`)
   - DKIM record (`TXT`)
   - DMARC record (`TXT`)
4. Add all three records at your DNS provider
5. Click **Verify** in Resend — verification takes up to 48 hours
6. Set the verified domain as your `from` address in `src/lib/email/index.ts`

---

## Webhook Setup (Sprint 2)

Resend can POST delivery events to your application for tracking.

1. In Resend → **Webhooks → Add Endpoint**
2. Enter: `https://your-domain.app/api/webhooks/resend`
3. Select events: `email.delivered`, `email.bounced`, `email.complained`
4. Copy the **Signing Secret** and add it to your environment:
   ```bash
   RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxx
   ```
5. The Route Handler at `src/app/api/webhooks/resend/route.ts` (Sprint 2) will
   validate the `Resend-Signature` header using this secret before processing

---

## Guardian Communication Restriction

All emails sent to guardians must respect `communication_json` on the guardianship row.
Before sending any guardian-targeted email:

```typescript
// Pseudocode — implemented in Sprint 2
const guardianship = await getGuardianship(guardianId, studentId);
if (!guardianship.communication_json.email) {
  // Skip this guardian — they opted out of email notifications
  return;
}
```

This check is the application's responsibility. Resend itself has no knowledge of
SchoolCo's guardian communication preferences.

---

## Security Notes

- `RESEND_API_KEY` is server-only — never expose to the browser
- All send operations happen in Server Actions or Route Handlers
- Webhook handler must validate `Resend-Signature` before processing any event
- Do not log email body contents — they may contain sensitive student or family information
- Audit log entries will record `email.sent` events with recipient role and template
  name, but never the full email body
