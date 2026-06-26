# SchoolCo Timeline Engine Architecture

**Status:** Architecture document — not yet implemented.
**Target Sprint:** Sprint 2 (foundation + Student Journey), Sprint 3 (Family Timeline + Activity Feeds), Sprint 4 (Leadership Passport + AI Summaries + Achievement Celebrations)
**Last updated:** Pre-Sprint 2

---

## Purpose and Distinction

SchoolCo has three record-keeping systems that are related but serve entirely different purposes:

| System | Audience | Purpose | Tone |
|---|---|---|---|
| **Audit Logs** | Compliance, admins | Immutable record of every database write. Who changed what, when. | Forensic. Never deleted. Never shown to parents or students. |
| **Event Bus** | Internal (server) | Decouples modules. Fires events so subscribers can react. | Technical. Not user-facing. |
| **Timeline Engine** | Students, families, staff | Tells the story of a student's growth journey in meaningful, human language. | Warm. Celebratory. Narrative. |

**The Audit Log answers: "What happened to this record?"**
**The Timeline Engine answers: "What is the story of this student?"**

A grade being recorded produces one audit log entry (`grade.recorded`) and one Event Bus emission. It may also produce a Timeline entry — but only if it is meaningful to the student's story (a new subject started, a milestone reached, a report card published). Routine grade updates do not clutter the timeline.

The Timeline Engine is a curator, not a recorder.

---

## Design Principles

- **Meaningful, not exhaustive.** Not every database change becomes a timeline entry. The engine selects events worth remembering.
- **Human language first.** Timeline entries are written in warm, readable prose — not database field names.
- **Organization-scoped.** Every entry belongs to an org. Entries are never visible across orgs.
- **Role-aware rendering.** The same underlying entry may be rendered differently for a student, a parent, or a staff member. Staff see more detail; students see encouragement; parents see context.
- **Privacy by design.** Split-household visibility rules apply to the Timeline exactly as they apply to raw data. A parent blocked from `behavior_notes` will never see a behavior-related timeline entry.
- **AI assists, humans approve.** AI Summaries are generated automatically but flagged for staff review before appearing in parent or student views.
- **Append-only storage.** Timeline entries are never deleted — they may be hidden (`hidden_at`) but the record persists.
- **Christ-centered tone.** Celebration entries acknowledge growth, perseverance, and character alongside academic achievement.

---

## Timeline Surfaces

The Timeline Engine powers seven distinct user-facing surfaces. Each surface is a filtered, rendered view of the same underlying `timeline_entries` table.

---

### 1. Student Journey

**Who sees it:** Staff (full view), Parents (filtered by `visibility_json`), Student themselves (age-appropriate view).

**What it shows:** The complete narrative of a student's time at the organization — from their first day to their most recent milestone. It reads like a storybook, not a spreadsheet.

**Entry types included:**
- Enrollment and grade transitions
- Track changes (e.g., switching from Classical to Entrepreneurship)
- Report cards published
- Attendance milestones (e.g., perfect attendance for a term)
- Badges earned
- Leadership Passport stamps
- Incidents (staff and admin only — never shown to parents unless explicitly approved)
- Notes shared with family
- Celebrations and character recognitions

**Rendering example:**
> *September 4, 2026 — Amara started 7th grade on the Classical track. Welcome back!*
> *November 15, 2026 — Amara earned the "Critical Thinker" badge from Ms. Rivera.*
> *December 18, 2026 — Amara's Fall Term report card was shared with her family.*

**Parent view:** Filtered by `visibility_json`. If `report_cards: false`, report card entries are hidden from that guardian's view.

---

### 2. Leadership Passport

**Who sees it:** The student, their parents, and staff. Designed to be printed or shared.

**What it shows:** A curated record of leadership development milestones — not academic grades, but character, service, and entrepreneurial growth. This is the student's portfolio of who they are becoming, not just what they've learned.

**Entry types included:**
- Leadership badges earned (tiered: Discovery → Explorer → Builder → Leader → Legacy)
- Service hours completed
- Business milestone (student entrepreneurs)
- Community impact entries (volunteering, presentations, mentorship)
- Character recognitions from teachers
- Key speeches, projects, or events the student led

**Design note:** The Leadership Passport is the most student-facing surface. Entries should be written in second person where possible ("You completed 10 hours of community service") and use celebratory language. This is a document students will show their families and future employers.

