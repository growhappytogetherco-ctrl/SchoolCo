import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";

export const metadata: Metadata = { title: "Messages" };

export default function PortalMessagesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Messages</h1>
        <p className="text-body-md text-sc-gray mt-1">Updates and communications from school staff.</p>
      </div>

      <div className="rounded-2xl bg-white border border-sc-gray-100 p-10 text-center space-y-3">
        <MessageSquare className="size-10 text-sc-gray-300 mx-auto" />
        <p className="font-serif text-heading-3 text-sc-navy">No messages yet</p>
        <p className="text-body-sm text-sc-gray max-w-xs mx-auto">
          When teachers or staff send you updates, they will appear here.
        </p>
      </div>
    </div>
  );
}
