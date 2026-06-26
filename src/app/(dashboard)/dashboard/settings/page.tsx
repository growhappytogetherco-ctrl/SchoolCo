import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-8 text-center">
        <h1 className="font-serif text-heading-1 text-sc-navy mb-2">Settings</h1>
        <p className="text-body-md text-sc-gray">
          Organization and account settings are coming in Sprint 1.
        </p>
      </div>
    </div>
  );
}
