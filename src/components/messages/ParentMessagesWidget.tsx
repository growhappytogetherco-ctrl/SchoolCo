import Link from "next/link";
import { MessageSquare, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  unreadCount:    number;
  latestSubject:  string | null;
  latestAt:       string | null;
  orgName:        string;
}

export function ParentMessagesWidget({ unreadCount, latestSubject, latestAt, orgName }: Props) {
  return (
    <Link
      href="/portal/messages"
      className="block rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 hover:border-sc-teal/40 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-sc-teal" />
          <h2 className="text-label-md font-semibold text-sc-navy">Messages</h2>
          {unreadCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sc-rose px-1 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </div>
        <ChevronRight className="size-4 text-sc-gray-400" />
      </div>

      {unreadCount > 0 && latestSubject ? (
        <div>
          <p className="text-label-sm text-sc-rose font-medium">
            {unreadCount === 1 ? "New reply" : `${unreadCount} new replies`} from {orgName}
          </p>
          <p className="text-body-md text-sc-gray truncate mt-0.5">{latestSubject}</p>
          {latestAt && (
            <p className="text-[12px] text-sc-gray-400 mt-0.5">
              {formatDistanceToNow(new Date(latestAt), { addSuffix: true })}
            </p>
          )}
        </div>
      ) : (
        <p className="text-body-md text-sc-gray">No new messages</p>
      )}
    </Link>
  );
}
