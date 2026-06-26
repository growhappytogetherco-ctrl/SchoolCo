"use client";

import { useState } from "react";
import { Mail, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]     = useState(false);
  const [error, setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
      }
    );

    if (resetError) {
      // Don't reveal whether the email exists — always show success for security
      // Log the actual error server-side via audit log in a future sprint
    }

    // Always show the sent state (prevents email enumeration)
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="text-center space-y-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sc-teal-50 mx-auto">
          <CheckCircle className="size-7 text-sc-teal" />
        </div>
        <h2 className="font-serif text-heading-3 text-sc-navy">Check your inbox</h2>
        <p className="text-body-md text-sc-gray leading-relaxed">
          If an account exists for <strong>{email}</strong>, we&apos;ve sent a
          password reset link. It may take a few minutes to arrive.
        </p>
        <p className="text-label-sm text-sc-gray-400">
          Check your spam folder if you don&apos;t see it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-9"
            required
            disabled={loading}
          />
        </div>
      </div>

      <Button
        type="submit"
        size="lg"
        loading={loading}
        className="w-full"
        disabled={!email}
      >
        Send Reset Link
      </Button>
    </form>
  );
}
