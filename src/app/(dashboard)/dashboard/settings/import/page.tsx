import { redirect } from "next/navigation";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { listImportJobs } from "@/app/actions/importData";
import { ImportCenter } from "@/components/import/ImportCenter";

export default async function ImportPage() {
  const user  = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const jobs = await listImportJobs();

  return <ImportCenter previousJobs={jobs} />;
}
