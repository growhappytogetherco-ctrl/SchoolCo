import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { LoginHero } from "@/components/auth/LoginHero";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function LoginPage() {
  // If already authenticated, skip login
  const user = await getUser();
  if (user) redirect("/select-mission");

  return (
    <main className="min-h-screen grid lg:grid-cols-[1fr_1fr] xl:grid-cols-[55%_45%]">
      {/* ── Left: Hero Panel ─────────────────────────────────── */}
      <div className="hidden lg:block bg-sc-navy">
        <LoginHero />
      </div>

      {/* ── Right: Login Card ─────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-12 bg-sc-cream">
        {/* Mobile logo — only visible below lg */}
        <div className="flex items-center gap-2 mb-8 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sc-teal">
            <svg viewBox="0 0 24 24" fill="none" className="size-5 text-white" aria-hidden="true">
              <path
                d="M12 21C12 21 1 14.5 1 8.5C1 5.42 3.42 3 6.5 3C8.24 3 9.91 3.81 11 5.08C12.09 3.81 13.76 3 15.5 3C18.58 3 21 5.42 21 8.5C21 14.5 12 21 12 21Z"
                fill="currentColor"
              />
            </svg>
          </div>
          <span className="font-serif font-semibold text-xl text-sc-navy tracking-wide">
            SchoolCo.
          </span>
        </div>

        <div className="w-full max-w-sm">
          {/* Heading */}
          <div className="mb-8 text-center">
            <h2 className="font-serif text-heading-1 text-sc-navy">
              Welcome Back!
            </h2>
            <p className="mt-2 text-body-md text-sc-gray">
              We&apos;re excited to continue your family&apos;s journey.
            </p>
          </div>

          {/* Form */}
          <LoginForm />

          {/* Footer */}
          <p className="mt-8 text-center text-label-sm text-sc-gray-400">
            Powered by SchoolCo &middot;{" "}
            <a href="/privacy" className="hover:text-sc-teal transition-colors">
              Privacy
            </a>
            {" · "}
            <a href="/terms" className="hover:text-sc-teal transition-colors">
              Terms
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
