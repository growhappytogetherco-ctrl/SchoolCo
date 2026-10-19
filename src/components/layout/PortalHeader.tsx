"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, User, LayoutDashboard } from "lucide-react";
import { setPortalView } from "@/app/actions/org";
import { signOutAction } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { getInitials } from "@/lib/utils";

interface PortalHeaderAccountProps {
  userName:    string;
  isMultiRole: boolean; // true = has verified staff access, may switch to staff dashboard
}

export function PortalHeaderAccount({ userName, isMultiRole }: PortalHeaderAccountProps) {
  const [open, setOpen] = useState(false);
  const [, startStaffTransition]   = useTransition();
  const [, startSignOutTransition] = useTransition();

  function switchToStaff() {
    setOpen(false);
    const form = new FormData();
    form.set("view", "staff");
    startStaffTransition(() => setPortalView(form));
  }

  function handleSignOut() {
    setOpen(false);
    startSignOutTransition(() => signOutAction());
  }

  const initials = getInitials(userName || "User");

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 h-9 px-2 rounded-lg hover:bg-sc-gray-50 transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Account menu"
      >
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs bg-sc-teal text-white">{initials}</AvatarFallback>
        </Avatar>
        <span className="hidden sm:block text-label-sm text-sc-navy max-w-[100px] truncate">
          {userName}
        </span>
        <ChevronDown className="size-3 text-sc-gray-400 hidden sm:block" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />

          {/* Dropdown panel */}
          <div className="absolute right-0 top-full mt-2 z-20 w-52 rounded-xl bg-white shadow-modal border border-sc-gray-100 overflow-hidden">
            {/* User info header */}
            <div className="px-4 py-3 bg-sc-gray-50 border-b border-sc-gray-100">
              <p className="text-label-md font-semibold text-sc-navy truncate">{userName}</p>
              <p className="text-label-sm text-sc-gray-400 mt-0.5">Family Portal</p>
            </div>

            <div className="p-1.5 space-y-0.5">
              <Link
                href="/portal/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-label-md text-sc-gray-700 hover:bg-sc-gray-50 hover:text-sc-navy transition-colors"
              >
                <User className="size-4" />
                My Account
              </Link>

              {isMultiRole && (
                <button
                  onClick={switchToStaff}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-label-md text-sc-teal-700 hover:bg-sc-teal-50 transition-colors"
                >
                  <LayoutDashboard className="size-4" />
                  Switch to Staff Portal
                </button>
              )}
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
  );
}
