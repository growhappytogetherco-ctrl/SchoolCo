import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { User, Mail, Shield, Building2 } from "lucide-react";
import { getUser, getProfile, createClient } from "@/lib/supabase/server";
import { getActiveOrgId, getActiveRole } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/lib/constants";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";

export const metadata: Metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const [profile, orgId, role] = await Promise.all([
    getProfile(user.id),
    getActiveOrgId(),
    getActiveRole(),
  ]);

  let orgName: string | null = null;
  if (orgId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single();
    orgName = data?.name ?? null;
  }

  const fullName = profile?.full_name ?? "Staff Member";
  const email    = user.email ?? "—";
  const roleLabel = ROLE_LABELS[role as UserRole] ?? role ?? "—";

  return (
    <div className="animate-fade-in max-w-lg space-y-6">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">My Profile</h1>
        <p className="text-body-md text-sc-gray mt-1">Your account and role details.</p>
      </div>

      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6 space-y-6">
        {/* Avatar + name */}
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt={fullName} />
            <AvatarFallback className="text-lg font-serif bg-sc-teal text-white">
              {getInitials(fullName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-serif text-heading-2 text-sc-navy">{fullName}</p>
            <p className="text-label-sm text-sc-gray mt-0.5">{roleLabel}</p>
          </div>
        </div>

        <div className="divide-y divide-sc-gray-100 -mx-6 px-6">
          <ProfileRow icon={Mail} label="Email" value={email} />
          <ProfileRow icon={Shield} label="Role" value={roleLabel} />
          {orgName && <ProfileRow icon={Building2} label="Organization" value={orgName} />}
          <ProfileRow icon={User} label="Account ID" value={user.id.slice(0, 8).toUpperCase()} />
        </div>
      </div>

      <p className="text-label-sm text-sc-gray-400 text-center">
        To update your name or email, contact your administrator.
      </p>
    </div>
  );
}

function ProfileRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-3.5">
      <Icon className="size-4 text-sc-gray-400 shrink-0" />
      <span className="text-label-sm text-sc-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-label-sm text-sc-navy font-medium">{value}</span>
    </div>
  );
}
