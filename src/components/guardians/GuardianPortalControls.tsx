"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, UserX, UserCheck, GraduationCap, Home, Pencil, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPortalAccess } from "@/app/actions/guardians";
import { inviteParentPortalUser } from "@/app/actions/inviteParentPortalUser";
import { grantStaffAccess } from "@/app/actions/staffManagement";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PortalStatus = "no_account" | "invited" | "active" | "disabled";

export interface PortalPreviewStudent {
  name:      string;
  household: string | null;
}

// ── Derived display status ─────────────────────────────────────────────────────

type DisplayStatus =
  | "missing_email"
  | "ready"
  | "invited"
  | "active"
  | "disabled"
  | "staff_active";

function deriveDisplayStatus(
  portalStatus: PortalStatus,
  hasEmail:     boolean,
  isStaff:      boolean,
): DisplayStatus {
  if (isStaff && portalStatus === "active") return "staff_active";
  if (portalStatus === "no_account" && !hasEmail) return "missing_email";
  if (portalStatus === "no_account" && hasEmail)  return "ready";
  if (portalStatus === "invited")  return "invited";
  if (portalStatus === "active")   return "active";
  if (portalStatus === "disabled") return "disabled";
  return "missing_email";
}

const STATUS_UI: Record<DisplayStatus, { label: string; dot: string; text: string }> = {
  missing_email: { label: "Missing Email",    dot: "bg-sc-gray-300",   text: "text-sc-gray"      },
  ready:         { label: "Ready to Invite",  dot: "bg-sc-teal",       text: "text-sc-teal-700"  },
  invited:       { label: "Invitation Sent",  dot: "bg-sc-gold-500",   text: "text-sc-gold-700"  },
  active:        { label: "Active",           dot: "bg-green-500",     text: "text-green-700"    },
  staff_active:  { label: "Active (Staff)",   dot: "bg-sc-navy",       text: "text-sc-navy"      },
  disabled:      { label: "Disabled",         dot: "bg-sc-rose",       text: "text-sc-rose-700"  },
};

// ── Invite confirmation dialog ─────────────────────────────────────────────────

