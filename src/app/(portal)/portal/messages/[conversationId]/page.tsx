import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUser, resolveProfileId } from "@/lib/supabase/server";
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

  // Use canonical profile ID so MessageBubble correctly identifies the parent's own messages
  // (stub accounts have auth.uid() ≠ profiles.id; messages are stored with canonical sender_id)
  const myProfileId = await resolveProfileId(user.id);

  const result = await getMyConversationThread(conversationId);
  if (!result.success) notFound();

  return <PortalThread conversation={result.data} myId={myProfileId} />;
}
