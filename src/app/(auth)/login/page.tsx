import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { LoginHero } from "@/components/auth/LoginHero";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Sign In · Rising Leaders Academy",
  description: "Sign in to the Rising Leaders Academy family portal.",
};

export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect("/select-mission");

  return (
    <main className="min-h-screen grid lg:grid-cols-[1fr_1fr] xl:grid-cols-[58%_42%]">

      {/* ── Left: RLA Hero Panel (desktop only) ── */}
      <div className="hidden lg:block bg-sc-navy">
        <LoginHero />
      </div>

      {/* ── Right: Login Panel ── */}
      <div className="flex flex-col min-h-screen bg-sc-cream">

        {/* Mobile hero band — shown only below lg */}
        <div className="lg:hidden relative h-40 bg-sc-navy overflow-hidden flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-br from-sc-navy to-sc-teal/30" />
          <div className="relative z-10 flex flex-col items-center justify-center h-full gap-1 px-4">
            <p className="text-sc-teal text-[10px] font-bold tracking-[0.2em] uppercase">Welcome to</p>
            <h1 className="font-serif text-white font-bold text-2xl text-center leading-tight">
              Rising Leaders Academy
            </h1>
            <p className="text-white/70 text-xs tracking-widest text-center">
              Faith · Leadership · Excellence
            </p>
          </div>
        </div>

        {/* Sign-in card */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 md:p-12">
          <div className="w-full max-w-sm">

            {/* Desktop school badge */}
            <div className="hidden lg:flex items-center gap-3 mb-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sc-navy shadow-sm">
                <span className="text-white font-serif font-bold text-sm tracking-tight">RLA</span>
              </div>
              <div>
                <p className="text-xs text-sc-gray-400 font-medium tracking-widest uppercase leading-none mb-0.5">
                  Family Portal
                </p>
                <p className="text-sm font-semibold text-sc-navy leading-none">
                  Rising Leaders Academy
                </p>
              </div>
            </div>

            {/* Heading */}
            <div className="mb-8">
              <h2 className="font-serif text-heading-1 text-sc-navy">
                Welcome back
              </h2>
              <p className="mt-1.5 text-body-md text-sc-gray">
                Sign in to continue your family&apos;s journey.
              </p>
            </div>

            {/* Form — authentication logic unchanged */}
            <LoginForm />

            {/* Footer */}
            <p className="mt-8 text-center text-label-sm text-sc-gray-400">
              Powered by SchoolCo &middot;{" "}
              <a href="/privacy" className="hover:text-sc-teal transition-colors">Privacy</a>
              {" · "}
              <a href="/terms" className="hover:text-sc-teal transition-colors">Terms</a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
