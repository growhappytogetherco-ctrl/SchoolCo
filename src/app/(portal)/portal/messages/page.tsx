import type { Metadata } from "next";
import { getMyConversations } from "@/app/actions/messages";
import { PortalInbox } from "@/components/messages/PortalInbox";

export const metadata: Metadata = { title: "Messages" };

export default async function PortalMessagesPage() {
  const result = await getMyConversations();
  const conversations = result.success ? result.data : [];

  return <PortalInbox conversations={conversations} />;
}
