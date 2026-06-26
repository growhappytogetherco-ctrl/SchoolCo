"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ── Context ───────────────────────────────────────────────────────────────

interface TabsContextValue {
  activeTab:    string;
  setActiveTab: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue>({
  activeTab:    "",
  setActiveTab: () => {},
});

// ── Tabs root ─────────────────────────────────────────────────────────────

interface TabsProps {
  defaultValue: string;
  value?:       string;
  onValueChange?: (value: string) => void;
  children:     React.ReactNode;
  className?:   string;
}

function Tabs({ defaultValue, value, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = React.useState(defaultValue);
  const activeTab    = value ?? internal;
  const setActiveTab = (v: string) => { setInternal(v); onValueChange?.(v); };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

// ── TabsList ──────────────────────────────────────────────────────────────

function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-xl bg-sc-cream border border-sc-gray-100 p-1",
        className
      )}
    >
      {children}
    </div>
  );
}

// ── TabsTrigger ───────────────────────────────────────────────────────────

interface TabsTriggerProps {
  value:     string;
  children:  React.ReactNode;
  className?: string;
}

function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const { activeTab, setActiveTab } = React.useContext(TabsContext);
  const isActive = activeTab === value;

  return (
    <button
      role="tab"
      type="button"
      aria-selected={isActive}
      onClick={() => setActiveTab(value)}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-label-sm font-medium",
        "transition-all focus:outline-none focus:ring-2 focus:ring-sc-teal focus:ring-offset-1",
        isActive
          ? "bg-white text-sc-navy shadow-sm"
          : "text-sc-gray hover:text-sc-navy",
        className
      )}
    >
      {children}
    </button>
  );
}

// ── TabsContent ───────────────────────────────────────────────────────────

interface TabsContentProps {
  value:     string;
  children:  React.ReactNode;
  className?: string;
}

function TabsContent({ value, children, className }: TabsContentProps) {
  const { activeTab } = React.useContext(TabsContext);
  if (activeTab !== value) return null;

  return (
    <div role="tabpanel" className={cn("mt-4", className)}>
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
