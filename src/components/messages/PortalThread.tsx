"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Send, User, CheckCircle2, AlertTriangle, Clock, ArrowDown } from "lucide-react";
import { type ConversationDetail, sendParentReply, type MessageItem } from "@/app/actions/messages";
import { CategoryBadge } from "@/components/messages/CategoryBadge";
import { cn } from "@/lib/utils";

const MAX_BODY = 5000;

function formatTime(ts: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(ts));
}

function MessageBubble({ msg, myId }: { msg: MessageItem; myId: string }) {
  const isMine = msg.sender_id === myId;
  return (
    <div className={cn("flex gap-3 max-w-[85%]", isMine ? "ml-auto flex-row-reverse" : "")}>
      {!isMine && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sc-navy/10 mt-0.5">
          <User className="size-4 text-sc-navy/60" />
        </div>
      )}
      <div className={cn("space-y-1", isMine ? "items-end" : "items-start", "flex flex-col")}>
        {!isMine && (
          <span className="text-[11px] text-sc-gray px-1">{msg.sender_name}</span>
        )}
        <div className={cn(
          "rounded-2xl px-4 py-2.5 text-label-sm",
          isMine
            ? "bg-sc-teal text-white rounded-tr-sm"
            : "bg-sc-gray-100 text-sc-navy rounded-tl-sm"
        )}>
          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        </div>
        <span className="text-[10px] text-sc-gray-400 px-1">
          {formatTime(msg.created_at)}
          {msg.edited_at && " · edited"}
        </span>
      </div>
    </div>
  );
}

interface Props {
  conversation: ConversationDetail;
  myId:         string;
}

