import type { Metadata } from "next";
import { requireRole } from "@/lib/roleGuard";
import { getActiveOrgId } from "@/lib/supabase/server";
import { getStaffConversations } from "@/app/actions/messages";
import { StaffInbox } from "@/components/messages/StaffInbox";

export const metadata: Metadata = { title: "Messages" };

export default async function StaffMessagesPage() {
  await requireRole("teacher");
  const orgId = await getActiveOrgId();
  if (!orgId) return null;

  const result = await getStaffConversations("unresolved");
  const conversations = result.success ? result.data : [];

  return <StaffInbox initialConversations={conversations} orgId={orgId} />;
}
