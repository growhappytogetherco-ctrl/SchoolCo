"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, LogOut, X, Clock, ScanLine, Users } from "lucide-react";
import { checkInStaffMember, checkOutStaffMember } from "@/app/actions/staffAttendance";
import { cn } from "@/lib/utils";
import { formatAttendanceTime } from "@/lib/format-attendance-time";

// Rapid re-scan within this window → block checkout, show "already checked in"
const DUPLICATE_WINDOW_MS = 120_000; // 2 minutes

// ── Types ─────────────────────────────────────────────────────────────────

type Phase =
  | { name: "loading" }
  | { name: "error"; message: string; inactive?: boolean }
  | { name: "duplicate_block"; displayName: string; checkInAt: string }
  | { name: "checkout_confirm"; staffId: string; displayName: string; checkInAt: string }
  | { name: "checkout_loading" }
  | { name: "result"; action: "checkin" | "checkout" | "already_out"; displayName: string; displayTitle: string | null; timestamp: string };

// ── Component ─────────────────────────────────────────────────────────────

export function StaffScanClient({ token }: { token: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });

  useEffect(() => {
    // Client-side token purpose check — must be STF-
    if (!token.startsWith("STF-")) {
      setPhase({
        name: "error",
        message: "This is not a valid staff attendance badge. Use the correct badge for this school.",
      });
      return;
    }

    async function run() {
      try {
        const res = await fetch(`/api/staff/qr/${encodeURIComponent(token)}`);

        if (res.status === 401) {
          setPhase({ name: "error", message: "Session expired. Please sign in again." });
          setTimeout(() => router.push(`/login?next=/staff/scan/${token}`), 1500);
          return;
        }

        if (res.status === 403) {
          const body = await res.json().catch(() => ({}));
          if ((body as { inactive?: boolean }).inactive) {
            setPhase({ name: "error", message: "Staff member is not currently active.", inactive: true });
          } else {
            setPhase({ name: "error", message: body.error ?? "Access denied." });
          }
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

        const { staff, today_record } = await res.json();

        const displayName = `${staff.first_name} ${staff.last_name}`;

        // Already fully checked out today
        if (today_record?.check_out_at) {
          setPhase({
            name: "result",
            action: "already_out",
            displayName,
            displayTitle: staff.display_title,
            timestamp: today_record.check_out_at,
          });
          return;
        }

        // Already checked in today
        if (today_record?.check_in_at) {
          const elapsedMs = Date.now() - new Date(today_record.check_in_at).getTime();

          if (elapsedMs < DUPLICATE_WINDOW_MS) {
            // Rapid rescan — show "already checked in", no checkout
            setPhase({
              name: "duplicate_block",
              displayName,
              checkInAt: today_record.check_in_at,
            });
          } else {
            // Past duplicate window — prompt for checkout
            setPhase({
              name: "checkout_confirm",
              staffId: staff.id,
              displayName,
              checkInAt: today_record.check_in_at,
            });
          }
          return;
        }

        // No attendance today — check in
        const result = await checkInStaffMember(staff.id, "qr");
        if (!result.success) {
          if (result.alreadyCheckedIn) {
            setPhase({
              name: "duplicate_block",
              displayName,
              checkInAt: new Date().toISOString(),
            });
          } else {
            setPhase({ name: "error", message: result.error ?? "Check-in failed." });
          }
          return;
        }

        setPhase({
          name: "result",
          action: "checkin",
          displayName,
          displayTitle: staff.display_title,
          timestamp: new Date().toISOString(),
        });
      } catch {
        setPhase({ name: "error", message: "Network error. Check your connection." });
      }
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-redirect after check-in (not after checkout confirm or already_out)
  useEffect(() => {
    if (phase.name !== "result") return;
    if (phase.action === "checkout" || phase.action === "already_out") return;
    const t = setTimeout(() => router.push("/dashboard/operations"), 2500);
    return () => clearTimeout(t);
  }, [phase, router]);

  // ── Checkout handler ─────────────────────────────────────────────────────

  async function handleConfirmCheckout() {
    if (phase.name !== "checkout_confirm") return;
    const { staffId, displayName } = phase;
    setPhase({ name: "checkout_loading" });

    const result = await checkOutStaffMember(staffId, "qr");
    if (!result.success) {
      setPhase({ name: "error", message: result.error ?? "Check-out failed." });
      return;
    }

    setPhase({
      name: "result",
      action: "checkout",
      displayName,
      displayTitle: null,
      timestamp: new Date().toISOString(),
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-sc-cream p-4 pt-8 max-w-sm mx-auto">

      {/* SchoolCo wordmark */}
      <div className="flex items-center gap-2 mb-6 self-start">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sc-teal">
          <Users className="size-4 text-white" aria-hidden="true" />
        </div>
        <span className="font-serif text-heading-3 text-sc-navy">SchoolCo</span>
      </div>

      {/* ── Loading ───────────────────────────────────────────── */}
      {phase.name === "loading" && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-14 w-14 rounded-full border-4 border-sc-teal border-t-transparent animate-spin" />
          <p className="text-body-lg text-sc-gray font-medium">Processing badge…</p>
        </div>
      )}

      {/* ── Duplicate-scan block ──────────────────────────────── */}
      {phase.name === "duplicate_block" && (
        <div className="w-full space-y-4">
          <div className="rounded-2xl border-2 border-sc-gold-300 bg-white p-6 text-center space-y-3">
            <ScanLine className="size-10 text-sc-gold-600 mx-auto" />
            <p className="font-serif text-heading-2 text-sc-navy">{phase.displayName}</p>
            <p className="text-label-md font-semibold text-sc-gold-700 uppercase tracking-wide">
              Already Checked In
            </p>
            <p className="text-body-md text-sc-gray">
              {formatAttendanceTime(phase.checkInAt)}
            </p>
            <p className="text-label-sm text-sc-gray-400 mt-1">No attendance change.</p>
          </div>
          <button
            onClick={() => router.push("/dashboard/operations")}
            className="w-full rounded-xl bg-sc-navy py-3.5 text-white text-label-md font-semibold"
          >
            Done
          </button>
        </div>
      )}

      {/* ── Checkout confirmation ─────────────────────────────── */}
      {phase.name === "checkout_confirm" && (
        <div className="w-full space-y-4">
          <div className="rounded-2xl border-2 border-sc-navy/20 bg-white p-6 text-center space-y-3">
            <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-sc-navy/10">
              <LogOut className="size-10 text-sc-navy" />
            </div>
            <p className="font-serif text-display-1 text-sc-navy leading-tight">
              {phase.displayName}
            </p>
            <p className="text-body-md text-sc-gray">
              Currently checked in at{" "}
              <span className="font-semibold text-sc-navy">{formatAttendanceTime(phase.checkInAt)}</span>
            </p>
          </div>

          <button
            onClick={handleConfirmCheckout}
            className="w-full rounded-xl bg-sc-navy py-4 text-white text-label-md font-bold text-lg tracking-wide"
          >
            CHECK OUT
          </button>

          <button
            onClick={() => router.push("/dashboard/operations")}
            className="w-full rounded-xl border-2 border-sc-gray-200 bg-white py-3.5 text-sc-gray text-label-md font-semibold"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Checkout loading ──────────────────────────────────── */}
      {phase.name === "checkout_loading" && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="h-14 w-14 rounded-full border-4 border-sc-navy border-t-transparent animate-spin" />
          <p className="text-body-lg text-sc-gray font-medium">Checking out…</p>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────── */}
      {phase.name === "error" && (
        <div className="w-full space-y-4">
          <div className={cn(
            "rounded-2xl border-2 bg-white p-6 text-center space-y-3",
            phase.inactive ? "border-sc-gold-300" : "border-sc-rose-200"
          )}>
            <X className={cn("size-10 mx-auto", phase.inactive ? "text-sc-gold-600" : "text-sc-rose")} />
            <p className="font-serif text-heading-2 text-sc-navy">
              {phase.inactive ? "Not Active" : "Something went wrong"}
            </p>
            <p className="text-body-md text-sc-gray">{phase.message}</p>
          </div>
          <button
            onClick={() => router.push("/dashboard/operations")}
            className="w-full rounded-xl bg-sc-navy py-3.5 text-white text-label-md font-semibold"
          >
            Go to Operations
          </button>
        </div>
      )}

      {/* ── Result screen ─────────────────────────────────────── */}
      {phase.name === "result" && (
        <StaffResultScreen
          action={phase.action}
          displayName={phase.displayName}
          displayTitle={phase.displayTitle}
          timestamp={phase.timestamp}
          onContinue={() => router.push("/dashboard/operations")}
        />
      )}
    </div>
  );
}

// ── Result Screen ──────────────────────────────────────────────────────────

function StaffResultScreen({
  action,
  displayName,
  displayTitle,
  timestamp,
  onContinue,
}: {
  action: "checkin" | "checkout" | "already_out";
  displayName: string;
  displayTitle: string | null;
  timestamp: string;
  onContinue: () => void;
}) {
  const time = formatAttendanceTime(timestamp);

  const config = {
    checkin:     { avatarBg: "bg-sc-teal",     cardBg: "bg-sc-teal-50  border-sc-teal/30",  badgeBg: "bg-sc-teal text-white",       label: "STAFF CHECKED IN",  Icon: CheckCircle },
    checkout:    { avatarBg: "bg-sc-navy",     cardBg: "bg-sc-navy-50  border-sc-navy/20",  badgeBg: "bg-sc-navy text-white",       label: "STAFF CHECKED OUT", Icon: LogOut      },
    already_out: { avatarBg: "bg-sc-gray-400", cardBg: "bg-white       border-sc-gray-200", badgeBg: "bg-sc-gray-200 text-sc-gray", label: "ALREADY CHECKED OUT", Icon: X         },
  }[action];

  const initials = displayName.split(" ").map((n) => n[0] ?? "").join("").slice(0, 2).toUpperCase();

  return (
    <div className="w-full space-y-4">
      <div className={cn("rounded-2xl border-2 p-6 flex flex-col items-center gap-4 text-center", config.cardBg)}>
        <div className={cn(
          "flex h-24 w-24 items-center justify-center rounded-full text-white text-3xl font-serif font-bold shadow-md",
          config.avatarBg
        )}>
          {initials}
        </div>
        <div>
          <p className="font-serif text-display-1 text-sc-navy leading-tight">{displayName}</p>
          {displayTitle && (
            <p className="text-body-md text-sc-gray mt-0.5">{displayTitle}</p>
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className={cn(
            "flex items-center gap-2 rounded-full px-5 py-2.5 text-label-md font-bold tracking-widest uppercase",
            config.badgeBg
          )}>
            <config.Icon className="size-5" />
            {config.label}
          </div>
          <p className="text-body-lg font-semibold text-sc-gray">{time}</p>
        </div>
        {action === "already_out" && (
          <p className="text-label-sm text-sc-gray-400">No action taken.</p>
        )}
      </div>

      {action === "checkin" && (
        <p className="text-center text-label-sm text-sc-gray-400">
          Returning to Operations automatically…
        </p>
      )}

      <button
        onClick={onContinue}
        className="w-full rounded-xl bg-sc-navy py-3.5 text-white text-label-md font-semibold"
      >
        Done
      </button>
    </div>
  );
}
