/**
 * SchoolCo Email — Resend Integration
 *
 * SETUP REQUIRED:
 *   npm install resend
 *
 * Required env vars (add to .env.local):
 *   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
 *   NEXT_PUBLIC_APP_URL=https://your-domain.com
 *
 * Resend dashboard: https://resend.com/
 * Domain verification: Resend → Domains → Add domain
 *   After verification, update FROM_ADDRESS below.
 *
 * This module is server-only. Never import in client components.
 */

// ── Types ─────────────────────────────────────────────────────────────────

export interface EmailOptions {
  to:       string | string[];
  subject:  string;
  html:     string;
  text?:    string;
  replyTo?: string;
}

export interface WelcomeGuardianEmailOptions {
  to:           string;
  guardianName: string;
  studentName:  string;
  orgName:      string;
  loginUrl:     string;
}

// ── Configuration ─────────────────────────────────────────────────────────

const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "no-reply@schoolco.app";
const APP_NAME     = "SchoolCo";

// ── Core send function ────────────────────────────────────────────────────

/**
 * sendEmail — sends a transactional email via Resend.
 *
 * Gracefully degrades if RESEND_API_KEY is not configured:
 * - In development: logs email to console
 * - In production: logs error but does not throw (email is not mission-critical)
 */
export async function sendEmail(options: EmailOptions): Promise<{ id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Development fallback — log to console
    console.log("\n[Email — NOT SENT, no RESEND_API_KEY]");
    console.log("  To:     ", Array.isArray(options.to) ? options.to.join(", ") : options.to);
    console.log("  Subject:", options.subject);
    console.log("  Body:   ", options.text ?? options.html.replace(/<[^>]+>/g, "").slice(0, 200));
    console.log("");
    return { id: "dev-mock" };
  }

  try {
    // Dynamic import so the module tree-shakes correctly if resend isn't installed
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from:     FROM_ADDRESS,
      to:       options.to,
      subject:  options.subject,
      html:     options.html,
      text:     options.text,
      replyTo: options.replyTo,
    });

    if (error) {
      console.error("[Email] Resend error:", error);
      return { error: error.message };
    }

    return { id: data?.id };
  } catch (err) {
    // resend package not installed — log and continue
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("Cannot find module 'resend'")) {
      console.warn("[Email] Resend package not installed. Run: npm install resend");
    } else {
      console.error("[Email] Failed to send:", msg);
    }
    return { error: msg };
  }
}

// ── Email templates ───────────────────────────────────────────────────────

/**
 * sendWelcomeGuardianEmail — sent when a guardian is invited to SchoolCo.
 *
 * This branded email supplements the Supabase system invite email.
 * It explains what SchoolCo is and gives the guardian their login link.
 */
export async function sendWelcomeGuardianEmail(opts: WelcomeGuardianEmailOptions) {
  const { to, guardianName, studentName, orgName, loginUrl } = opts;
  const firstName = guardianName.split(" ")[0];

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ${orgName} — ${APP_NAME}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #F8F7F4; color: #1a1a1a; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: #0B1747; padding: 36px 40px; text-align: center; }
    .logo-text { font-family: Georgia, 'Times New Roman', serif; font-size: 24px; font-weight: bold; color: #ffffff; letter-spacing: -0.5px; }
    .tagline { color: rgba(255,255,255,0.6); font-size: 13px; margin-top: 4px; }
    .body { padding: 40px; }
    .greeting { font-family: Georgia, serif; font-size: 28px; color: #0B1747; font-weight: bold; margin-bottom: 8px; }
    .intro { font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 24px; }
    .highlight-box { background: #F0FAF9; border-left: 4px solid #046264; border-radius: 8px; padding: 16px 20px; margin-bottom: 28px; }
    .highlight-box p { margin: 0; font-size: 15px; color: #046264; font-weight: 500; }
    .cta-button { display: inline-block; background: #046264; color: #ffffff; font-size: 16px; font-weight: 600; padding: 14px 32px; border-radius: 10px; text-decoration: none; margin-bottom: 28px; }
    .body-text { font-size: 15px; color: #555; line-height: 1.7; margin-bottom: 20px; }
    .footer { background: #F8F7F4; padding: 28px 40px; text-align: center; font-size: 13px; color: #999; }
    .footer a { color: #046264; text-decoration: none; }
    .divider { height: 1px; background: #E8E6E1; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo-text">SchoolCo.</div>
      <div class="tagline">Every Child Known. Every Family Connected. Every Leader Developed.</div>
    </div>
    <div class="body">
      <div class="greeting">Welcome, ${firstName}!</div>
      <p class="intro">
        You've been added as a guardian to <strong>${orgName}</strong>'s family portal —
        the place where you'll stay connected to ${studentName}'s journey.
      </p>
      <div class="highlight-box">
        <p>📚 ${studentName}'s progress, milestones, and announcements from ${orgName} will be right here for you.</p>
      </div>
      <p class="body-text">
        Check your email for a separate message from SchoolCo to set up your password.
        Once you've done that, click the button below to log in for the first time.
      </p>
      <a href="${loginUrl}" class="cta-button">Log In to Your Portal</a>
      <div class="divider"></div>
      <p class="body-text">
        If you have any questions, reach out to the team at ${orgName} directly —
        they'll be happy to help you get settled in.
      </p>
      <p class="body-text">
        <em>We're glad you're here. Together, we're raising leaders.</em>
      </p>
    </div>
    <div class="footer">
      <p>You received this email because you were added as a guardian at <strong>${orgName}</strong>.</p>
      <p style="margin-top: 8px;">Powered by <a href="https://schoolco.app">SchoolCo</a></p>
    </div>
  </div>
</body>
</html>
`;

  const text = `
Welcome to ${orgName}, ${firstName}!

You've been added as a guardian for ${studentName} on SchoolCo — the family portal where you'll stay connected to their journey.

Log in here: ${loginUrl}

You should also receive a separate email to set your password.

If you have questions, contact ${orgName} directly.

Together, we're raising leaders.

— The SchoolCo Team
`.trim();

  return sendEmail({
    to,
    subject:  `Welcome to ${orgName} — You've been added to ${studentName}'s portal`,
    html,
    text,
  });
}