function PortalInviteDialog({
  profileId,
  familyId,
  guardianName,
  guardianEmail,
  previewStudents,
  isResend,
  onClose,
}: {
  profileId:       string;
  familyId:        string;
  guardianName:    string;
  guardianEmail:   string;
  previewStudents: PortalPreviewStudent[];
  isResend:        boolean;
  onClose:         () => void;
}) {
  const router = useRouter();
  const [sending, startSend] = useTransition();
  const [error,   setError]  = useState<string | null>(null);
  const [sent,    setSent]   = useState(false);

  // Group students by household for cleaner preview
  const byHousehold: Record<string, string[]> = {};
  for (const s of previewStudents) {
    const hh = s.household ?? "No Household Assigned";
    if (!byHousehold[hh]) byHousehold[hh] = [];
    byHousehold[hh].push(s.name);
  }

  function confirm() {
    startSend(async () => {
      setError(null);
      try {
        const result = await inviteParentPortalUser({ profile_id: profileId, family_id: familyId });
        if (!result.success) { setError(result.error ?? "Failed to send invite."); return; }
        setSent(true);
        // router.refresh() is called client-side after success — invite does not depend on page re-render
        setTimeout(() => { onClose(); router.refresh(); }, 1500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "An unexpected error occurred.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sc-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100 bg-sc-navy">
          <h2 className="font-serif text-heading-3 text-white">
            {isResend ? "Resend Portal Invitation" : "Invite to Parent Portal"}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="size-4 text-white" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {sent ? (
            <div className="rounded-xl bg-sc-teal-50 border border-sc-teal-200 p-4 text-center">
              <p className="text-label-md font-semibold text-sc-teal-700">Invitation sent!</p>
              <p className="text-label-sm text-sc-teal mt-0.5">{guardianEmail}</p>
            </div>
          ) : (
            <>
              {/* Guardian */}
              <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 px-4 py-3">
                <p className="text-label-sm text-sc-gray-400 uppercase tracking-wide font-semibold mb-1">Guardian</p>
                <p className="font-serif text-heading-3 text-sc-navy">{guardianName}</p>
                <p className="flex items-center gap-1.5 text-label-sm text-sc-gray mt-0.5">
                  <Mail className="size-3" /> {guardianEmail}
                </p>
              </div>

              {/* Access preview */}
              <div className="space-y-3">
                <p className="text-label-sm text-sc-gray-400 uppercase tracking-wide font-semibold">Portal Access Preview</p>
                {Object.keys(byHousehold).length === 0 ? (
                  <p className="text-label-sm text-sc-gray italic">No student relationships found.</p>
                ) : (
                  Object.entries(byHousehold).map(([hh, students]) => (
                    <div key={hh} className="rounded-xl border border-sc-gray-100 bg-white p-3 space-y-2">
                      <p className="flex items-center gap-1.5 text-label-sm font-semibold text-sc-navy">
                        <Home className="size-3.5" /> {hh}
                      </p>
                      <ul className="space-y-1">
                        {students.map((s) => (
                          <li key={s} className="flex items-center gap-1.5 text-label-sm text-sc-gray ml-5">
                            <GraduationCap className="size-3" /> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>

              {isResend && (
                <p className="text-label-sm text-sc-gray bg-sc-gold-50 border border-sc-gold-200 rounded-lg px-3 py-2">
                  A new invitation email will be sent. This does not create a duplicate account.
                </p>
              )}

              {error && (
                <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
                <Button
                  className="flex-1 bg-sc-teal hover:bg-sc-teal-700"
                  disabled={sending}
                  onClick={confirm}
                >
                  <Mail className="size-3.5 mr-1.5" />
                  {sending ? "Sending…" : isResend ? "Resend Invitation" : "Send Invitation"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function GuardianPortalControls({
  profileId,
  familyId,
  status,
  hasEmail,
  guardianName,
  guardianEmail,
  previewStudents,
  isStaffMember,
  isAdminViewer,
  onEditContact,
}: {
  profileId:       string;
  familyId:        string;
  status:          PortalStatus;
  hasEmail:        boolean;
  guardianName:    string;
  guardianEmail:   string | null;
  previewStudents: PortalPreviewStudent[];
  isStaffMember:   boolean;
  isAdminViewer?:  boolean;
  onEditContact?:  () => void;
}) {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);
  const [busy, startAction]         = useTransition();
  const [error, setError]           = useState<string | null>(null);

  const displayStatus = deriveDisplayStatus(status, hasEmail, isStaffMember);
  const ui = STATUS_UI[displayStatus];

  async function handleGrantStaff() {
    setError(null);
    startAction(async () => {
      const r = await grantStaffAccess(profileId);
      if (!r.success) { setError(r.error); return; }
      router.refresh();
    });
  }

  async function handleDisable() {
    setError(null);
    startAction(async () => {
      const r = await setPortalAccess({ profile_id: profileId, family_id: familyId, action: "disable" });
      if (!r.success) { setError(r.error); return; }
      router.refresh();
    });
  }

  async function handleRestore() {
    setError(null);
    startAction(async () => {
      const r = await setPortalAccess({ profile_id: profileId, family_id: familyId, action: "restore" });
      if (!r.success) { setError(r.error); return; }
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {/* Status badge */}
        <span className={cn("flex items-center gap-1.5 text-label-sm font-medium", ui.text)}>
          <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", ui.dot)} />
          {ui.label}
        </span>

        {/* Actions */}
        {displayStatus === "missing_email" && onEditContact && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-label-sm px-2.5"
            onClick={onEditContact}
          >
            <Pencil className="size-3.5 mr-1" />
            Edit Contact Info
          </Button>
        )}

        {displayStatus === "ready" && (
          <Button
            size="sm"
            className="h-7 text-label-sm px-2.5 bg-sc-teal hover:bg-sc-teal-700 text-white"
            onClick={() => setShowInvite(true)}
          >
            <Mail className="size-3.5 mr-1" />
            Invite to Parent Portal
          </Button>
        )}

        {displayStatus === "invited" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-label-sm px-2.5"
            onClick={() => setShowInvite(true)}
          >
            <Mail className="size-3.5 mr-1" />
            Resend Invitation
          </Button>
        )}

        {displayStatus === "active" && (
          <>
            {isAdminViewer && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-label-sm px-2.5 text-sc-navy border-sc-gray-200 hover:border-sc-navy"
                disabled={busy}
                onClick={handleGrantStaff}
              >
                <ShieldCheck className="size-3.5 mr-1" />
                Grant Staff Access
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-label-sm px-2.5 text-sc-rose hover:text-sc-rose-700 border-sc-rose-200 hover:border-sc-rose"
              disabled={busy}
              onClick={handleDisable}
            >
              <UserX className="size-3.5 mr-1" />
              Disable Access
            </Button>
          </>
        )}

        {displayStatus === "disabled" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-label-sm px-2.5"
            disabled={busy}
            onClick={handleRestore}
          >
            <UserCheck className="size-3.5 mr-1" />
            Restore Access
          </Button>
        )}

        {displayStatus === "staff_active" && (
          <span className="text-label-sm text-sc-gray-400">
            Access via staff account — no parent invite needed.
          </span>
        )}

        {error && <span className="text-label-sm text-sc-rose">{error}</span>}
      </div>

      {showInvite && guardianEmail && (
        <PortalInviteDialog
          profileId={profileId}
          familyId={familyId}
          guardianName={guardianName}
          guardianEmail={guardianEmail}
          previewStudents={previewStudents}
          isResend={displayStatus === "invited"}
          onClose={() => setShowInvite(false)}
        />
      )}
    </>
  );
}
