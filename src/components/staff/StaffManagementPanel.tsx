"use client";

import { useState, useTransition } from "react";
import {
  UserCheck, UserX, Mail, Plus, ChevronDown, Shield,
} from "lucide-react";
import {
  updateMemberRole, updateMemberStatus, inviteStaffMember,
  type StaffMember,
} from "@/app/actions/staffManagement";
import { ROLE_LABELS, ROLE_HIERARCHY, ADMIN_ROLES, type UserRole } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Roles that can be assigned to staff (not parent/student)
const ASSIGNABLE_ROLES: UserRole[] = [
  "volunteer", "teacher", "staff", "registrar", "admin", "full_admin",
];

const ROLE_COLOR: Record<string, string> = {
  full_admin:    "bg-sc-rose-50 text-sc-rose border-sc-rose-200",
  admin:         "bg-sc-gold-50 text-sc-gold-700 border-sc-gold-200",
  registrar:     "bg-sc-navy-50 text-sc-navy border-sc-navy-200",
  teacher:       "bg-sc-teal-50 text-sc-teal border-sc-teal-200",
  staff:         "bg-sc-gray-100 text-sc-gray-700 border-sc-gray-200",
  volunteer:     "bg-sc-green-50 text-sc-green border-sc-green-200",
  platform_admin:"bg-sc-rose-100 text-sc-rose-800 border-sc-rose-300",
};

interface Props {
  initialMembers: StaffMember[];
  currentRole: string;
}

