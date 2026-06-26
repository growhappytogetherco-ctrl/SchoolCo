import type { Metadata } from "next";
import Link from "next/link";
import { Database, Upload } from "lucide-react";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  {
    title: "Data Import",
    description: "Import student records from Airtable CSV exports.",
    href: "/dashboard/settings/import",
    icon: Upload,
    badge: "Admin Only",
  },
];

export default function SettingsPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Settings</h1>
        <p className="text-body-sm text-sc-gray mt-1">Organization and account configuration.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}
            className="group flex items-start gap-4 rounded-2xl border border-sc-gray-100 bg-white shadow-card p-6 hover:border-sc-teal transition-colors">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sc-teal-50 border border-sc-teal-200 group-hover:bg-sc-teal group-hover:border-sc-teal transition-colors">
              <s.icon className="size-5 text-sc-teal group-hover:text-white transition-colors" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-label-md font-semibold text-sc-navy">{s.title}</p>
                {s.badge && (
                  <span className="rounded-full bg-sc-gray-50 border border-sc-gray-200 px-2 py-0.5 text-label-sm text-sc-gray">{s.badge}</span>
                )}
              </div>
              <p className="text-label-sm text-sc-gray mt-0.5">{s.description}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
        <div className="flex items-center gap-2 mb-3">
          <Database className="size-4 text-sc-gray" />
          <h2 className="text-label-md font-semibold text-sc-gray">More settings coming soon</h2>
        </div>
        <p className="text-body-sm text-sc-gray">
          Organization profile, notification preferences, user roles, and integrations will be added in future phases.
        </p>
      </div>
    </div>
  );
}