**Entry types NOT included:** Attendance, grades, incidents, behavior notes. The Leadership Passport is a celebration document.

---

### 3. Family Timeline

**Who sees it:** Parents/guardians, filtered by their specific `visibility_json` and `household_id`.

**What it shows:** A unified view of activity across all children a guardian is linked to. A parent with two children sees both children's milestones in one feed, with child names clearly labeled.

**Split-household enforcement:** Each guardian sees only entries they are permitted to see per their `visibility_json`. Two guardians in the same family with different visibility settings will see different timelines for the same student. This is by design. The engine generates visibility at render time, not at write time.

**Entry types included:**
- Student milestones (report cards, grade transitions, badges)
- Communications sent from staff to this family
- Events the family RSVP'd to
- Payment receipts (Sprint 5+)

**Entry types NOT included:** Staff notes, incidents (unless explicitly approved and `visibility_json.incidents: true`), other children they are not guardian of.

---

### 4. Organization Activity Feed

**Who sees it:** Staff (teacher role and above). This is the "What's happening at RLA today?" view.

**What it shows:** A real-time stream of meaningful organization-level activity — enrollments, announcements, achievements, and major milestones. It is intentionally high-level. It does not show individual student behavior or sensitive records.

**Entry types included:**
- New student enrollments
- Organization-wide announcements published
- Upcoming events (next 7 days)
- Achievement highlights (badge earned, student business milestone)
- Staff member joined or role changed
- Term/grading period transitions

**Entry types NOT included:** Individual attendance records, incident details, family financial data, staff-only notes.

**Purpose:** Gives staff a sense of the organization's pulse without requiring them to open individual student records. Encourages a culture of celebration and awareness.

---

### 5. Staff Activity Feed

**Who sees it:** Admins and full admins only.

**What it shows:** A more detailed operational feed — who did what, when. This is between the Audit Log (forensic) and the Org Activity Feed (celebration). It is the "staff situation awareness" layer.

**Entry types included:**
- All entries from the Org Activity Feed
- Enrollment status changes (withdrawn, suspended)
- Incident approvals and parent notifications
- Guardian/custody record changes
- Communication threads opened or escalated
- Attendance exceptions (patterns, excessive absences)
- Staff-flagged items needing admin attention

**Entry types NOT included:** Raw audit log entries, database field diffs, SECURITY DEFINER internals.

**Note:** The Staff Activity Feed is operationally useful, not forensic. If a staff member needs to know exactly what changed in a record, they go to the Audit Log. If they need to know what matters today, they use the Staff Activity Feed.

---

### 6. AI Summaries

**Who sees it:** Staff generate them; parents and students receive them (after approval).

**What it does:** The AI Summaries engine reads a student's timeline entries for a defined period (a week, a term, a year) and generates a warm, readable narrative summary — a "progress story" rather than a bullet list of events.

**Example output (term summary, parent-facing):**
> *Amara had a strong Fall Term. She maintained consistent attendance, completed her Classical track coursework, and earned her first Leadership Badge — "Critical Thinker" — recognizing her contribution to the Socratic seminar discussions. Her report card has been shared below. We're proud of how she's growing.*

**Constraints:**
- AI Summaries are generated by Claude (Anthropic API), using only the timeline entries the requesting user is already permitted to see. The AI never has access to data beyond what the human would see directly.
- Every generated summary is flagged `requires_review: true` until a staff member explicitly approves it.
- Staff may edit the summary before it is sent or made visible.
- Summaries are stored in `timeline_entries` with `entry_type: 'ai_summary'` and the original generated text preserved even if edited (edit history stored in `metadata`).
- Parents and students never see an AI-generated summary that has not been reviewed and approved by a staff member.
- The AI never autonomously decides to send a summary. It drafts; a human approves.

**Use cases:**
- End-of-term parent communication
- Student self-reflection prompts (Leadership Passport)
- New-family onboarding welcome message
- Staff briefing before a parent-teacher conference

---

### 7. Achievement Celebrations

**Who sees it:** Student, their guardians, and org-wide (with student/family consent).

**What it does:** When a student reaches a significant milestone — earns a badge, completes their first business sale, hits a service hour goal, achieves perfect attendance for a term — the Timeline Engine generates a Celebration Entry. These are displayed prominently, styled differently from regular timeline entries (larger, colored, with an icon), and may optionally be shared to the Org Activity Feed as an encouragement to the broader community.

