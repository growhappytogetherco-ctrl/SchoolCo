import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";

/**
 * Root page: redirect authenticated users to the dashboard,
 * unauthenticated users to the login page.
 */
export default async function RootPage() {
  const user = await getUser();
  if (user) {
    redirect("/select-mission");
  }
  redirect("/login");
}
