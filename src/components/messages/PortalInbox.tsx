"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, MessageSquare, Clock, CheckCircle2, User } from "lucide-react";
import { type ConversationSummary } from "@/app/actions/messages";
import { CategoryBadge } from "@/components/messages/CategoryBadge";
import { ComposeModal } from "@/components/messages/ComposeModal";
import { cn } from "@/lib/utils";

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)   return "just now";
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  < 7)   return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(ts));
}

function ConversationCard({ c }: { c: ConversationSummary }) {
  const isResolved = c.status === "resolved";
  return (
    <Link
      href={`/portal/messages/${c.id}`}
      className={cn(
        "block rounded-2xl border p-4 transition-all hover:shadow-sm",
        c.unread_count > 0
          ? "border-sc-teal/40 bg-sc-teal/[0.07] shadow-sm"
          : isResolved
          ? "border-sc-gray-100 bg-sc-gray-50/50 opacity-80"
          : "border-sc-gray-100 bg-white hover:border-sc-gray-200"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {c.unread_count > 0 && (
              <span className="size-2 rounded-full bg-sc-teal shrink-0" aria-hidden="true" />
            )}
            {c.unread_count > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sc-teal px-1.5 text-[10px] font-bold text-white">
                {c.unread_count}
              </span>
            )}
            <span className={cn(
              "text-label-sm truncate",
              c.unread_count > 0 ? "font-bold text-sc-navy" : "font-semibold text-sc-navy/80"
            )}>
              {c.subject}
            </span>
            {isResolved && (
              <CheckCircle2 className="size-3.5 text-sc-teal shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <CategoryBadge category={c.category} />
            {c.student_name && (
              <span className="flex items-center gap-1 text-[11px] text-sc-gray">
                <User className="size-3" />
                {c.student_name}
              </span>
            )}
          </div>
          {c.last_message_preview && (
            <p className={cn(
              "mt-2 text-label-sm line-clamp-2",
              c.unread_count > 0 ? "font-medium text-sc-navy/80" : "text-sc-gray"
            )}>
              {c.last_sender_name ? <span className={cn(
                c.unread_count > 0 ? "font-bold text-sc-navy/70" : "font-medium text-sc-navy/70"
              )}>{c.last_sender_name}: </span> : null}
              {c.last_message_preview}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn(
            "flex items-center gap-1 text-[11px]",
            c.unread_count > 0 ? "font-semibold text-sc-teal" : "text-sc-gray-400"
          )}>
            <Clock className="size-3" />
            {formatRelative(c.last_message_at)}
          </span>
          {isResolved && (
            <span className="text-[10px] text-sc-gray uppercase tracking-wide">Resolved</span>
          )}
        </div>
      </div>
    </Link>
  );
}

interface Props {
  conversations: ConversationSummary[];
}

export function PortalInbox({ conversations }: Props) {
  const [showCompose, setShowCompose] = useState(false);

  // Sort: unread first (by most recent), then read open, then resolved
  const open = conversations
    .filter(c => c.status !== "resolved" && c.status !== "closed")
    .sort((a, b) => {
      if (a.unread_count > 0 && b.unread_count === 0) return -1;
      if (a.unread_count === 0 && b.unread_count > 0) return 1;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
  const resolved = conversations.filter(c => c.status === "resolved" || c.status === "closed");
  const totalUnread = conversations.reduce((n, c) => n + c.unread_count, 0);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-heading-1 text-sc-navy">Messages</h1>
            <p className="text-body-md text-sc-gray mt-1">
              {totalUnread > 0
                ? `${totalUnread} unread message${totalUnread !== 1 ? "s" : ""}`
                : "All messages with the school"}
            </p>
          </div>
          <button
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2.5 text-label-sm font-semibold text-white hover:bg-sc-teal-700 transition-colors"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">New Message</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>

        {/* Open conversations */}
        {open.length > 0 && (
          <section className="space-y-3">
            {open.map(c => <ConversationCard key={c.id} c={c} />)}
          </section>
        )}

        {/* Resolved conversations */}
        {resolved.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-label-sm font-semibold uppercase tracking-wider text-sc-gray">
              Resolved
            </h2>
            {resolved.map(c => <ConversationCard key={c.id} c={c} />)}
          </section>
        )}

        {/* Empty state */}
        {conversations.length === 0 && (
          <div className="rounded-2xl bg-white border border-sc-gray-100 p-10 text-center space-y-3">
            <MessageSquare className="size-10 text-sc-gray-300 mx-auto" />
            <p className="font-serif text-heading-3 text-sc-navy">No messages yet</p>
            <p className="text-body-sm text-sc-gray max-w-xs mx-auto">
              Send a message to the school and your conversations will appear here.
            </p>
            <button
              onClick={() => setShowCompose(true)}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-sc-teal px-5 py-2.5 text-label-sm font-semibold text-white hover:bg-sc-teal-700 transition-colors"
            >
              <Plus className="size-4" /> Send a Message
            </button>
          </div>
        )}
      </div>

      {showCompose && <ComposeModal onClose={() => setShowCompose(false)} />}
    </>
  );
}