export function StaffManagementPanel({ initialMembers, currentRole }: Props) {
  const [members, setMembers] = useState<StaffMember[]>(initialMembers);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName]   = useState("");
  const [inviteRole, setInviteRole]   = useState<UserRole>("staff");

  const canManageRoles = ADMIN_ROLES.includes(currentRole as UserRole);

  function flash(msg: string, isError = false) {
    if (isError) { setError(msg); setTimeout(() => setError(null), 4000); }
    else         { setSuccess(msg); setTimeout(() => setSuccess(null), 3000); }
  }

  function handleRoleChange(memberId: string, newRole: UserRole) {
    startTransition(async () => {
      const res = await updateMemberRole(memberId, newRole);
      if (!res.success) { flash(res.error, true); return; }
      setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m));
      setEditingId(null);
      flash("Role updated");
    });
  }

  function handleStatusChange(memberId: string, newStatus: "active" | "suspended") {
    startTransition(async () => {
      const res = await updateMemberStatus(memberId, newStatus);
      if (!res.success) { flash(res.error, true); return; }
      setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, status: newStatus } : m));
      flash(newStatus === "active" ? "Member reactivated" : "Member suspended");
    });
  }

  function handleInvite() {
    if (!inviteEmail.trim() || !inviteName.trim()) {
      flash("Email and name are required", true); return;
    }
    startTransition(async () => {
      const res = await inviteStaffMember({
        email:     inviteEmail.trim(),
        full_name: inviteName.trim(),
        role:      inviteRole,
      });
      if (!res.success) { flash(res.error, true); return; }
      flash("Invitation sent");
      setInviteEmail(""); setInviteName(""); setInviteRole("staff");
      setShowInvite(false);
      // Reload members list
      window.location.reload();
    });
  }

  // Group members by role level
  const grouped = ROLE_HIERARCHY
    .slice().reverse()
    .filter((r) => r !== "parent" && r !== "student_future")
    .map((role) => ({
      role,
      members: members.filter((m) => m.role === role),
    }))
    .filter((g) => g.members.length > 0);

  return (
    <div className="space-y-5">
      {/* Feedback */}
      {error   && <div className="rounded-xl bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose">{error}</div>}
      {success && <div className="rounded-xl bg-sc-teal-50 border border-sc-teal-200 px-4 py-3 text-label-sm text-sc-teal">{success}</div>}

      {/* Actions bar */}
      {canManageRoles && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowInvite((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl bg-sc-navy px-4 py-2.5 text-white text-label-md font-medium hover:bg-sc-navy/90 transition-colors"
          >
            <Plus className="size-4" /> Invite Staff Member
          </button>
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <div className="rounded-2xl border border-sc-navy-200 bg-sc-navy-50 p-5 space-y-4">
          <h2 className="font-serif text-heading-3 text-sc-navy flex items-center gap-2">
            <Mail className="size-4 text-sc-teal" /> Invite New Staff Member
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-label-sm font-medium text-sc-navy">Full Name *</label>
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-label-sm font-medium text-sc-navy">Email Address *</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="jane@school.org"
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-label-sm font-medium text-sc-navy">Role *</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-md text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleInvite}
              disabled={isPending}
              className="rounded-xl bg-sc-teal px-4 py-2 text-white text-label-md font-medium disabled:opacity-60 hover:bg-sc-teal/90 transition-colors"
            >
              {isPending ? "Sending…" : "Send Invite"}
            </button>
            <button
              onClick={() => setShowInvite(false)}
              className="rounded-xl border border-sc-gray-200 px-4 py-2 text-label-md text-sc-gray hover:bg-sc-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Member list grouped by role */}
      {grouped.map(({ role, members: groupMembers }) => (
        <div key={role} className="rounded-2xl border border-sc-gray-100 bg-white shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-sc-gray-100 bg-sc-gray-50 flex items-center gap-2">
            <Shield className="size-4 text-sc-gray" />
            <span className="text-label-sm font-semibold text-sc-navy uppercase tracking-wide">
              {ROLE_LABELS[role as UserRole] ?? role}
            </span>
            <span className="ml-1 text-label-sm text-sc-gray">({groupMembers.length})</span>
          </div>
          <div className="divide-y divide-sc-gray-50">
            {groupMembers.map((m) => (
              <div key={m.id} className={cn(
                "flex items-center gap-4 px-5 py-4",
                m.status === "suspended" && "opacity-60"
              )}>
                {/* Avatar */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sc-navy text-white text-label-sm font-bold">
                  {m.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-label-md font-semibold text-sc-navy">{m.full_name}</p>
                    <span className={cn(
                      "rounded-full border px-2.5 py-0.5 text-label-sm font-medium",
                      ROLE_COLOR[m.role] ?? "bg-sc-gray-100 text-sc-gray border-sc-gray-200"
                    )}>
                      {ROLE_LABELS[m.role]}
                    </span>
                    {m.status === "suspended" && (
                      <span className="rounded-full bg-sc-rose-50 border border-sc-rose-200 text-sc-rose px-2.5 py-0.5 text-label-sm">
                        Suspended
                      </span>
                    )}
                  </div>
                  <p className="text-label-sm text-sc-gray mt-0.5">
                    {m.email ?? "No email"}{m.display_id ? ` · ${m.display_id}` : ""}
                  </p>
                </div>

                {/* Role editor */}
                {canManageRoles && (
                  <div className="flex items-center gap-2 shrink-0">
                    {editingId === m.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          defaultValue={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value as UserRole)}
                          disabled={isPending}
                          className="rounded-lg border border-sc-gray-200 px-2 py-1 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal"
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-label-sm text-sc-gray hover:text-sc-navy"
                        >Cancel</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingId(m.id)}
                        className="flex items-center gap-1 rounded-lg border border-sc-gray-200 px-3 py-1.5 text-label-sm text-sc-gray hover:border-sc-teal hover:text-sc-teal transition-colors"
                      >
                        Change Role <ChevronDown className="size-3" />
                      </button>
                    )}

                    {m.status === "active" ? (
                      <button
                        onClick={() => handleStatusChange(m.id, "suspended")}
                        disabled={isPending}
                        className="p-1.5 rounded-lg text-sc-gray hover:text-sc-rose hover:bg-sc-rose-50 transition-colors"
                        aria-label="Suspend member"
                      >
                        <UserX className="size-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(m.id, "active")}
                        disabled={isPending}
                        className="p-1.5 rounded-lg text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
                        aria-label="Reactivate member"
                      >
                        <UserCheck className="size-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {members.length === 0 && (
        <div className="rounded-2xl border border-dashed border-sc-gray-200 p-10 text-center">
          <p className="text-body-md text-sc-gray-400">No staff members yet. Invite someone to get started.</p>
        </div>
      )}
    </div>
  );
}
