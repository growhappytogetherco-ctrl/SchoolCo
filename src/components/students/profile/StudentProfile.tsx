"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, HeartPulse, CalendarCheck, StickyNote,
  AlertOctagon, FolderOpen, Award, Briefcase, Users,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudentProfileData, TabId } from "./types";
import { StudentProfileHeader } from "./StudentProfileHeader";
import { StudentQuickActions } from "./StudentQuickActions";
import { OverviewTab }        from "./tabs/OverviewTab";
import { MedicalTab }         from "./tabs/MedicalTab";
import { AttendanceTab }      from "./tabs/AttendanceTab";
import { StaffNotesTab }      from "./tabs/StaffNotesTab";
import { IncidentsTab }       from "./tabs/IncidentsTab";
import { DocumentsTab }       from "./tabs/DocumentsTab";
import { LeadershipTab }      from "./tabs/LeadershipTab";
import { EntrepreneurshipTab } from "./tabs/EntrepreneurshipTab";
import { FamilyTab }          from "./tabs/FamilyTab";

// ── Tab definitions ────────────────────────────────────────────

const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: "overview",        label: "Overview",        Icon: LayoutDashboard },
  { id: "medical",         label: "Medical",         Icon: HeartPulse      },
  { id: "attendance",      label: "Attendance",      Icon: CalendarCheck   },
  { id: "notes",           label: "Staff Notes",     Icon: StickyNote      },
  { id: "incidents",       label: "Incidents",       Icon: AlertOctagon    },
  { id: "documents",       label: "Documents",       Icon: FolderOpen      },
  { id: "leadership",      label: "Leadership",      Icon: Award           },
  { id: "entrepreneurship",label: "Entrepreneurship",Icon: Briefcase       },
  { id: "family",          label: "Family",          Icon: Users           },
];

// ── Props ─────────────────────────────────────────────────────

interface Props {
  data: StudentProfileData;
  initialTab: string;
  orgId: string;
  currentUserId: string;
}

// ── Component ─────────────────────────────────────────────────

export function StudentProfile({ data, initialTab, orgId, currentUserId }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>(
    (TABS.some((t) => t.id === initialTab) ? initialTab : "overview") as TabId
  );

  const switchTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(url.toString(), { scroll: false });
  }, [router]);

  const hasEmergencyMed = data.medication_alerts.some((m) => m.is_emergency);

  return (
    <div className="space-y-0 -mt-4 sm:-mt-6"> {/* bleed into page padding */}

      {/* ── Emergency banner — always visible ─────────────────── */}
      {hasEmergencyMed && (
        <div className="sticky top-0 z-40 bg-sc-rose border-b-2 border-sc-rose-700 px-4 py-2.5 flex items-center gap-3">
          <ShieldAlert className="size-5 text-white shrink-0" />
          <p className="text-white text-label-sm font-bold uppercase tracking-wide">
            Emergency Medication:{" "}
            {data.medication_alerts
              .filter((m) => m.is_emergency)
              .map((m) => m.medication_name)
              .join(", ")}
          </p>
        </div>
      )}

      {/* ── Profile header ────────────────────────────────────── */}
      <StudentProfileHeader data={data} />

      {/* ── Quick actions ─────────────────────────────────────── */}
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-sc-gray-100 bg-white">
        <StudentQuickActions
          studentId={data.id}
          todayAttendance={data.today_attendance}
          attendanceQrToken={data.attendance_qr_token}
        />
      </div>

      {/* ── Tab navigation — horizontal scroll on mobile ─────── */}
      <div className="bg-white border-b border-sc-gray-100 sticky top-0 z-30 px-4 sm:px-6">
        <div className="flex gap-0 overflow-x-auto scrollbar-none -mx-4 sm:-mx-6 px-4 sm:px-6">
          {TABS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            const isMedical = id === "medical" && data.medication_alerts.length > 0;
            return (
              <button
                key={id}
                onClick={() => switchTab(id)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap px-3 py-3.5 text-label-sm font-medium border-b-2 transition-all shrink-0",
                  isActive
                    ? "border-sc-teal text-sc-teal"
                    : "border-transparent text-sc-gray hover:text-sc-navy hover:border-sc-gray-200"
                )}
              >
                <Icon className={cn("size-3.5", isMedical && !isActive && "text-sc-rose")} />
                {label}
                {isMedical && !isActive && (
                  <span className="flex h-1.5 w-1.5 rounded-full bg-sc-rose" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-6">
        {activeTab === "overview"         && <OverviewTab         studentId={data.id} data={data} />}
        {activeTab === "medical"          && <MedicalTab          studentId={data.id} data={data} />}
        {activeTab === "attendance"       && <AttendanceTab       studentId={data.id} />}
        {activeTab === "notes"            && <StaffNotesTab       studentId={data.id} currentUserId={currentUserId} />}
        {activeTab === "incidents"        && <IncidentsTab        studentId={data.id} />}
        {activeTab === "documents"        && <DocumentsTab        studentId={data.id} driveFolderStatus={data.drive_folder_status} driveFolderUrl={data.drive_folder_url} />}
        {activeTab === "leadership"       && <LeadershipTab       studentId={data.id} />}
        {activeTab === "entrepreneurship" && <EntrepreneurshipTab studentId={data.id} />}
        {activeTab === "family"           && <FamilyTab           studentId={data.id} />}
      </div>
    </div>
  );
}
