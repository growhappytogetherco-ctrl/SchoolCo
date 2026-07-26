"use client";

import { useTransition } from "react";
import { LayoutDashboard, Home, Users } from "lucide-react";
import { setPortalView } from "@/app/actions/org";

/**
 * View picker for multi-role users (e.g., a staff member who is also a parent).
 * Shown after org selection when `sc_has_parent` cookie is set.
 * Choosing a view sets `sc_portal_view` and redirects to the appropriate home.
 */
export default function SelectViewPage() {
  const [staffPending, startStaff]   = useTransition();
  const [parentPending, startParent] = useTransition();

  function pick(view: "staff" | "parent") {
    const form = new FormData();
    form.set("view", view);
    if (view === "staff") {
      startStaff(() => setPortalView(form));
    } else {
      startParent(() => setPortalView(form));
    }
  }

  return (
    <div className="min-h-screen bg-sc-cream flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sc-teal">
              <Users className="size-5 text-white" />
            </div>
            <span className="font-serif font-bold text-xl text-sc-navy">SchoolCo.</span>
          </div>
          <h1 className="font-serif text-heading-1 text-sc-navy">Choose Your View</h1>
          <p className="mt-2 text-body-md text-sc-gray">
            Your account has both staff and parent access.
            <br />
            Which would you like to enter?
          </p>
        </div>

        {/* View cards */}
        <div className="space-y-4">
          <button
            onClick={() => pick("staff")}
            disabled={staffPending || parentPending}
            className="w-full flex items-center gap-4 rounded-2xl bg-white border-2 border-sc-navy/10 p-5 text-left hover:border-sc-teal hover:shadow-md transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sc-navy text-white group-hover:bg-sc-teal transition-colors">
              <LayoutDashboard className="size-6" />
            </div>
            <div>
              <p className="font-serif text-heading-3 text-sc-navy group-hover:text-sc-teal transition-colors">
                Staff Dashboard
              </p>
              <p className="text-label-sm text-sc-gray mt-0.5">
                Full admin access · Students, attendance, reports
              </p>
            </div>
            {staffPending && (
              <div className="ml-auto h-5 w-5 rounded-full border-2 border-sc-teal border-t-transparent animate-spin" />
            )}
          </button>

          <button
            onClick={() => pick("parent")}
            disabled={staffPending || parentPending}
            className="w-full flex items-center gap-4 rounded-2xl bg-white border-2 border-sc-navy/10 p-5 text-left hover:border-sc-teal hover:shadow-md transition-all group disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sc-teal text-white group-hover:bg-sc-navy transition-colors">
              <Home className="size-6" />
            </div>
            <div>
              <p className="font-serif text-heading-3 text-sc-navy group-hover:text-sc-teal transition-colors">
                Parent Portal
              </p>
              <p className="text-label-sm text-sc-gray mt-0.5">
                Family view · Your child's progress and timeline
              </p>
            </div>
            {parentPending && (
              <div className="ml-auto h-5 w-5 rounded-full border-2 border-sc-teal border-t-transparent animate-spin" />
            )}
          </button>
        </div>

        <p className="text-center text-label-sm text-sc-gray-400">
          You can switch views at any time from the navigation bar.
        </p>
      </div>
    </div>
  );
}
