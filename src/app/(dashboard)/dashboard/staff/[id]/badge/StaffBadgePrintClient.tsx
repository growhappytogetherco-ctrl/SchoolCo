"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Download, RefreshCw, QrCode, AlertTriangle, CheckCircle } from "lucide-react";
import { generateStaffQrDataUrl, generatePrintQrDataUrl, staffAttendanceQrUrl } from "@/lib/qr";
import { regenerateStaffQrToken } from "@/app/actions/staffAttendance";
import { cn } from "@/lib/utils";

interface StaffMember {
  id:                  string;
  first_name:          string;
  last_name:           string;
  display_title:       string | null;
  avatar_url:          string | null;
  status:              string;
  attendance_qr_token: string | null;
}

interface Props {
  member:       StaffMember;
  isFullAdmin:  boolean;
}

export function StaffBadgePrintClient({ member, isFullAdmin }: Props) {
  const [token, setToken]         = useState(member.attendance_qr_token);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [regenState, setRegen]    = useState<"idle" | "loading" | "done" | "error">("idle");
  const [regenMsg, setRegenMsg]   = useState<string | null>(null);

  const fullName = `${member.first_name} ${member.last_name}`;

  // Generate preview QR whenever token changes
  useEffect(() => {
    if (!token) { setQrDataUrl(null); return; }
    generateStaffQrDataUrl(token, { size: 280 }).then(setQrDataUrl);
  }, [token]);

  async function handleDownload() {
    if (!token) return;
    const url = staffAttendanceQrUrl(token);
    const dataUrl = await generatePrintQrDataUrl(url);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `staff-badge-${member.first_name.toLowerCase()}-${member.last_name.toLowerCase()}.png`;
    a.click();
  }

  async function handleRegenerate() {
    if (!isFullAdmin) return;
    setRegen("loading");
    setRegenMsg(null);
    const result = await regenerateStaffQrToken(member.id);
    if (result.success) {
      setToken(result.token);
      setRegen("done");
      setRegenMsg("New QR token issued. Old badge is now invalid.");
    } else {
      setRegen("error");
      setRegenMsg(result.error);
    }
    setTimeout(() => setRegen("idle"), 4000);
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      {/* Back link */}
      <Link
        href={`/dashboard/staff/${member.id}`}
        className="inline-flex items-center gap-1.5 text-label-sm text-sc-gray hover:text-sc-navy transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to {fullName}
      </Link>

      <div>
        <h1 className="font-serif text-heading-1 text-sc-navy">Staff ID Badge QR</h1>
        <p className="text-body-md text-sc-gray mt-1">
          Staff Attendance QR for {fullName}
          {member.display_title && ` · ${member.display_title}`}
        </p>
      </div>

      {member.status !== "active" && (
        <div className="flex items-center gap-3 rounded-xl border border-sc-gold-300 bg-sc-gold-50 px-4 py-3 text-label-md text-sc-gold-800">
          <AlertTriangle className="size-5 shrink-0" />
          This staff member is <strong>{member.status}</strong>. Their QR badge is not valid for check-in.
        </div>
      )}

      {/* QR Card */}
      <div className="rounded-2xl border border-sc-gray-100 bg-white shadow-card p-8 flex flex-col items-center gap-6">

        {/* QR preview */}
        <div className="flex flex-col items-center gap-3">
          <p className="text-label-sm font-semibold text-sc-navy uppercase tracking-wider">
            Staff Attendance QR
          </p>
          {qrDataUrl ? (
            <div className="rounded-xl border-2 border-sc-gray-100 p-3 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt={`Staff attendance QR for ${fullName}`}
                className="w-64 h-64"
              />
            </div>
          ) : (
            <div className="w-64 h-64 rounded-xl border-2 border-dashed border-sc-gray-200 flex items-center justify-center">
              <QrCode className="size-16 text-sc-gray-300" />
            </div>
          )}
          <p className="text-label-sm text-sc-gray-400 text-center max-w-xs">
            Scan with any phone camera to record staff attendance.<br />
            Token: <code className="font-mono text-sc-navy">{token?.slice(0, 8)}…</code>
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
          <button
            onClick={handleDownload}
            disabled={!token}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-sc-teal px-5 py-2.5 text-white text-label-md font-semibold hover:bg-sc-teal-700 transition-colors disabled:opacity-50"
          >
            <Download className="size-4" />
            Download PNG
          </button>

          {isFullAdmin && (
            <button
              onClick={handleRegenerate}
              disabled={regenState === "loading"}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-xl border-2 px-5 py-2.5 text-label-md font-semibold transition-colors",
                regenState === "done"
                  ? "border-sc-teal bg-sc-teal-50 text-sc-teal"
                  : regenState === "error"
                  ? "border-sc-rose bg-sc-rose-50 text-sc-rose"
                  : "border-sc-gray-200 text-sc-gray hover:border-sc-rose hover:text-sc-rose"
              )}
            >
              {regenState === "loading" ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : regenState === "done" ? (
                <CheckCircle className="size-4" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {regenState === "loading" ? "Regenerating…" : regenState === "done" ? "Regenerated" : "Regenerate QR"}
            </button>
          )}
        </div>

        {regenMsg && (
          <p className={cn(
            "text-label-sm text-center",
            regenState === "done" ? "text-sc-teal" : "text-sc-rose"
          )}>
            {regenMsg}
          </p>
        )}
      </div>

      {/* Instructions */}
      <div className="rounded-xl border border-sc-gray-100 bg-sc-gray-50 p-5 space-y-2">
        <p className="text-label-sm font-semibold text-sc-navy">How to use</p>
        <ul className="space-y-1 text-label-sm text-sc-gray list-disc list-inside">
          <li>Download the QR PNG and place it on the staff ID badge in Canva.</li>
          <li>When scanned, it records staff check-in or prompts for check-out.</li>
          <li>Only active staff members can check in.</li>
          {isFullAdmin && <li>Regenerate if a badge is lost — the old QR is immediately invalidated.</li>}
        </ul>
      </div>
    </div>
  );
}
