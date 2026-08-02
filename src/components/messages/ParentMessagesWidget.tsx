"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, ChevronRight, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ConversationSummary } from "@/app/actions/messages";
import { getParentConversationsForWidget } from "@/app/actions/messages";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface Props {
  conversations: ConversationSummary[];
  totalUnread:   number;
  userId:        string;
}

export function ParentMessagesWidget({ conversations: initialConversations, totalUnread: initialUnread, userId }: Props) {
  const [conversations, setConversations] = useState(initialConversations);
  const totalUnread = conversations.reduce((n, c) => n + c.unread_count, 0);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`portal-home-notif-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` },
        async () => {
          const result = await getParentConversationsForWidget();
          if (result.success) setConversations(result.data);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const items = conversations.slice(0, 5);

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-sc-teal" />
          <h2 className="text-label-md font-semibold text-sc-navy">Messages</h2>
          {totalUnread > 0 && (
            <span
              className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sc-rose px-1 text-[10px] font-bold text-white"
              aria-label={`${totalUnread} unread conversation${totalUnread !== 1 ? "s" : ""}`}
            >
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>
        <Link
          href="/portal/messages"
          className="text-label-sm text-sc-teal hover:text-sc-teal-700 transition-colors flex items-center gap-0.5"
        >
          View all <ChevronRight className="size-3" />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-body-md text-sc-gray text-center py-4">No new messages</p>
      ) : (
        <ul className="space-y-2">
          {items.map(c => (
            <li key={c.id}>
              <Link
                href={`/portal/messages/${c.id}`}
                className={cn(
                  "flex items-start gap-3 rounded-xl p-3 transition-colors",
                  c.unread_count > 0
                    ? "bg-sc-teal/5 border border-sc-teal/20 hover:bg-sc-teal/10"
                    : "hover:bg-sc-gray-100"
                )}
              >
                {/* Unread dot */}
                <span className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  c.unread_count > 0 ? "bg-sc-teal" : "bg-transparent"
                )} />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className={cn(
                      "text-label-sm truncate",
                      c.unread_count > 0 ? "font-bold text-sc-navy" : "font-medium text-sc-navy/80"
                    )}>
                      {c.subject}
                    </span>
                    {c.unread_count > 0 && (
                      <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-sc-teal px-1 text-[9px] font-bold text-white">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  {c.student_name && (
                    <span className="flex items-center gap-1 text-[11px] text-sc-gray mb-0.5">
                      <User className="size-3" />{c.student_name}
                    </span>
                  )}
                  {c.last_message_preview && (
                    <p className={cn(
                      "text-[12px] truncate",
                      c.unread_count > 0 ? "text-sc-navy/70 font-medium" : "text-sc-gray-400"
                    )}>
                      {c.last_sender_name && (
                        <span className="font-semibold">{c.last_sender_name}: </span>
                      )}
                      {c.last_message_preview}
                    </p>
                  )}
                </div>

                <span className="shrink-0 text-[11px] text-sc-gray-400 whitespace-nowrap mt-0.5">
                  {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
