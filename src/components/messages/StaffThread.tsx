"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Send, User, CheckCircle2, Clock,
  Flag, Lock, ChevronDown, UserCheck, RotateCcw, ArrowDown,
} from "lucide-react";
import {
  type ConversationDetail,
  type MessageItem,
  type StaffMember,
  type ConversationPriority,
  type ConversationStatus,
  sendStaffMessage,
  updateConversationStatus,
  updateConversationPriority,
  assignConversation,
} from "@/app/actions/messages";
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
  const isMine    = msg.sender_id === myId;
  const isNote    = msg.message_type === "note";
  const isSystem  = msg.message_type === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[11px] text-sc-gray bg-sc-gray-100 rounded-full px-3 py-1">{msg.body}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3", isMine ? "flex-row-reverse" : "")}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sc-navy/10 mt-0.5">
        <User className="size-4 text-sc-navy/60" />
      </div>
      <div className={cn("space-y-1 max-w-[75%]", isMine ? "items-end" : "items-start", "flex flex-col")}>
        <div className="flex items-center gap-2 flex-wrap px-1">
          <span className="text-[11px] text-sc-gray">{msg.sender_name}</span>
          {isNote && (
            <span className="flex items-center gap-1 text-[10px] text-sc-navy bg-sc-gold-50 border border-sc-gold-300 rounded-full px-2 py-0.5">
              <Lock className="size-2.5" /> Staff note
            </span>
          )}
        </div>
        <div className={cn(
          "rounded-2xl px-4 py-2.5 text-label-sm",
          isNote
            ? "bg-sc-gold-50 border border-sc-gold-300 text-sc-navy rounded-tl-sm"
            : isMine
            ? "bg-sc-navy text-white rounded-tr-sm"
            : "bg-sc-gray-100 text-sc-navy rounded-tl-sm"
        )}>
          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        </div>
        <span className="text-[10px] text-sc-gray-400 px-1">{formatTime(msg.created_at)}</span>
      </div>
    </div>
  );
}

interface Props {
  conversation: ConversationDetail;
  staffMembers: StaffMember[];
  myId:         string;
}

