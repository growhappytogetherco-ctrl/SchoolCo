"use client";

import Link from "next/link";
import { MessageSquare, ChevronRight } from "lucide-react";
import type { ConversationSummary } from "@/app/actions/messages";
import { CategoryBadge } from "@/components/messages/CategoryBadge";
import { formatDistanceToNow } from "date-fns";

interface Props {
  conversations: ConversationSummary[];
  totalUnread:   number;
}

export function MessagesWidget({ conversations, totalUnread }: Props) {
  const items = conversations.slice(0, 5);

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-sc-teal" />
          <h2 className="text-label-md font-semibold text-sc-navy">Parent Messages</h2>
          {totalUnread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sc-rose px-1 text-[10px] font-bold text-white">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>
        <Link
          href="/dashboard/messages"
          className="text-label-sm text-sc-teal hover:text-sc-teal-700 transition-colors flex items-center gap-0.5"
        >
          View all <ChevronRight className="size-3" />
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="text-body-md text-sc-gray text-center py-4">No unread messages</p>
      ) : (
        <ul className="space-y-2">
          {items.map(c => (
            <li key={c.id}>
              <Link
                href={`/dashboard/messages/${c.id}`}
                className="flex items-start gap-3 rounded-xl p-3 hover:bg-sc-gray-100 transition-colors"
              >
                {c.unread_count > 0 && (
                  <span className="mt-1 size-2 shrink-0 rounded-full bg-sc-rose" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-label-sm truncate ${c.unread_count > 0 ? "font-semibold text-sc-navy" : "text-sc-navy"}`}>
                      {c.family_name}
                    </span>
                    <CategoryBadge category={c.category} className="text-[10px]" />
                  </div>
                  <p className="text-body-md text-sc-gray truncate">{c.subject}</p>
                  {c.last_message_preview && (
                    <p className="text-[12px] text-sc-gray-400 truncate">{c.last_message_preview}</p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-sc-gray-400 whitespace-nowrap">
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