**Celebration trigger examples:**
- First badge earned in any tier
- Leadership Passport: 10, 25, 50, 100 service hours
- Enrollment anniversary (1 year, 2 years, 3 years at the academy)
- Graduation
- Perfect attendance (term or year)
- First student business sale recorded
- Community impact milestone

**Consent model:** Celebration entries are opt-in for org-wide sharing. The default is private (visible to student + family + staff). Staff may promote a celebration to the Org Activity Feed with family consent. A family can opt out of public celebrations in their communication preferences.

**Tone guidance:** Celebration entries are the most joyful entries in the system. They should reference the specific achievement, acknowledge the student by name, and — where appropriate — connect the achievement to character or faith ("Elijah's perseverance paid off this term…"). They are never generic.

---

## Database Schema (Planned — Sprint 2)

```sql
create type timeline_entry_type as enum (
  'enrollment',
  'grade_transition',
  'track_change',
  'report_card_published',
  'badge_earned',
  'service_milestone',
  'business_milestone',
  'attendance_milestone',
  'character_recognition',
  'staff_note_shared',
  'announcement',
  'communication_sent',
  'incident_resolved',       -- Staff/admin only; never auto-shown to parent
  'ai_summary',
  'celebration',
  'custom'
);

create table timeline_entries (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references organizations(id),

  -- Who this entry is about
  student_id        uuid        references students(id),
  family_id         uuid        references families(id),

  -- What it is
  entry_type        timeline_entry_type not null,
  title             text        not null,  -- Short heading
  body              text,                  -- Narrative prose (may be null for simple entries)
  icon              text,                  -- Icon key (maps to Lucide icon name)
  color_key         text,                  -- 'teal' | 'navy' | 'gold' | 'green' | 'rose' | 'gray'

  -- Source event (what triggered this entry)
  source_event_name text,                  -- e.g. 'badge.earned'
  source_resource_type text,
  source_resource_id   uuid,

  -- Visibility & approval
  staff_only        boolean     not null default false,
  requires_approval boolean     not null default false,
  approved_by       uuid        references profiles(id),
  approved_at       timestamptz,
  hidden_at         timestamptz,          -- Soft-hide (never delete)
  hidden_by         uuid        references profiles(id),

  -- AI Summary fields (when entry_type = 'ai_summary')
  ai_generated      boolean     not null default false,
  ai_reviewed       boolean     not null default false,
  ai_reviewed_by    uuid        references profiles(id),

  -- Celebration fields
  is_celebration    boolean     not null default false,
  org_wide_shared   boolean     not null default false,
  org_wide_shared_at timestamptz,

  -- Rich metadata (entry-type specific)
  metadata          jsonb,

  -- Standard columns
  occurred_at       timestamptz not null default now(),  -- When the thing happened (may differ from created_at)
  created_at        timestamptz not null default now(),
  created_by        uuid        references profiles(id),
  updated_at        timestamptz,
  updated_by        uuid        references profiles(id),

  -- Organization scoping is enforced by RLS
  constraint chk_student_or_family check (student_id is not null or family_id is not null)
);

create index on timeline_entries (organization_id, student_id, occurred_at desc);
create index on timeline_entries (organization_id, family_id, occurred_at desc);
create index on timeline_entries (organization_id, entry_type, occurred_at desc);
create index on timeline_entries (organization_id, is_celebration, occurred_at desc)
  where is_celebration = true;
```

---

## RLS Rules (Summary)

| Actor | Can See |
|---|---|
| `platform_admin`, `full_admin` | All entries in their org |
| `admin`, `registrar`, `staff`, `teacher` | All non-`hidden_at` entries in their org |
| Parent guardian | Entries for their student(s), filtered by `visibility_json`, never `staff_only`, never `requires_approval = true AND approved_at IS NULL` |
| Student (future) | Their own non-`staff_only` entries, age-appropriate subset |

**Split-household isolation:** Parents access timeline entries through the same guardian helper functions as all other student data. A guardian blocked from `visibility_json.incidents` will not see `incident_resolved` entries even if `staff_only = false`.

---

## Event Bus Subscriptions

The Timeline Engine subscribes to the following Event Bus events and decides whether to create a timeline entry:

