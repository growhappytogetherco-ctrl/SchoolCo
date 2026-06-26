"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, UserCheck, ClipboardCheck, BookOpen,
  MessageSquare, Briefcase, FolderOpen, Settings, Home, Heart,
  Star, Gift, Compass, Award, Zap, Building2, X,
  GraduationCap, AlertTriangle, BarChart2, Calendar,
  ClipboardList, ShieldCheck, User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TodaysBlessing } from "@/components/shared/TodaysBlessing";
import { NAV_ITEMS_BY_ROLE, type UserRole, type NavItem } from "@/lib/constants";
import { cn } from "@/lib/utils";

// Map icon string names to Lucide components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, UserCheck, ClipboardCheck, BookOpen,
  MessageSquare, Briefcase, FolderOpen, Settings, Home, Heart,
  Star, Gift, Compass, Award, Zap, Building2,
  GraduationCap, AlertTriangle, BarChart2, Calendar,
  ClipboardList, ShieldCheck, User,
};

interface AppSidebarProps {
  role:     UserRole;
  orgName:  string;
  orgLogo?: string | null;
  onClose?: () => void; // Mobile: close drawer
}

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon     = ICON_MAP[item.icon] ?? LayoutDashboard;

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-label-md",
        "transition-all duration-150",
        isActive
          ? "bg-sc-teal text-white shadow-sm"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <Icon
        className={cn(
          "size-4 shrink-0 transition-colors",
          isActive ? "text-white" : "text-white/60 group-hover:text-white"
        )}
      />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge !== undefined && (
        <Badge
          variant="outline"
          className="ml-auto text-[10px] h-5 px-1.5 border-white/30 text-white bg-white/10"
        >
          {item.badge}
        </Badge>
      )}
    </Link>
  );
}

export function AppSidebar({ role, orgName, orgLogo, onClose }: AppSidebarProps) {
  const navItems = NAV_ITEMS_BY_ROLE[role] ?? [];

  return (
    <aside className="flex flex-col h-full bg-sc-navy w-64 shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5 min-w-0">
          {orgLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={orgLogo}
              alt={`${orgName} logo`}
              className="h-7 w-7 rounded-md object-contain"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/15">
              <Building2 className="size-4 text-white/80" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-label-sm font-semibold text-white truncate leading-tight">
              {orgName}
            </p>
            <p className="text-[10px] text-white/50 leading-tight">
              Powered by SchoolCo
            </p>
          </div>
        </div>

        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden text-white/60 hover:text-white transition-colors p-1"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <Separator className="bg-white/10" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin" aria-label="Main navigation">
        {navItems.map((item) => (
          <NavLink key={item.href} item={item} onClick={onClose} />
        ))}
      </nav>

      <Separator className="bg-white/10" />

      {/* Today's Blessing — bottom of sidebar */}
      <div className="px-4 py-4">
        <TodaysBlessing compact className="text-xs" />
      </div>
    </aside>
  );
}
