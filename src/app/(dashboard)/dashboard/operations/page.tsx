import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/supabase/org-context";
import { requireRole } from "@/lib/roleGuard";
import { getOperationsDashboard } from "@/app/actions/operations";
import { OperationsDashboard } from "@/components/operations/OperationsDashboard";

export const metadata: Metadata = { title: "Daily Operations" };

// Revalidate every 5 minutes if the page is pre-rendered
export const revalidate = 300;

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  // Server-side auth + role guard: teacher and above only
  await requireRole("teacher");

  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const { date } = await searchParams;

  const data = await getOperationsDashboard(date);

  if ("error" in data) {
    // Role mismatch (shouldn't happen after requireRole) — redirect gracefully
    redirect("/dashboard/home");
  }

  return <OperationsDashboard initialData={data} />;
}
