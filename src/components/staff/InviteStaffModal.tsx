"use client";

import { useState, useTransition } from "react";
import { X, Send } from "lucide-react";
import { sendStaffInvite, resendStaffInvite, revokeStaffInvite } from "@/app/actions/staff-invitations";
import type { StaffPortalStatus } from "@/app/actions/staff-invitations";
import type { StaffRosterRow } from "@/app/actions/staffActions";
import { ROLE_LABELS, type UserRole } from "@/lib/constants";

const INVITABLE_ROLES: UserRole[] = ["volunteer", "teacher", "staff", "registrar", "admin", "full_admin"];

interface Props {
  member:        StaffRosterRow;
  portalStatus:  StaffPortalStatus | null;
  onClose:       () => void;
  onDone:        (msg: string) => void;
}

export function InviteStaffModal({ member, portalStatus, onClose, onDone }: Props) {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState(member.email ?? "");
  const [error, setError] = useState("");

  // Derive default roles from staff_roster
  const defaultRoles = [member.primary_role, ...member.additional_roles].filter(
    r => INVITABLE_ROLES.includes(r as UserRole)
  );
  const [selectedRoles, setSelectedRoles] = useState<string[]>(
    defaultRoles.length > 0 ? defaultRoles : [member.primary_role]
  );

  const isPending_invite = portalStatus?.portal_status === "invite_pending";

  function toggleRole(r: string) {
    setSelectedRoles(prev =>
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    );
  }

  function handleSend() {
    if (!email.trim()) { setError("Email is required."); return; }
    if (selectedRoles.length === 0) { setError("Select at least one role."); return; }
    setError("");

    startTransition(async () => {
      const result = await sendStaffInvite({
        staffRosterId: member.id,
        email:         email.trim(),
        roles:         selectedRoles,
      });
      if (!result.success) { setError(result.error ?? "Failed to send invite."); return; }
      onDone(result.data.message);
    });
  }

  function handleResend() {
    if (!portalStatus?.invitation_id) return;
    startTransition(async () => {
      const result = await resendStaffInvite(portalStatus.invitation_id!);
      if (!result.success) { setError(result.error ?? "Failed to resend."); return; }
      onDone("Invite resent.");
    });
  }

  function handleRevoke() {
    if (!portalStatus?.invitation_id) return;
    if (!confirm(`Cancel the pending invite for ${member.full_name}? They won't be able to use the invite link.`)) return;
    startTransition(async () => {
      const result = await revokeStaffInvite(portalStatus.invitation_id!);
      if (!result.success) { setError(result.error ?? "Failed to revoke."); return; }
      onDone("Invite cancelled.");
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5" onClick={e => e.stopPropagation()}>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif text-xl text-sc-navy">
              {isPending_invite ? "Manage Invite" : "Invite to SchoolCo"}
            </h2>
            <p className="text-label-sm text-sc-gray mt-0.5">{member.full_name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-sc-gray hover:bg-sc-gray-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2.5 text-sc-rose-700 text-sm">
            {error}
          </div>
        )}

        {isPending_invite ? (
          // Pending invite — show resend / revoke options
          <div className="space-y-4">
            <div className="rounded-lg bg-sc-gold-50 border border-sc-gold-300 px-4 py-3">
              <p className="text-sm font-medium text-sc-gold-800">Invite Pending</p>
              <p className="text-sm text-sc-gold-700 mt-0.5">
                Sent to <strong>{portalStatus?.invited_at ? new Date(portalStatus.invited_at).toLocaleDateString() : ""}</strong>.
                Expires {portalStatus?.expires_at ? new Date(portalStatus.expires_at).toLocaleDateString() : "soon"}.
              </p>
            </div>
            <p className="text-sm text-sc-gray">
              Roles invited: {(portalStatus?.intended_roles ?? []).map(r => ROLE_LABELS[r as UserRole] ?? r).join(", ")}
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleResend}
                disabled={isPending}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-sc-teal px-4 py-2.5 text-white text-sm font-medium hover:bg-sc-teal-700 disabled:opacity-50 transition-colors"
              >
                <Send className="h-4 w-4" />
                {isPending ? "Sending…" : "Resend Invite"}
              </button>
              <button
                onClick={handleRevoke}
                disabled={isPending}
                className="flex-1 rounded-lg border border-sc-rose-200 text-sc-rose-700 px-4 py-2.5 text-sm font-medium hover:bg-sc-rose-50 disabled:opacity-50 transition-colors"
              >
                Cancel Invite
              </button>
            </div>
          </div>
        ) : (
          // No invite — show send form
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-sc-navy mb-1.5">Email Address *</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="staff@example.com"
                className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-sc-navy mb-2">Roles *</label>
              <div className="flex flex-wrap gap-2">
                {INVITABLE_ROLES.map(r => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(r)}
                      onChange={() => toggleRole(r)}
                      className="h-4 w-4 rounded border-sc-gray-200 accent-sc-teal"
                    />
                    <span className="text-sm text-sc-navy">{ROLE_LABELS[r as UserRole] ?? r}</span>
                  </label>
                ))}
              </div>
            </div>

            <p className="text-xs text-sc-gray-400">
              A secure invite link will be emailed. The invited person will set their own password.
              Roles are applied automatically on acceptance.
            </p>

            <button
              onClick={handleSend}
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-sc-teal px-4 py-2.5 text-white font-medium hover:bg-sc-teal-700 disabled:opacity-50 transition-colors"
            >
              <Send className="h-4 w-4" />
              {isPending ? "Sending…" : "Send Invite"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
