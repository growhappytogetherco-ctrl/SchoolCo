"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { generateQrDataUrl } from "@/lib/qr";

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
}

export function BadgePrintClient({ student, orgName, badgeBg, badgeText }: Props) {
  const [attQrDataUrl, setAttQrDataUrl] = useState<string | null>(null);
  const [profileQrDataUrl, setProfileQrDataUrl] = useState<string | null>(null);

  const bg   = badgeBg   ?? "#0B1747"; // sc-navy
  const text = badgeText ?? "#FFFFFF";

  useEffect(() => {
    async function gen() {
      if (student.attendance_qr_token) {
        const url = await generateQrDataUrl(student.attendance_qr_token, {
          size: 200,
          darkColor: bg,
          lightColor: "#FFFFFF",
        });
        setAttQrDataUrl(url);
      }
      if (student.profile_qr_token) {
        // Profile QR encodes the staff profile URL (not attendance)
        const profileUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://schoolco.vercel.app"}/dashboard/students/${student.id}`;
        const { default: QRCode } = await import("qrcode");
        const svg = await QRCode.toDataURL(profileUrl, {
          width: 200, margin: 2,
          color: { dark: bg, light: "#FFFFFF" },
          errorCorrectionLevel: "M",
        });
        setProfileQrDataUrl(svg);
      }
    }
    gen();
  }, [student, bg]);

  const displayName = student.preferred_name
    ? `${student.preferred_name} ${student.last_name}`
    : `${student.first_name} ${student.last_name}`;

  return (
    <div>
      {/* Controls — hidden when printing */}
      <div className="print:hidden flex items-center gap-4 p-4 border-b border-sc-gray-100 bg-white">
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

        {/* Back — Profile QR (for staff) */}
        <div
          className="w-[3.375in] h-[2.125in] rounded-xl overflow-hidden flex flex-col items-center justify-center gap-2 shadow-modal print:shadow-none print:rounded-none"
          style={{ backgroundColor: bg }}
        >
          {profileQrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profileQrDataUrl} alt="Profile QR" className="h-24 w-24 rounded-lg" />
          )}
          <p className="text-xs font-semibold" style={{ color: text, opacity: 0.7 }}>
            Staff Profile QR
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
