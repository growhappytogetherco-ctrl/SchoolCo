"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, Download, RefreshCw, Printer, AlertCircle, CheckCircle } from "lucide-react";
import Link from "next/link";
import { generateQrDataUrl, generateProfileQrDataUrl, generatePrintQrDataUrl, attendanceQrUrl, profileQrUrl } from "@/lib/qr";
import { regenerateAttendanceQrToken, regenerateProfileQrToken } from "@/app/actions/badge";

interface Student {
  id: string;
  student_display_id: string | null;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  grade_level: string | null;
  attendance_qr_token: string | null;
  profile_qr_token: string | null;
  avatar_url: string | null;
}

interface Props {
  student: Student;
  orgName: string;
  badgeBg: string | null;
  badgeText: string | null;
  isFullAdmin: boolean;
}

export function BadgePrintClient({ student, orgName, badgeBg, badgeText, isFullAdmin }: Props) {
  const [attToken,  setAttToken]  = useState(student.attendance_qr_token);
  const [prfToken,  setPrfToken]  = useState(student.profile_qr_token);
  const [attQrDataUrl, setAttQrDataUrl] = useState<string | null>(null);
  const [prfQrDataUrl, setPrfQrDataUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const [attPending, startAttTransition] = useTransition();
  const [prfPending, startPrfTransition] = useTransition();

  const bg   = badgeBg   ?? "#0B1747";
  const text = badgeText ?? "#FFFFFF";

  const displayName = student.preferred_name
    ? `${student.preferred_name} ${student.last_name}`
    : `${student.first_name} ${student.last_name}`;

  // Generate preview QRs whenever tokens change
  useEffect(() => {
    async function gen() {
      if (attToken) {
        const url = await generateQrDataUrl(attToken, { size: 200, darkColor: bg });
        setAttQrDataUrl(url);
      } else {
        setAttQrDataUrl(null);
      }
      if (prfToken) {
        const url = await generateProfileQrDataUrl(prfToken, { size: 200, darkColor: bg });
        setPrfQrDataUrl(url);
      } else {
        setPrfQrDataUrl(null);
      }
    }
    gen();
  }, [attToken, prfToken, bg]);

  function showFeedback(type: "ok" | "err", msg: string) {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  }

  async function downloadQr(kind: "attendance" | "record") {
    const token = kind === "attendance" ? attToken : prfToken;
    if (!token) return;
    const url   = kind === "attendance" ? attendanceQrUrl(token) : profileQrUrl(token);
    const label = kind === "attendance" ? "attendance" : "record";
    const dataUrl = await generatePrintQrDataUrl(url, { darkColor: "#000000" });
    const a = document.createElement("a");
    a.href     = dataUrl;
    a.download = `${displayName.replace(/\s+/g, "-")}-${label}-qr.png`;
    a.click();
  }

  function handleRegenerateAtt() {
    startAttTransition(async () => {
      const res = await regenerateAttendanceQrToken(student.id);
      if (res.success && res.data) {
        setAttToken(res.data);
        showFeedback("ok", "Attendance QR regenerated. Old code is now invalid.");
      } else {
        showFeedback("err", ("error" in res ? res.error : null) ?? "Failed to regenerate.");
      }
    });
  }

  function handleRegeneratePrf() {
    startPrfTransition(async () => {
      const res = await regenerateProfileQrToken(student.id);
      if (res.success && res.data) {
        setPrfToken(res.data);
        showFeedback("ok", "Record QR regenerated. Old code is now invalid.");
      } else {
        showFeedback("err", ("error" in res ? res.error : null) ?? "Failed to regenerate.");
      }
    });
  }

  return (
    <div>
      {/* Controls */}
      <div className="print:hidden flex flex-wrap items-center gap-4 p-4 border-b border-sc-gray-100 bg-white">
        <Link href={`/dashboard/students/${student.id}`}
          className="flex items-center gap-2 text-label-sm text-sc-gray hover:text-sc-navy">
          <ArrowLeft className="size-4" /> Back to Profile
        </Link>
        <button
          onClick={() => window.print()}
          className="ml-auto flex items-center gap-2 rounded-lg bg-sc-teal px-4 py-2 text-white text-label-md font-medium"
        >
          <Printer className="size-4" /> Print Badge
        </button>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className={`print:hidden flex items-center gap-3 px-4 py-3 ${
          feedback.type === "ok"
            ? "bg-sc-teal-50 border-b border-sc-teal-200 text-sc-teal-700"
            : "bg-sc-rose-50 border-b border-sc-rose-200 text-sc-rose-700"
        }`}>
          {feedback.type === "ok"
            ? <CheckCircle className="size-4 shrink-0" />
            : <AlertCircle className="size-4 shrink-0" />}
          <p className="text-label-sm font-medium">{feedback.msg}</p>
        </div>
      )}

      {/* ── QR Management Panel (Full Admin only) ──────────────────── */}
      {isFullAdmin && (
        <div className="print:hidden p-4 sm:p-6 bg-sc-gray-50 border-b border-sc-gray-100">
          <h2 className="text-label-md font-semibold text-sc-navy mb-4">Badge QR Codes — {displayName}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Front — Attendance QR */}
            <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-label-md font-semibold text-sc-navy">FRONT — Attendance QR</p>
                  <p className="text-label-sm text-sc-gray-400 mt-0.5">Scan to check in / check out</p>
                </div>
                {attQrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attQrDataUrl} alt="Attendance QR preview" className="h-16 w-16 rounded-lg shrink-0" />
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadQr("attendance")}
                  disabled={!attToken}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-sc-teal bg-sc-teal-50 px-3 py-2 text-label-sm font-medium text-sc-teal-700 hover:bg-sc-teal-100 disabled:opacity-40 transition-colors"
                >
                  <Download className="size-3.5" /> Download PNG
                </button>
                <button
                  onClick={handleRegenerateAtt}
                  disabled={attPending}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm font-medium text-sc-gray hover:border-sc-rose hover:text-sc-rose disabled:opacity-40 transition-colors"
                >
                  <RefreshCw className={`size-3.5 ${attPending ? "animate-spin" : ""}`} />
                  {attPending ? "…" : "Regenerate"}
                </button>
              </div>
            </div>

            {/* Back — Student Record QR */}
            <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-label-md font-semibold text-sc-navy">BACK — Student Record QR</p>
                  <p className="text-label-sm text-sc-gray-400 mt-0.5">Scan to open student profile</p>
                </div>
                {prfQrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={prfQrDataUrl} alt="Record QR preview" className="h-16 w-16 rounded-lg shrink-0" />
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadQr("record")}
                  disabled={!prfToken}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-sc-teal bg-sc-teal-50 px-3 py-2 text-label-sm font-medium text-sc-teal-700 hover:bg-sc-teal-100 disabled:opacity-40 transition-colors"
                >
                  <Download className="size-3.5" /> Download PNG
                </button>
                <button
                  onClick={handleRegeneratePrf}
                  disabled={prfPending}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-sc-gray-200 px-3 py-2 text-label-sm font-medium text-sc-gray hover:border-sc-rose hover:text-sc-rose disabled:opacity-40 transition-colors"
                >
                  <RefreshCw className={`size-3.5 ${prfPending ? "animate-spin" : ""}`} />
                  {prfPending ? "…" : "Regenerate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Badge preview */}
      <div className="print:p-0 p-8 bg-sc-gray-50 min-h-screen print:min-h-0 flex flex-wrap gap-6 justify-center items-start">

        {/* Front — Attendance QR */}
        <div
          className="w-[3.375in] h-[2.125in] rounded-xl overflow-hidden flex flex-col shadow-modal print:shadow-none print:rounded-none"
          style={{ backgroundColor: bg, color: text }}
        >
          <div className="flex-1 flex items-center gap-3 px-4 pt-4">
            {student.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={student.avatar_url} alt={displayName}
                className="h-16 w-16 rounded-xl object-cover shrink-0 border-2 border-white/20" />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/10 border-2 border-white/20 text-2xl font-bold" style={{ color: text }}>
                {student.first_name[0]}{student.last_name[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-serif text-lg font-bold leading-tight" style={{ color: text }}>{displayName}</p>
              {student.grade_level && (
                <p className="text-xs mt-0.5 opacity-80" style={{ color: text }}>{student.grade_level}</p>
              )}
              <p className="text-xs font-mono mt-1 opacity-60" style={{ color: text }}>
                {student.student_display_id}
              </p>
            </div>
            {attQrDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={attQrDataUrl} alt="Attendance QR" className="h-16 w-16 shrink-0 rounded-lg" />
            )}
          </div>
          <div className="px-4 pb-3 flex items-center justify-between">
            <p className="text-xs font-semibold opacity-70" style={{ color: text }}>{orgName}</p>
            <p className="text-xs opacity-50" style={{ color: text }}>Scan to check in/out</p>
          </div>
        </div>

        {/* Back — Profile QR */}
        <div
          className="w-[3.375in] h-[2.125in] rounded-xl overflow-hidden flex flex-col items-center justify-center gap-2 shadow-modal print:shadow-none print:rounded-none"
          style={{ backgroundColor: bg }}
        >
          {prfQrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={prfQrDataUrl} alt="Student Record QR" className="h-24 w-24 rounded-lg" />
          )}
          <p className="text-xs font-semibold" style={{ color: text, opacity: 0.7 }}>
            Student Record QR
          </p>
          <p className="text-xs" style={{ color: text, opacity: 0.5 }}>
            {orgName} — {student.student_display_id}
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: 3.375in 2.125in; margin: 0; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}
