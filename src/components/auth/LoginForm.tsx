"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Mail, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

type AuthError = {
  message: string;
  type: "credentials" | "network" | "locked" | "unverified";
};

function mapSupabaseError(message: string): AuthError {
  if (message.toLowerCase().includes("invalid login credentials")) {
    return { message: "Email or password is incorrect.", type: "credentials" };
  }
  if (message.toLowerCase().includes("email not confirmed")) {
    return {
      message: "Please verify your email before signing in. Check your inbox.",
      type: "unverified",
    };
  }
  if (message.toLowerCase().includes("too many requests")) {
    return {
      message: "Too many attempts. Please wait a few minutes and try again.",
      type: "locked",
    };
  }
  return {
    message: "Something went wrong. Please try again.",
    type: "network",
  };
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [remember, setRemember]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<AuthError | null>(null);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      setError(mapSupabaseError(signInError.message));
      setLoading(false);
      return;
    }

    // On success, middleware will handle org context.
    // Redirect to mission selector.
    router.push("/select-mission");
    router.refresh();
  }

  return (
    <form onSubmit={handleSignIn} noValidate className="space-y-5">
      {/* Error Banner */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg bg-sc-rose-50 border border-sc-rose-200 p-4"
        >
          <AlertCircle className="size-4 text-sc-rose mt-0.5 shrink-0" />
          <p className="text-body-sm text-sc-rose-700">{error.message}</p>
        </div>
      )}

      {/* Email */}
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
            error={error?.type === "credentials"}
            className="pl-9"
            required
            disabled={loading}
          />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-label-sm text-sc-teal hover:underline"
            tabIndex={0}
          >
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sc-gray-400 pointer-events-none" />
          <Input
            id="password"
            type={showPass ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error?.type === "credentials"}
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
      </div>

      {/* Remember me */}
      <div className="flex items-center gap-2">
        <input
          id="remember"
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-4 w-4 rounded border-sc-gray-300 text-sc-teal accent-sc-teal cursor-pointer"
        />
        <Label htmlFor="remember" className="font-normal cursor-pointer text-sc-gray">
          Remember me
        </Label>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        size="lg"
        loading={loading}
        className="w-full"
        disabled={!email || !password}
      >
        {loading ? "Signing in…" : "Sign In"}
      </Button>

      {/* Help */}
      <div className="flex items-center justify-center gap-4 pt-1">
        <a
          href="tel:+1-800-SCHOOLCO"
          className="text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
        >
          Call Us
        </a>
        <span className="text-sc-gray-300">·</span>
        <a
          href="mailto:help@schoolco.app"
          className="text-label-sm text-sc-gray hover:text-sc-teal transition-colors"
        >
          Email Support
        </a>
      </div>
    </form>
  );
}