export function StaffThread({ conversation: initial, staffMembers, myId }: Props) {
  const [conv, setConv]              = useState(initial);
  const [body, setBody]              = useState("");
  const [isNote, setIsNote]          = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);
  const [sent, setSent]              = useState(false);
  const [actionError, setActionError]= useState<string | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);

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
    if (conv.messages.length > initial.messages.length) scrollToBottom();
  }, [conv.messages.length, initial.messages.length, scrollToBottom]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || isPending) return;
    setError(null);
    setSent(false);
    const toSend = body.trim();
    const noteMode = isNote;
    startTransition(async () => {
      const res = await sendStaffMessage(conv.id, toSend, noteMode);
      if (res.success) {
        setSent(true);
        setBody("");
        setConv(prev => ({
          ...prev,
          messages: [...prev.messages, {
            id:             crypto.randomUUID(),
            sender_id:      myId,
            sender_name:    "You",
            sender_role:    null,
            body:           toSend,
            message_type:   noteMode ? "note" : "message",
            parent_visible: !noteMode,
            created_at:     new Date().toISOString(),
            edited_at:      null,
          }],
        }));
        setTimeout(() => setSent(false), 2000);
      } else {
        setError(res.error ?? "Failed to send.");
      }
    });
  }

  function handleStatusChange(status: ConversationStatus) {
    setActionError(null);
    startTransition(async () => {
      const res = await updateConversationStatus(conv.id, status);
      if (res.success) setConv(prev => ({ ...prev, status, resolved_at: status === "resolved" ? new Date().toISOString() : null }));
      else setActionError(res.error ?? "Failed.");
    });
  }

  function handlePriorityChange(priority: ConversationPriority) {
    setActionError(null);
    startTransition(async () => {
      const res = await updateConversationPriority(conv.id, priority);
      if (res.success) setConv(prev => ({ ...prev, priority }));
      else setActionError(res.error ?? "Failed.");
    });
  }

  function handleAssign(profileId: string) {
    setActionError(null);
    const staffMember = staffMembers.find(s => s.profile_id === profileId);
    startTransition(async () => {
      const res = await assignConversation(conv.id, profileId || null);
      if (res.success) setConv(prev => ({ ...prev, assigned_to: profileId || null, assigned_name: staffMember?.full_name ?? null }));
      else setActionError(res.error ?? "Failed.");
    });
  }

  const isResolved = conv.status === "resolved" || conv.status === "closed";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
      {/* Main thread */}
      <div className="flex flex-col min-h-0">
        {/* Header */}
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 mb-4">
          <div className="flex items-start gap-3">
            <Link href="/dashboard/messages" className="shrink-0 text-sc-gray hover:text-sc-navy transition-colors mt-0.5">
              <ArrowLeft className="size-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-serif text-heading-2 text-sc-navy truncate">{conv.subject}</h1>
                {conv.priority !== "normal" && (
                  <Flag className={cn("size-4 shrink-0", conv.priority === "urgent" ? "text-sc-rose" : "text-sc-gold-600")} />
                )}
                {isResolved && <CheckCircle2 className="size-4 text-sc-teal shrink-0" />}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <CategoryBadge category={conv.category} />
                <Link href={`/dashboard/families/${conv.family_id}`} className="text-[11px] text-sc-teal hover:underline font-medium">{conv.family_name}</Link>
                {conv.student_id && conv.student_name && (
                  <Link href={`/dashboard/students/${conv.student_id}`} className="flex items-center gap-1 text-[11px] text-sc-gray hover:text-sc-teal">
                    <User className="size-3" /> {conv.student_name}
                  </Link>
                )}
                <span className="flex items-center gap-1 text-[11px] text-sc-gray">
                  <Clock className="size-3" />
                  {formatTime(conv.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 space-y-4 mb-4 max-h-[60vh] overflow-y-auto">
          {conv.messages.length === 0 && (
            <p className="text-center text-label-sm text-sc-gray py-8">No messages yet.</p>
          )}
          {conv.messages.map((m, i) => {
            const isFirstUnread =
              initial.first_unread_at !== null &&
              m.created_at === initial.first_unread_at &&
              m.sender_id !== myId;
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
        <form onSubmit={handleSend} className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 space-y-3">
          {/* Note toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsNote(false)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-label-sm font-medium transition-colors",
                !isNote ? "bg-sc-navy text-white" : "text-sc-gray hover:bg-sc-gray-100"
              )}
            >
              Reply to family
            </button>
            <button
              type="button"
              onClick={() => setIsNote(true)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-label-sm font-medium transition-colors",
                isNote ? "bg-sc-gold-600 text-white" : "text-sc-gray hover:bg-sc-gray-100"
              )}
            >
              <Lock className="size-3.5" /> Internal note
            </button>
          </div>

          {isNote && (
            <p className="text-[11px] text-sc-gold-700 bg-sc-gold-50 border border-sc-gold-200 rounded-lg px-3 py-2">
              Internal notes are never shown to parents or guardians.
            </p>
          )}

          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={MAX_BODY}
            placeholder={isNote ? "Write an internal note for staff only…" : "Write a reply to the family…"}
            rows={3}
            className={cn(
              "w-full rounded-xl border px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 placeholder:text-sc-gray-400 resize-none",
              isNote ? "border-sc-gold-300 focus:ring-sc-gold-300/30 bg-sc-gold-50" : "border-sc-gray-200 focus:ring-sc-teal/30"
            )}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(e as unknown as React.FormEvent);
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {error && <p className="text-label-sm text-sc-rose-700">{error}</p>}
              {sent  && <p className="text-label-sm text-sc-teal">Sent!</p>}
              <span className={cn("text-[11px]", body.length > MAX_BODY - 200 ? "text-sc-rose-700" : "text-sc-gray-400")}>
                {body.length}/{MAX_BODY}
              </span>
            </div>
            <button
              type="submit"
              disabled={!body.trim() || isPending}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-label-sm font-semibold text-white transition-colors disabled:opacity-50",
                isNote ? "bg-sc-gold-600 hover:bg-sc-gold-700" : "bg-sc-navy hover:bg-sc-navy/80"
              )}
            >
              {isPending ? <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Send className="size-4" />}
              {isPending ? "Sending…" : sent ? "Sent!" : isNote ? "Save Note" : "Send Reply"}
            </button>
          </div>
        </form>
      </div>

      {/* Sidebar: conversation actions */}
      <div className="space-y-4">
        {actionError && (
          <p className="text-label-sm text-sc-rose-700 bg-sc-rose-50 border border-sc-rose-200 rounded-xl px-4 py-3">{actionError}</p>
        )}

        {/* Status */}
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 space-y-3">
          <h3 className="text-label-sm font-semibold text-sc-navy uppercase tracking-wider">Status</h3>
          <div className="relative">
            <select
              value={conv.status}
              onChange={e => handleStatusChange(e.target.value as ConversationStatus)}
              disabled={isPending}
              className="w-full appearance-none rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 disabled:opacity-50 pr-8"
            >
              <option value="open">Open</option>
              <option value="waiting_parent">Waiting: Parent</option>
              <option value="waiting_staff">Waiting: Staff</option>
              <option value="reopened">Reopened</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 size-4 text-sc-gray pointer-events-none" />
          </div>
          {!isResolved && (
            <button
              onClick={() => handleStatusChange("resolved")}
              disabled={isPending}
              className="w-full flex items-center gap-2 rounded-xl bg-sc-teal px-3 py-2 text-label-sm font-medium text-white hover:bg-sc-teal-700 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="size-4" /> Mark resolved
            </button>
          )}
          {isResolved && (
            <button
              onClick={() => handleStatusChange("reopened")}
              disabled={isPending}
              className="w-full flex items-center gap-2 rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy hover:bg-sc-gray-100 transition-colors disabled:opacity-50"
            >
              <RotateCcw className="size-4" /> Reopen conversation
            </button>
          )}
        </div>

        {/* Priority */}
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 space-y-3">
          <h3 className="text-label-sm font-semibold text-sc-navy uppercase tracking-wider">Priority</h3>
          <div className="relative">
            <select
              value={conv.priority}
              onChange={e => handlePriorityChange(e.target.value as ConversationPriority)}
              disabled={isPending}
              className="w-full appearance-none rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 disabled:opacity-50 pr-8"
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-2.5 size-4 text-sc-gray pointer-events-none" />
          </div>
        </div>

        {/* Assignment */}
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 space-y-3">
          <h3 className="text-label-sm font-semibold text-sc-navy uppercase tracking-wider">Assigned to</h3>
          <div className="relative">
            <select
              value={conv.assigned_to ?? ""}
              onChange={e => handleAssign(e.target.value)}
              disabled={isPending}
              className="w-full appearance-none rounded-xl border border-sc-gray-200 px-3 py-2 text-label-sm text-sc-navy focus:outline-none focus:ring-2 focus:ring-sc-teal/30 disabled:opacity-50 pr-8"
            >
              <option value="">Unassigned</option>
              {staffMembers.map(s => (
                <option key={s.profile_id} value={s.profile_id}>
                  {s.full_name}
                </option>
              ))}
            </select>
            <UserCheck className="absolute right-2.5 top-2.5 size-4 text-sc-gray pointer-events-none" />
          </div>
        </div>

        {/* Participants */}
        {conv.participants.length > 0 && (
          <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 space-y-2">
            <h3 className="text-label-sm font-semibold text-sc-navy uppercase tracking-wider">Participants</h3>
            {conv.participants.map(p => (
              <div key={p.profile_id} className="flex items-center gap-2 text-label-sm text-sc-navy">
                <User className="size-3.5 text-sc-gray" />
                <span className="truncate">{p.name}</span>
                <span className="text-[10px] text-sc-gray capitalize ml-auto">{p.participant_type}</span>
              </div>
            ))}
          </div>
        )}

        {/* Links */}
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 space-y-2">
          <h3 className="text-label-sm font-semibold text-sc-navy uppercase tracking-wider">Links</h3>
          <Link
            href={`/dashboard/families/${conv.family_id}`}
            className="flex items-center gap-2 text-label-sm text-sc-teal hover:underline"
          >
            View family: {conv.family_name}
          </Link>
          {conv.student_id && conv.student_name && (
            <Link
              href={`/dashboard/students/${conv.student_id}`}
              className="flex items-center gap-2 text-label-sm text-sc-teal hover:underline"
            >
              View student: {conv.student_name}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
