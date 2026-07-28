import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getMyConversationThread } from "@/app/actions/messages";
import { PortalThread } from "@/components/messages/PortalThread";

export const metadata: Metadata = { title: "Conversation" };

interface Props {
  params: Promise<{ conversationId: string }>;
}

export default async function PortalConversationPage({ params }: Props) {
  const { conversationId } = await params;
  const user = await getUser();
  if (!user) notFound();

  const result = await getMyConversationThread(conversationId);
  if (!result.success) notFound();

  return <PortalThread conversation={result.data} myId={user.id} />;
}
