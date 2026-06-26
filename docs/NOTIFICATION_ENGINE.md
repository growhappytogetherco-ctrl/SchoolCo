# SchoolCo Unified Notification Engine Architecture

**Status:** Architecture document — not yet implemented.
**Target Sprint:** Sprint 2 (email), Sprint 3 (in-app), Sprint 4 (SMS/push)
**Last updated:** Sprint 1

---

## Overview

The Unified Notification Engine (UNE) is the single delivery layer for all outbound communications in SchoolCo. Every notification — whether triggered by an attendance alert, a staff message, or a published announcement — passes through the UNE.

The UNE is responsible for:
1. Determining which guardians/members should receive a notification
2. Enforcing each guardian's `communication_json` preferences
3. Selecting the correct delivery channel(s) per recipient
4. Queuing messages and managing retries
5. Recording delivery results in `audit_logs`

**The UNE never sends autonomously for sensitive notifications.** Staff must approve incident notifications, behavioral alerts, and certain record changes before delivery. The engine queues and waits.

---

## Delivery Channels

| Channel | Sprint | Provider | Notes |
|---|---|---|---|
| **Email** | Sprint 2 | Resend | Transactional; uses domain authentication |
| **In-app** | Sprint 3 | Supabase Realtime | Bell icon + notification center in dashboard |
| **SMS** | Sprint 4 | TBD (Twilio or similar) | Guardian opt-in required |
| **Push** | Sprint 4+ | TBD | Mobile app (future) |

---

## Guardian Communication Preferences (`communication_json`)

Every `guardianship` row stores a `communication_json` object that controls what this guardian receives and how:

```typescript
interface GuardianCommunication {
  // Channels this guardian has enabled
  channels: {
    email:  boolean;
    sms:    boolean;
    in_app: boolean;
    push:   boolean;
  };

  // Which event types this guardian wants to receive
  receive: {
    attendance_alerts:     boolean;
    grade_reports:         boolean;
    announcements:         boolean;
    incident_notifications: boolean;
    direct_messages:       boolean;
    payment_reminders:     boolean;
  };

  // Quiet hours (local time)
  quiet_hours: {
    enabled:    boolean;
    start_time: string | null;  // "22:00"
    end_time:   string | null;  // "07:00"
  };

  // Preferred language (future i18n support)
  preferred_language: string;  // "en"
}
```

**The UNE is the only place that reads `communication_json`.** No other module checks preferences directly.

**Custody restrictions apply before preferences.** If a guardian's `visibility_json` blocks a category (e.g., `incidents: false`), the UNE will not deliver incident notifications regardless of `communication_json`.

---

## Notification Types

### Auto-Approved Notifications
These are sent without requiring staff review:

| Type | Trigger Event | Channels |
|---|---|---|
| Absence alert | `attendance.absent_marked` | Email, SMS, in-app |
| Tardy alert | `attendance.tardy_marked` | In-app (email optional) |
| Announcement | `announcement.published` | Email, in-app |
| Message received | `message.sent` | In-app, email digest |
| Grades published | `report_card.published` | Email, in-app |

### Human-Approved Notifications
These are queued by the UNE and require explicit staff approval before delivery:

| Type | Trigger Event | Approver Role |
|---|---|---|
| Incident notification | `incident.created` | Admin+ |
| Behavior alert | Internal flag | Admin+ |
| Custody/pickup change | `guardian.custody_changed` | Registrar+ |
| Suspension notice | Incident type = suspension | Full Admin |

The UNE shows pending-approval notifications in the staff dashboard (Sprint 3).

---

## Notification Lifecycle

```
Event emitted
     │
     ▼
UNE receives event
     │
     ├─ Determine recipients (guardians of affected student, or org members)
     ├─ Check visibility_json — exclude guardians blocked from this category
     ├─ Check communication_json — exclude channels guardian has disabled
     ├─ Check quiet_hours — defer delivery if in quiet window
     │
     ▼
Notification record created in notifications table
  status: pending_approval (human-gated) OR queued (auto-approved)
     │
     ▼
[If pending_approval] → Staff dashboard approval queue
     │                       │
     │              Staff approves
     │                       │
     ▼                       ▼
UNE dispatches to channel providers
     │
     ├─ Email → Resend API
     ├─ In-app → Supabase Realtime insert
     ├─ SMS → Twilio (Sprint 4)
     │
     ▼
Delivery result recorded
  success → status: delivered, delivered_at set
  failure → status: failed, retry scheduled (max 3 attempts)
     │
     ▼
audit_logs.INSERT — every delivery attempt recorded
```

