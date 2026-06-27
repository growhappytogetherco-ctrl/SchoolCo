"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, HeartPulse, CalendarCheck, StickyNote,
  AlertOctagon, FolderOpen, Award, Briefcase, Users,
  ShieldAlert, Target, BookOpen, AlertTriangle,
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
import { GoalsTab }           from "./tabs/GoalsTab";
import { SupportTab }         from "./tabs/SupportTab";
import { AcademicsTab }       from "./tabs/AcademicsTab";

// ── Role visibility ────────────────────────────────────────────
// Tabs hidden from volunteers — they can only see safety-relevant info.
const VOLUNTEER_HIDDEN_TABS: TabId[] = [
  "notes", "incidents", "documents", "support", "academics",
  "leadership", "entrepreneurship", "family",
];

// Tabs hidden from parents (they use the portal, but just in case)
const PARENT_HIDDEN_TABS: TabId[] = [
  "notes", "support", "incidents", "documents",
];

function getHiddenTabs(role: string): TabId[] {
  if (role === "volunteer") return VOLUNTEER_HIDDEN_TABS;
  if (role === "parent")    return PARENT_HIDDEN_TABS;
  return [];
}

// ── Tab definitions ────────────────────────────────────────────
// ROW 1: core daily-use tabs (7)
// ROW 2: reference/deep-dive tabs (5)

const ROW1_TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: "overview",   label: "Snapshot",   Icon: LayoutDashboard },
  { id: "goals",      label: "Goals",      Icon: Target          },
  { id: "support",    label: "Support",    Icon: ShieldAlert     },
  { id: "academics",  label: "Academics",  Icon: BookOpen        },
  { id: "medical",    label: "Medical",    Icon: HeartPulse      },
  { id: "attendance", label: "Attendance", Icon: CalendarCheck   },
  { id: "notes",      label: "Notes",      Icon: StickyNote      },
];

const ROW2_TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: "incidents",        label: "Incidents",        Icon: AlertOctagon },
  { id: "documents",        label: "Documents",        Icon: FolderOpen   },
  { id: "leadership",       label: "Leadership",       Icon: Award        },
  { id: "entrepreneurship", label: "Entrepreneurship", Icon: Briefcase    },
  { id: "family",           label: "Family",           Icon: Users        },
];

const ALL_TABS = [...ROW1_TABS, ...ROW2_TABS];

// ── Alert banner types ─────────────────────────────────────────

interface AlertFlag {
  id: string;
  title: string;
  priority: "high" | "critical";
  category: string;
  color: string;
}

interface PickupAlert {
  guardian_name: string;
  custody_type: string;
  can_pickup: boolean;
  pickup_restrictions: string | null;
}

// ── Props ─────────────────────────────────────────────────────

interface Props {
  data: StudentProfileData;
  initialTab: string;
  orgId: string;
  currentUserId: string;
  role?: string;
  alertBannerFlags?: AlertFlag[];
  pickupAlerts?: PickupAlert[];
}

// ── Component ─────────────────────────────────────────────────

