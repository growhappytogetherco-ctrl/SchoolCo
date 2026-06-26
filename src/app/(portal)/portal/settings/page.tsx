import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser, getMyGuardianships } from "@/lib/supabase/server";
import { PreferencesForm } from "@/components/portal/PreferencesForm";
import { EmptyState } from "@/components/shared/EmptyState";
import { Users } from "lucide-react";

export const metadata: Metadata = { title: "Communication Settings" };

/**
 * Parent Portal — Communication & Visibility Preferences.
 *
 * Security:
 * - Parents can only update their OWN guardianship rows.
 * - updateMyPreferences server action verifies the calling user owns the row.
 * - Custody-restricted visibility fields (set by staff on supervised/none custody)
 *   cannot be elevated by the parent — the action enforces this.
 * - Staff-only notes on guardianships are never returned to this page.
 */
export default async function PortalSettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const guardianships = await getMyGuardianships(user.id);
  const active = guardianships.filter((g) => g.status === "active");

  if (active.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No active connections"
        description="You have no active guardianship records. Contact your school office if this seems incorrect."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Communication Settings</h1>
        <p className="text-body-md text-sc-gray mt-1">
          Control how the school contacts you and what information you receive.
        </p>
      </div>

      {active.map((guardianship) => (
        <PreferencesForm key={guardianship.id} guardianship={guardianship} />
      ))}
    </div>
  );
}
