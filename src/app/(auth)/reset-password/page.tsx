import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata: Metadata = { title: "Set New Password" };

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-sc-cream">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-10">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sc-teal">
          <svg viewBox="0 0 24 24" fill="none" className="size-5 text-white" aria-hidden="true">
            <path
              d="M12 21C12 21 1 14.5 1 8.5C1 5.42 3.42 3 6.5 3C8.24 3 9.91 3.81 11 5.08C12.09 3.81 13.76 3 15.5 3C18.58 3 21 5.42 21 8.5C21 14.5 12 21 12 21Z"
              fill="currentColor"
            />
          </svg>
        </div>
        <span className="font-serif font-semibold text-xl text-sc-navy">SchoolCo.</span>
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-serif text-heading-1 text-sc-navy">Set new password</h1>
          <p className="mt-2 text-body-md text-sc-gray">
            Choose a strong password for your account.
          </p>
        </div>

        <ResetPasswordForm />

        <p className="mt-8 text-center text-label-sm text-sc-gray">
          Need help?{" "}
          <Link href="/forgot-password" className="text-sc-teal font-medium hover:underline">
            Request a new link
          </Link>
        </p>
      </div>
    </main>
  );
}
