"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import {
  Search, Plus, Mail, UserX, UserCheck, ChevronRight,
  Shield, ShieldCheck, ShieldAlert, ShieldX, Clock,
  Filter, Users,
} from "lucide-react";
import {
  updateMemberStatus, updatePrimaryRole, inviteNewStaff,
  type StaffDirectoryRow, type BgStatus, type StaffType,
} from "@/app/actions/staffActions";
import { ROLE_LABELS, ADMIN_ROLES, type UserRole } from "@/lib/constants";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────

const ASSIGNABLE_ROLES: UserRole[] = [
  "volunteer", "teacher", "staff", "registrar", "admin", "full_admin",
];

const ROLE_COLOR: Record<string, string> = {
  full_admin:    "bg-sc-rose-50 text-sc-rose-700 border-sc-rose-200",
  admin:         "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",
  registrar:     "bg-sc-navy-50 text-sc-navy-700 border-sc-navy-200",
  teacher:       "bg-sc-teal-50 text-sc-teal-700 border-sc-teal-200",
  staff:         "bg-sc-gray-100 text-sc-gray-700 border-sc-gray-200",
  volunteer:     "bg-sc-green-50 text-sc-green-700 border-sc-green-200",
  contractor:    "bg-amber-50 text-amber-700 border-amber-200",
  platform_admin:"bg-sc-rose-100 text-sc-rose-800 border-sc-rose-300",
};

const BG_STATUS_CONFIG: Record<BgStatus, { label: string; icon: React.ElementType; cls: string }> = {
  not_submitted: { label: "Not Submitted", icon: ShieldX,     cls: "text-sc-gray-400" },
  pending:       { label: "Pending",       icon: Clock,        cls: "text-sc-gold-600" },
  cleared:       { label: "Cleared",       icon: ShieldCheck,  cls: "text-sc-green-600" },
  expired:       { label: "Expired",       icon: ShieldAlert,  cls: "text-sc-rose-600" },
  flagged:       { label: "Flagged",       icon: ShieldAlert,  cls: "text-sc-rose-700" },
};

