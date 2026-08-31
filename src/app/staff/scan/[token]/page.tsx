/**
 * /staff/scan/[token]
 *
 * Staff attendance QR landing page (STF- prefix tokens).
 * Requires authenticated session — unauthenticated requests are sent to login
 * with next= param so the flow continues after sign-in.
 */

import { redirect } from "next/navigation";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { StaffScanClient } from "./StaffScanClient";

interface Props {
  params: { token: string };
}

export default async function StaffScanPage({ params }: Props) {
  const { token } = params;

  const user = await getUser();
  if (!user) {
    redirect(`/login?next=/staff/scan/${encodeURIComponent(token)}`);
  }

  const orgId = await getActiveOrgId();
  if (!orgId) {
    redirect(`/select-mission?next=/staff/scan/${encodeURIComponent(token)}`);
  }

  return <StaffScanClient token={token} />;
}