---

## Database Schema (Planned — Sprint 2)

```sql
create table notifications (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id),
  
  -- What triggered this
  event_id         uuid,             -- references the audit_log event
  notification_type text not null,  -- 'absence_alert', 'incident', 'message', etc.
  
  -- Who it's for
  recipient_id     uuid not null references profiles(id),
  student_id       uuid references students(id),
  
  -- Content
  subject          text,
  body_text        text not null,
  body_html        text,
  metadata         jsonb,
  
  -- Channel & delivery
  channel          text not null,   -- 'email', 'sms', 'in_app', 'push'
  status           text not null default 'queued',
                   -- 'pending_approval' | 'queued' | 'sending' | 'delivered' | 'failed' | 'cancelled'
  
  -- Approval gate
  requires_approval boolean not null default false,
  approved_by      uuid references profiles(id),
  approved_at      timestamptz,
  
  -- Delivery tracking
  provider_message_id text,         -- Resend message ID, Twilio SID, etc.
  delivered_at     timestamptz,
  failed_at        timestamptz,
  failure_reason   text,
  retry_count      int not null default 0,
  
  -- Standard columns
  created_at       timestamptz not null default now(),
  created_by       uuid references profiles(id),
  archived_at      timestamptz,
  
  -- RLS
  -- Recipients can see their own in-app notifications
  -- Staff+ can see all notifications for their org
  -- Audit logs are append-only
);

create index on notifications (organization_id, recipient_id, status);
create index on notifications (organization_id, status) where requires_approval = true;
```

---

## Email Architecture (Sprint 2)

All outbound email uses **Resend** (see `RESEND_SETUP.md`).

### Template Strategy
Templates are React Email components (server-rendered to HTML). Each notification type has its own template:

```
src/
  emails/
    templates/
      AbsenceAlert.tsx
      IncidentNotice.tsx
      Announcement.tsx
      WelcomeGuardian.tsx
      PasswordReset.tsx
    layouts/
      BaseEmail.tsx        — SchoolCo brand wrapper
      OrganizationEmail.tsx — org-specific header/footer
    send.ts               — sendEmail() helper using Resend
```

### Org Branding
Each organization can configure a custom `primary_color` and `logo_url`. The `OrganizationEmail` layout uses these to brand outbound emails — so a parent of a Rising Leaders Academy student sees RLA branding, not generic SchoolCo branding.

---

## In-App Notifications (Sprint 3)

In-app notifications use Supabase Realtime subscriptions. The dashboard shell subscribes to the `notifications` table for the current user's unread in-app items.

```typescript
// Planned implementation
supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `recipient_id=eq.${userId}&channel=eq.in_app`,
  }, handleNewNotification)
  .subscribe();
```

A bell icon in the top nav shows the unread count. Clicking opens a notification panel.

---

## Split-Household Enforcement

When a notification is triggered for a student with a split household:

1. The UNE loads all active guardianships for the student.
2. For each guardian, it checks `visibility_json` for the notification category.
3. If `visibility_json[category] === false`, that guardian is excluded entirely.
4. Remaining guardians are notified per their `communication_json` preferences.

**Example:** Darnell Williams (`custody_type: supervised`, `visibility_json.incidents: false`) will never receive incident notifications for Zoe or Jordan, even if he requests them. The engine enforces this at the RLS helper level — his guardian row simply isn't returned by `can_view_student()`.

---

## What the Notification Engine Does NOT Do

- It does not store message content permanently visible to parents in Sprint 1. The parent-facing message center is Sprint 2.
- It does not allow guardians to send messages to staff in Sprint 1. That is Sprint 2.
- It does not implement push notifications or mobile app in Sprint 1-3.
- It does not override custody restrictions. `visibility_json` is a hard gate, not a preference.
- It does not let AI autonomously send sensitive communications. Every incident notification, custody-related message, or behavioral alert requires explicit human approval.
