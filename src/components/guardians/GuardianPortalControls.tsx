"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Mail, UserX, UserCheck, GraduationCap, Home, Pencil, X,
  KeyRound, UserPlus, Send, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { setPortalAccess } from "@/app/actions/guardians";
import { grantStaffAccess } from "@/app/actions/staffManagement";
import {
  adminCreateParentAccount,
  adminSetParentTempPassword,
  adminSendParentPasswordSetupLink,
  adminDisableParentLogin,
  adminEnableParentLogin,
} from "@/app/actions/parentLogin";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

// PortalStatus: derived from organization_members.status
export type PortalStatus = "no_account" | "invited" | "active" | "disabled";

// LoginStatus: computed from PortalStatus + hasAuth
export type LoginStatus = "no_login" | "setup_required" | "active" | "disabled";

export interface PortalPreviewStudent {
  name:      string;
  household: string | null;
}

// ── Derive internal login status ──────────────────────────────────────────────

function deriveLoginStatus(portal: PortalStatus, hasAuth: boolean): LoginStatus {
  if (portal === "active")   return "active";
  if (portal === "disabled") return "disabled";
  if (hasAuth)               return "setup_required"; // auth exists but not fully active
  return "no_login";
}

const LOGIN_STATUS_UI: Record<LoginStatus, { label: string; dot: string; text: string }> = {
  no_login:      { label: "No Login",        dot: "bg-sc-gray-300",  text: "text-sc-gray-400"   },
  setup_required:{ label: "Setup Required",  dot: "bg-sc-gold-500",  text: "text-sc-gold-700"   },
  active:        { label: "Active",          dot: "bg-green-500",    text: "text-green-700"     },
  disabled:      { label: "Disabled",        dot: "bg-sc-rose",      text: "text-sc-rose-700"   },
};

// ── Temp-password modal (shared by Create and Reset) ─────────────────────────

function TempPasswordModal({
  title,
  description,
  email,
  onConfirm,
  onClose,
}: {
  title:       string;
  description: string;
  email:       string | null;
  onConfirm:   (password: string) => void;
  onClose:     () => void;
}) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [localErr, setLocalErr] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setLocalErr("Password must be at least 8 characters."); return; }
    setLocalErr("");
    onConfirm(password);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sc-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100 bg-sc-navy">
          <h2 className="font-serif text-heading-3 text-white">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="size-4 text-white" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-body-sm text-sc-gray">{description}</p>
          {email && (
            <div className="rounded-lg border border-sc-gray-100 bg-sc-gray-50 px-4 py-3">
              <p className="text-label-sm text-sc-gray-400 uppercase tracking-wide font-semibold mb-0.5">Guardian Email</p>
              <p className="text-label-sm text-sc-navy">{email}</p>
            </div>
          )}
          <form onSubmit={submit} className="space-y-3">
            {localErr && (
              <p className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">{localErr}</p>
            )}
            <div>
              <label className="block text-label-sm font-medium text-sc-navy mb-1.5">Temporary Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Min. 8 characters"
                  autoFocus
                  className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 pr-10 text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sc-gray-400 hover:text-sc-navy"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-label-sm text-sc-gray-400 mt-1">
                Guardian will be required to change this on first login.
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button type="submit" className="flex-1 bg-sc-teal hover:bg-sc-teal-700">
                <KeyRound className="size-3.5 mr-1.5" /> Set Password
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Confirm action modal (disable / enable) ───────────────────────────────────

