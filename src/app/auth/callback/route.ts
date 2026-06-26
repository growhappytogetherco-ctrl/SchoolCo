import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback handler.
 * Supabase redirects here after email confirmation or OAuth.
 * Exchanges the auth code for a session, then redirects accordingly.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code  = searchParams.get("code");
  const next  = searchParams.get("next") ?? "/select-mission";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth/magic link errors
  if (error) {
    console.error("[Auth Callback] Error:", error, errorDescription);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", errorDescription ?? error);
    return NextResponse.redirect(loginUrl);
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("[Auth Callback] Code exchange failed:", exchangeError.message);
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("error", "Sign-in link expired. Please try again.");
      return NextResponse.redirect(loginUrl);
    }

    // Redirect to intended destination (default: mission selector)
    const forwardedHost = request.headers.get("x-forwarded-host");
    const isLocalEnv    = process.env.NODE_ENV === "development";

    if (isLocalEnv) {
      return NextResponse.redirect(`${origin}${next}`);
    } else if (forwardedHost) {
      return NextResponse.redirect(`https://${forwardedHost}${next}`);
    } else {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // No code — redirect to login
  return NextResponse.redirect(new URL("/login", origin));
}
