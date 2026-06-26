# SchoolCo Internal Event Bus Architecture

**Status:** Architecture document — not yet implemented.
**Target Sprint:** Sprint 3 (internal listeners) + Sprint 4 (external webhooks)
**Last updated:** Sprint 1

---

## Overview

The Internal Event Bus is a lightweight, in-process pub/sub system that decouples modules from each other. When something meaningful happens in SchoolCo (a student is enrolled, a guardian is updated, attendance is marked), an event is emitted. Any number of subscribers can react to that event independently.

This prevents tight coupling between modules. The Attendance module does not call the Notification module directly — it emits `attendance.absent_marked`, and the Notification Engine subscribes to it.

---

## Design Principles

- **Emit and forget.** The emitter does not wait for subscribers to complete.
- **Human approval gates remain.** The Event Bus fires — but sensitive downstream actions (sending communications, escalating incidents) still require a human to approve before execution.
- **Organization-scoped.** Every event carries `organization_id`. Subscribers must filter to their org.
- **Append-only audit.** Every emitted event is written to `audit_logs` before delivery to subscribers.
- **No external dependencies for MVP.** The MVP implementation uses an in-process queue (Node.js `EventEmitter` or similar). External queue (Redis, SQS) is a Sprint 5+ consideration.

---

## Event Catalog

### Student Events

| Event Name | Emitted When | Key Payload Fields |
|---|---|---|
| `student.created` | A student record is created | `student_id`, `family_id`, `enrolled_by` |
| `student.enrolled` | Enrollment status → `enrolled` | `student_id`, `family_id`, `grade_level`, `track` |
| `student.withdrawn` | Enrollment status → `withdrawn` | `student_id`, `reason` |
| `student.archived` | `archived_at` is set on a student | `student_id`, `archived_by` |
| `student.profile_updated` | Any profile field changes | `student_id`, `changed_fields[]` |

### Family & Guardian Events

| Event Name | Emitted When | Key Payload Fields |
|---|---|---|
| `family.created` | A new family is created | `family_id`, `family_name`, `created_by` |
| `guardian.linked` | A guardianship row is created | `guardianship_id`, `profile_id`, `student_id`, `custody_type` |
| `guardian.updated` | Guardianship fields changed | `guardianship_id`, `changed_fields[]` |
| `guardian.custody_changed` | `custody_type` specifically changes | `guardianship_id`, `old_custody`, `new_custody` — triggers alert review |
| `guardian.pickup_restricted` | `can_pickup` set to false | `guardianship_id`, `profile_id`, `student_id` |
| `household.updated` | Household address or contact info changes | `household_id`, `family_id`, `changed_fields[]` |

### Attendance Events

| Event Name | Emitted When | Key Payload Fields |
|---|---|---|
| `attendance.absent_marked` | A student is marked absent | `student_id`, `date`, `reason`, `marked_by` |
| `attendance.tardy_marked` | A student is marked tardy | `student_id`, `date`, `minutes_late`, `marked_by` |
| `attendance.excused` | An absence is excused | `student_id`, `date`, `excused_by` |
| `attendance.checkin_completed` | QR check-in succeeds | `student_id`, `checked_in_by`, `timestamp` |

### Communication Events

| Event Name | Emitted When | Key Payload Fields |
|---|---|---|
| `message.sent` | Staff sends a message to family | `message_id`, `sender_id`, `recipient_ids[]`, `thread_id` |
| `announcement.published` | Org-wide announcement goes live | `announcement_id`, `published_by`, `audience` |
| `notification.queued` | Unified Notification Engine queues a delivery | `notification_id`, `channel`, `recipient_id` |
| `notification.delivered` | Delivery confirmed (email/SMS ACK) | `notification_id`, `channel`, `delivered_at` |
| `notification.failed` | Delivery failed after retries | `notification_id`, `channel`, `error` |

### Academic Events

| Event Name | Emitted When | Key Payload Fields |
|---|---|---|
| `grade.recorded` | A grade is entered | `student_id`, `subject`, `value`, `recorded_by` |
| `report_card.published` | Report card made visible to parent | `student_id`, `term`, `published_by` |

### Behavior & Incident Events

| Event Name | Emitted When | Key Payload Fields |
|---|---|---|
| `incident.created` | An incident is logged | `incident_id`, `student_id`, `type`, `created_by` |
| `incident.approved` | Staff admin approves incident | `incident_id`, `approved_by` — required before parent notification |
| `incident.parent_notified` | Parent is notified of approved incident | `incident_id`, `notified_by` |

### Organization Events

| Event Name | Emitted When | Key Payload Fields |
|---|---|---|
| `member.invited` | A new member invitation is sent | `profile_id`, `role`, `invited_by` |
| `member.activated` | Member accepts invite | `profile_id`, `role` |
| `member.role_changed` | Role is promoted or demoted | `profile_id`, `old_role`, `new_role`, `changed_by` |

---

## Base Event Schema

Every event conforms to this shape:

```typescript
interface SchoolCoEvent<T = Record<string, unknown>> {
  id:              string;          // UUID, unique event ID
  name:            string;          // e.g. "student.enrolled"
  organization_id: string;          // Always present — events are org-scoped
  emitted_at:      string;          // ISO 8601 timestamp
  emitted_by:      string | null;   // profile_id of the acting user (null for system)
  payload:         T;               // Event-specific data
}
```

---

## Subscriber Pattern

Subscribers are registered at app startup:

```typescript
// src/lib/events/bus.ts
export const bus = new SchoolCoEventBus();

// src/lib/events/subscribers/attendance.ts
bus.on('attendance.absent_marked', async (event) => {
  // Queue a notification for primary guardian
  // Human approval still required for communication delivery
  await notificationEngine.queue({
    type: 'absence_alert',
    student_id: event.payload.student_id,
    organization_id: event.organization_id,
    requires_approval: false, // Attendance alerts are auto-approved per policy
  });
});
```

---

## Audit Integration

Every emitted event is written to `audit_logs` **before** subscribers run:

```sql
INSERT INTO audit_logs (organization_id, actor_id, action, resource_type, resource_id, metadata)
VALUES (
  $event.organization_id,
  $event.emitted_by,
  $event.name,
  split_part($event.name, '.', 1),  -- e.g. 'student'
  $event.payload.student_id,         -- primary resource
  $event.payload                     -- full payload as JSONB
);
```

This means every meaningful action in the system is auditable even if subscribers fail.

---

## Implementation Roadmap

| Sprint | Deliverable |
|---|---|
| Sprint 3 | `SchoolCoEventBus` class, `audit_logs` integration, `student.*` and `attendance.*` events |
| Sprint 4 | `guardian.*`, `incident.*`, `communication.*` events; Notification Engine subscriber |
| Sprint 5 | External webhook delivery (POST to registered URLs), retry queue, dead letter storage |

---

## What the Event Bus Does NOT Do

- It does not replace server actions. Server actions validate input, write to the DB, and then emit events.
- It does not send notifications autonomously. The Notification Engine subscribes to events, queues messages, and waits for human approval on sensitive communications.
- It does not implement external webhooks in MVP. That is Sprint 5+.
- It does not cross organization boundaries. No event is visible outside the org it was emitted in.