| Event | Entry Created? | Entry Type | Notes |
|---|---|---|---|
| `student.enrolled` | Always | `enrollment` | First entry in every student's journey |
| `student.withdrawn` | Always | `enrollment` | Marked with `staff_only: true` |
| `report_card.published` | Always | `report_card_published` | Parent-visible when published |
| `badge.earned` | Always | `badge_earned` + `celebration` | Both a timeline entry and a celebration |
| `attendance.absent_marked` | Only on pattern (3+ in term) | `attendance_milestone` | Staff-only note; not individual absences |
| `attendance_milestone` (custom) | On trigger (perfect attendance) | `attendance_milestone` + `celebration` | |
| `grade.recorded` | Never (individual grades) | — | Too granular; only aggregated milestones matter |
| `incident.approved` | Staff-only entry | `incident_resolved` | `staff_only: true`; parent-visible only if explicitly shared |
| `guardian.custody_changed` | Staff-only note | `custom` | `staff_only: true` |
| `member.activated` | Staff activity feed only | `custom` | Org-level entry, no `student_id` |
| `announcement.published` | Org Activity Feed entry | `announcement` | No `student_id` |

The Timeline Engine is the subscriber that decides. The Event Bus fires — the engine chooses whether the event is worth preserving as a story moment.

---

## AI Summary Flow (Detailed)

```
Staff triggers summary (e.g., "Generate Fall Term summary for Amara")
     │
     ▼
Timeline Engine gathers:
  - All timeline entries for student in period
  - Filtered to entries the requesting staff member can see
  - Ordered chronologically
     │
     ▼
Prompt sent to Claude API (Anthropic):
  - System: SchoolCo tone guidelines, org values, privacy rules
  - User: Structured list of timeline entries (no raw DB fields — only curated content)
  - Output format: Short narrative paragraphs, parent-facing voice
     │
     ▼
Generated text stored as timeline_entry:
  entry_type: 'ai_summary'
  ai_generated: true
  ai_reviewed: false        ← Not yet approved
  requires_approval: true   ← Will not appear in parent/student view
     │
     ▼
Staff review queue shows summary
Staff reads, optionally edits (edit stored in metadata.edit_history)
Staff approves
     │
     ▼
ai_reviewed: true
approved_by: staff profile_id
approved_at: now()
requires_approval: false
     │
     ▼
Summary becomes visible in parent's Family Timeline / student's Journey
Optionally: Resend email to guardian(s) with summary attached
```

**The AI never sends. The AI only drafts.**

---

## Relationship to Other Systems

```
Database Write (Supabase)
         │
         ▼
   Event Bus emits
    ┌────┴──────────────────┐
    │                       │
    ▼                       ▼
Audit Log              Timeline Engine
(every write)          (meaningful moments)
Compliance.            User-facing story.
Append-only.           Curated. Warm. Role-aware.
Staff/admin only.      Students, families, staff.
    │                       │
    │                ┌──────┴───────┐
    │                │              │
    │          Notification      AI Summary
    │            Engine          (human approved)
    │          (delivery)
    │
    └── Never surfaces to parents or students directly
```

---

## What the Timeline Engine Does NOT Do

- It does not replace Audit Logs. If you need to know exactly who changed a field and when, use Audit Logs.
- It does not send notifications. That is the Notification Engine. The Timeline Engine writes entries; the Notification Engine delivers them.
- It does not create entries for every event. Routine grade updates, individual attendance marks, and minor field changes do not become timeline entries.
- It does not expose sensitive data to wrong audiences. Split-household rules, `visibility_json`, `staff_only` flags, and `requires_approval` gates all apply.
- It does not allow AI to autonomously publish content to families. Every AI-generated entry requires human review and explicit approval.
- It does not delete entries. Entries may be hidden (`hidden_at`), but the record persists for compliance and historical accuracy.

---

## Implementation Roadmap

| Sprint | Deliverable |
|---|---|
| Sprint 2 | `timeline_entries` table, RLS, `enrollment` and `report_card_published` entries, Student Journey page shell |
| Sprint 3 | Family Timeline surface, Org Activity Feed, `badge_earned` and `celebration` entries |
| Sprint 4 | Leadership Passport surface, AI Summary generation + review flow, Achievement Celebrations rendering |
| Sprint 5 | Staff Activity Feed, org-wide celebration sharing with consent model |
