"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);

  const mismatch   = confirm.length > 0 && password !== confirm;
  const tooShort   = password.length > 0 && password.length < 8;
  const canSubmit  = password.length >= 8 && password === confirm && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message ?? "Failed to update password. The link may have expired.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    // Brief pause so the user sees the success state, then redirect
    setTimeout(() => router.push("/select-mission"), 1500);
  }

  if (success) {
    return (
      <div className="text-center space-y-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sc-teal-50 mx-auto">
          <svg className="size-7 text-sc-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-serif text-heading-3 text-sc-navy">Password updated!</p>
        <p className="text-body-md text-sc-gray">Redirecting you to the dashboard…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && (
        <div role="alert" className="rounded-lg bg-sc-rose-50 border border-sc-rose-200 px-4 py-3 text-label-sm text-sc-rose-700">
          {error}
        </div>
      )}

      {/* New password */}
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
          <Input
            id="password"
            type={showPass ? "text" : "password"}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={tooShort}
            className="pl-9 pr-10"
            required
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPass((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sc-gray-400 hover:text-sc-navy transition-colors"
            aria-label={showPass ? "Hide password" : "Show password"}
          >
            {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {tooShort && (
          <p className="text-label-sm text-sc-rose">Password must be at least 8 characters.</p>
        )}
      </div>

      {/* Confirm password */}
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
          <Input
            id="confirm"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={mismatch}
            className="pl-9 pr-10"
            required
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((p) => !p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sc-gray-400 hover:text-sc-navy transition-colors"
            aria-label={showConfirm ? "Hide password" : "Show password"}
          >
            {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {mismatch && (
          <p className="text-label-sm text-sc-rose">Passwords do not match.</p>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        loading={loading}
        disabled={!canSubmit}
        className="w-full"
      >
        Update Password
      </Button>
    </form>
  );
}
