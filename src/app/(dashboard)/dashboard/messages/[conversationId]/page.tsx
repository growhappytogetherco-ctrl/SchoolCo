import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/roleGuard";
import { getUser } from "@/lib/supabase/server";
import { getStaffConversationThread, getStaffMembers } from "@/app/actions/messages";
import { StaffThread } from "@/components/messages/StaffThread";

export const metadata: Metadata = { title: "Conversation" };

interface Props {
  params: Promise<{ conversationId: string }>;
}

export default async function StaffConversationPage({ params }: Props) {
  await requireRole("teacher");
  const { conversationId } = await params;
  const user = await getUser();
  if (!user) notFound();

  const [threadResult, staffResult] = await Promise.all([
    getStaffConversationThread(conversationId),
    getStaffMembers(),
  ]);

  if (!threadResult.success) notFound();

  return (
    <StaffThread
      conversation={threadResult.data}
      staffMembers={staffResult.success ? staffResult.data : []}
      myId={user.id}
    />
  );
}
