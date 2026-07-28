"use client";

import { useState, useTransition } from "react";
import { Users, Plus, CheckCircle2, MessageSquare, Calendar, Eye, AlertCircle, LogIn, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { addPilotFamily, recordPilotEvent } from "@/app/actions/launch";
import type { PilotFamily } from "@/app/actions/launch";

// ── Event type config ─────────────────────────────────────────────────────

const EVENT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  invited:               { label: "Invited",           icon: Mail,          color: "text-sc-teal" },
  accepted:              { label: "Accepted",           icon: CheckCircle2,  color: "text-emerald-600" },
  portal_login:          { label: "Portal Login",       icon: LogIn,         color: "text-sc-navy" },
  first_message:         { label: "First Message",      icon: MessageSquare, color: "text-sc-teal" },
  first_rsvp:            { label: "First RSVP",         icon: Calendar,      color: "text-sc-gold-700" },
  first_attendance_view: { label: "Viewed Attendance",  icon: Eye,           color: "text-sc-gray" },
  issue_reported:        { label: "Issue Reported",     icon: AlertCircle,   color: "text-sc-rose" },
};

// ── Family card ───────────────────────────────────────────────────────────

function FamilyCard({ family }: { family: PilotFamily }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showEventPicker, setShowEventPicker] = useState(false);

  function addEvent(eventType: string) {
    startTransition(async () => {
      const res = await recordPilotEvent(family.id, eventType);
      if (!res.success) setError(res.error);
      setShowEventPicker(false);
    });
  }

  const sortedEvents = [...family.events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );

  return (
    <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sc-navy">{family.family_name}</h3>
          <p className="text-[11px] text-sc-gray-400 mt-0.5">
            Invited {new Date(family.invited_at).toLocaleDateString()}
            {family.notes ? ` · ${family.notes}` : ""}
          </p>
        </div>
        <button
          onClick={() => setShowEventPicker((v) => !v)}
          className="shrink-0 flex items-center gap-1 rounded-lg border border-sc-gray-200 px-2 py-1.5 text-xs text-sc-gray hover:bg-sc-gray-100 transition-colors"
        >
          <Plus className="size-3" /> Log Event
        </button>
      </div>

      {error && <p className="text-xs text-sc-rose-700">{error}</p>}

      {showEventPicker && (
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(EVENT_CONFIG).map(([type, cfg]) => {
            const Icon = cfg.icon;
            return (
              <button
                key={type}
                onClick={() => addEvent(type)}
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg border border-sc-gray-200 px-2 py-1.5 text-xs text-sc-gray hover:bg-sc-gray-100 transition-colors disabled:opacity-50 text-left"
              >
                <Icon className={cn("size-3 shrink-0", cfg.color)} />
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Event timeline */}
      {sortedEvents.length > 0 && (
        <div className="space-y-1.5 mt-2">
          {sortedEvents.map((event) => {
            const cfg = EVENT_CONFIG[event.event_type] ?? EVENT_CONFIG.invited;
            const Icon = cfg.icon;
            return (
              <div key={event.id} className="flex items-center gap-2 text-xs text-sc-gray">
                <Icon className={cn("size-3 shrink-0", cfg.color)} />
                <span>{cfg.label}</span>
                <span className="text-sc-gray-400 ml-auto">{new Date(event.occurred_at).toLocaleDateString()}</span>
              </div>
            );
          })}
        </div>
      )}

      {sortedEvents.length === 0 && (
        <p className="text-xs text-sc-gray-400 italic">No events recorded yet.</p>
      )}
    </div>
  );
}

// ── Add family form ────────────────────────────────────────────────────────

function AddFamilyForm({ onAdd }: { onAdd: () => void }) {
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Family name is required"); return; }
    setError(null);
    startTransition(async () => {
      const res = await addPilotFamily(name.trim(), undefined, notes.trim() || undefined);
      if (res.success) {
        setName("");
        setNotes("");
        onAdd();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 space-y-3">
      <h3 className="font-semibold text-sc-navy text-sm">Add Pilot Family</h3>
      <div className="flex gap-2 flex-wrap">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Family name (e.g. The Johnson Family)"
          className="flex-1 min-w-48 rounded-xl border border-sc-gray-200 px-3 py-2 text-sm text-sc-navy placeholder-sc-gray-400 focus:outline-none focus:ring-1 focus:ring-sc-teal"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="flex-1 min-w-36 rounded-xl border border-sc-gray-200 px-3 py-2 text-sm text-sc-navy placeholder-sc-gray-400 focus:outline-none focus:ring-1 focus:ring-sc-teal"
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-xl bg-sc-teal text-white px-4 py-2 text-sm font-medium hover:bg-sc-teal-700 transition-colors disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          {isPending ? "Adding…" : "Add"}
        </button>
      </div>
      {error && <p className="text-xs text-sc-rose-700">{error}</p>}
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function ParentPilot({ initialFamilies }: { initialFamilies: PilotFamily[] }) {
  const [families, setFamilies] = useState(initialFamilies);

  // Summary stats
  const invited = families.length;
  const accepted = families.filter((f) => f.events.some((e) => e.event_type === "accepted")).length;
  const loggedIn = families.filter((f) => f.events.some((e) => e.event_type === "portal_login")).length;
  const messaged = families.filter((f) => f.events.some((e) => e.event_type === "first_message")).length;

  async function refreshFamilies() {
    // Full page reload for simplicity (families state is from server)
    window.location.reload();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-semibold text-sc-navy">Parent Pilot Program</h2>
        <p className="text-label-sm text-sc-gray mt-0.5">
          Invite a small group of families to test the portal before full rollout.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Invited",      value: invited,  icon: Mail },
          { label: "Accepted",     value: accepted, icon: CheckCircle2 },
          { label: "Portal Login", value: loggedIn, icon: LogIn },
          { label: "Messaged",     value: messaged, icon: MessageSquare },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sc-teal/10">
              <Icon className="size-4 text-sc-teal" />
            </div>
            <div>
              <p className="text-xl font-bold text-sc-navy">{value}</p>
              <p className="text-label-sm text-sc-gray">{label}</p>
            </div>
          </div>
        ))}
      </div>

      <AddFamilyForm onAdd={refreshFamilies} />

      {families.length === 0 ? (
        <div className="rounded-2xl bg-white border border-sc-gray-100 shadow-card p-8 text-center">
          <Users className="size-8 text-sc-gray-400 mx-auto mb-2" />
          <p className="text-sc-gray text-label-sm">No pilot families yet. Add some above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {families.map((f) => (
            <FamilyCard key={f.id} family={f} />
          ))}
        </div>
      )}
    </div>
  );
}