export function StudentProfile({
  data, initialTab, orgId, currentUserId,
  role = "staff",
  alertBannerFlags = [],
  pickupAlerts = [],
}: Props) {
  const router = useRouter();
  const hiddenTabs = getHiddenTabs(role);

  const firstVisible = ALL_TABS.find((t) => !hiddenTabs.includes(t.id));
  const [activeTab, setActiveTab] = useState<TabId>(
    (ALL_TABS.some((t) => t.id === initialTab && !hiddenTabs.includes(t.id))
      ? initialTab
      : (firstVisible?.id ?? "overview")) as TabId
  );

  const switchTab = useCallback((tab: TabId) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    router.replace(url.toString(), { scroll: false });
  }, [router]);

  const hasEmergencyMed = data.medication_alerts.some((m) => m.is_emergency);
  const hasCriticalFlags = alertBannerFlags.some((f) => f.priority === "critical");
  const hasHighFlags = alertBannerFlags.some((f) => f.priority === "high");
  const hasPickupAlerts = pickupAlerts.length > 0;
  const isAdmin = ["admin", "full_admin", "platform_admin"].includes(role);

  function TabRow({ tabs }: { tabs: typeof ROW1_TABS }) {
    const visible = tabs.filter((t) => !hiddenTabs.includes(t.id));
    if (visible.length === 0) return null;
    return (
      <>
        {visible.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          const isMedical = id === "medical" && data.medication_alerts.length > 0;
          return (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-label-sm font-medium border-b-2 transition-all shrink-0",
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
      </>
    );
  }

  return (
    <div className="space-y-0 -mt-4 sm:-mt-6">

      {/* ── Emergency medication banner ────────────────────────── */}
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

      {/* ── Critical support flag banner ───────────────────────── */}
      {hasCriticalFlags && (
        <div className="bg-sc-rose-700 border-b-2 border-sc-rose-900 px-4 py-2.5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-white shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-white text-label-sm font-bold uppercase tracking-wide">Critical Alert</p>
              {alertBannerFlags
                .filter((f) => f.priority === "critical")
                .map((f) => (
                  <p key={f.id} className="text-white text-label-sm">{f.title}</p>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── High-priority support flag banner ─────────────────── */}
      {hasHighFlags && !hasCriticalFlags && (
        <div className="bg-sc-gold border-b-2 border-sc-gold-600 px-4 py-2.5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-sc-navy shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sc-navy text-label-sm font-bold uppercase tracking-wide">Staff Alert</p>
              {alertBannerFlags
                .filter((f) => f.priority === "high")
                .map((f) => (
                  <p key={f.id} className="text-sc-navy text-label-sm">{f.title}</p>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Pickup restriction banner ──────────────────────────── */}
      {hasPickupAlerts && (
        <div className="bg-sc-rose-50 border-b-2 border-sc-rose-300 px-4 py-2.5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-sc-rose-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sc-rose-800 text-label-sm font-bold uppercase tracking-wide">Pickup Restriction</p>
              {pickupAlerts.map((a, i) => (
                <p key={i} className="text-sc-rose-700 text-label-sm">
                  {a.guardian_name}:{" "}
                  {a.custody_type === "none"
                    ? "NOT authorized for pickup"
                    : "Supervised visitation only"}
                  {a.pickup_restrictions && ` — ${a.pickup_restrictions}`}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Profile header ────────────────────────────────────── */}
      <StudentProfileHeader
        data={data}
        alertBannerFlags={alertBannerFlags}
        allergies={data.allergies}
      />

      {/* ── Quick actions ─────────────────────────────────────── */}
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-sc-gray-100 bg-white">
        <StudentQuickActions
          studentId={data.id}
          studentName={data.preferred_name ? `${data.preferred_name} ${data.last_name}` : `${data.first_name} ${data.last_name}`}
          gradeLevel={data.grade_level}
          todayAttendance={data.today_attendance}
          attendanceQrToken={data.attendance_qr_token}
          role={role}
          isAdmin={isAdmin}
        />
      </div>

      {/* ── Tab navigation — two rows, no horizontal scroll ───── */}
      <div className="bg-white border-b border-sc-gray-100 sticky top-0 z-30 px-4 sm:px-6">
        {/* Row 1 */}
        <div className="flex gap-0 border-b border-sc-gray-50">
          <TabRow tabs={ROW1_TABS} />
        </div>
        {/* Row 2 — only show if at least one row-2 tab is visible */}
        {ROW2_TABS.some((t) => !hiddenTabs.includes(t.id)) && (
          <div className="flex gap-0">
            <TabRow tabs={ROW2_TABS} />
          </div>
        )}
      </div>

      {/* ── Tab content ───────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-6">
        {activeTab === "overview"         && <OverviewTab         studentId={data.id} data={data} />}
        {activeTab === "goals"            && <GoalsTab            studentId={data.id} />}
        {activeTab === "support"          && <SupportTab          studentId={data.id} />}
        {activeTab === "academics"        && <AcademicsTab        studentId={data.id} />}
        {activeTab === "medical"          && <MedicalTab          studentId={data.id} data={data} />}
        {activeTab === "attendance"       && <AttendanceTab       studentId={data.id} isAdmin={isAdmin} />}
        {activeTab === "notes"            && <StaffNotesTab       studentId={data.id} currentUserId={currentUserId} />}
        {activeTab === "incidents"        && <IncidentsTab        studentId={data.id} />}
        {activeTab === "documents"        && <DocumentsTab        studentId={data.id} driveFolderStatus={data.drive_folder_status} driveFolderUrl={data.drive_folder_url} />}
        {activeTab === "leadership"       && <LeadershipTab       studentId={data.id} />}
        {activeTab === "entrepreneurship" && <EntrepreneurshipTab studentId={data.id} />}
        {activeTab === "family"           && <FamilyTab           studentId={data.id} role={role} isAdmin={isAdmin} />}
      </div>
    </div>
  );
}
