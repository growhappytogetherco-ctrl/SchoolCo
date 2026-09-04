"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BookOpen } from "lucide-react";

export default function SetPasswordPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError("");

    startTransition(async () => {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/select-mission"), 1500);
    });
  }

  return (
    <div className="min-h-screen bg-sc-cream flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">

        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-2xl bg-sc-navy p-3">
            <BookOpen className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="font-serif text-2xl text-sc-navy">Welcome to SchoolCo</h1>
            <p className="text-sc-gray text-sm mt-1">Set a password to finish creating your account.</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-6">
          {success ? (
            <div className="text-center py-4">
              <p className="text-sc-teal font-medium">Password set! Redirecting…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-3 py-2.5 text-sc-rose-700 text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-sc-navy mb-1.5">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-sc-navy mb-1.5">Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  placeholder="Repeat your password"
                  className="w-full rounded-lg border border-sc-gray-200 px-3 py-2.5 text-sc-navy placeholder:text-sc-gray-400 focus:outline-none focus:ring-2 focus:ring-sc-teal/30 focus:border-sc-teal"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-lg bg-sc-teal px-4 py-2.5 text-white font-medium hover:bg-sc-teal-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Setting password…" : "Set Password & Enter SchoolCo"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
