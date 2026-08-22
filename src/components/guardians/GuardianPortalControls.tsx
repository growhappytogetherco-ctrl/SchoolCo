"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sendPortalInvite, setPortalAccess } from "@/app/actions/guardians";

type PortalStatus = "no_account" | "invited" | "active" | "disabled";

const STATUS_BADGE: Record<PortalStatus, { label: string; variant: "muted" | "gold" | "green" | "rose" }> = {
  no_account: { label: "No Account",  variant: "muted"  },
  invited:    { label: "Invited",     variant: "gold"   },
  active:     { label: "Active",      variant: "green"  },
  disabled:   { label: "Disabled",    variant: "rose"   },
};

export function GuardianPortalControls({
  profileId,
  familyId,
  status,
  hasEmail,
}: {
  profileId: string;
  familyId:  string;
  status:    PortalStatus;
  hasEmail:  boolean;
}) {
  const router = useRouter();
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const badge = STATUS_BADGE[status];

  async function handleInvite() {
    setBusy(true); setError(null);
    const result = await sendPortalInvite({ profile_id: profileId, family_id: familyId });
    setBusy(false);
    if (!result.success) { setError(result.error); return; }
    router.refresh();
  }

  async function handleDisable() {
    setBusy(true); setError(null);
    const result = await setPortalAccess({ profile_id: profileId, family_id: familyId, action: "disable" });
    setBusy(false);
    if (!result.success) { setError(result.error); return; }
    router.refresh();
  }

  async function handleRestore() {
    setBusy(true); setError(null);
    const result = await setPortalAccess({ profile_id: profileId, family_id: familyId, action: "restore" });
    setBusy(false);
    if (!result.success) { setError(result.error); return; }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={badge.variant}>{badge.label}</Badge>

      {(status === "no_account" || status === "invited") && hasEmail && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-label-sm px-2.5"
          disabled={busy}
          onClick={handleInvite}
          title={status === "invited" ? "Resend portal invite" : "Send portal invite"}
        >
          <Mail className="size-3.5 mr-1" />
          {status === "invited" ? "Resend" : "Invite"}
        </Button>
      )}

      {status === "active" && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-label-sm px-2.5 text-sc-rose hover:text-sc-rose border-sc-rose-200 hover:border-sc-rose"
          disabled={busy}
          onClick={handleDisable}
          title="Disable portal access"
        >
          <UserX className="size-3.5 mr-1" />
          Disable
        </Button>
      )}

      {status === "disabled" && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-label-sm px-2.5"
          disabled={busy}
          onClick={handleRestore}
          title="Restore portal access"
        >
          <UserCheck className="size-3.5 mr-1" />
          Restore
        </Button>
      )}

      {error && <span className="text-label-sm text-sc-rose">{error}</span>}
    </div>
  );
}
