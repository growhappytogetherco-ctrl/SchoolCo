import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  GraduationCap, Home, Users, Calendar,
  MessageSquare, Star, BookOpen,
} from "lucide-react";
import { getUser, getProfile, getOrgStats } from "@/lib/supabase/server";
import { TodaysBlessing } from "@/components/shared/TodaysBlessing";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Dashboard Home — Sprint 1
 *
 * Server component. Validates auth, loads real org stats, renders
 * the role-appropriate welcome experience.
 *
 * Security: Re-validates user server-side even though middleware guards the route.
 * Defense in depth — never rely solely on middleware.
 */
export default async function DashboardHomePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getProfile(user.id);
  const firstName = profile?.full_name?.split(" ")[0] ?? "Friend";

  // Active org from localStorage is not available server-side in Sprint 1.
  // Sprint 2 will migrate to server-side cookies. For now, stats are
  // shown per the user's primary org (first active membership).
  // TODO Sprint 2: replace with server-side org cookie.
  let stats = { memberCount: 0, studentCount: 0, familyCount: 0 };
  let orgName = "Your Organization";

  try {
    // Attempt to load stats — gracefully degrades if org context unavailable
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: memberships } = await supabase
      .from("organization_members")
      .select("organization_id, role, status, organizations(name, short_name)")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (memberships?.organization_id) {
      stats = await getOrgStats(memberships.organization_id);
      const org = memberships.organizations as { name: string; short_name: string } | null;
      orgName = org?.short_name ?? org?.name ?? "Your Organization";
    }
  } catch {
    // No active membership found — show zeroed stats
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Welcome Banner ──────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sc-navy via-sc-navy to-sc-teal p-6 sm:p-8 text-white">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -right-6 -bottom-20 h-48 w-48 rounded-full bg-sc-teal/20" />

        <div className="relative z-10">
          <p className="text-label-sm font-semibold text-white/60 uppercase tracking-widest mb-1">
            Welcome back
          </p>
          <h1 className="font-serif text-display-2 text-white leading-tight">
            {firstName}!
          </h1>
          <p className="mt-2 text-body-md text-white/70 max-w-lg leading-relaxed">
            Here&apos;s what&apos;s happening at {orgName} today.
          </p>
        </div>
      </div>

      {/* ── Today's Blessing ────────────────────────────────── */}
      <TodaysBlessing />

      {/* ── Live Stats ──────────────────────────────────────── */}
      <div>
        <h2 className="font-serif text-heading-3 text-sc-navy mb-3">At a Glance</h2>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Enrolled Students"
            value={stats.studentCount}
            icon={GraduationCap}
            href="/dashboard/students"
            color="teal"
          />
          <StatCard
            label="Families"
            value={stats.familyCount}
            icon={Home}
            href="/dashboard/families"
            color="navy"
          />
          <StatCard
            label="Members"
            value={stats.memberCount}
            icon={Users}
            href="/dashboard/staff"
            color="green"
            className="col-span-2 lg:col-span-1"
          />
        </div>
      </div>

      {/* ── Quick Links ─────────────────────────────────────── */}
      <div>
        <h2 className="font-serif text-heading-3 text-sc-navy mb-3">Quick Access</h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <QuickLink key={link.label} {...link} />
          ))}
        </div>
      </div>

      {/* ── Coming Soon modules ─────────────────────────────── */}
      <div>
        <h2 className="font-serif text-heading-3 text-sc-navy mb-3">Coming Soon</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {COMING_SOON.map((item) => (
            <ComingSoonCard key={item.title} {...item} />
          ))}
        </div>
      </div>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, href, color, className = "",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  color: "teal" | "navy" | "green";
  className?: string;
}) {
  const colors = {
    teal:  { bg: "bg-sc-teal-50",  icon: "text-sc-teal",  text: "text-sc-teal-700" },
    navy:  { bg: "bg-sc-navy-50",  icon: "text-sc-navy",  text: "text-sc-navy-600" },
    green: { bg: "bg-sc-green-50", icon: "text-sc-green", text: "text-sc-green-700" },
  }[color];

  return (
    <Link
      href={href}
      className={`group rounded-xl bg-white border border-sc-gray-100 shadow-card p-5 hover:shadow-card-hover transition-all ${className}`}
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.bg} mb-3`}>
        <Icon className={`size-5 ${colors.icon}`} />
      </div>
      <p className="font-serif text-3xl font-bold text-sc-navy leading-none mb-1">
        {value.toLocaleString()}
      </p>
      <p className="text-label-sm text-sc-gray group-hover:text-sc-navy transition-colors">{label}</p>
    </Link>
  );
}

function QuickLink({ label, href, icon: Icon, sprint }: {
  label: string; href: string; icon: React.ComponentType<{ className?: string }>; sprint?: string;
}) {
  const inner = (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-sc-gray-100 bg-white p-4 text-center hover:shadow-card transition-shadow">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sc-cream">
        <Icon className="size-5 text-sc-navy" />
      </div>
      <span className="text-label-sm font-medium text-sc-navy">{label}</span>
      {sprint && (
        <span className="text-label-sm text-sc-gray-400">{sprint}</span>
      )}
    </div>
  );

  return sprint ? <div className="opacity-50 cursor-not-allowed">{inner}</div> : (
    <Link href={href}>{inner}</Link>
  );
}

function ComingSoonCard({ title, description, sprint }: {
  title: string; description: string; sprint: string;
}) {
  return (
    <div className="rounded-xl bg-white border border-sc-gray-100 border-dashed p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="font-serif text-heading-3 text-sc-gray">{title}</h3>
        <span className="shrink-0 text-label-sm rounded-full bg-sc-gold-50 border border-sc-gold-200 px-2.5 py-0.5 text-sc-gold-700">
          {sprint}
        </span>
      </div>
      <p className="text-body-sm text-sc-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: "Students",  href: "/dashboard/students",  icon: GraduationCap },
  { label: "Families",  href: "/dashboard/families",  icon: Home },
  { label: "Attendance",href: "/dashboard/attendance",icon: Calendar,      sprint: "Sprint 3" },
  { label: "Messages",  href: "/dashboard/comms",     icon: MessageSquare, sprint: "Sprint 2" },
] as const;

const COMING_SOON = [
  {
    title:       "Attendance & Check-In",
    description: "QR code check-in, daily attendance tracking, absence alerts to guardians.",
    sprint:      "Sprint 3",
  },
  {
    title:       "Communications Hub",
    description: "Staff-to-family messaging, org announcements, guardian notification preferences.",
    sprint:      "Sprint 2",
  },
  {
    title:       "Academics & Grades",
    description: "Grade recording, report cards, curriculum tracking, and parent visibility.",
    sprint:      "Sprint 3",
  },
  {
    title:       "Leadership Badges",
    description: "Badge Studio, Leadership Passport, student growth portfolios.",
    sprint:      "Sprint 4",
  },
] as const;
