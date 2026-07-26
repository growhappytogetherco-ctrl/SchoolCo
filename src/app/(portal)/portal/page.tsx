import { redirect } from "next/navigation";

// /portal → /portal/children
export default function PortalRootPage() {
  redirect("/portal/children");
}