// ── Invite Modal ──────────────────────────────────────────────────────────

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "", email: "", phone: "",
    primary_role: "staff" as UserRole,
    display_title: "", staff_type: "staff" as StaffType,
  });

  function set(k: string, v: string) { setForm((p) => ({ ...p, [k]: v })); }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await inviteNewStaff({
        email:         form.email,
        full_name:     form.full_name,
        phone:         form.phone || null,
        primary_role:  form.primary_role,
        display_title: form.display_title || null,
        staff_type:    form.staff_type,
      });
      if (!res.success) { setError(res.error); return; }
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100">
          <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
            <Mail className="size-4 text-sc-teal" /> Invite Staff Member
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sc-gray-100 text-sc-gray text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Full Name *">
              <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)}
                placeholder="Jane Smith" className={inputCls} />
            </Field>
            <Field label="Email *">
              <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
                placeholder="jane@school.org" className={inputCls} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)}
                placeholder="(555) 000-0000" className={inputCls} />
            </Field>
            <Field label="Display Title">
              <input value={form.display_title} onChange={(e) => set("display_title", e.target.value)}
                placeholder="e.g. Founder / Principal" className={inputCls} />
            </Field>
            <Field label="Primary Role *">
              <select value={form.primary_role} onChange={(e) => set("primary_role", e.target.value)}
                className={inputCls}>
                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </Field>
            <Field label="Classification">
              <select value={form.staff_type} onChange={(e) => set("staff_type", e.target.value)}
                className={inputCls}>
                <option value="staff">Staff</option>
                <option value="volunteer">Volunteer</option>
                <option value="contractor">Contractor</option>
              </select>
            </Field>
          </div>
          {error && <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-2 text-label-sm text-sc-rose-700">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 rounded-xl border border-sc-gray-200 px-4 py-2 text-label-md text-sc-gray hover:bg-sc-gray-50">Cancel</button>
            <button onClick={handleSubmit} disabled={isPending}
              className="flex-1 rounded-xl bg-sc-teal px-4 py-2 text-white text-label-md font-medium hover:bg-sc-teal/90 disabled:opacity-60">
              {isPending ? "Sending…" : "Send Invite"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Staff Row ─────────────────────────────────────────────────────────────

function StaffRow({
  member, canManage, onStatusChange,
}: {
  member: StaffDirectoryRow;
  canManage: boolean;
  onStatusChange: (id: string, s: "active" | "suspended") => void;
}) {
  const bgCfg = BG_STATUS_CONFIG[member.background_check_status];
  const BgIcon = bgCfg.icon;
  const initials = member.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const allRoles = [member.primary_role, ...member.additional_roles].filter(Boolean);

  return (
    <div className={cn(
      "flex items-center gap-4 px-4 py-3.5 hover:bg-sc-cream/60 transition-colors",
      member.member_status === "suspended" && "opacity-55"
    )}>
      {/* Avatar */}
      <Link href={`/dashboard/staff/${member.member_id}`} className="shrink-0">
        {member.avatar_url ? (
          <img src={member.avatar_url} alt="" className="size-10 rounded-full object-cover" />
        ) : (
          <div className="size-10 rounded-full bg-sc-navy flex items-center justify-center text-white text-label-sm font-bold">
            {initials}
          </div>
        )}
      </Link>

      {/* Name + details */}
      <div className="flex-1 min-w-0">
        <Link href={`/dashboard/staff/${member.member_id}`}
          className="flex items-center gap-2 flex-wrap hover:text-sc-teal transition-colors">
          <span className="text-label-md font-semibold text-sc-navy">{member.full_name}</span>
          {member.display_title && (
            <span className="text-label-sm text-sc-gray">— {member.display_title}</span>
          )}
        </Link>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {allRoles.slice(0, 4).map((r) => (
            <span key={r} className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium",
              ROLE_COLOR[r] ?? "bg-sc-gray-100 text-sc-gray-700 border-sc-gray-200")}>
              {ROLE_LABELS[r as UserRole] ?? r}
            </span>
          ))}
          <span className={cn("text-[11px] font-medium capitalize px-2 py-0.5 rounded-full border",
            member.staff_type === "volunteer" ? "bg-sc-green-50 text-sc-green-700 border-sc-green-200"
            : member.staff_type === "contractor" ? "bg-amber-50 text-amber-700 border-amber-200"
            : "bg-sc-gray-100 text-sc-gray-600 border-sc-gray-200")}>
            {member.staff_type}
          </span>
          {member.member_status === "suspended" && (
            <span className="rounded-full bg-sc-rose-50 border border-sc-rose-200 text-sc-rose-700 px-2 py-0.5 text-[11px] font-medium">Suspended</span>
          )}
        </div>
      </div>

      {/* Contact */}
      <div className="hidden sm:block text-right min-w-[160px]">
        <p className="text-label-sm text-sc-gray truncate">{member.email}</p>
        {member.phone && <p className="text-label-sm text-sc-gray-400">{member.phone}</p>}
      </div>

      {/* Background check status */}
      <div className="hidden md:flex items-center gap-1.5 min-w-[110px]">
        <BgIcon className={cn("size-4 shrink-0", bgCfg.cls)} />
        <span className={cn("text-label-sm", bgCfg.cls)}>{bgCfg.label}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {canManage && (
          member.member_status === "active" ? (
            <button onClick={() => onStatusChange(member.member_id, "suspended")}
              title="Suspend"
              className="p-1.5 rounded-lg text-sc-gray hover:text-sc-rose hover:bg-sc-rose-50 transition-colors">
              <UserX className="size-4" />
            </button>
          ) : (
            <button onClick={() => onStatusChange(member.member_id, "active")}
              title="Reactivate"
              className="p-1.5 rounded-lg text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50 transition-colors">
              <UserCheck className="size-4" />
            </button>
          )
        )}
        <Link href={`/dashboard/staff/${member.member_id}`}
          className="p-1.5 rounded-lg text-sc-gray hover:text-sc-navy hover:bg-sc-cream transition-colors">
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface Props {
  initialMembers: StaffDirectoryRow[];
  currentRole:    string;
}

export function StaffDirectory({ initialMembers, currentRole }: Props) {
  const [members, setMembers]       = useState<StaffDirectoryRow[]>(initialMembers);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  // Filters
  const [search, setSearch]         = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [filterBg, setFilterBg]     = useState<string>("all");

  const canManage = ADMIN_ROLES.includes(currentRole as UserRole);

  function flash(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function handleStatusChange(memberId: string, status: "active" | "suspended") {
    startTransition(async () => {
      const res = await updateMemberStatus(memberId, status);
      if (!res.success) { flash(res.error, false); return; }
      setMembers((prev) => prev.map((m) => m.member_id === memberId ? { ...m, member_status: status } : m));
      flash(status === "active" ? "Member reactivated" : "Member suspended");
    });
  }

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (filterStatus !== "all" && m.member_status !== filterStatus) return false;
      if (filterRole !== "all" && m.primary_role !== filterRole) return false;
      if (filterBg !== "all" && m.background_check_status !== filterBg) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!m.full_name.toLowerCase().includes(q) &&
            !m.email.toLowerCase().includes(q) &&
            !(m.display_title ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [members, search, filterRole, filterStatus, filterBg]);

  return (
    <div className="space-y-5">
      {toast && (
        <div className={cn("rounded-xl px-4 py-3 text-label-sm border",
          toast.ok ? "bg-sc-teal-50 border-sc-teal-200 text-sc-teal-700"
                   : "bg-sc-rose-50 border-sc-rose-200 text-sc-rose-700")}>
          {toast.msg}
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-sc-gray-200 text-label-md text-sc-navy bg-white focus:outline-none focus:ring-2 focus:ring-sc-teal"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="size-4 text-sc-gray-400 shrink-0" />

          <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}
            className="rounded-lg border border-sc-gray-200 px-2.5 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="all">All Roles</option>
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>

          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-sc-gray-200 px-2.5 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>

          <select value={filterBg} onChange={(e) => setFilterBg(e.target.value)}
            className="rounded-lg border border-sc-gray-200 px-2.5 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal">
            <option value="all">All Compliance</option>
            <option value="cleared">BG Cleared</option>
            <option value="pending">BG Pending</option>
            <option value="expired">BG Expired</option>
            <option value="not_submitted">Not Submitted</option>
            <option value="flagged">Flagged</option>
          </select>
        </div>

        {/* CTA */}
        {canManage && (
          <button onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 rounded-xl bg-sc-navy px-4 py-2 text-white text-label-md font-medium hover:bg-sc-navy/90 transition-colors shrink-0">
            <Plus className="size-4" /> Invite Staff
          </button>
        )}
      </div>

      {/* ── Count ────────────────────────────────────────────── */}
      <p className="text-label-sm text-sc-gray">
        {filtered.length} of {members.length} staff member{members.length !== 1 ? "s" : ""}
      </p>

      {/* ── Table ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
        {/* Column headers */}
        <div className="hidden md:grid px-4 py-2.5 bg-sc-cream border-b border-sc-gray-100 text-label-sm font-semibold text-sc-gray uppercase tracking-wide"
          style={{ gridTemplateColumns: "2.5rem 1fr 180px 140px 56px" }}>
          <div />
          <div>Name / Roles</div>
          <div className="text-right">Contact</div>
          <div>BG Status</div>
          <div />
        </div>

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="size-10 text-sc-gray-300 mx-auto mb-3" />
            <p className="text-body-md text-sc-gray-400">
              {members.length === 0 ? "No staff yet. Invite someone to get started." : "No results for these filters."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-sc-gray-50">
            {filtered.map((m) => (
              <StaffRow
                key={m.member_id}
                member={m}
                canManage={canManage}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onDone={() => { setShowInvite(false); flash("Invite sent!"); window.location.reload(); }}
        />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal bg-white";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-label-sm font-medium text-sc-navy">{label}</label>
      {children}
    </div>
  );
}
