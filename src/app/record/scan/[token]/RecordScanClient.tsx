"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string }
  | { name: "redirecting"; displayName: string };

export function RecordScanClient({ token }: { token: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });

  useEffect(() => {
    if (!token.startsWith("PRF-")) {
      if (token.startsWith("ATT-")) {
        setPhase({
          name: "error",
          message: "This is an attendance QR code. Use the front of the badge for check-in.",
        });
      } else {
        setPhase({ name: "error", message: "This QR code is not a valid student record badge." });
      }
      return;
    }

    async function resolve() {
      try {
        const res = await fetch(`/api/record/qr/${encodeURIComponent(token)}`);

        if (res.status === 401) {
          router.push(`/login?next=/record/scan/${token}`);
          return;
        }
        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          setPhase({ name: "error", message: body.error ?? "Access denied." });
          return;
        }
        if (res.status === 404) {
          setPhase({ name: "error", message: "Badge not recognised for this school." });
          return;
        }
        if (!res.ok) {
          setPhase({ name: "error", message: "Could not reach the server. Try again." });
          return;
        }

        const { studentId, firstName, lastName, preferredName } = await res.json();
        const displayName = preferredName
          ? `${preferredName} ${lastName}`
          : `${firstName} ${lastName}`;

        setPhase({ name: "redirecting", displayName });
        router.push(`/dashboard/students/${studentId}?via=record_qr`);
      } catch {
        setPhase({ name: "error", message: "Network error. Check your connection." });
      }
    }

    resolve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-sc-cream p-4 pt-8 max-w-sm mx-auto">

      {/* SchoolCo wordmark */}
      <div className="flex items-center gap-2 mb-6 self-start">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sc-teal">
          <svg viewBox="0 0 24 24" fill="none" className="size-4 text-white" aria-hidden="true">
            <path d="M12 21C12 21 1 14.5 1 8.5C1 5.42 3.42 3 6.5 3C8.24 3 9.91 3.81 11 5.08C12.09 3.81 13.76 3 15.5 3C18.58 3 21 5.42 21 8.5C21 14.5 12 21 12 21Z"
              fill="currentColor" />
          </svg>
        </div>
        <span className="font-serif text-heading-3 text-sc-navy">SchoolCo</span>
      </div>

      {phase.name === "loading" && (
        <div className="flex flex-col items-center gap-4 py-16">
          <Loader2 className="h-14 w-14 text-sc-teal animate-spin" />
          <p className="text-body-lg text-sc-gray font-medium">Looking up student…</p>
        </div>
      )}

      {phase.name === "redirecting" && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Loader2 className="h-10 w-10 text-sc-teal animate-spin" />
          <p className="font-serif text-heading-2 text-sc-navy">{phase.displayName}</p>
          <p className="text-body-md text-sc-gray">Opening student profile…</p>
        </div>
      )}

      {phase.name === "error" && (
        <div className="w-full space-y-4">
          <div className="rounded-2xl border-2 border-sc-rose-200 bg-white p-6 text-center space-y-3">
            <X className="size-10 text-sc-rose mx-auto" />
            <p className="font-serif text-heading-2 text-sc-navy">Something went wrong</p>
            <p className="text-body-md text-sc-gray">{phase.message}</p>
          </div>
          <button
            onClick={() => router.push("/dashboard/home")}
            className="w-full rounded-xl bg-sc-navy py-3.5 text-white text-label-md font-semibold"
          >
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
