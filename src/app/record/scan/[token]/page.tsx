/**
 * /record/scan/[token]
 *
 * Public landing page encoded inside every student's BACK badge QR.
 * A staff member scans the back of the badge with their phone camera.
 *
 * Flow:
 *   1. Server component checks auth. If not logged in → redirect to login.
 *   2. After login the callback redirects back here.
 *   3. Client resolves the PRF- token → student ID → redirects to profile.
 *
 * Security:
 *   - Token is an opaque PRF-{hex} string. No PII in URL.
 *   - ATT- tokens are rejected (purpose enforcement).
 *   - Student profile enforces full role-based permissions after redirect.
 *   - Unauthenticated users never reach the student lookup.
 */

import { redirect } from "next/navigation";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { RecordScanClient } from "./RecordScanClient";

interface Props {
  params: { token: string };
}

export default async function RecordScanPage({ params }: Props) {
  const { token } = params;

  const user = await getUser();
  if (!user) {
    redirect(`/login?next=/record/scan/${encodeURIComponent(token)}`);
  }

  const orgId = await getActiveOrgId();
  if (!orgId) {
    redirect(`/select-mission?next=/record/scan/${encodeURIComponent(token)}`);
  }

  return <RecordScanClient token={token} />;
}
