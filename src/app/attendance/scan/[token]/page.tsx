/**
 * /attendance/scan/[token]
 *
 * Public landing page encoded inside every student's attendance QR badge.
 * A staff member scans the badge with their regular phone camera — iOS/Android
 * opens this URL automatically.
 *
 * Flow:
 *   1. Server component checks auth. If not logged in → redirect to login
 *      with `next` param pointing back here.
 *   2. After login the callback redirects back here.
 *   3. Client component fires the auto-action (check in / check out / already
 *      checked out) and shows the result screen for 2.5 s.
 *   4. Redirects to /dashboard/attendance so staff can see the full roster.
 *
 * Security:
 *   - Token is an opaque 24-hex string (ATT- prefix). No student PII in URL.
 *   - API route validates token is owned by the caller's active org.
 *   - Unauthenticated requests never reach the student lookup.
 */

import { redirect } from "next/navigation";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { AttendanceScanClient } from "./AttendanceScanClient";

interface Props {
  params: { token: string };
}

export default async function AttendanceScanPage({ params }: Props) {
  const { token } = params;

  const user = await getUser();

  if (!user) {
    // Send to login, then return here after auth
    redirect(`/login?next=/attendance/scan/${encodeURIComponent(token)}`);
  }

  const orgId = await getActiveOrgId();
  if (!orgId) {
    // Authenticated but no org selected — need to pick a mission first
    redirect(`/select-mission?next=/attendance/scan/${encodeURIComponent(token)}`);
  }

  return <AttendanceScanClient token={token} />;
}
