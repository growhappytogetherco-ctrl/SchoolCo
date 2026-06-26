import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap, ChevronRight } from "lucide-react";
import { getUser, getGuardianChildren } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { ENROLLMENT_LABELS } from "@/lib/constants";
import type { EnrollmentStatus } from "@/lib/constants";

export const metadata: Metadata = { title: "My Children" };

/**
 * Parent Portal — My Children.
 *
 * Security:
 * - getGuardianChildren uses get_guardian_household_ids() via RLS.
 * - A parent can ONLY see students in their own guardianship records.
 * - Split-household isolation is enforced at the DB level.
 * - Staff-only fields (notes, court_order_notes, etc.) are never returned here.
 */
export default async function PortalChildrenPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const children = await getGuardianChildren(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">My Children</h1>
        <p className="text-body-md text-sc-gray mt-1">
          You can view your child&apos;s progress and timeline below.
        </p>
      </div>

      {children.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No children linked"
          description="Your account hasn't been linked to any students yet. Contact your school's office if this looks wrong."
        />
      ) : (
        <div className="space-y-3">
          {children.map((child) => (
            <Link
              key={child.id}
              href={`/portal/children/${child.id}`}
              className="flex items-center gap-4 rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 hover:border-sc-teal transition-colors group"
            >
              {/* Avatar initials */}
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sc-teal text-white font-serif text-lg">
                {child.first_name.charAt(0)}{child.last_name.charAt(0)}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-serif text-heading-3 text-sc-navy group-hover:text-sc-teal transition-colors">
                  {child.first_name} {child.last_name}
                  {child.preferred_name ? <span className="text-sc-gray font-sans font-normal text-body-sm"> ({child.preferred_name})</span> : null}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {child.grade_level && (
                    <span className="text-label-sm text-sc-gray">{child.grade_level}</span>
                  )}
                  {child.track && (
                    <span className="text-label-sm text-sc-gray-400">· {child.track}</span>
                  )}
                  <Badge variant={child.enrollment_status === "enrolled" ? "green" : "muted"}>
                    {ENROLLMENT_LABELS[child.enrollment_status as EnrollmentStatus] ?? child.enrollment_status}
                  </Badge>
                </div>
              </div>

              <ChevronRight className="size-5 text-sc-gray-300 group-hover:text-sc-teal transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
