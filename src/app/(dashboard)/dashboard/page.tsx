import { redirect } from "next/navigation";

// /dashboard → /dashboard/home
export default function DashboardRootPage() {
  redirect("/dashboard/home");
}
