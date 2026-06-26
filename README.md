# SchoolCo

**Every Child Known. Every Family Connected. Every Leader Developed.**

SchoolCo is a secure, multi-organization school relationship platform built for
Christ-centered academies, co-ops, and educational organizations.

---

## What SchoolCo Is

A production SaaS platform — not a template or prototype.
Rising Leaders Academy is the first organization on the platform.
Every feature is multi-tenant from day one.

---

## Tech Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Framework    | Next.js 14 (App Router)             |
| Language     | TypeScript (strict mode)            |
| Styling      | Tailwind CSS + SchoolCo Design System |
| Components   | shadcn/ui (customized)              |
| Database     | Supabase (PostgreSQL)               |
| Auth         | Supabase Auth                       |
| Storage      | Supabase Storage                    |
| Security     | Row Level Security (default deny)   |
| Deployment   | Vercel                              |
| Forms        | React Hook Form + Zod               |
| Data         | TanStack Query + TanStack Table     |
| Charts       | Recharts                            |
| Animation    | Framer Motion                       |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase account (free tier works for development)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase keys

# 3. Set up the database
# Follow SUPABASE_SETUP.md step by step

# 4. Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
schoolco/
├── architecture/         # Architecture Decision Records (ADRs)
├── docs/                 # Product, technical, and design documentation
├── sample-data/          # Realistic test data (no real PII)
├── src/
│   ├── app/              # Next.js App Router pages and layouts
│   │   ├── (auth)/       # Login, forgot password (no sidebar)
│   │   ├── (dashboard)/  # Protected app screens
│   │   └── auth/         # Auth callbacks (Supabase)
│   ├── components/
│   │   ├── auth/         # Login form, hero, forgot-password
│   │   ├── layout/       # Sidebar, header, org switcher
│   │   ├── mission/      # Mission/org selection cards
│   │   ├── shared/       # Reusable cross-feature components
│   │   └── ui/           # Base shadcn/ui components
│   ├── hooks/            # Custom React hooks
│   ├── lib/
│   │   ├── supabase/     # Client, server, and middleware helpers
│   │   ├── audit.ts      # Audit log helper
│   │   ├── constants.ts  # Roles, nav, org types
│   │   ├── errors.ts     # Error handling utilities
│   │   ├── logger.ts     # Structured logging
│   │   └── utils.ts      # Shared utilities
│   ├── providers/        # React Query, Toast, and other providers
│   └── types/            # TypeScript type definitions
└── supabase/
    └── migrations/       # SQL migration files
```

---

## Documentation

| Document                      | Location                        |
|-------------------------------|---------------------------------|
| Product Requirements (PRD)    | docs/PRD.md                     |
| Software Requirements (SRS)   | docs/SRS.md                     |
| Database Architecture         | docs/DATABASE.md                |
| API Reference                 | docs/API.md                     |
| Security Architecture         | docs/SECURITY.md                |
| Design System                 | docs/DESIGN_SYSTEM.md           |
| Architecture Decisions        | architecture/DECISION_LOG.md    |
| Setup Guide                   | SUPABASE_SETUP.md               |
| Change Log                    | architecture/CHANGELOG.md       |

---

## Security

SchoolCo uses a **default-deny** security model.

- Row Level Security is enabled on every table
- No data is accessible without an explicit RLS policy
- Parents never access staff-only records
- Audit logs are append-only and immutable
- Service role keys never reach the browser
- Split-household permissions are a first-class architectural concern

---

## Sprint Status

| Sprint   | Status      | Focus                                   |
|----------|-------------|-----------------------------------------|
| Sprint 0 | ✅ Complete | Foundation, auth, org architecture, shell |
| Sprint 1 | Pending     | Role dashboards, student records        |
| Sprint 2 | Pending     | Communications, family hub              |
| Sprint 3 | Pending     | Attendance, academics                   |
| Sprint 4 | Pending     | Leadership Passport, Badge Studio       |

---

## Core Values

SchoolCo features must satisfy at least one of:
- Strengthen relationships
- Reduce administrative burden
- Celebrate student growth
- Increase safety
- Support the organization's mission

AI assists humans — it never approves, modifies, or deletes sensitive records autonomously.

---

## License

Proprietary. SchoolCo platform is not open source.