export function PortalThread({ conversation: initial, myId }: Props) {
  const [conv, setConv]           = useState(initial);
  const [body, setBody]           = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError]         = useState<string | null>(null);
  const [sent, setSent]           = useState(false);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const dividerRef  = useRef<HTMLDivElement>(null);

  // On open: scroll to first unread message if it exists, otherwise scroll to bottom
  useEffect(() => {
    if (initial.first_unread_at && dividerRef.current) {
      dividerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    // After sending, scroll to bottom
    if (conv.messages.length > initial.messages.length) scrollToBottom();
  }, [conv.messages.length, initial.messages.length, scrollToBottom]);

  const isMedical = conv.category === "medical";
  const isResolved = conv.status === "resolved";

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || isPending) return;
    setError(null);
    setSent(false);

    const toSend = body.trim();
    startTransition(async () => {
      const res = await sendParentReply(conv.id, toSend);
      if (res.success) {
        setSent(true);
        setBody("");
        // Optimistic: append message locally
        setConv(prev => ({
          ...prev,
          messages: [...prev.messages, {
            id:             crypto.randomUUID(),
            sender_id:      myId,
            sender_name:    "You",
            sender_role:    null,
            body:           toSend,
            message_type:   "message",
            parent_visible: true,
            created_at:     new Date().toISOString(),
            edited_at:      null,
          }],
          last_message_at: new Date().toISOString(),
        }));
        setTimeout(() => setSent(false), 2000);
      } else {
        setError(res.error ?? "Failed to send message.");
      }
    });
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 mb-4 space-y-3">
        <div className="flex items-start gap-3">
          <Link
            href="/portal/messages"
            className="shrink-0 text-sc-gray hover:text-sc-navy transition-colors mt-0.5"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-serif text-heading-2 text-sc-navy truncate">{conv.subject}</h1>
              {isResolved && (
                <span className="flex items-center gap-1 text-[11px] text-sc-teal font-medium">
                  <CheckCircle2 className="size-3.5" /> Resolved
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <CategoryBadge category={conv.category} />
              {conv.student_name && (
                <span className="flex items-center gap-1 text-[11px] text-sc-gray">
                  <User className="size-3" /> {conv.student_name}
                </span>
              )}
              <span className="flex items-center gap-1 text-[11px] text-sc-gray">
                <Clock className="size-3" />
                Started {formatTime(conv.created_at)}
              </span>
            </div>
          </div>
        </div>
        {conv.assigned_name && (
          <p className="text-label-sm text-sc-gray">Assigned to: <strong className="text-sc-navy">{conv.assigned_name}</strong></p>
        )}
        {isResolved && conv.resolved_by_name && (
          <p className="text-label-sm text-sc-gray">Resolved by {conv.resolved_by_name}{conv.resolved_at ? ` on ${formatTime(conv.resolved_at)}` : ""}</p>
        )}
      </div>

      {/* Medical warning */}
      {isMedical && (
        <div className="flex items-start gap-2 rounded-xl border border-sc-gold-300 bg-sc-gold-50 px-4 py-3 mb-4">
          <AlertTriangle className="size-4 text-sc-gold-600 shrink-0 mt-0.5" />
          <p className="text-label-sm text-sc-gold-800">
            <strong>SchoolCo messaging is not monitored continuously.</strong> For an emergency, call 911. For urgent same-day concerns, contact the school directly.
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 space-y-4 mb-4">
        {conv.messages.length === 0 && (
          <p className="text-center text-label-sm text-sc-gray py-8">No messages yet.</p>
        )}
        {conv.messages.map((m, i) => {
          // Insert "New Messages" divider before the first unread message from another sender
          const isFirstUnread =
            initial.first_unread_at !== null &&
            m.created_at === initial.first_unread_at &&
            m.sender_id !== myId;
          // Also cover: divider at start if first_unread_at is before all loaded messages
          const isBeforeFirstMsg =
            i === 0 &&
            initial.first_unread_at !== null &&
            initial.first_unread_at <= m.created_at &&
            m.sender_id !== myId;
          const showDivider = isFirstUnread || isBeforeFirstMsg;
          return (
            <div key={m.id}>
              {showDivider && (
                <div ref={dividerRef} className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-sc-teal/30" />
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-sc-teal bg-sc-teal/10 border border-sc-teal/20 rounded-full px-3 py-1">
                    <ArrowDown className="size-3" /> New Messages
                  </span>
                  <div className="flex-1 h-px bg-sc-teal/30" />
                </div>
              )}
              <MessageBubble msg={m} myId={myId} />
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      {!isResolved ? (
        <form onSubmit={handleSend} className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 space-y-3">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={MAX_BODY}
            placeholder="Write a reply…"
            rows={3}
            className="w-full rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 placeholder:text-sc-gray-400 resize-none"
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(e as unknown as React.FormEvent);
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {error && <p className="text-label-sm text-sc-rose-700">{error}</p>}
              {sent  && <p className="text-label-sm text-sc-teal">Sent!</p>}
              <span className={cn(
                "text-[11px]",
                body.length > MAX_BODY - 200 ? "text-sc-rose-700" : "text-sc-gray-400"
              )}>
                {body.length}/{MAX_BODY}
              </span>
            </div>
            <button
              type="submit"
              disabled={!body.trim() || isPending}
              className="flex items-center gap-2 rounded-xl bg-sc-teal px-4 py-2 text-label-sm font-semibold text-white hover:bg-sc-teal-700 transition-colors disabled:opacity-50"
            >
              {isPending ? (
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Send className="size-4" />
              )}
              {isPending ? "Sending…" : "Send"}
            </button>
          </div>
          <p className="text-[11px] text-sc-gray-400">Press ⌘+Enter to send</p>
        </form>
      ) : (
        <div className="rounded-2xl bg-sc-gray-50 border border-sc-gray-100 p-4 text-center">
          <p className="text-label-sm text-sc-gray">This conversation has been resolved. <Link href="/portal/messages" className="text-sc-teal hover:underline">Go back to messages</Link></p>
        </div>
      )}
    </div>
  );
}
