"use client";

import { useState, useTransition } from "react";
import { X, ShieldCheck, ShieldOff } from "lucide-react";
import {
  updateStaffPortalRoles,
  disableStaffPortalAccess,
  enableStaffPortalAccess,
} from "@/app/actions/staff-invitations";
import type { StaffPortalStatus } from "@/app/actions/staff-invitations";
import type { StaffRosterRow } from "@/app/actions/staffActions";
import { ROLE_LABELS, type UserRole } from "@/lib/constants";

const MANAGEABLE_ROLES: UserRole[] = ["volunteer", "teacher", "staff", "registrar", "admin", "full_admin"];

interface Props {
  member:       StaffRosterRow;
  portalStatus: StaffPortalStatus;
  onClose:      () => void;
  onDone:       (msg: string) => void;
}

export function ManageAccessModal({ member, portalStatus, onClose, onDone }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const currentRoles = portalStatus.org_roles.filter(r =>
    MANAGEABLE_ROLES.includes(r as UserRole)
  );
  const [selectedRoles, setSelectedRoles] = useState<string[]>(currentRoles);

  const isDisabled = portalStatus.org_member_status !== "active";

  function toggleRole(r: string) {
    setSelectedRoles(prev =>
      prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]
    );
  }

  function handleSaveRoles() {
    if (selectedRoles.length === 0) { setError("At least one role is required."); return; }
    setError("");
    startTransition(async () => {
      const result = await updateStaffPortalRoles(member.id, selectedRoles);
      if (!result.success) { setError(result.error ?? "Failed to update roles."); return; }
      onDone("Roles updated.");
    });
  }

  function handleDisable() {
    if (!confirm(`Disable portal access for ${member.full_name}? They won't be able to log in until re-enabled.`)) return;
    startTransition(async () => {
      const result = await disableStaffPortalAccess(member.id);
      if (!result.success) { setError(result.error ?? "Failed to disable access."); return; }
      onDone("Portal access disabled.");
    });
  }

  function handleEnable() {
    startTransition(async () => {
      const result = await enableStaffPortalAccess(member.id);
      if (!result.success) { setError(result.error ?? "Failed to enable access."); return; }
      onDone("Portal access enabled.");
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5" onClick={e => e.stopPropagation()}>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif text-xl text-sc-navy">Manage Portal Access</h2>
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

        {/* Account info */}
        <div className="rounded-lg bg-sc-gray-100/50 border border-sc-gray-100 px-4 py-3 space-y-1">
          <p className="text-sm text-sc-gray">
            <span className="font-medium text-sc-navy">Login email:</span>{" "}
            {portalStatus.profile_email ?? "—"}
          </p>
          <p className="text-sm text-sc-gray">
            <span className="font-medium text-sc-navy">Status:</span>{" "}
            {isDisabled
              ? <span className="text-sc-rose-700 font-medium">Disabled</span>
              : <span className="text-sc-teal font-medium">Active</span>}
          </p>
        </div>

        {/* Roles */}
        <div>
          <label className="block text-sm font-medium text-sc-navy mb-2">Roles</label>
          <div className="flex flex-wrap gap-2">
            {MANAGEABLE_ROLES.map(r => (
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

        <button
          onClick={handleSaveRoles}
          disabled={isPending}
          className="w-full rounded-lg bg-sc-teal px-4 py-2.5 text-white font-medium hover:bg-sc-teal-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? "Saving…" : "Save Roles"}
        </button>

        <div className="border-t border-sc-gray-100 pt-4">
          {isDisabled ? (
            <button
              onClick={handleEnable}
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-sc-teal text-sc-teal px-4 py-2.5 text-sm font-medium hover:bg-sc-teal/5 disabled:opacity-50 transition-colors"
            >
              <ShieldCheck className="h-4 w-4" />
              Re-enable Portal Access
            </button>
          ) : (
            <button
              onClick={handleDisable}
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-sc-rose-200 text-sc-rose-700 px-4 py-2.5 text-sm font-medium hover:bg-sc-rose-50 disabled:opacity-50 transition-colors"
            >
              <ShieldOff className="h-4 w-4" />
              Disable Portal Access
            </button>
          )}
          <p className="text-xs text-sc-gray-400 text-center mt-2">
            Disabling access does not delete the staff record.
          </p>
        </div>
      </div>
    </div>
  );
}