function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onClose,
}: {
  title:        string;
  message:      string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm:    () => void;
  onClose:      () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-sc-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-sc-gray-100 bg-sc-navy">
          <h2 className="font-serif text-heading-3 text-white">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="size-4 text-white" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-body-sm text-sc-gray">{message}</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className={cn("flex-1", confirmClass)} onClick={onConfirm}>{confirmLabel}</Button>
          </div>
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
  hasAuth,
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
  hasAuth:         boolean;
  guardianName:    string;
  guardianEmail:   string | null;
  previewStudents: PortalPreviewStudent[];
  isStaffMember:   boolean;
  isAdminViewer?:  boolean;
  onEditContact?:  () => void;
}) {
  const router = useRouter();
  const [busy, startAction] = useTransition();
  const [error, setError]   = useState<string | null>(null);
  const [toast, setToast]   = useState<string | null>(null);

  // Modal state
  const [modal, setModal] = useState<
    | "create_account"
    | "set_temp_password"
    | "disable_confirm"
    | "enable_confirm"
    | null
  >(null);

  const loginStatus = deriveLoginStatus(status, hasAuth);
  const statusUi    = LOGIN_STATUS_UI[loginStatus];

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  function clearState() { setError(null); setModal(null); }

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleCreateAccount(tempPassword: string) {
    clearState();
    startAction(async () => {
      const r = await adminCreateParentAccount({ profileId, tempPassword });
      if (!r.success) { setError(r.error); return; }
      showToast(r.data.message);
      router.refresh();
    });
  }

  function handleSetTempPassword(tempPassword: string) {
    clearState();
    startAction(async () => {
      const r = await adminSetParentTempPassword({ profileId, tempPassword });
      if (!r.success) { setError(r.error); return; }
      showToast(r.data.message);
      router.refresh();
    });
  }

  function handleSendSetupLink() {
    setError(null);
    startAction(async () => {
      const r = await adminSendParentPasswordSetupLink(profileId);
      if (!r.success) { setError(r.error); return; }
      showToast("Setup link sent to " + (guardianEmail ?? "guardian") + ".");
      router.refresh();
    });
  }

  function handleDisable() {
    clearState();
    startAction(async () => {
      const r = await adminDisableParentLogin(profileId);
      if (!r.success) { setError(r.error); return; }
      showToast("Portal access disabled.");
      router.refresh();
    });
  }

  function handleEnable() {
    clearState();
    startAction(async () => {
      const r = await adminEnableParentLogin(profileId);
      if (!r.success) { setError(r.error); return; }
      showToast("Portal access re-enabled.");
      router.refresh();
    });
  }

  async function handleGrantStaff() {
    setError(null);
    startAction(async () => {
      const r = await grantStaffAccess(profileId);
      if (!r.success) { setError(r.error); return; }
      router.refresh();
    });
  }

  // ── Staff with parent role — simplified display ────────────────────────────

  if (isStaffMember && status === "active") {
    return (
      <span className="text-label-sm text-sc-gray-400">
        Access via staff account — no separate parent login needed.
      </span>
    );
  }

  // ── Admin Login & Access section ───────────────────────────────────────────

  if (isAdminViewer) {
    return (
      <>
        {/* Status row */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <span className={cn("flex items-center gap-1.5 text-label-sm font-semibold", statusUi.text)}>
              <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", statusUi.dot)} />
              {statusUi.label}
            </span>
            {guardianEmail && (
              <p className="flex items-center gap-1 text-label-sm text-sc-gray ml-3.5">
                <Mail className="size-3" /> {guardianEmail}
              </p>
            )}
            {!hasEmail && (
              <p className="text-label-sm text-sc-gray-400 ml-3.5 italic">No email on file</p>
            )}
          </div>

          {/* Primary actions */}
          <div className="flex flex-wrap gap-1.5">
            {loginStatus === "no_login" && (
              <>
                {hasEmail ? (
                  <Button
                    size="sm"
                    className="h-7 text-label-sm px-2.5 bg-sc-teal hover:bg-sc-teal-700 text-white"
                    disabled={busy}
                    onClick={() => setModal("create_account")}
                  >
                    <UserPlus className="size-3.5 mr-1" />
                    Create Login Account
                  </Button>
                ) : (
                  onEditContact && (
                    <Button size="sm" variant="outline" className="h-7 text-label-sm px-2.5" onClick={onEditContact}>
                      <Pencil className="size-3.5 mr-1" /> Add Email First
                    </Button>
                  )
                )}
              </>
            )}

            {(loginStatus === "setup_required" || loginStatus === "active") && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-label-sm px-2.5"
                  disabled={busy}
                  onClick={() => setModal("set_temp_password")}
                >
                  <KeyRound className="size-3.5 mr-1" />
                  {loginStatus === "setup_required" ? "Set Temp Password" : "Reset Password"}
                </Button>
                {guardianEmail && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-label-sm px-2.5"
                    disabled={busy}
                    onClick={handleSendSetupLink}
                  >
                    <Send className="size-3.5 mr-1" />
                    Send Setup Link
                  </Button>
                )}
              </>
            )}

            {loginStatus === "active" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-label-sm px-2.5 text-sc-navy border-sc-gray-200 hover:border-sc-navy"
                  disabled={busy}
                  onClick={handleGrantStaff}
                >
                  Grant Staff Access
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-label-sm px-2.5 text-sc-rose hover:text-sc-rose-700 border-sc-rose-200 hover:border-sc-rose"
                  disabled={busy}
                  onClick={() => setModal("disable_confirm")}
                >
                  <UserX className="size-3.5 mr-1" /> Disable
                </Button>
              </>
            )}

            {loginStatus === "disabled" && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-label-sm px-2.5"
                disabled={busy}
                onClick={() => setModal("enable_confirm")}
              >
                <UserCheck className="size-3.5 mr-1" /> Re-enable
              </Button>
            )}
          </div>
        </div>

        {/* Linked students */}
        {previewStudents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {previewStudents.map((s) => (
              <span
                key={s.name}
                className="inline-flex items-center gap-1 rounded-full bg-sc-gray-50 border border-sc-gray-100 px-2 py-0.5 text-label-sm text-sc-navy"
              >
                <GraduationCap className="size-3 text-sc-gray-400" /> {s.name}
                {s.household && (
                  <span className="text-sc-gray-400">
                    <Home className="size-2.5 inline mx-0.5" />{s.household}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-1 rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2 text-label-sm text-sc-rose-700">
            {error}
          </p>
        )}

        {toast && (
          <p className="mt-1 rounded-lg bg-sc-teal-50 border border-sc-teal-200 px-3 py-2 text-label-sm text-sc-teal-700">
            {toast}
          </p>
        )}

        {/* Modals */}
        {modal === "create_account" && (
          <TempPasswordModal
            title="Create Login Account"
            description="Set a temporary password for this guardian. They will be required to change it on their first login."
            email={guardianEmail}
            onConfirm={handleCreateAccount}
            onClose={clearState}
          />
        )}

        {modal === "set_temp_password" && (
          <TempPasswordModal
            title={loginStatus === "active" ? "Reset Password" : "Set Temporary Password"}
            description="Set a new temporary password. The guardian will be required to change it on next login."
            email={guardianEmail}
            onConfirm={handleSetTempPassword}
            onClose={clearState}
          />
        )}

        {modal === "disable_confirm" && (
          <ConfirmModal
            title="Disable Portal Access"
            message={`This will prevent ${guardianName} from logging into the Parent Portal. Their account data is preserved.`}
            confirmLabel="Disable Access"
            confirmClass="bg-sc-rose hover:bg-sc-rose-700 text-white"
            onConfirm={() => { setModal(null); handleDisable(); }}
            onClose={clearState}
          />
        )}

        {modal === "enable_confirm" && (
          <ConfirmModal
            title="Re-enable Portal Access"
            message={`This will restore ${guardianName}'s access to the Parent Portal.`}
            confirmLabel="Re-enable Access"
            confirmClass="bg-sc-teal hover:bg-sc-teal-700 text-white"
            onConfirm={() => { setModal(null); handleEnable(); }}
            onClose={clearState}
          />
        )}
      </>
    );
  }

  // ── Non-admin view — simple status badge only ──────────────────────────────

  const simpleUi = LOGIN_STATUS_UI[loginStatus];
  return (
    <span className={cn("flex items-center gap-1.5 text-label-sm font-medium", simpleUi.text)}>
      <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", simpleUi.dot)} />
      {simpleUi.label}
    </span>
  );
}
