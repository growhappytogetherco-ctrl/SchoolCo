import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser, getActiveOrgId } from "@/lib/supabase/server";
import { getTranscriptData } from "@/app/actions/transcript";
import { TranscriptDocument } from "@/components/transcript/TranscriptDocument";

export const metadata: Metadata = { title: "Current Academic Transcript" };
export const dynamic = "force-dynamic";

export default async function TranscriptPage({
  params,
}: {
  params: { studentId: string };
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const orgId = await getActiveOrgId();
  if (!orgId) redirect("/select-mission");

  const result = await getTranscriptData(params.studentId);

  if (!result.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold text-gray-800">Transcript Unavailable</p>
          <p className="text-sm text-gray-500">{result.error}</p>
        </div>
      </div>
    );
  }

  return <TranscriptDocument data={result.data} />;
}
