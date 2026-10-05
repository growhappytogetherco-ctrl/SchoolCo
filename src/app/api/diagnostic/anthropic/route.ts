import { NextResponse } from "next/server";

/**
 * Public-safe Anthropic configuration diagnostic.
 * Returns ONLY "available" or "unavailable" — never the key value, length, or prefix.
 * No other environment variables are exposed.
 *
 * GET /api/diagnostic/anthropic
 */
export const dynamic = "force-dynamic";

export async function GET() {
  // Read at request time — dynamic prevents any build-time caching
  const configured = !!process.env["ANTHROPIC_API_KEY"];

  return NextResponse.json(
    { anthropic: configured ? "available" : "unavailable" },
    {
      headers: {
        // Prevent caching — result must reflect runtime environment
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
