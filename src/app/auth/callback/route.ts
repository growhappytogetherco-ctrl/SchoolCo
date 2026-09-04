import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { provisionInvitedStaffAccount } from "@/app/actions/staff-invitations";

/**
 * Auth callback handler.
 * Handles: email confirmation, password reset, OAuth, and staff portal invites.
 *
 * For staff invites, `invitation_id` and `org_id` are passed in the query string
 * (set in the redirectTo URL when sendStaffInvite calls auth.admin.inviteUserByEmail).
 * Roles are read from the `staff_invitations` DB row — never from user-controlled input.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const code          = searchParams.get("code");
  const next          = searchParams.get("next") ?? "/select-mission";
  const error         = searchParams.get("error");
  const errorDesc     = searchParams.get("error_description");
  const invitationId  = searchParams.get("invitation_id");
  const orgId         = searchParams.get("org_id");

  // Handle OAuth/magic link errors
  if (error) {
    console.error("[Auth Callback] Error:", error, errorDesc);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", errorDesc ?? error);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    console.error("[Auth Callback] Code exchange failed:", exchangeError.message);
    const loginUrl = new URL("/login", origin);
    loginUrl.searchParams.set("error", "Sign-in link expired. Please try again.");
    return NextResponse.redirect(loginUrl);
  }

  // If this is a staff invite acceptance, provision the account
  if (invitationId && orgId) {
    const { data: { user } } = await supabase.auth.getUser();

    if (user?.email) {
      const result = await provisionInvitedStaffAccount({
        authUserId:   user.id,
        email:        user.email,
        invitationId,
        orgId,
      });

      if (!result.ok) {
        console.error("[Auth Callback] Staff provisioning failed:", result.error);
        // Still redirect — let set-password page surface the error if needed
      }
    }
  }

  // Redirect to intended destination
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocalEnv    = process.env.NODE_ENV === "development";

  const destination = isLocalEnv
    ? `${origin}${next}`
    : forwardedHost
    ? `https://${forwardedHost}${next}`
    : `${origin}${next}`;

  return NextResponse.redirect(destination);
}
