"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, Search, Bell, ChevronDown, LogOut, User, Settings, RefreshCw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ROLE_LABELS, type UserRole } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";

interface AppHeaderProps {
  userName:    string;
  userAvatar?: string | null;
  orgName:     string;
  role:        UserRole;
  onMenuToggle: () => void;
}

export function AppHeader({ userName, userAvatar, orgName, role, onMenuToggle }: AppHeaderProps) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const initials = getInitials(userName || "User");

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-sc-gray-100 bg-white px-4 sm:px-6">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuToggle}
        className="lg:hidden text-sc-gray-500 hover:text-sc-navy transition-colors p-1"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </button>

      {/* Search — full width on desktop, icon only on mobile */}
      <div className="flex-1 hidden sm:flex items-center">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
          <input
            type="search"
            placeholder="Search students, messages, or anything…"
            className="w-full h-9 pl-9 pr-4 rounded-lg border border-sc-gray-200 bg-sc-gray-50 text-body-sm text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal focus:border-sc-teal transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {/* Notification bell */}
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-sc-gray-500 hover:bg-sc-gray-100 hover:text-sc-navy transition-colors"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          {/* Unread dot */}
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-sc-rose border-2 border-white" aria-hidden="true" />
        </button>

        {/* Org context chip — click to switch */}
        <Link
          href="/select-mission"
          className="hidden sm:flex items-center gap-1.5 h-9 px-3 rounded-lg border border-sc-gray-200 hover:bg-sc-gray-50 transition-colors"
          title="Switch organization"
        >
          <RefreshCw className="size-3 text-sc-gray-400" />
          <span className="text-label-sm text-sc-gray-600 max-w-[140px] truncate">{orgName}</span>
        </Link>

        {/* Profile dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-2 h-9 px-2 rounded-lg hover:bg-sc-gray-50 transition-colors"
            aria-expanded={profileOpen}
            aria-haspopup="true"
            aria-label="Profile menu"
          >
            <Avatar className="h-7 w-7">
              <AvatarImage src={userAvatar ?? undefined} alt={userName} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden sm:block text-label-sm text-sc-navy max-w-[100px] truncate">
              {userName}
            </span>
            <ChevronDown className="size-3 text-sc-gray-400 hidden sm:block" />
          </button>

          {/* Dropdown */}
          {profileOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setProfileOpen(false)}
              />
              <div className="absolute right-0 top-full mt-2 z-20 w-56 rounded-xl bg-white shadow-modal border border-sc-gray-100 overflow-hidden">
                {/* User info */}
                <div className="px-4 py-3 bg-sc-gray-50 border-b border-sc-gray-100">
                  <p className="text-label-md font-semibold text-sc-navy truncate">{userName}</p>
                  <Badge variant="default" className="mt-1 text-xs">
                    {ROLE_LABELS[role]}
                  </Badge>
                </div>

                {/* Links */}
                <div className="p-1.5 space-y-0.5">
                  <Link
                    href="/dashboard/profile"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-label-md text-sc-gray-700 hover:bg-sc-gray-50 hover:text-sc-navy transition-colors"
                  >
                    <User className="size-4" />
                    My Profile
                  </Link>
                  <Link
                    href="/dashboard/settings"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-label-md text-sc-gray-700 hover:bg-sc-gray-50 hover:text-sc-navy transition-colors"
                  >
                    <Settings className="size-4" />
                    Settings
                  </Link>
                  <Link
                    href="/select-mission"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-label-md text-sc-gray-700 hover:bg-sc-gray-50 hover:text-sc-navy transition-colors"
                  >
                    <RefreshCw className="size-4" />
                    Switch Mission
                  </Link>
                </div>

                <Separator />

                <div className="p-1.5">
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-label-md text-sc-rose hover:bg-sc-rose-50 transition-colors"
                  >
                    <LogOut className="size-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
