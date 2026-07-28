"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Plus, MessageSquare, Clock, CheckCircle2, User,
  Flag, AlertTriangle, Circle,
} from "lucide-react";
import {
  type ConversationSummary,
  type StaffConversationFilter,
  getStaffConversations,
} from "@/app/actions/messages";
import { CategoryBadge } from "@/components/messages/CategoryBadge";
import { StaffComposeModal } from "@/components/messages/StaffComposeModal";
import { cn } from "@/lib/utils";

function formatRelative(ts: string): string {
  const diff  = Date.now() - new Date(ts).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)  return "just now";
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(ts));
}

const PRIORITY_COLORS = {
  urgent: "text-sc-rose",
  high:   "text-sc-gold-600",
  normal: "text-sc-gray-400",
};

function PriorityIcon({ priority }: { priority: string }) {
  if (priority === "urgent") return <Flag className={cn("size-3.5", PRIORITY_COLORS.urgent)} />;
  if (priority === "high")   return <AlertTriangle className={cn("size-3.5", PRIORITY_COLORS.high)} />;
  return null;
}

const TABS: { key: StaffConversationFilter; label: string }[] = [
  { key: "unresolved",   label: "Open" },
  { key: "unread",       label: "Unread" },
  { key: "mine",         label: "Assigned to me" },
  { key: "high_priority",label: "High priority" },
  { key: "all",          label: "All" },
  { key: "resolved",     label: "Resolved" },
];

function ConversationRow({ c }: { c: ConversationSummary }) {
  const isResolved = c.status === "resolved";
  return (
    <Link
      href={`/dashboard/messages/${c.id}`}
      className={cn(
        "flex items-start gap-4 px-5 py-4 border-b border-sc-gray-100 hover:bg-sc-gray-50/50 transition-colors",
        c.unread_count > 0 && "bg-sc-teal/3"
      )}
    >
      {/* Unread indicator */}
      <div className="mt-1.5 shrink-0">
        {c.unread_count > 0 ? (
          <Circle className="size-2.5 fill-sc-teal text-sc-teal" />
        ) : (
          <Circle className="size-2.5 text-transparent" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <PriorityIcon priority={c.priority} />
              <span className={cn(
                "text-label-sm font-semibold truncate",
                c.unread_count > 0 ? "text-sc-navy" : "text-sc-navy/80"
              )}>
                {c.subject}
              </span>
              {c.unread_count > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sc-teal px-1.5 text-[10px] font-bold text-white">
                  {c.unread_count}
                </span>
              )}
              {isResolved && <CheckCircle2 className="size-3.5 text-sc-teal shrink-0" />}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className="text-label-sm font-medium text-sc-navy/70">{c.family_name}</span>
              {c.student_name && (
                <span className="flex items-center gap-1 text-[11px] text-sc-gray">
                  <User className="size-3" />{c.student_name}
                </span>
              )}
              <CategoryBadge category={c.category} />
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 text-right">
            <span className="flex items-center gap-1 text-[11px] text-sc-gray-400">
              <Clock className="size-3" />
              {formatRelative(c.last_message_at)}
            </span>
            {c.assigned_name && (
              <span className="text-[11px] text-sc-gray">→ {c.assigned_name}</span>
            )}
          </div>
        </div>
        {c.last_message_preview && (
          <p className="text-label-sm text-sc-gray line-clamp-1">
            {c.last_sender_name && <span className="font-medium text-sc-navy/60">{c.last_sender_name}: </span>}
            {c.last_message_preview}
          </p>
        )}
      </div>
    </Link>
  );
}

interface Props {
  initialConversations: ConversationSummary[];
  orgId:                string;
}

export function StaffInbox({ initialConversations, orgId }: Props) {
  const [filter, setFilter]           = useState<StaffConversationFilter>("unresolved");
  const [conversations, setConvs]     = useState(initialConversations);
  const [showCompose, setShowCompose] = useState(false);
  const [isPending, startTransition]  = useTransition();

  function switchFilter(f: StaffConversationFilter) {
    setFilter(f);
    startTransition(async () => {
      const res = await getStaffConversations(f);
      if (res.success) setConvs(res.data);
    });
  }

  const totalUnread = initialConversations.reduce((n, c) => n + c.unread_count, 0);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-heading-1 text-sc-navy">Messages</h1>
            <p className="text-body-md text-sc-gray mt-1">
              {totalUnread > 0 ? `${totalUnread} unread` : "Family and parent communications"}
            </p>
          </div>
          <button
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-2 rounded-xl bg-sc-navy px-4 py-2.5 text-label-sm font-semibold text-white hover:bg-sc-navy/80 transition-colors"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">New Conversation</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>

        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card overflow-hidden">
          {/* Tabs */}
          <div className="flex overflow-x-auto border-b border-sc-gray-100 bg-sc-gray-50/50">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => switchFilter(tab.key)}
                className={cn(
                  "shrink-0 px-4 py-3 text-label-sm font-medium transition-colors whitespace-nowrap",
                  filter === tab.key
                    ? "border-b-2 border-sc-teal text-sc-teal -mb-px"
                    : "text-sc-gray hover:text-sc-navy"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* List */}
          {isPending ? (
            <div className="py-12 text-center text-label-sm text-sc-gray">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <MessageSquare className="size-10 text-sc-gray-300 mx-auto" />
              <p className="text-label-sm text-sc-gray">
                {filter === "unresolved" ? "No open conversations." :
                 filter === "unread"     ? "No unread conversations." :
                 filter === "mine"       ? "No conversations assigned to you." :
                 filter === "high_priority" ? "No high-priority conversations." :
                 "No conversations yet."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-sc-gray-100">
              {conversations.map(c => <ConversationRow key={c.id} c={c} />)}
            </div>
          )}
        </div>
      </div>

      {showCompose && (
        <StaffComposeModal orgId={orgId} onClose={() => setShowCompose(false)} />
      )}
    </>
  );
}
