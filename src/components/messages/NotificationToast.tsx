"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";

interface Props {
  userId:    string;
  linkBase?: string; // "/dashboard/messages" or "/portal/messages"
}

export function NotificationToast({ userId, linkBase = "/dashboard/messages" }: Props) {
  const router = useRouter();
  const mountedRef = useRef(false);

  useEffect(() => {
    // Skip toasts from before this component mounted (stale notifications)
    const mountedAt = new Date().toISOString();
    mountedRef.current = true;

    const supabase = createClient();

    const channel = supabase
      .channel(`notification-toast-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        payload => {
          if (!mountedRef.current) return;
          const n = payload.new as {
            id: string;
            title: string;
            resource_id: string | null;
            created_at: string;
          };
          // Only show toast for notifications created after mount
          if (n.created_at < mountedAt) return;

          const href = n.resource_id ? `${linkBase}/${n.resource_id}` : linkBase;

          toast(n.title, {
            icon: <MessageSquare className="size-4 text-sc-teal" />,
            action: {
              label:   "View",
              onClick: () => router.push(href),
            },
            duration: 6000,
          });
        }
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [userId, linkBase, router]);

  return null;
}
