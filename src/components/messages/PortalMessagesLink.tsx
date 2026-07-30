"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NotificationToast } from "@/components/messages/NotificationToast";
import { getUnreadCount } from "@/app/actions/messages";

interface Props {
  userId:       string;
  initialCount: number;
}

export function PortalMessagesLink({ userId, initialCount }: Props) {
  const [count, setCount] = useState(initialCount);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`portal-notif-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        async () => {
          // Re-fetch canonical conversation-based unread count
          const c = await getUnreadCount();
          setCount(c);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        async () => {
          // Conversation was read — re-fetch to get accurate count
          const c = await getUnreadCount();
          setCount(c);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return (
    <>
      <NotificationToast userId={userId} linkBase="/portal/messages" />
      <Link
        href="/portal/messages"
        className="relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-label-sm text-sc-gray hover:text-sc-teal hover:bg-sc-teal-50 transition-colors"
        title="Messages"
        aria-label={count > 0 ? `Messages — ${count} unread conversation${count !== 1 ? "s" : ""}` : "Messages"}
      >
        <MessageSquare className="size-4" />
        <span className="hidden md:block">Messages</span>
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sc-rose px-0.5 text-[9px] font-bold text-white"
            aria-hidden="true"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Link>
    </>
  );
}
